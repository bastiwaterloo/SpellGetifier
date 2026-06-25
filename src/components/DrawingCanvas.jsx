import {useRef, useEffect, useCallback, useState} from 'react';
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    STROKE_COLOR,
    STROKE_WIDTH,
    ERASER_WIDTH,
    RUNES_PATH,
    SIGNS_PATH,
    ENABLED_RUNES,
    ENABLED_SIGNS
} from '../config.js';
import { recognizeRune, itterativeAnalysis } from '../utils/runeRecognition.jsx';
import {
    RECOGNIZERS,
    DEFAULT_RECOGNIZER_ID,
    getRecognizer
} from '../utils/recognizers.js';
import {
    extractRunePoints,
    createTemplateFromStroke,
    createAveragedTemplate
} from '../utils/unistrokeRecognition.jsx';
import {calculateCircleScore as getCircleScore} from '../utils/utils.ts';
import {runesToSpell} from '../utils/spell.js';
import RuneAlphabet from './RuneAlphabet.jsx';
import './DrawingCanvas.css';

function DrawingCanvas({onSpellCast}) {
    const canvasRef = useRef(null);
    const contextRef = useRef(null);
    const isDrawingRef = useRef(false);
    const pointsRef = useRef([]);
    const currentStrokeRef = useRef([]);
    const lastPosRef = useRef(null);

    const [hasDrawing, setHasDrawing] = useState(false);
    const [score, setScore] = useState(null);
    const [recognitionResult, setRecognitionResult] = useState(null);
    const [isRecognizing, setIsRecognizing] = useState(false);
    const [isErasing, setIsErasing] = useState(false);
    const [isSpellMenuOpen, setIsSpellMenuOpen] = useState(false);
    const spellMenuRef = useRef(null);
    const [recognizerId, setRecognizerId] = useState(DEFAULT_RECOGNIZER_ID);
    const [isDebugMenuOpen, setIsDebugMenuOpen] = useState(false);
    const debugMenuRef = useRef(null);

    // Trainer: Proben einer Rune sammeln und daraus Templates erzeugen.
    const [isTrainingMode, setIsTrainingMode] = useState(false);
    const [trainingName, setTrainingName] = useState('');
    const [samples, setSamples] = useState([]);
    const [trainingMessage, setTrainingMessage] = useState('');
    const [templateOutput, setTemplateOutput] = useState('');

    const activeRecognizer = getRecognizer(recognizerId);

    // Canvas mit fester Größe einrichten (HiDPI-fähig).
    const setupCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;

        canvas.width = CANVAS_WIDTH * dpr;
        canvas.height = CANVAS_HEIGHT * dpr;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        contextRef.current = ctx;
    }, []);

    useEffect(() => {
        setupCanvas();
    }, [setupCanvas]);

    // Vorlagen/Beschreibungen des aktiven Recognizers vorladen.
    useEffect(() => {
        getRecognizer(recognizerId).loadTemplates();
    }, [recognizerId]);

    useEffect(() => {
        if (!isSpellMenuOpen) return undefined;
        const handlePointerDown = (event) => {
            if (
                spellMenuRef.current &&
                !spellMenuRef.current.contains(event.target)
            ) {
                setIsSpellMenuOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsSpellMenuOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isSpellMenuOpen]);

    useEffect(() => {
        if (!isDebugMenuOpen) return undefined;
        const handlePointerDown = (event) => {
            if (
                debugMenuRef.current &&
                !debugMenuRef.current.contains(event.target)
            ) {
                setIsDebugMenuOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsDebugMenuOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isDebugMenuOpen]);

    // Kürzester Abstand eines Punktes zur Strecke a–b.
    const distanceToSegment = (point, a, b) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared === 0) {
            return Math.hypot(point.x - a.x, point.y - a.y);
        }
        let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
    };

    // Aufgezeichnete Punkte entfernen, die der Radiergummi überstreicht,
    // damit die Auswertung zur sichtbaren Zeichnung passt.
    const eraseRecordedPoints = (from, to) => {
        const radius = ERASER_WIDTH / 2;
        pointsRef.current = pointsRef.current
            .map((stroke) =>
                stroke.filter(
                    (point) => distanceToSegment(point, from, to) > radius
                )
            )
            .filter((stroke) => stroke.length > 0);
        if (pointsRef.current.length === 0) {
            setHasDrawing(false);
        }
    };

    const getPos = (event) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const point = event.touches ? event.touches[0] : event;
        return {
            x: point.clientX - rect.left,
            y: point.clientY - rect.top
        };
    };

    const startDrawing = (event) => {
        event.preventDefault();
        const ctx = contextRef.current;
        const {x, y} = getPos(event);
        // Radieren entfernt Pixel (destination-out), Zeichnen malt normal.
        ctx.globalCompositeOperation = isErasing
            ? 'destination-out'
            : 'source-over';
        ctx.strokeStyle = STROKE_COLOR;
        ctx.lineWidth = isErasing ? ERASER_WIDTH : STROKE_WIDTH;
        ctx.beginPath();
        ctx.moveTo(x, y);
        // Nur echte Zeichenstriche fließen in die Auswertung ein.
        currentStrokeRef.current = isErasing ? [] : [{x, y}];
        lastPosRef.current = {x, y};
        isDrawingRef.current = true;
        if (isErasing) {
            eraseRecordedPoints({x, y}, {x, y});
        } else {
            setHasDrawing(true);
        }
        setScore(null);
    };

    const draw = (event) => {
        if (!isDrawingRef.current) return;
        event.preventDefault();
        const ctx = contextRef.current;
        const {x, y} = getPos(event);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (isErasing) {
            eraseRecordedPoints(lastPosRef.current, {x, y});
        } else {
            currentStrokeRef.current.push({x, y});
        }
        lastPosRef.current = {x, y};
    };

    const stopDrawing = () => {
        if (!isDrawingRef.current) return;
        if (currentStrokeRef.current.length > 0) {
            pointsRef.current.push(currentStrokeRef.current);
        }
        contextRef.current.closePath();
        currentStrokeRef.current = [];
        isDrawingRef.current = false;
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = contextRef.current;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pointsRef.current = [];
        currentStrokeRef.current = [];
        setHasDrawing(false);
        setScore(null);
        setRecognitionResult(null);
    };

    const calculateCircleScore = () => {
        setScore(getCircleScore(pointsRef.current));
    };

    const drawBoundingBoxes = (boxes) => {
        const ctx = contextRef.current;
        if (!ctx || !boxes?.length) return;
        
        ctx.save();
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.globalCompositeOperation = 'source-over';
        
        boxes.forEach(box => {
            const x = (box.x / 100) * CANVAS_WIDTH;
            const y = (box.y / 100) * CANVAS_HEIGHT;
            const w = (box.w / 100) * CANVAS_WIDTH;
            const h = (box.h / 100) * CANVAS_HEIGHT;
            ctx.strokeRect(x, y, w, h);
        });
        
        ctx.restore();
    };

    const performRecognition = async () => {
        const canvas = canvasRef.current;

        setIsRecognizing(true);
        setRecognitionResult(null);

        try {
            const result = await recognizeRune(canvas);
            setRecognitionResult(result);
            if (result.boxes) {
                drawBoundingBoxes(result.boxes);
            }
            // Aus der Liste der erkannten Runen den resultierenden Zauber
            // ableiten und nach oben (App) melden.
            onSpellCast?.(runesToSpell(result.matches ?? []));
        } catch (error) {
            console.error('Fehler bei der Runen-Erkennung:', error);
            setRecognitionResult({
                count: 0,
                boxes: [],
                images: [],
                message: 'Fehler bei der Erkennung'
            });
        } finally {
            setIsRecognizing(false);
        }
    };

    return (
        <div className="drawing">
            <div className="drawing__stage">
                <canvas
                    ref={canvasRef}
                    className="drawing__canvas"
                    style={{width: CANVAS_WIDTH, height: CANVAS_HEIGHT}}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
                <RuneAlphabet
                    title="Siegel"
                    items={ENABLED_SIGNS}
                    path={SIGNS_PATH}
                    side="left"
                />
                <RuneAlphabet
                    title="Runen"
                    items={ENABLED_RUNES}
                    path={RUNES_PATH}
                    side="right"
                />
            </div>

            <div className="drawing__actions">
                <button
                    type="button"
                    className={
                        'drawing__button drawing__button--secondary' +
                        (isErasing ? ' drawing__button--active' : '')
                    }
                    onClick={() => setIsErasing((value) => !value)}
                    aria-pressed={isErasing}
                >
                    {isErasing ? 'Radiergummi: an' : 'Radieren'}
                </button>
                <button
                    type="button"
                    className="drawing__button drawing__button--secondary"
                    onClick={clearCanvas}
                >
                    Löschen
                </button>
                <button
                    type="button"
                    className="drawing__button drawing__button--secondary"
                    onClick={performRecognition}
                    disabled={!hasDrawing || isRecognizing}
                >
                    Runen erkennen
                </button>
                <button
                    type="button"
                    className="drawing__button drawing__button--primary"
                    onClick={calculateCircleScore}
                    disabled={!hasDrawing}
                >
                    Kreis bewerten
                </button>
            </div>

            {isTrainingMode && (
                <div className="drawing__trainer">
                    <h2 className="drawing__trainer-title">Template-Trainer</h2>
                    <p className="drawing__trainer-hint">
                        Rune benennen, dann mehrmals (≈5×) mit gleichem
                        Startpunkt und gleicher Richtung zeichnen und je „Sample
                        aufnehmen".
                    </p>
                    <label className="drawing__trainer-field">
                        Runenname
                        <input
                            type="text"
                            className="drawing__trainer-input"
                            value={trainingName}
                            placeholder="z. B. Feuer"
                            onChange={(event) =>
                                setTrainingName(event.target.value)
                            }
                        />
                    </label>
                    <div className="drawing__trainer-actions">
                        <button
                            type="button"
                            className="drawing__button drawing__button--secondary"
                            onClick={captureSample}
                            disabled={!hasDrawing}
                        >
                            Sample aufnehmen ({samples.length})
                        </button>
                        <button
                            type="button"
                            className="drawing__button drawing__button--secondary"
                            onClick={buildAverageTemplate}
                            disabled={!samples.length}
                        >
                            Average-Template
                        </button>
                        <button
                            type="button"
                            className="drawing__button drawing__button--secondary"
                            onClick={buildIndividualTemplates}
                            disabled={!samples.length}
                        >
                            Einzel-Templates
                        </button>
                        <button
                            type="button"
                            className="drawing__button drawing__button--secondary"
                            onClick={discardSamples}
                            disabled={!samples.length}
                        >
                            Samples leeren
                        </button>
                    </div>
                    {trainingMessage && (
                        <p className="drawing__trainer-message">
                            {trainingMessage}
                        </p>
                    )}
                    {templateOutput && (
                        <div className="drawing__trainer-output">
                            <div className="drawing__trainer-output-head">
                                <span>JSON für runeTemplates.ts</span>
                                <button
                                    type="button"
                                    className="drawing__button drawing__button--secondary"
                                    onClick={copyTemplateOutput}
                                >
                                    Kopieren
                                </button>
                            </div>
                            <textarea
                                className="drawing__trainer-textarea"
                                readOnly
                                value={templateOutput}
                                rows={10}
                            />
                        </div>
                    )}
                </div>
            )}

            <div className="drawing__result" aria-live="polite">
                {score === null ? (
                    <p>
                        Zeichne etwas und werte den Kreis aus oder wirke einen
                        Zauber.
                    </p>
                ) : (
                    <p>
                        Score: <strong>{score}</strong> von 100
                    </p>
                )}
            </div>

            {isRecognizing && (
                <div className="drawing__recognition">
                    <p>Wirke Zauber…</p>
                </div>
            )}

            {recognitionResult && (
                <div className="drawing__recognition drawing__recognition--success">
                    <p>{recognitionResult.message}</p>
                    {recognitionResult.matches?.length > 0 && (
                        <div className="drawing__extracted-runes">
                            {recognitionResult.matches.map((item, index) => (
                                <div key={index} className="drawing__extracted-rune">
                                    <img
                                        src={item.image}
                                        alt={`Rune ${index + 1}`}
                                        className="drawing__extracted-rune-image"
                                    />
                                    {item.match ? (
                                        <div className="drawing__match-info">
                                            <img
                                                src={item.match.rune.imagePath}
                                                alt={item.match.rune.name}
                                                className="drawing__match-image"
                                                style={{ transform: `rotate(${item.match.rotation}deg)` }}
                                            />
                                            <span className="drawing__match-name">{item.match.rune.name}</span>
                                            <span className="drawing__match-confidence">{item.match.confidence}%</span>
                                            {item.match.rotation !== 0 && (
                                                <span className="drawing__match-rotation">Rotation: {item.match.rotation}°</span>
                                            )}
                                            <span className="drawing__match-clock">Position: {item.clockPosition} Uhr</span>
                                        </div>
                                    ) : (
                                        <div className="drawing__match-info drawing__match-info--unknown">
                                            <span className="drawing__extracted-rune-label">Nicht erkannt</span>
                                            <span className="drawing__match-clock">Position: {item.clockPosition} Uhr</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default DrawingCanvas;

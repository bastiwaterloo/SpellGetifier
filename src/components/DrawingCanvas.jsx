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
import {itterativeAnalysis} from '../utils/runeRecognition.jsx';
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
import RuneAlphabet from './RuneAlphabet.jsx';
import './DrawingCanvas.css';

function DrawingCanvas() {
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

    // --- Trainer ---------------------------------------------------------
    const slugify = (value) =>
        value.trim().toLowerCase().replace(/\s+/g, '-') || 'rune';

    // Punkte auf 2 Nachkommastellen runden, damit das JSON lesbar bleibt.
    const tidyTemplate = (template) => ({
        ...template,
        points: template.points.map((point) => ({
            x: Math.round(point.x * 100) / 100,
            y: Math.round(point.y * 100) / 100
        }))
    });

    // Eine Probe aufnehmen: genau das, was der Recognizer auch sehen würde
    // (Kreis abgezogen), danach Canvas leeren für die nächste Zeichnung.
    const captureSample = () => {
        const points = extractRunePoints(pointsRef.current);
        if (points.length < 4) {
            setTrainingMessage(
                'Zu wenig Punkte – bitte die Rune deutlicher zeichnen.'
            );
            return;
        }
        const next = [...samples, points];
        setSamples(next);
        setTemplateOutput('');
        setTrainingMessage(
            `Sample ${next.length} aufgenommen. Gleicher Startpunkt & gleiche Richtung!`
        );
        clearCanvas();
    };

    const discardSamples = () => {
        setSamples([]);
        setTemplateOutput('');
        setTrainingMessage('Samples verworfen.');
    };

    const buildAverageTemplate = () => {
        if (!samples.length) {
            setTrainingMessage('Noch keine Samples aufgenommen.');
            return;
        }
        const name = trainingName.trim() || 'Rune';
        const template = tidyTemplate(
            createAveragedTemplate(name, samples, {id: slugify(name)})
        );
        const output = JSON.stringify([template], null, 4);
        setTemplateOutput(output);
        setTrainingMessage(
            `Average-Template aus ${samples.length} Samples erstellt.`
        );
    };

    const buildIndividualTemplates = () => {
        if (!samples.length) {
            setTrainingMessage('Noch keine Samples aufgenommen.');
            return;
        }
        const name = trainingName.trim() || 'Rune';
        const templates = samples.map((sample, index) =>
            tidyTemplate(
                createTemplateFromStroke(name, sample, {
                    id: `${slugify(name)}-${index + 1}`
                })
            )
        );
        setTemplateOutput(JSON.stringify(templates, null, 4));
        setTrainingMessage(`${templates.length} Einzel-Templates erstellt.`);
    };

    const copyTemplateOutput = async () => {
        if (!templateOutput) return;
        try {
            await navigator.clipboard.writeText(templateOutput);
            setTrainingMessage('In die Zwischenablage kopiert.');
        } catch {
            setTrainingMessage(
                'Kopieren nicht möglich – bitte manuell markieren.'
            );
        }
    };

    const castSpell = async (spell) => {
        // Beide Recognizer-Varianten bekommen dasselbe Input-Objekt und
        // greifen sich je nach Ansatz das Canvas-Bild oder die Punkte heraus.
        const input = {canvas: canvasRef.current, strokes: pointsRef.current};
        setIsSpellMenuOpen(false);
        setIsRecognizing(true);
        setRecognitionResult(null);

        try {
            const result = await spell(input);
            setRecognitionResult(result);
        } catch (error) {
            console.error('Fehler beim Wirken des Zaubers:', error);
            setRecognitionResult({
                match: null,
                confidence: 0,
                message: 'Fehler bei der Erkennung'
            });
        }

        setIsRecognizing(false);
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
                <div className="drawing__dropdown" ref={spellMenuRef}>
                    <button
                        type="button"
                        className="drawing__button drawing__button--secondary"
                        onClick={() => setIsSpellMenuOpen((open) => !open)}
                        disabled={isRecognizing}
                        aria-haspopup="menu"
                        aria-expanded={isSpellMenuOpen}
                    >
                        Zauber wirken ▾
                    </button>
                    {isSpellMenuOpen && (
                        <ul className="drawing__menu" role="menu">
                            <li role="none">
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="drawing__menu-item"
                                    onClick={() =>
                                        castSpell(activeRecognizer.recognize)
                                    }
                                >
                                    Zaub-AI-rn
                                </button>
                            </li>
                            <li role="none">
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="drawing__menu-item"
                                    onClick={() =>
                                        castSpell(itterativeAnalysis)
                                    }
                                >
                                    Alter Zauber
                                </button>
                            </li>
                        </ul>
                    )}
                </div>
                <div className="drawing__dropdown" ref={debugMenuRef}>
                    <button
                        type="button"
                        className={
                            'drawing__button drawing__button--secondary' +
                            (isDebugMenuOpen ? ' drawing__button--active' : '')
                        }
                        onClick={() => setIsDebugMenuOpen((open) => !open)}
                        aria-haspopup="menu"
                        aria-expanded={isDebugMenuOpen}
                    >
                        Debug ▾
                    </button>
                    {isDebugMenuOpen && (
                        <div
                            className="drawing__menu drawing__menu--debug"
                            role="menu"
                        >
                            <p className="drawing__menu-label">Recognizer</p>
                            {RECOGNIZERS.map((recognizer) => (
                                <label
                                    key={recognizer.id}
                                    className="drawing__menu-radio"
                                >
                                    <input
                                        type="radio"
                                        name="recognizer"
                                        value={recognizer.id}
                                        checked={recognizerId === recognizer.id}
                                        onChange={() =>
                                            setRecognizerId(recognizer.id)
                                        }
                                    />
                                    {recognizer.label}
                                </label>
                            ))}
                            <p className="drawing__menu-label">Training</p>
                            <label className="drawing__menu-radio">
                                <input
                                    type="checkbox"
                                    checked={isTrainingMode}
                                    onChange={(event) =>
                                        setIsTrainingMode(event.target.checked)
                                    }
                                />
                                Trainingsmodus
                            </label>
                        </div>
                    )}
                </div>
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
                <div
                    className={`drawing__recognition ${recognitionResult.match ? 'drawing__recognition--success' : 'drawing__recognition--error'}`}
                >
                    <p>{recognitionResult.message}</p>
                    {recognitionResult.match?.imagePath && (
                        <div className="drawing__recognized-rune">
                            <img
                                src={recognitionResult.match.imagePath}
                                alt={recognitionResult.match.name}
                                className="drawing__rune-image"
                            />
                        </div>
                    )}
                    {recognitionResult.findings && recognitionResult.findings.length > 0 && (
                        <ul className="drawing__findings">
                            {recognitionResult.findings.map((finding, index) => (
                                <li key={index} className="drawing__finding">
                                    <strong>{finding.name}</strong>
                                    {` · ${finding.size}px · (${Math.round(finding.x)}, ${Math.round(finding.y)}) · ${finding.rotation}° · ${finding.score}%`}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

export default DrawingCanvas;

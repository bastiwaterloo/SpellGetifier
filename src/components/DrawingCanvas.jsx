import {useRef, useEffect, useCallback, useState} from 'react';
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    STROKE_COLOR,
    STROKE_WIDTH,
    ERASER_WIDTH,
    RUNES_PATH
} from '../config.js';
import {recognizeRune, loadRuneTemplates, itterativeAnalysis} from '../utils/runeRecognition.jsx';
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
        loadRuneTemplates();
    }, [setupCanvas]);

    useEffect(() => {
        if (!isSpellMenuOpen) return undefined;
        const handlePointerDown = (event) => {
            if (spellMenuRef.current && !spellMenuRef.current.contains(event.target)) {
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

    const castSpell = async (spell) => {
        const canvas = canvasRef.current;
        setIsSpellMenuOpen(false);
        setIsRecognizing(true);
        setRecognitionResult(null);

        try {
            const result = await spell(canvas);
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
                <RuneAlphabet />
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
                        disabled={!hasDrawing || isRecognizing}
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
                                    onClick={() => castSpell(recognizeRune)}
                                >
                                    ZaubAIrn
                                </button>
                            </li>
                            <li role="none">
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="drawing__menu-item"
                                    onClick={() => castSpell(itterativeAnalysis)}
                                >
                                    Alter Zauber
                                </button>
                            </li>
                        </ul>
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

            <div className="drawing__result" aria-live="polite">
                {score === null ? (
                    <p>Zeichne etwas und werte den Kreis aus oder wirke einen Zauber.</p>
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
                    {recognitionResult.match && (
                        <div className="drawing__recognized-rune">
                            <img
                                src={recognitionResult.match.imagePath}
                                alt={recognitionResult.match.name}
                                className="drawing__rune-image"
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default DrawingCanvas;

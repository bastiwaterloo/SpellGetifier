import {useRef, useEffect, useCallback, useState} from 'react';
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    STROKE_COLOR,
    STROKE_WIDTH,
    ERASER_WIDTH
} from '../config.js';
import {recognizeRune, loadRuneTemplates} from '../utils/runeRecognition.js';
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
                stroke.filter((point) => distanceToSegment(point, from, to) > radius)
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
        ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';
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

    const calculateScore = () => {
        const strokes = pointsRef.current;
        const allPoints = strokes.flat();

        if (allPoints.length < 5) {
            setScore(0);
            return;
        }

        const center = allPoints.reduce(
            (accumulator, point) => ({
                x: accumulator.x + point.x,
                y: accumulator.y + point.y
            }),
            {x: 0, y: 0}
        );

        center.x /= allPoints.length;
        center.y /= allPoints.length;

        const distances = allPoints.map((point) =>
            Math.hypot(point.x - center.x, point.y - center.y)
        );
        const meanRadius =
            distances.reduce((sum, distance) => sum + distance, 0) /
            distances.length;
        const radiusVariance =
            distances.reduce(
                (sum, distance) => sum + (distance - meanRadius) ** 2,
                0
            ) / distances.length;
        const radiusStdDev = Math.sqrt(radiusVariance);

        const firstPoint = allPoints[0];
        const lastPoint = allPoints[allPoints.length - 1];
        const closureGap = Math.hypot(
            firstPoint.x - lastPoint.x,
            firstPoint.y - lastPoint.y
        );

        const shapePenalty = Math.min(
            radiusStdDev / Math.max(meanRadius, 1),
            1
        );
        const closurePenalty =
            Math.min(closureGap / Math.max(meanRadius, 1), 1) * 0.25;
        const rawScore = Math.max(
            0,
            Math.round((1 - Math.min(1, shapePenalty + closurePenalty)) * 100)
        );
        const nerfedScore = Math.round((rawScore / 100) ** 2 * 100);

        setScore(nerfedScore);
    };

    const downloadCanvas = async () => {
        const canvas = canvasRef.current;

        setIsRecognizing(true);
        setRecognitionResult(null);

        try {
            const result = await recognizeRune(canvas);
            setRecognitionResult(result);
        } catch (error) {
            console.error('Fehler bei der Runen-Erkennung:', error);
            setRecognitionResult({
                match: null,
                confidence: 0,
                message: 'Fehler bei der Erkennung'
            });
        } finally {
            setIsRecognizing(false);
        }

        const link = document.createElement('a');
        link.download = 'zeichnung.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
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
                <button
                    type="button"
                    className="drawing__button drawing__button--secondary"
                    onClick={downloadCanvas}
                >
                    Speichern
                </button>
                <button
                    type="button"
                    className="drawing__button drawing__button--primary"
                    onClick={calculateScore}
                    disabled={!hasDrawing}
                >
                    Auswerten
                </button>
            </div>

            <div className="drawing__result" aria-live="polite">
                {score === null ? (
                    <p>Zeichne eine Rune und klicke dann auf Speichern.</p>
                ) : (
                    <p>
                        Score: <strong>{score}</strong> von 100
                    </p>
                )}
            </div>

            {isRecognizing && (
                <div className="drawing__recognition">
                    <p>Erkenne Rune...</p>
                </div>
            )}

            {recognitionResult && (
                <div className={`drawing__recognition ${recognitionResult.match ? 'drawing__recognition--success' : 'drawing__recognition--error'}`}>
                    <p>{recognitionResult.message}</p>
                    {recognitionResult.match && (
                        <div className="drawing__recognized-rune">
                            <img
                                src={`/runes/rune_${String(recognitionResult.match.id).padStart(2, '0')}.png`}
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

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
import { recognizeRune } from '../utils/runeRecognition.jsx';
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
import ElementStage from './ElementStage.jsx';
import WaterStage from './WaterStage.jsx';
import FireStage from './FireStage.jsx';
import ElementDebugPanel from './ElementDebugPanel.jsx';
import {getPresetByFile} from '../config/elementPresets.js';
import {
    computeQuality,
    buildAttackParams,
    applyRuneModifiers,
    RUNE_MODIFIERS
} from '../utils/attackMapping.js';
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
    const [recognizerId, setRecognizerId] = useState(DEFAULT_RECOGNIZER_ID);
    const [isDebugMenuOpen, setIsDebugMenuOpen] = useState(false);
    const debugMenuRef = useRef(null);

    // Trainer: Proben einer Rune sammeln und daraus Templates erzeugen.
    const [isTrainingMode, setIsTrainingMode] = useState(false);
    const [trainingName, setTrainingName] = useState('');
    const [samples, setSamples] = useState([]);
    const [trainingMessage, setTrainingMessage] = useState('');
    const [templateOutput, setTemplateOutput] = useState('');

    // Siegel-Auswahl + Element-Animations-POC.
    const [selectedSigilFile, setSelectedSigilFile] = useState(null);
    const [elementParams, setElementParams] = useState(null);
    const [igniteKey, setIgniteKey] = useState(0);
    const [attackStrength, setAttackStrength] = useState(null);
    const [modifierNames, setModifierNames] = useState([]);

    const selectedPreset = getPresetByFile(selectedSigilFile);

    // Konfidenz des erkannten Mitte-Siegels (Element), sonst Mittel der Ring-Runen.
    const getElementConfidence = (result) => {
        if (result?.centerSign?.match) {
            return result.centerSign.match.confidence;
        }
        const ring = result?.matches?.filter((m) => m.match) ?? [];
        if (!ring.length) return null;
        const sum = ring.reduce((acc, m) => acc + (m.match.confidence ?? 0), 0);
        return Math.round(sum / ring.length);
    };

    // Erkannte Ring-Runen als {file, name} (für Modifier + Anzeige).
    const getRunes = (result) =>
        (result?.matches ?? [])
            .filter((m) => m.match?.rune)
            .map((m) => ({file: m.match.rune.fileName, name: m.match.rune.name}));

    // Zeichenqualität -> Stärke (Power-Parameter), Ring-Runen -> Charakter-Modifier.
    const igniteAttack = (preset, signals) => {
        if (!preset) return;
        const runes = signals.runes ?? [];
        const runeFiles = runes.map((rune) => rune.file);
        const quality = computeQuality(signals);
        const params = applyRuneModifiers(
            buildAttackParams(preset, quality),
            runeFiles
        );
        setElementParams(params);
        setAttackStrength(Math.round(quality * 100));
        setModifierNames(
            runes.filter((rune) => RUNE_MODIFIERS[rune.file]).map((rune) => rune.name)
        );
        setIgniteKey((key) => key + 1);
    };

    const handleSelectSigil = (file) => {
        setSelectedSigilFile(file);
        // Animierbares Siegel: Defaults laden und Animation (neu) zünden.
        const preset = getPresetByFile(file);
        if (preset) {
            setElementParams(preset.defaults);
            setIgniteKey((key) => key + 1);
        }
    };

    const updateElementParam = (key, value) => {
        setElementParams((prev) => ({...prev, [key]: value}));
    };

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
        setAttackStrength(null);
        setModifierNames([]);
        setSelectedSigilFile(null);
        setElementParams(null);
        setIsRecognizing(false);
    };

    const calculateCircleScore = () => {
        const circleScore = getCircleScore(pointsRef.current);
        setScore(circleScore);
        // Bei gewähltem Element die Attacke an der Kreisqualität ausrichten.
        if (selectedPreset) {
            igniteAttack(selectedPreset, {
                circleScore,
                confidence: getElementConfidence(recognitionResult),
                runes: getRunes(recognitionResult)
            });
        }
    };

    const drawBoundingBoxes = (boxes, centerBox = null) => {
        const ctx = contextRef.current;
        if (!ctx) return;
        
        ctx.save();
        ctx.lineWidth = 2;
        ctx.globalCompositeOperation = 'source-over';

        if (boxes?.length) {
            ctx.strokeStyle = 'red';
            boxes.forEach(box => {
                const x = (box.x / 100) * CANVAS_WIDTH;
                const y = (box.y / 100) * CANVAS_HEIGHT;
                const w = (box.w / 100) * CANVAS_WIDTH;
                const h = (box.h / 100) * CANVAS_HEIGHT;
                ctx.strokeRect(x, y, w, h);
            });
        }

        if (centerBox) {
            ctx.strokeStyle = 'blue';
            const x = (centerBox.x / 100) * CANVAS_WIDTH;
            const y = (centerBox.y / 100) * CANVAS_HEIGHT;
            const w = (centerBox.w / 100) * CANVAS_WIDTH;
            const h = (centerBox.h / 100) * CANVAS_HEIGHT;
            ctx.strokeRect(x, y, w, h);
        }
        
        ctx.restore();
    };

    const copyTemplateOutput = async () => {
        if (!templateOutput) return;
        try {
            await navigator.clipboard.writeText(templateOutput);
            setTrainingMessage('JSON in die Zwischenablage kopiert.');
        } catch {
            setTrainingMessage('Kopieren fehlgeschlagen.');
        }
    };

    const captureSample = () => {
        const stroke = extractRunePoints(pointsRef.current);
        if (stroke.length < 4) {
            setTrainingMessage('Zu wenig Punkte — bitte einen Runen-Strich zeichnen.');
            return;
        }
        setSamples((previous) => [...previous, stroke]);
        setTrainingMessage(`Sample ${samples.length + 1} aufgenommen.`);
    };

    const buildAverageTemplate = () => {
        const name = trainingName.trim();
        if (!name) {
            setTrainingMessage('Bitte zuerst einen Runennamen eingeben.');
            return;
        }
        if (!samples.length) {
            setTrainingMessage('Noch keine Samples aufgenommen.');
            return;
        }
        const template = createAveragedTemplate(name, samples);
        setTemplateOutput(JSON.stringify(template, null, 2));
        setTrainingMessage(
            `Average-Template „${name}" mit ${samples.length} Samples erzeugt.`
        );
    };

    const buildIndividualTemplates = () => {
        const name = trainingName.trim();
        if (!name) {
            setTrainingMessage('Bitte zuerst einen Runennamen eingeben.');
            return;
        }
        if (!samples.length) {
            setTrainingMessage('Noch keine Samples aufgenommen.');
            return;
        }
        const templates = samples.map((sample, index) =>
            createTemplateFromStroke(`${name}_${index + 1}`, sample)
        );
        setTemplateOutput(JSON.stringify(templates, null, 2));
        setTrainingMessage(`${templates.length} Einzel-Templates erzeugt.`);
    };

    const discardSamples = () => {
        setSamples([]);
        setTrainingMessage('Samples geleert.');
    };

    const performRecognition = async () => {
        const canvas = canvasRef.current;

        setIsRecognizing(true);
        setRecognitionResult(null);

        try {
            const result = await recognizeRune(canvas);
            setRecognitionResult(result);
            if (result.boxes || result.centerBox) {
                drawBoundingBoxes(result.boxes, result.centerBox);
            }
            // Element automatisch aus dem erkannten Mitte-Siegel ableiten.
            const sigilFile = result?.centerSign?.match?.sign?.fileName ?? null;
            const recognizedPreset = getPresetByFile(sigilFile);
            const preset = recognizedPreset ?? selectedPreset;
            if (recognizedPreset) {
                setSelectedSigilFile(sigilFile); // UI-Auswahl spiegeln
            }
            // Erkennungs-Konfidenz + Kreisqualität bestimmen die Attacken-Stärke.
            if (preset) {
                igniteAttack(preset, {
                    circleScore: getCircleScore(pointsRef.current),
                    confidence: getElementConfidence(result),
                    runes: getRunes(result)
                });
            }
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

    const hasSomethingToClear =
        hasDrawing ||
        score !== null ||
        recognitionResult !== null ||
        selectedSigilFile !== null ||
        attackStrength !== null;

    const isRecognitionError =
        recognitionResult?.message?.includes('Fehler') ?? false;

    const scoreTone =
        score == null ? 'neutral' : score >= 80 ? 'good' : score >= 50 ? 'mid' : 'low';

    return (
        <div className="drawing">
            <div className="drawing__stage">
                <canvas
                    ref={canvasRef}
                    className="drawing__canvas"
                    style={{width: CANVAS_WIDTH, height: CANVAS_HEIGHT}}
                    aria-label="Zeichenleinwand"
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
                    onSelect={handleSelectSigil}
                    selectedFile={selectedSigilFile}
                />
                <RuneAlphabet
                    title="Runen"
                    items={ENABLED_RUNES}
                    path={RUNES_PATH}
                    side="right"
                />
            </div>

            <nav className="drawing__toolbar" aria-label="Werkzeuge">
                <div className="drawing__toolbar-group">
                    <span className="drawing__toolbar-label">Werkzeug</span>
                    <div className="drawing__toolbar-buttons">
                        <button
                            type="button"
                            className={
                                'drawing__button drawing__button--secondary' +
                                (isErasing ? ' drawing__button--active' : '')
                            }
                            onClick={() => setIsErasing((value) => !value)}
                            aria-pressed={isErasing}
                        >
                            {isErasing ? 'Radiergummi an' : 'Radieren'}
                        </button>
                        <button
                            type="button"
                            className="drawing__button drawing__button--secondary"
                            onClick={clearCanvas}
                            disabled={!hasSomethingToClear}
                        >
                            Löschen
                        </button>
                    </div>
                </div>

                <div className="drawing__toolbar-group">
                    <span className="drawing__toolbar-label">Auswertung</span>
                    <div className="drawing__toolbar-buttons">
                        <button
                            type="button"
                            className="drawing__button drawing__button--primary"
                            onClick={calculateCircleScore}
                            disabled={!hasDrawing}
                        >
                            Kreis bewerten
                        </button>
                        <button
                            type="button"
                            className="drawing__button drawing__button--secondary"
                            onClick={performRecognition}
                            disabled={!hasDrawing || isRecognizing}
                        >
                            {isRecognizing ? 'Erkenne…' : 'Runen erkennen'}
                        </button>
                    </div>
                </div>

                <div className="drawing__toolbar-group drawing__toolbar-group--end">
                    <div className="drawing__dropdown" ref={debugMenuRef}>
                        <button
                            type="button"
                            className="drawing__button drawing__button--ghost"
                            onClick={() => setIsDebugMenuOpen((open) => !open)}
                            aria-haspopup="menu"
                            aria-expanded={isDebugMenuOpen}
                        >
                            Entwickler ▾
                        </button>
                        {isDebugMenuOpen && (
                            <div
                                className="drawing__menu drawing__menu--debug"
                                role="menu"
                            >
                                <p className="drawing__menu-label">Erkenner</p>
                                {RECOGNIZERS.map((recognizer) => (
                                    <label
                                        key={recognizer.id}
                                        className="drawing__menu-radio"
                                    >
                                        <input
                                            type="radio"
                                            name="recognizer"
                                            checked={recognizerId === recognizer.id}
                                            onChange={() =>
                                                setRecognizerId(recognizer.id)
                                            }
                                        />
                                        {recognizer.label}
                                    </label>
                                ))}
                                <hr className="drawing__menu-divider" />
                                <label className="drawing__menu-radio">
                                    <input
                                        type="checkbox"
                                        checked={isTrainingMode}
                                        onChange={(event) =>
                                            setIsTrainingMode(event.target.checked)
                                        }
                                    />
                                    Template-Trainer
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            <section
                className="drawing__status"
                aria-live="polite"
                aria-label="Status"
            >
                {isRecognizing && (
                    <p className="drawing__status-loading" role="status">
                        <span className="drawing__spinner" aria-hidden="true" />
                        Runen werden erkannt…
                    </p>
                )}

                {!isRecognizing && score === null && !recognitionResult && (
                    <p className="drawing__status-hint">
                        Zeichne einen Kreis mit Runen, bewerte die Form oder starte
                        die Erkennung.
                    </p>
                )}

                {score !== null && (
                    <div className={`drawing__score drawing__score--${scoreTone}`}>
                        <div className="drawing__score-header">
                            <span className="drawing__score-label">Kreisqualität</span>
                            <strong className="drawing__score-value">{score}%</strong>
                        </div>
                        <div
                            className="drawing__score-track"
                            role="meter"
                            aria-valuenow={score}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Kreis zu ${score} Prozent perfekt`}
                        >
                            <div
                                className="drawing__score-fill"
                                style={{width: `${score}%`}}
                            />
                        </div>
                    </div>
                )}

                {attackStrength !== null && selectedPreset && (
                    <div className="drawing__attack">
                        <span className="drawing__attack-label">
                            Attacke · {selectedPreset.label}
                        </span>
                        <strong className="drawing__attack-value">
                            {attackStrength}% Stärke
                        </strong>
                    </div>
                )}

                {modifierNames.length > 0 && (
                    <p className="drawing__modifiers">
                        Modifier:{' '}
                        <strong>{modifierNames.join(', ')}</strong>
                    </p>
                )}
            </section>

            {isTrainingMode && (
                <section className="drawing__trainer" aria-label="Template-Trainer">
                    <h2 className="drawing__trainer-title">Template-Trainer</h2>
                    <p className="drawing__trainer-hint">
                        Runenname vergeben, dann mehrmals (≈5×) mit gleichem
                        Startpunkt und gleicher Richtung zeichnen und je Sample
                        aufnehmen.
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
                        <p className="drawing__trainer-message">{trainingMessage}</p>
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
                </section>
            )}

            {recognitionResult && !isRecognizing && (
                <section
                    className={
                        'drawing__recognition' +
                        (isRecognitionError
                            ? ' drawing__recognition--error'
                            : ' drawing__recognition--success')
                    }
                    aria-label="Erkennungsergebnis"
                >
                    <p className="drawing__recognition-message">
                        {recognitionResult.message}
                    </p>

                    {recognitionResult.centerSign && (
                        <div className="drawing__results drawing__results--center">
                            <h3 className="drawing__results-heading">Mitte-Siegel</h3>
                            <article className="drawing__result-card drawing__result-card--center">
                                <img
                                    src={recognitionResult.centerSign.image}
                                    alt="Erkanntes Mitte-Siegel"
                                    className="drawing__result-crop"
                                />
                                {recognitionResult.centerSign.match ? (
                                    <div className="drawing__match">
                                        <img
                                            src={
                                                recognitionResult.centerSign.match.sign
                                                    .imagePath
                                            }
                                            alt={
                                                recognitionResult.centerSign.match.sign
                                                    .name
                                            }
                                            className="drawing__match-ref"
                                            style={{
                                                transform: `rotate(${recognitionResult.centerSign.match.rotation}deg)`
                                            }}
                                        />
                                        <span className="drawing__match-name">
                                            {
                                                recognitionResult.centerSign.match.sign
                                                    .name
                                            }
                                        </span>
                                        <span className="drawing__match-meta">
                                            {
                                                recognitionResult.centerSign.match
                                                    .confidence
                                            }
                                            % · Mitte
                                            {recognitionResult.centerSign.match
                                                .rotation !== 0 &&
                                                ` · ${recognitionResult.centerSign.match.rotation}°`}
                                        </span>
                                    </div>
                                ) : (
                                    <p className="drawing__match drawing__match--unknown">
                                        Siegel nicht erkannt · Mitte
                                    </p>
                                )}
                            </article>
                        </div>
                    )}

                    {recognitionResult.matches?.length > 0 && (
                        <div className="drawing__results">
                            <h3 className="drawing__results-heading">Ring-Runen</h3>
                            <div className="drawing__results-grid">
                                {recognitionResult.matches.map((item, index) => (
                                    <article
                                        key={index}
                                        className="drawing__result-card"
                                    >
                                        <img
                                            src={item.image}
                                            alt={`Erkannte Rune ${index + 1}`}
                                            className="drawing__result-crop"
                                        />
                                        {item.match ? (
                                            <div className="drawing__match">
                                                <img
                                                    src={item.match.rune.imagePath}
                                                    alt={item.match.rune.name}
                                                    className="drawing__match-ref"
                                                    style={{
                                                        transform: `rotate(${item.match.rotation}deg)`
                                                    }}
                                                />
                                                <span className="drawing__match-name">
                                                    {item.match.rune.name}
                                                </span>
                                                <span className="drawing__match-meta">
                                                    {item.match.confidence}% ·{' '}
                                                    {item.clockPosition} Uhr
                                                    {item.match.rotation !== 0 &&
                                                        ` · ${item.match.rotation}°`}
                                                </span>
                                            </div>
                                        ) : (
                                            <p className="drawing__match drawing__match--unknown">
                                                Nicht erkannt · {item.clockPosition}{' '}
                                                Uhr
                                            </p>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {selectedPreset && elementParams && (
                <section className="drawing__element" aria-label="Element-Animation">
                    {(() => {
                        const SHADER_STAGES = {water: WaterStage, fire: FireStage};
                        const StageComponent =
                            selectedPreset.renderMode === 'shader'
                                ? SHADER_STAGES[selectedPreset.id]
                                : ElementStage;
                        return (
                            <StageComponent
                                key={selectedPreset.id}
                                preset={selectedPreset}
                                params={elementParams}
                                igniteKey={igniteKey}
                            />
                        );
                    })()}
                    <ElementDebugPanel
                        title={selectedPreset.label}
                        params={elementParams}
                        onChange={updateElementParam}
                        onReset={() => setElementParams(selectedPreset.defaults)}
                        onReplay={() => setIgniteKey((key) => key + 1)}
                    />
                </section>
            )}
        </div>
    );
}

export default DrawingCanvas;

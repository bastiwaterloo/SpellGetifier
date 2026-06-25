// Lokaler Unistroke-Ansatz ($1-Recognizer): vergleicht den gezeichneten Strich
// offline gegen die Vorlagen aus runeTemplates.ts – keine API nötig.
import {
    recognizeRune as recognizeUnistroke,
    logTemplateFromStroke,
    createNormalizedTemplate,
    createAveragedTemplate as createAveragedNormalizedTemplate
} from './unistrokeRecognizer.ts';
import {RUNE_TEMPLATES} from './runeTemplates.ts';
import {calculateCircleScore as getCircleScore} from './utils.ts';

const MIN_CONFIDENCE = 0.65;
const MIN_CIRCLE_SCORE = 70;
const INNER_RADIUS_FACTOR = 0.95;

function flattenStrokes(strokes) {
    return strokes.flat();
}

function getCenter(points) {
    const sums = points.reduce(
        (accumulator, point) => ({
            x: accumulator.x + point.x,
            y: accumulator.y + point.y
        }),
        {x: 0, y: 0}
    );

    return {
        x: sums.x / points.length,
        y: sums.y / points.length
    };
}

function getMeanRadius(points, center) {
    const total = points.reduce(
        (sum, point) => sum + Math.hypot(point.x - center.x, point.y - center.y),
        0
    );
    return total / points.length;
}

export function extractRunePoints(strokes) {
    if (!strokes.length) return [];

    let bestCircleIndex = -1;
    let bestCircleScore = -1;

    for (let index = 0; index < strokes.length; index += 1) {
        const stroke = strokes[index];
        if (stroke.length < 12) continue;
        const score = getCircleScore([stroke]);
        if (score > bestCircleScore) {
            bestCircleScore = score;
            bestCircleIndex = index;
        }
    }

    if (bestCircleIndex === -1 || bestCircleScore < MIN_CIRCLE_SCORE) {
        return flattenStrokes(strokes);
    }

    const circleStroke = strokes[bestCircleIndex];
    const center = getCenter(circleStroke);
    const radius = getMeanRadius(circleStroke, center) * INNER_RADIUS_FACTOR;
    const runePoints = strokes
        .filter((_, index) => index !== bestCircleIndex)
        .flat()
        .filter(
            (point) => Math.hypot(point.x - center.x, point.y - center.y) <= radius
        );

    return runePoints.length > 0
        ? runePoints
        : flattenStrokes(strokes.filter((_, index) => index !== bestCircleIndex));
}

export async function loadRuneTemplates() {
    return RUNE_TEMPLATES;
}

export async function recognizeRune(strokes, templates = RUNE_TEMPLATES) {
    try {
        const userStroke = extractRunePoints(strokes);
        const result = recognizeUnistroke(userStroke, templates);

        if (!result || result.score < MIN_CONFIDENCE) {
            return {
                match: null,
                confidence: 0,
                message: 'Keine passende Rune gefunden'
            };
        }

        const confidence = Math.round(result.score * 100);
        return {
            match: result.template,
            confidence,
            message: `Erkannt: ${result.template.name} (${confidence}% Übereinstimmung)`
        };
    } catch (error) {
        console.error('Fehler bei der Runen-Erkennung:', error);
        return {
            match: null,
            confidence: 0,
            message: `Fehler: ${error.message}`
        };
    }
}

export function exportTemplateFromStroke(name, stroke, extras = {}) {
    return logTemplateFromStroke(name, stroke, extras);
}

export function createTemplateFromStroke(name, stroke, extras = {}) {
    return createNormalizedTemplate(name, stroke, extras);
}

// Mehrere aufgenommene Proben zu einem gemittelten Template zusammenführen.
export function createAveragedTemplate(name, samples, extras = {}) {
    return createAveragedNormalizedTemplate(name, samples, extras);
}

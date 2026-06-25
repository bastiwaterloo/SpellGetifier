// Recognizer-Wrapper auf Basis des $P-Point-Cloud-Algorithmus.
// Die Templates werden zur Laufzeit aus den Rune-SVGs (Vektoren) erzeugt –
// keine handgezeichneten Vorlagen nötig.
import {RUNES_PATH, ENABLED_RUNES} from '../config.js';
import {recognize as recognizeCloud, createPointCloud} from './pDollarRecognizer.ts';
import {sampleSvgFromUrl} from './svgSampler.ts';
import {calculateCircleScore as getCircleScore} from './utils.ts';

const VECTORS_PATH = '/assets/vectors/sign';
const MIN_CONFIDENCE = 0.3; // $P-Score-Schwelle; ggf. mit echten Tests justieren
const MIN_CIRCLE_SCORE = 70;
const INNER_RADIUS_FACTOR = 0.95;

let templatesPromise = null;

function getCenter(points) {
    const sums = points.reduce(
        (accumulator, point) => ({
            x: accumulator.x + point.x,
            y: accumulator.y + point.y
        }),
        {x: 0, y: 0}
    );
    return {x: sums.x / points.length, y: sums.y / points.length};
}

function getMeanRadius(points, center) {
    const total = points.reduce(
        (sum, point) => sum + Math.hypot(point.x - center.x, point.y - center.y),
        0
    );
    return total / points.length;
}

// Wie beim Unistroke-Ansatz den umschließenden Kreis abziehen – hier aber die
// verbleibenden Striche als Gruppen behalten ($P ist mehrstrich-fähig).
function extractRuneStrokes(strokes) {
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
        return strokes;
    }

    const circleStroke = strokes[bestCircleIndex];
    const center = getCenter(circleStroke);
    const radius = getMeanRadius(circleStroke, center) * INNER_RADIUS_FACTOR;

    const runeStrokes = strokes
        .filter((_, index) => index !== bestCircleIndex)
        .map((stroke) =>
            stroke.filter(
                (point) =>
                    Math.hypot(point.x - center.x, point.y - center.y) <= radius
            )
        )
        .filter((stroke) => stroke.length > 0);

    return runeStrokes.length > 0
        ? runeStrokes
        : strokes.filter((_, index) => index !== bestCircleIndex);
}

async function buildTemplates() {
    const results = await Promise.all(
        ENABLED_RUNES.map(async ({file, label}) => {
            try {
                const strokes = await sampleSvgFromUrl(`${VECTORS_PATH}/${file}.svg`);
                if (!strokes.length) return null;
                return createPointCloud(label, strokes, {
                    id: file,
                    imagePath: `${RUNES_PATH}/${file}.png`
                });
            } catch (error) {
                console.warn(`Template für ${file} übersprungen:`, error);
                return null;
            }
        })
    );
    return results.filter(Boolean);
}

export async function loadRuneTemplates() {
    if (!templatesPromise) {
        templatesPromise = buildTemplates();
    }
    return templatesPromise;
}

export async function recognizeRune(strokes) {
    try {
        const templates = await loadRuneTemplates();
        if (!templates.length) {
            return {
                match: null,
                confidence: 0,
                message: 'Keine Vektor-Templates verfügbar'
            };
        }

        const runeStrokes = extractRuneStrokes(strokes);
        const result = recognizeCloud(runeStrokes, templates);

        if (!result) {
            return {
                match: null,
                confidence: 0,
                message: 'Keine passende Rune gefunden'
            };
        }

        const confidence = Math.round(result.score * 100);
        if (result.score < MIN_CONFIDENCE) {
            return {
                match: null,
                confidence,
                message: `Keine passende Rune (beste: ${result.template.name}, ${confidence}%)`
            };
        }

        return {
            match: result.template,
            confidence,
            message: `Erkannt: ${result.template.name} (${confidence}% Übereinstimmung)`
        };
    } catch (error) {
        console.error('Fehler bei der $P-Erkennung:', error);
        return {
            match: null,
            confidence: 0,
            message: `Fehler: ${error.message}`
        };
    }
}

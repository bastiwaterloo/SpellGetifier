// Lokale Klassifikation einzelner Glyphen über den $P-Point-Cloud-Recognizer.
// Eingabe sind die Striche eines bereits segmentierten Glyphs (Point[][]).
// Rune-Templates kommen aus den Rune-SVGs (via pDollarRecognition), Siegel-
// Templates werden hier aus den Siegel-SVGs erzeugt.
import {recognize as pdollarRecognize, createPointCloud} from './pDollarRecognizer.ts';
import {loadRuneTemplates} from './pDollarRecognition.jsx';
import {sampleSvgFromUrl} from './svgSampler.ts';
import {ENABLED_SIGNS, SIGNS_PATH} from '../config.js';

const SIGN_VECTORS_PATH = '/assets/vectors/modifiers';
const MIN_CONFIDENCE = 0.3; // $P-Score-Schwelle (wie beim Rune-Recognizer)

let signTemplatesPromise = null;

async function loadSignTemplates() {
    if (!signTemplatesPromise) {
        signTemplatesPromise = Promise.all(
            ENABLED_SIGNS.map(async ({file, label}) => {
                try {
                    const strokes = await sampleSvgFromUrl(
                        `${SIGN_VECTORS_PATH}/${file}.svg`
                    );
                    if (!strokes.length) return null;
                    return createPointCloud(label, strokes, {
                        id: file,
                        imagePath: `${SIGNS_PATH}/${file}.png`
                    });
                } catch (error) {
                    // z. B. fehlendes SVG (water_simple) -> kein lokales Template.
                    console.warn(`Sign-Template ${file} übersprungen:`, error.message);
                    return null;
                }
            })
        ).then((list) => list.filter(Boolean));
    }
    return signTemplatesPromise;
}

function bestMatch(strokeGroups, templates) {
    if (!strokeGroups.length || !templates.length) return null;
    const result = pdollarRecognize(strokeGroups, templates);
    if (!result || result.score < MIN_CONFIDENCE) return null;
    return {template: result.template, confidence: Math.round(result.score * 100)};
}

// Liefert dieselbe Match-Form wie identifySingleRune (Gemini): {rune, confidence, rotation}.
export async function classifyRune(strokeGroups) {
    const templates = await loadRuneTemplates();
    const match = bestMatch(strokeGroups, templates);
    if (!match) return null;
    return {
        rune: {
            name: match.template.name,
            fileName: match.template.id,
            imagePath: match.template.imagePath
        },
        confidence: match.confidence,
        rotation: 0 // $P liefert keine Rotation
    };
}

// Liefert dieselbe Match-Form wie identifyCenterSign (Gemini): {sign, confidence, rotation}.
export async function classifySign(strokeGroups) {
    const templates = await loadSignTemplates();
    const match = bestMatch(strokeGroups, templates);
    if (!match) return null;
    return {
        sign: {
            name: match.template.name,
            fileName: match.template.id,
            imagePath: match.template.imagePath
        },
        confidence: match.confidence,
        rotation: 0
    };
}

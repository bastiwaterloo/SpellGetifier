// Registry der verfügbaren Runen-Recognizer. Beide Ansätze bleiben als
// Alternativen erhalten und teilen sich eine einheitliche Schnittstelle:
//   recognize({canvas, strokes}) -> {match, confidence, message}
//   loadTemplates() -> Promise (Vorlagen/Beschreibungen vorladen)
import {
    recognizeRune as recognizeWithGemini,
    loadRuneTemplates as loadGeminiTemplates
} from './runeRecognition.jsx';
import {
    recognizeRune as recognizeWithUnistroke,
    loadRuneTemplates as loadUnistrokeTemplates
} from './unistrokeRecognition.jsx';

export const RECOGNIZERS = [
    {
        id: 'unistroke',
        label: 'Unistroke (lokal)',
        loadTemplates: loadUnistrokeTemplates,
        // Lokaler $1-Recognizer arbeitet auf den aufgezeichneten Punkten.
        recognize: ({strokes}) => recognizeWithUnistroke(strokes)
    },
    {
        id: 'gemini',
        label: 'KI (Gemini)',
        loadTemplates: loadGeminiTemplates,
        // Gemini Vision braucht das gerenderte Canvas-Bild.
        recognize: ({canvas}) => recognizeWithGemini(canvas)
    }
];

export const DEFAULT_RECOGNIZER_ID = 'unistroke';

export function getRecognizer(id) {
    return RECOGNIZERS.find((recognizer) => recognizer.id === id) ?? RECOGNIZERS[0];
}

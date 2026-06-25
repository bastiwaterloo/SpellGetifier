import { RUNES_PATH, RUNE_NAMES, RUNE_COUNT } from '../config.js';
import { callGeminiVision, parseJsonResponse } from './geminiApi.jsx';

let runeDescriptions = null;

async function loadRuneDescriptions() {
    if (runeDescriptions) return runeDescriptions;

    runeDescriptions = RUNE_NAMES.map((name, index) => ({
        id: index + 1,
        name: name.replace(/_/g, ' '),
        fileName: name,
        imagePath: `${RUNES_PATH}/${name}.png`
    }));

    return runeDescriptions;
}

export async function loadRuneTemplates() {
    return loadRuneDescriptions();
}

function canvasToBase64(canvas) {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');

    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(canvas, 0, 0);

    const dataUrl = tempCanvas.toDataURL('image/png');
    return dataUrl.split(',')[1];
}

async function loadImageAsBase64(imagePath) {
    const response = await fetch(imagePath);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function buildPrompt() {
    return `Du bist ein Runen-Erkennungssystem. 

Das ERSTE Bild ist eine handgezeichnete Rune (schwarze Linien auf weißem Hintergrund).
Die FOLGENDEN ${RUNE_COUNT} Bilder sind die Referenz-Runen (Rune 1 bis Rune ${RUNE_COUNT}, in dieser Reihenfolge).

Vergleiche die handgezeichnete Rune mit allen Referenz-Runen und finde die beste Übereinstimmung.

WICHTIG: Antworte NUR mit einem JSON-Objekt in diesem Format:
{"runeId": <nummer>, "confidence": <0-100>}

Wenn keine Rune passt, antworte:
{"runeId": null, "confidence": 0}`;
}

export async function recognizeRune(canvas) {
    const runes = await loadRuneDescriptions();

    try {
        const drawingBase64 = canvasToBase64(canvas);

        const runeImages = await Promise.all(
            runes.map(async (rune) => {
                const base64 = await loadImageAsBase64(rune.imagePath);
                return { base64 };
            })
        );

        const images = [
            { base64: drawingBase64 },
            ...runeImages
        ];

        const response = await callGeminiVision(buildPrompt(), images);
        const result = parseJsonResponse(response.text);

        if (!result) {
            return {
                match: null,
                confidence: 0,
                message: 'Keine gültige Antwort erhalten'
            };
        }

        if (result.runeId === null || result.confidence < 20) {
            return {
                match: null,
                confidence: 0,
                message: 'Keine passende Rune gefunden'
            };
        }

        const matchedRune = runes.find(r => r.id === result.runeId);
        if (!matchedRune) {
            return {
                match: null,
                confidence: 0,
                message: 'Keine passende Rune gefunden'
            };
        }

        return {
            match: matchedRune,
            confidence: result.confidence,
            message: `Erkannt: ${matchedRune.name} (${result.confidence}% Übereinstimmung)`
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

// Platzhalter-Zauber: der eigentliche iterative Abgleich folgt später.
// Gleiches Ergebnis-Schema wie recognizeRune, damit die Anzeige unverändert bleibt.
export async function itterativeAnalysis(canvas) {
    void canvas;
    return {
        match: null,
        confidence: 0,
        message: 'Alter Zauber: noch nicht implementiert'
    };
}

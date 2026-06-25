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

Das ERSTE Bild ist eine handgezeichnete Zeichnung (schwarze Linien auf weißem Hintergrund).
Die Zeichnung kann EINE ODER MEHRERE Runen enthalten.
Die FOLGENDEN ${RUNE_COUNT} Bilder sind die Referenz-Runen (Rune 1 bis Rune ${RUNE_COUNT}, in dieser Reihenfolge).

Analysiere die handgezeichnete Zeichnung und identifiziere ALLE erkennbaren Runen.
Vergleiche jede gefundene Rune mit den Referenz-Runen.
Runen können auch rotiert sein. Prüfe also auch, ob es sich um eine Rune in einer anderen Rotation handelt.
Bestimme auch die ROTATION jeder Rune in Grad (0-359), wobei 0° die Standardausrichtung ist.

Antworte NUR mit reinem JSON (kein Markdown, keine Code-Blöcke, keine Erklärung):
{"runes":[{"runeId":1,"confidence":85,"rotation":0}]}

- runeId: Nummer der erkannten Referenz-Rune (1 bis ${RUNE_COUNT})
- confidence: Übereinstimmung in Prozent (0-100)
- rotation: Grad im Uhrzeigersinn von der Standardausrichtung (0, 90, 180, 270 oder Zwischenwerte)

Reihenfolge: von links nach rechts, von oben nach unten.

Wenn keine Rune erkannt wird: {"runes":[]}`;
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

        if (!result || !result.runes) {
            return {
                matches: [],
                message: 'Keine gültige Antwort erhalten'
            };
        }

        if (result.runes.length === 0) {
            return {
                matches: [],
                message: 'Keine Runen erkannt'
            };
        }

        const matches = result.runes
            .filter(r => r.runeId !== null && r.confidence >= 20)
            .map(r => {
                const matchedRune = runes.find(rune => rune.id === r.runeId);
                return matchedRune ? {
                    rune: matchedRune,
                    confidence: r.confidence,
                    rotation: r.rotation ?? 0
                } : null;
            })
            .filter(Boolean);

        if (matches.length === 0) {
            return {
                matches: [],
                message: 'Keine passenden Runen gefunden'
            };
        }

        const runeNames = matches.map(m => m.rune.name).join(', ');
        return {
            matches,
            message: `Erkannt: ${runeNames} (${matches.length} Rune${matches.length > 1 ? 'n' : ''})`
        };

    } catch (error) {
        console.error('Fehler bei der Runen-Erkennung:', error);
        return {
            matches: [],
            message: `Fehler: ${error.message}`
        };
    }
}

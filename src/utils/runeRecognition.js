import { RUNES_PATH, RUNE_COUNT } from '../config.js';

let runeDescriptions = null;

async function loadRuneDescriptions() {
    if (runeDescriptions) return runeDescriptions;

    runeDescriptions = [];
    for (let i = 1; i <= RUNE_COUNT; i++) {
        runeDescriptions.push({
            id: i,
            name: `Rune ${i}`,
            imagePath: `${RUNES_PATH}/rune_${String(i).padStart(2, '0')}.png`
        });
    }
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

    ctx.fillStyle = 'black';
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

export async function recognizeRune(canvas) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        return {
            match: null,
            confidence: 0,
            message: 'API-Key fehlt. Bitte VITE_GEMINI_API_KEY in .env setzen.'
        };
    }

    const runes = await loadRuneDescriptions();

    try {
        const drawingBase64 = canvasToBase64(canvas);

        const runeImages = await Promise.all(
            runes.map(async (rune) => {
                const base64 = await loadImageAsBase64(rune.imagePath);
                return { id: rune.id, base64 };
            })
        );

        const runeListText = runes.map(r => `- Rune ${r.id}`).join('\n');

        const imageParts = [
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: drawingBase64
                }
            },
            ...runeImages.map(ri => ({
                inlineData: {
                    mimeType: 'image/png',
                    data: ri.base64
                }
            }))
        ];

        const prompt = `Du bist ein Runen-Erkennungssystem. 

Das ERSTE Bild ist eine handgezeichnete Rune (weiße Linien auf schwarzem Hintergrund).
Die FOLGENDEN ${RUNE_COUNT} Bilder sind die Referenz-Runen (Rune 1 bis Rune ${RUNE_COUNT}, in dieser Reihenfolge).

Vergleiche die handgezeichnete Rune mit allen Referenz-Runen und finde die beste Übereinstimmung.

WICHTIG: Antworte NUR mit einem JSON-Objekt in diesem Format:
{"runeId": <nummer>, "confidence": <0-100>}

Wenn keine Rune passt, antworte:
{"runeId": null, "confidence": 0}`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: prompt },
                                ...imageParts
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 100
                    }
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('Gemini API Error:', error);
            return {
                match: null,
                confidence: 0,
                message: `API-Fehler: ${error.error?.message || 'Unbekannter Fehler'}`
            };
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return {
                match: null,
                confidence: 0,
                message: 'Keine gültige Antwort erhalten'
            };
        }

        const result = JSON.parse(jsonMatch[0]);

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

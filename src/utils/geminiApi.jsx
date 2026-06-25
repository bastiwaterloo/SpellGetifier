const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 5;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function callGeminiVision(prompt, images, options = {}) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error('API-Key fehlt. Bitte VITE_GEMINI_API_KEY in .env setzen.');
    }

    const {
        temperature = 0.1,
        maxOutputTokens = 1024
    } = options;

    const imageParts = images.map(img => ({
        inlineData: {
            mimeType: img.mimeType || 'image/png',
            data: img.base64
        }
    }));

    const requestBody = JSON.stringify({
        contents: [
            {
                parts: [
                    { text: prompt },
                    ...imageParts
                ]
            }
        ],
        generationConfig: {
            temperature,
            maxOutputTokens
        }
    });

    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(
                `${API_BASE_URL}/${MODEL}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: requestBody
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

            return {
                text: textResponse,
                raw: data
            };

        } catch (error) {
            lastError = error;
            console.warn(`API-Versuch ${attempt}/${MAX_RETRIES} fehlgeschlagen:`, error.message);

            if (attempt < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.log(`Warte ${delay}ms vor erneutem Versuch...`);
                await sleep(delay);
            }
        }
    }

    throw new Error(`API-Fehler nach ${MAX_RETRIES} Versuchen: ${lastError.message}`);
}

export function parseJsonResponse(text) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return null;
    }

    let jsonString = jsonMatch[0];

    // Bereinige häufige Probleme in KI-generierten JSON-Antworten
    jsonString = jsonString
        // Entferne Trailing Commas vor ] oder }
        .replace(/,\s*([\]}])/g, '$1')
        // Entferne Kommentare (// ...)
        .replace(/\/\/[^\n]*/g, '')
        // Normalisiere Whitespace
        .replace(/[\r\n\t]+/g, ' ');

    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('JSON-Parsing fehlgeschlagen:', error.message);
        console.error('Bereinigte Antwort:', jsonString);
        return null;
    }
}

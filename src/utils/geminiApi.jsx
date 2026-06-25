const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.5-flash';

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

    const response = await fetch(
        `${API_BASE_URL}/${MODEL}:generateContent?key=${apiKey}`,
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
                    temperature,
                    maxOutputTokens
                }
            })
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Unbekannter API-Fehler');
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
        text: textResponse,
        raw: data
    };
}

export function parseJsonResponse(text) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return null;
    }
    return JSON.parse(jsonMatch[0]);
}

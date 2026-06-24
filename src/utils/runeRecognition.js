export const RUNE_COUNT = 34;
const RUNE_SIZE = 128;

let runeTemplates = null;

export async function loadRuneTemplates() {
    if (runeTemplates) return runeTemplates;

    runeTemplates = [];

    for (let i = 1; i <= RUNE_COUNT; i++) {
        const paddedNum = String(i).padStart(2, '0');
        const img = new Image();
        img.src = `/runes/rune_${paddedNum}.png`;

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = RUNE_SIZE;
        canvas.height = RUNE_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, RUNE_SIZE, RUNE_SIZE);

        const imageData = ctx.getImageData(0, 0, RUNE_SIZE, RUNE_SIZE);
        const binaryData = toBinary(imageData);

        runeTemplates.push({
            id: i,
            name: `Rune ${i}`,
            data: binaryData,
            image: img
        });
    }

    return runeTemplates;
}

function toBinary(imageData) {
    const data = imageData.data;
    const binary = new Uint8Array(imageData.width * imageData.height);

    for (let i = 0; i < binary.length; i++) {
        const pixelIndex = i * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        const gray = (r + g + b) / 3;
        binary[i] = gray < 128 ? 1 : 0;
    }

    return binary;
}

function preprocessDrawing(canvas) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = RUNE_SIZE;
    tempCanvas.height = RUNE_SIZE;
    const ctx = tempCanvas.getContext('2d');

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, RUNE_SIZE, RUNE_SIZE);

    const sourceCanvas = canvas;
    const dpr = window.devicePixelRatio || 1;
    const sourceWidth = sourceCanvas.width / dpr;
    const sourceHeight = sourceCanvas.height / dpr;

    const sourceCtx = sourceCanvas.getContext('2d');
    const sourceData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    let minX = sourceCanvas.width;
    let minY = sourceCanvas.height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < sourceCanvas.height; y++) {
        for (let x = 0; x < sourceCanvas.width; x++) {
            const i = (y * sourceCanvas.width + x) * 4;
            const a = sourceData.data[i + 3];
            if (a > 50) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    if (maxX <= minX || maxY <= minY) {
        return null;
    }

    const padding = 10;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(sourceCanvas.width, maxX + padding);
    maxY = Math.min(sourceCanvas.height, maxY + padding);

    const drawingWidth = maxX - minX;
    const drawingHeight = maxY - minY;

    const scale = Math.min(
        (RUNE_SIZE - 20) / drawingWidth,
        (RUNE_SIZE - 20) / drawingHeight
    );

    const scaledWidth = drawingWidth * scale;
    const scaledHeight = drawingHeight * scale;
    const offsetX = (RUNE_SIZE - scaledWidth) / 2;
    const offsetY = (RUNE_SIZE - scaledHeight) / 2;

    ctx.drawImage(
        sourceCanvas,
        minX, minY, drawingWidth, drawingHeight,
        offsetX, offsetY, scaledWidth, scaledHeight
    );

    const imageData = ctx.getImageData(0, 0, RUNE_SIZE, RUNE_SIZE);
    return toBinary(imageData);
}

function calculateSimilarity(data1, data2) {
    if (!data1 || !data2 || data1.length !== data2.length) {
        return 0;
    }

    let matches = 0;
    let total1 = 0;
    let total2 = 0;

    for (let i = 0; i < data1.length; i++) {
        if (data1[i] === 1) total1++;
        if (data2[i] === 1) total2++;
        if (data1[i] === 1 && data2[i] === 1) {
            matches++;
        }
    }

    if (total1 === 0 || total2 === 0) return 0;

    const precision = matches / total1;
    const recall = matches / total2;

    if (precision + recall === 0) return 0;
    const f1Score = (2 * precision * recall) / (precision + recall);

    return f1Score;
}

export async function recognizeRune(canvas) {
    const templates = await loadRuneTemplates();
    const drawingData = preprocessDrawing(canvas);

    if (!drawingData) {
        return { match: null, confidence: 0, message: 'Keine Zeichnung erkannt' };
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const template of templates) {
        const score = calculateSimilarity(drawingData, template.data);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = template;
        }
    }

    const confidence = Math.round(bestScore * 100);

    if (confidence < 15) {
        return {
            match: null,
            confidence: 0,
            message: 'Keine passende Rune gefunden'
        };
    }

    return {
        match: bestMatch,
        confidence,
        message: `Erkannt: ${bestMatch.name} (${confidence}% Übereinstimmung)`
    };
}

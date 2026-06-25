import { RUNES_PATH, RUNE_NAMES, RUNE_COUNT } from '../config.js';
import { callGeminiVision, parseJsonResponse } from './geminiApi.jsx';
import { detectRunes } from './iterativeRecognition.js';

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

function buildCountPrompt() {
    return `Analyze this image of handdrawn runes on white background.

IMPORTANT: 
- A single rune can have MULTIPLE disconnected strokes/parts.
- The runes are usually drawn INSIDE A CIRCLE. IGNORE the circle - it is NOT a rune.
- Only count the rune symbols inside the circle, not the circle itself.

Your task: Count how many COMPLETE RUNES are in the drawing.
- Do NOT count the surrounding circle
- Do NOT count individual strokes as separate runes
- Group strokes that form a single rune symbol together
- If the same rune appears multiple times, count each occurrence

Study the reference images carefully to understand what constitutes ONE rune.

Reply ONLY with valid JSON: {"count":N}`;
}

function buildBoxPrompt(count) {
    return `This image contains exactly ${count} handdrawn rune(s) on white background.
The runes are drawn INSIDE A CIRCLE. IGNORE the circle - only find bounding boxes for the runes.

Find the EXACT pixel-perfect bounding box for each rune (NOT the circle).

For each rune, find:
- The LEFTMOST black pixel of the RUNE → this is x
- The TOPMOST black pixel of the RUNE → this is y
- The RIGHTMOST black pixel of the RUNE → x + w
- The BOTTOMMOST black pixel of the RUNE → y + h

A rune may have disconnected strokes - include ALL strokes of one rune in ONE box.
Do NOT include the surrounding circle in the bounding box.

Return coordinates as PERCENTAGE (0-100) of image width/height.
x and y are the top-left corner. w is width, h is height.

Return EXACTLY ${count} box${count > 1 ? 'es' : ''} for the runes only.

JSON only: {"runes":[{"x":N,"y":N,"w":N,"h":N}]}`;
}

function buildIdentifyPrompt() {
    return `The FIRST image shows a SINGLE handdrawn rune on white background.
The following ${RUNE_COUNT} images are the REFERENCE runes (numbered 1 to ${RUNE_COUNT}).

IMPORTANT: 
- The reference images show the STANDARD orientation (0 degrees).
- The handdrawn rune may be ROTATED compared to the reference.
- IGNORE any circle or arc that may be visible - focus ONLY on the rune symbol.

Your task:
1. Find which reference rune matches the handdrawn rune (ignore any circle)
2. Determine the rotation angle in 15° steps (0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345)

Reply ONLY with valid JSON:
{"runeId":N,"confidence":0-100,"rotation":DEGREES}

- runeId: Number of the matching reference rune (1 to ${RUNE_COUNT}), or null if no match
- confidence: Match percentage (0-100)
- rotation: Degrees clockwise in 15° steps (0, 15, 30, ... 345). Use 0 if rotation is very small.`;
}

const OUTPUT_SIZE = 128;
const MAX_MERGE_DISTANCE = 8;

function calculateClockPosition(box, canvasWidth, canvasHeight) {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    const boxCenterX = (box.x + box.w / 2) / 100 * canvasWidth;
    const boxCenterY = (box.y + box.h / 2) / 100 * canvasHeight;
    
    const dx = boxCenterX - centerX;
    const dy = boxCenterY - centerY;
    
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    angle = (angle + 90 + 360) % 360;
    
    let clockPos = Math.round(angle / 30);
    if (clockPos === 0) clockPos = 12;
    
    return clockPos;
}

function findConnectedComponents(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    const visited = new Array(width * height).fill(false);
    const components = [];
    
    const isDrawn = (x, y) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
        return a > 50 && (r < 200 || g < 200 || b < 200);
    };
    
    const floodFill = (startX, startY) => {
        const stack = [[startX, startY]];
        let minX = startX, maxX = startX, minY = startY, maxY = startY;
        
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = y * width + x;
            
            if (visited[idx] || !isDrawn(x, y)) continue;
            visited[idx] = true;
            
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        
        return { minX, maxX, minY, maxY };
    };
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (!visited[idx] && isDrawn(x, y)) {
                const bounds = floodFill(x, y);
                if (bounds.maxX - bounds.minX > 2 && bounds.maxY - bounds.minY > 2) {
                    components.push(bounds);
                }
            }
        }
    }
    
    return components.map(c => ({
        x: (c.minX / width) * 100,
        y: (c.minY / height) * 100,
        w: ((c.maxX - c.minX) / width) * 100,
        h: ((c.maxY - c.minY) / height) * 100,
        centerX: ((c.minX + c.maxX) / 2 / width) * 100,
        centerY: ((c.minY + c.maxY) / 2 / height) * 100
    }));
}

function isCircleLike(component) {
    const aspectRatio = component.w / component.h;
    const isSquarish = aspectRatio > 0.7 && aspectRatio < 1.4;
    const isLarge = component.w > 40 && component.h > 40;
    const coversLargeArea = component.w * component.h > 2000;
    return isSquarish && isLarge && coversLargeArea;
}

function filterOutCircle(components) {
    if (components.length <= 1) return components;
    
    const sorted = [...components].sort((a, b) => (b.w * b.h) - (a.w * a.h));
    const largest = sorted[0];
    
    if (isCircleLike(largest)) {
        console.log('Kreis erkannt und gefiltert:', largest);
        return components.filter(c => c !== largest);
    }
    
    return components;
}

function mergeComponentsIntoRunes(components) {
    if (components.length === 0) return [];
    
    const filtered = filterOutCircle(components);
    if (filtered.length === 0) return [];
    
    let groups = filtered.map(c => [c]);
    
    let merged = true;
    while (merged) {
        merged = false;
        let minDist = Infinity;
        let mergeI = -1, mergeJ = -1;
        
        for (let i = 0; i < groups.length; i++) {
            for (let j = i + 1; j < groups.length; j++) {
                const centerI = {
                    x: groups[i].reduce((s, c) => s + c.centerX, 0) / groups[i].length,
                    y: groups[i].reduce((s, c) => s + c.centerY, 0) / groups[i].length
                };
                const centerJ = {
                    x: groups[j].reduce((s, c) => s + c.centerX, 0) / groups[j].length,
                    y: groups[j].reduce((s, c) => s + c.centerY, 0) / groups[j].length
                };
                const dist = Math.hypot(centerI.x - centerJ.x, centerI.y - centerJ.y);
                if (dist < minDist) {
                    minDist = dist;
                    mergeI = i;
                    mergeJ = j;
                }
            }
        }
        
        if (minDist < MAX_MERGE_DISTANCE && mergeI >= 0) {
            groups[mergeI] = [...groups[mergeI], ...groups[mergeJ]];
            groups.splice(mergeJ, 1);
            merged = true;
        }
    }
    
    return groups.map(group => {
        const minX = Math.min(...group.map(c => c.x));
        const minY = Math.min(...group.map(c => c.y));
        const maxX = Math.max(...group.map(c => c.x + c.w));
        const maxY = Math.max(...group.map(c => c.y + c.h));
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    });
}

function extractRuneImages(canvas, boxes) {
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;
    
    return boxes.map(box => {
        const x = (box.x / 100) * canvasWidth;
        const y = (box.y / 100) * canvasHeight;
        const w = (box.w / 100) * canvasWidth;
        const h = (box.h / 100) * canvasHeight;
        
        const sx = Math.max(0, x);
        const sy = Math.max(0, y);
        const sw = Math.min(w, canvasWidth - sx);
        const sh = Math.min(h, canvasHeight - sy);
        
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        tempCanvas.width = OUTPUT_SIZE;
        tempCanvas.height = OUTPUT_SIZE;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        
        const scale = Math.min(OUTPUT_SIZE / sw, OUTPUT_SIZE / sh);
        const scaledW = sw * scale;
        const scaledH = sh * scale;
        const offsetX = (OUTPUT_SIZE - scaledW) / 2;
        const offsetY = (OUTPUT_SIZE - scaledH) / 2;
        
        ctx.drawImage(
            canvas,
            sx * dpr, sy * dpr, sw * dpr, sh * dpr,
            offsetX, offsetY, scaledW, scaledH
        );
        
        const dataUrl = tempCanvas.toDataURL('image/png');
        return {
            dataUrl,
            base64: dataUrl.split(',')[1]
        };
    });
}

function normalizeRotation(rotation) {
    if (rotation === undefined || rotation === null) return 0;
    let r = Math.round(rotation / 15) * 15;
    r = ((r % 360) + 360) % 360;
    if (r < 15 || r > 345) return 0;
    return r;
}

async function identifySingleRune(runeBase64, runeImages, runes) {
    const response = await callGeminiVision(
        buildIdentifyPrompt(),
        [{ base64: runeBase64 }, ...runeImages]
    );
    console.log('Identify Antwort:', response.text);
    
    const result = parseJsonResponse(response.text);
    if (!result || result.runeId === null) {
        return null;
    }
    
    const matchedRune = runes.find(r => r.id === result.runeId);
    if (!matchedRune) return null;
    
    const normalizedRotation = normalizeRotation(result.rotation);
    console.log(`Rotation: ${result.rotation}° → normalisiert: ${normalizedRotation}°`);
    
    return {
        rune: matchedRune,
        confidence: result.confidence || 0,
        rotation: normalizedRotation
    };
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

        const countResponse = await callGeminiVision(
            buildCountPrompt(),
            [{ base64: drawingBase64 }, ...runeImages]
        );
        console.log('Count Antwort:', countResponse.text);
        
        const countResult = parseJsonResponse(countResponse.text);
        let count = countResult?.count;
        if (count === undefined) {
            const numberMatch = countResponse.text.match(/\d+/);
            count = numberMatch ? parseInt(numberMatch[0], 10) : 1;
        }
        count = Math.max(1, count);
        console.log('Erkannte Anzahl:', count);

        const boxResponse = await callGeminiVision(
            buildBoxPrompt(count),
            [{ base64: drawingBase64 }]
        );
        console.log('Box Antwort:', boxResponse.text);
        
        const boxResult = parseJsonResponse(boxResponse.text);
        let boxes = boxResult?.runes || [];
        console.log('Gefundene Boxes:', boxes);
        
        boxes = boxes.filter(b => 
            typeof b.x === 'number' && 
            typeof b.y === 'number' &&
            typeof b.w === 'number' &&
            typeof b.h === 'number'
        );
        
        if (boxes.length < count) {
            console.warn(`Nur ${boxes.length} Boxes von Gemini, erwarte ${count}. Nutze Pixel-Analyse.`);
            const components = findConnectedComponents(canvas);
            console.log('Gefundene Komponenten:', components.length);
            boxes = mergeComponentsIntoRunes(components);
            count = boxes.length;
            console.log('Erkannte Runen nach Pixel-Analyse:', count, boxes);
        }
        
        const extractedRunes = extractRuneImages(canvas, boxes);
        console.log('Extrahierte Runen:', extractedRunes.length);
        
        const dpr = window.devicePixelRatio || 1;
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;
        
        const matches = [];
        for (let i = 0; i < extractedRunes.length; i++) {
            console.log(`Identifiziere Rune ${i + 1}/${extractedRunes.length}...`);
            const match = await identifySingleRune(extractedRunes[i].base64, runeImages, runes);
            const clockPosition = calculateClockPosition(boxes[i], canvasWidth, canvasHeight);
            console.log(`Rune ${i + 1} Uhrposition: ${clockPosition}`);
            matches.push({
                image: extractedRunes[i].dataUrl,
                match: match,
                clockPosition: clockPosition
            });
        }
        
        const recognizedNames = matches
            .filter(m => m.match)
            .map(m => m.match.rune.name);
        
        return {
            count,
            boxes,
            matches,
            images: extractedRunes.map(r => r.dataUrl),
            message: recognizedNames.length > 0 
                ? `Erkannt: ${recognizedNames.join(', ')}` 
                : `${count} Rune${count !== 1 ? 'n' : ''} gefunden, keine identifiziert`
        };

    } catch (error) {
        console.error('Fehler bei der Runen-Erkennung:', error);
        return {
            count: 1,
            boxes: [],
            matches: [],
            images: [canvas.toDataURL('image/png')],
            message: `Fehler: ${error.message}`
        };
    }
}

// Iterativer Abgleich (lokal, ohne API): findet alle Runen im Bild.
export async function itterativeAnalysis(canvas) {
    return detectRunes(canvas);
}

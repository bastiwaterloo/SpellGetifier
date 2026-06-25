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

IMPORTANT: A single rune can have MULTIPLE disconnected strokes/parts.
Look at the reference rune images - notice how some runes consist of separate lines that belong together.

Your task: Count how many COMPLETE RUNES are in the drawing.
- Do NOT count individual strokes as separate runes
- Group strokes that form a single rune symbol together
- If the same rune appears multiple times, count each occurrence

Study the reference images carefully to understand what constitutes ONE rune.

Reply ONLY with valid JSON: {"count":N}`;
}

function buildBoxPrompt(count) {
    return `This image contains exactly ${count} handdrawn rune(s) on white background.

Find the EXACT pixel-perfect bounding box for each rune.

For each rune, find:
- The LEFTMOST black pixel → this is x
- The TOPMOST black pixel → this is y
- The RIGHTMOST black pixel → x + w
- The BOTTOMMOST black pixel → y + h

A rune may have disconnected strokes - include ALL strokes of one rune in ONE box.

Return coordinates as PERCENTAGE (0-100) of image width/height.
x and y are the top-left corner. w is width, h is height.

The box edges must touch the outermost pixels of the rune - no extra space.

Return EXACTLY ${count} box${count > 1 ? 'es' : ''}.

JSON only: {"runes":[{"x":N,"y":N,"w":N,"h":N}]}`;
}

const OUTPUT_SIZE = 128;
const MAX_MERGE_DISTANCE = 8;

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

function mergeComponentsIntoRunes(components) {
    if (components.length === 0) return [];
    
    let groups = components.map(c => [c]);
    
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
        
        return tempCanvas.toDataURL('image/png');
    });
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
        
        const runeImageUrls = extractRuneImages(canvas, boxes);
        
        return {
            count,
            boxes,
            images: runeImageUrls,
            message: `${count} Rune${count !== 1 ? 'n' : ''} erkannt`
        };

    } catch (error) {
        console.error('Fehler bei der Runen-Erkennung:', error);
        return {
            count: 1,
            boxes: [],
            images: [canvas.toDataURL('image/png')],
            message: `Fehler: ${error.message}`
        };
    }
}

// Iterativer Abgleich (lokal, ohne API): findet alle Runen im Bild.
export async function itterativeAnalysis(canvas) {
    return detectRunes(canvas);
}

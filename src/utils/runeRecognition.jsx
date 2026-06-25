import {
    RUNES_PATH,
    RUNE_NAMES,
    RUNE_COUNT,
    SIGNS_PATH,
    ENABLED_SIGNS,
    CANVAS_WIDTH,
    CANVAS_HEIGHT
} from '../config.js';
import { callGeminiVision, parseJsonResponse } from './geminiApi.jsx';
import { detectRunes } from './iterativeRecognition.js';
import { classifyRune, classifySign } from './localClassification.js';
import { calculateCircleScore } from './utils.ts';

let runeDescriptions = null;
let signDescriptions = null;

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

async function loadSignDescriptions() {
    if (signDescriptions) return signDescriptions;

    signDescriptions = ENABLED_SIGNS.map(({ file, label }, index) => ({
        id: index + 1,
        name: label,
        fileName: file,
        imagePath: `${SIGNS_PATH}/${file}.png`
    }));

    return signDescriptions;
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
- There is usually ONE SIGIL in the CENTER of the circle. Do NOT count it.
- Only count rune symbols on the RING around the center (clock positions), not the circle itself.

Your task: Count how many COMPLETE RUNES are on the ring around the center.
- Do NOT count the surrounding circle
- Do NOT count the center sigil
- Do NOT count individual strokes as separate runes
- Group strokes that form a single rune symbol together
- If the same rune appears multiple times, count each occurrence

Study the reference images carefully to understand what constitutes ONE rune.

Reply ONLY with valid JSON: {"count":N}`;
}

function buildBoxPrompt(count) {
    return `This image contains exactly ${count} handdrawn rune(s) on white background.
The runes are drawn INSIDE A CIRCLE on the RING around the center. IGNORE the circle and IGNORE the center sigil.

Find the EXACT pixel-perfect bounding box for each ring rune (NOT the circle, NOT the center sigil).

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

function buildIdentifySignPrompt(signCount) {
    return `The FIRST image shows a SINGLE handdrawn sigil in the CENTER of a seal on white background.
The following ${signCount} images are the REFERENCE sigils (numbered 1 to ${signCount}).

IMPORTANT:
- The reference images show the STANDARD orientation (0 degrees).
- IGNORE any circle or ring runes that may be visible - focus ONLY on the center sigil.

Your task:
1. Find which reference sigil matches the handdrawn center sigil
2. Determine the rotation angle in 15° steps (0, 15, 30, ..., 345)

Reply ONLY with valid JSON:
{"signId":N,"confidence":0-100,"rotation":DEGREES}

- signId: Number of the matching reference sigil (1 to ${signCount}), or null if no match
- confidence: Match percentage (0-100)
- rotation: Degrees clockwise in 15° steps. Use 0 if rotation is very small.`;
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
const CENTER_RADIUS_FRACTION = 0.40;
const CENTER_BOX_PADDING_PERCENT = 2;

function getCenterRegionRadius(canvasWidth, canvasHeight) {
    return (Math.min(canvasWidth, canvasHeight) / 2) * CENTER_RADIUS_FRACTION;
}

function componentInCenterRegion(component, canvasWidth, canvasHeight) {
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const radius = getCenterRegionRadius(canvasWidth, canvasHeight);

    const boxLeft = (component.x / 100) * canvasWidth;
    const boxTop = (component.y / 100) * canvasHeight;
    const boxRight = ((component.x + component.w) / 100) * canvasWidth;
    const boxBottom = ((component.y + component.h) / 100) * canvasHeight;

    const closestX = Math.max(boxLeft, Math.min(cx, boxRight));
    const closestY = Math.max(boxTop, Math.min(cy, boxBottom));
    const dist = Math.hypot(closestX - cx, closestY - cy);

    return dist <= radius;
}

function isCenterRegion(box, canvasWidth, canvasHeight) {
    return componentInCenterRegion(box, canvasWidth, canvasHeight);
}

function partitionComponentsByRegion(components, canvasWidth, canvasHeight) {
    const center = [];
    const ring = [];

    for (const component of components) {
        if (componentInCenterRegion(component, canvasWidth, canvasHeight)) {
            center.push(component);
        } else {
            ring.push(component);
        }
    }

    return { center, ring };
}

function splitBoxesByRegion(boxes, canvasWidth, canvasHeight) {
    const ringBoxes = [];
    const centerBoxes = [];

    for (const box of boxes) {
        if (isCenterRegion(box, canvasWidth, canvasHeight)) {
            centerBoxes.push(box);
        } else {
            ringBoxes.push(box);
        }
    }

    return { ringBoxes, centerBoxes };
}

function mergeBoxes(boxes, paddingPercent = 0) {
    if (!boxes.length) return null;

    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w));
    const maxY = Math.max(...boxes.map(b => b.y + b.h));

    const x = Math.max(0, minX - paddingPercent);
    const y = Math.max(0, minY - paddingPercent);
    const w = Math.min(100 - x, maxX - minX + paddingPercent * 2);
    const h = Math.min(100 - y, maxY - minY + paddingPercent * 2);

    return { x, y, w, h };
}

function mergeCenterSigilComponents(components) {
    if (!components.length) return null;
    return mergeBoxes(components, CENTER_BOX_PADDING_PERCENT);
}

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

async function identifyCenterSign(signBase64, signImages, signs) {
    if (!signs.length) return null;

    const response = await callGeminiVision(
        buildIdentifySignPrompt(signs.length),
        [{ base64: signBase64 }, ...signImages]
    );
    console.log('Center-Sign Antwort:', response.text);

    const result = parseJsonResponse(response.text);
    if (!result || result.signId === null) {
        return null;
    }

    const matchedSign = signs.find(s => s.id === result.signId);
    if (!matchedSign) return null;

    return {
        sign: matchedSign,
        confidence: result.confidence || 0,
        rotation: normalizeRotation(result.rotation)
    };
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

// Lokale Segmentierung: rein über Pixel-Connected-Components, ohne KI.
// Liefert dasselbe Format wie die KI-Variante: { count, boxes, centerBox }
// (Boxen in Prozent-Koordinaten 0..100).
function segmentLocal(canvas) {
    const components = findConnectedComponents(canvas);
    const filtered = filterOutCircle(components);
    const {center, ring} = partitionComponentsByRegion(
        filtered,
        CANVAS_WIDTH,
        CANVAS_HEIGHT
    );
    const centerBox = center.length ? mergeCenterSigilComponents(center) : null;
    const boxes = mergeComponentsIntoRunes(ring);
    return {count: boxes.length, boxes, centerBox};
}

// KI-Segmentierung: Anzahl + Ring-Boxen via Gemini; Center-Siegel und ein
// Fallback für fehlende Ring-Boxen weiterhin lokal über Pixel-Komponenten.
async function segmentAi(canvas, drawingBase64, runeImages) {
    const countResponse = await callGeminiVision(
        buildCountPrompt(),
        [{base64: drawingBase64}, ...runeImages]
    );
    const countResult = parseJsonResponse(countResponse.text);
    let count = countResult?.count;
    if (count === undefined) {
        const numberMatch = countResponse.text.match(/\d+/);
        count = numberMatch ? parseInt(numberMatch[0], 10) : 1;
    }
    count = Math.max(0, count);

    const boxResponse = await callGeminiVision(
        buildBoxPrompt(Math.max(1, count)),
        [{base64: drawingBase64}]
    );
    const boxResult = parseJsonResponse(boxResponse.text);
    let boxes = (boxResult?.runes || []).filter(
        (b) =>
            typeof b.x === 'number' &&
            typeof b.y === 'number' &&
            typeof b.w === 'number' &&
            typeof b.h === 'number'
    );

    const components = findConnectedComponents(canvas);
    const filtered = filterOutCircle(components);
    const {center, ring} = partitionComponentsByRegion(
        filtered,
        CANVAS_WIDTH,
        CANVAS_HEIGHT
    );
    let centerBox = center.length ? mergeCenterSigilComponents(center) : null;

    if (boxes.length > 0) {
        const split = splitBoxesByRegion(boxes, CANVAS_WIDTH, CANVAS_HEIGHT);
        boxes = split.ringBoxes;
        if (!centerBox && split.centerBoxes.length > 0) {
            centerBox = mergeCenterSigilComponents(split.centerBoxes);
        }
    }

    if (boxes.length < count) {
        // Gemini hat zu wenige Boxen geliefert -> lokale Pixel-Analyse.
        boxes = mergeComponentsIntoRunes(ring);
        count = boxes.length;
    } else {
        boxes = boxes.filter((b) => !isCenterRegion(b, CANVAS_WIDTH, CANVAS_HEIGHT));
    }

    return {count, boxes, centerBox};
}

// Den umschließenden Kreis-Strich entfernen, damit er nicht in die lokale
// Klassifikation einzelner Glyphen einfließt.
function removeCircleStroke(strokes) {
    let bestIndex = -1;
    let bestScore = -1;
    strokes.forEach((stroke, index) => {
        if (stroke.length < 12) return;
        const score = calculateCircleScore([stroke], false);
        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });
    return bestIndex >= 0 && bestScore >= 70
        ? strokes.filter((_, index) => index !== bestIndex)
        : strokes;
}

// Striche (Canvas-Pixel), deren Schwerpunkt in einer Box (Prozent 0..100) liegt.
function strokesForBox(strokes, box, pad = 8) {
    const x0 = (box.x / 100) * CANVAS_WIDTH - pad;
    const y0 = (box.y / 100) * CANVAS_HEIGHT - pad;
    const x1 = ((box.x + box.w) / 100) * CANVAS_WIDTH + pad;
    const y1 = ((box.y + box.h) / 100) * CANVAS_HEIGHT + pad;
    return strokes.filter((stroke) => {
        if (!stroke.length) return false;
        const cx = stroke.reduce((sum, p) => sum + p.x, 0) / stroke.length;
        const cy = stroke.reduce((sum, p) => sum + p.y, 0) / stroke.length;
        return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
    });
}

export async function recognizeRune(
    canvas,
    {segmentMethod = 'ai', classifyMethod = 'ai', strokes = []} = {}
) {
    const runes = await loadRuneDescriptions();
    const signs = await loadSignDescriptions();

    try {
        const needGeminiSeg = segmentMethod === 'ai';
        const needGeminiClass = classifyMethod === 'ai';

        // Referenzbilder / Canvas-Base64 nur laden, wenn Gemini sie braucht.
        const drawingBase64 = needGeminiSeg ? canvasToBase64(canvas) : null;
        const runeImages =
            needGeminiSeg || needGeminiClass
                ? await Promise.all(
                      runes.map(async (rune) => ({
                          base64: await loadImageAsBase64(rune.imagePath)
                      }))
                  )
                : [];
        const signImages = needGeminiClass
            ? await Promise.all(
                  signs.map(async (sign) => ({
                      base64: await loadImageAsBase64(sign.imagePath)
                  }))
              )
            : [];

        const dpr = window.devicePixelRatio || 1;
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;

        // Segmentierung wählbar: lokal (Pixel) oder KI (Gemini).
        const {count, boxes, centerBox} =
            segmentMethod === 'local'
                ? segmentLocal(canvas)
                : await segmentAi(canvas, drawingBase64, runeImages);

        // Für lokale Klassifikation: Striche ohne den umschließenden Kreis.
        const runeStrokes =
            classifyMethod === 'local' ? removeCircleStroke(strokes) : [];

        let centerSign = null;

        if (centerBox) {
            const [extractedCenter] = extractRuneImages(canvas, [centerBox]);
            const centerMatch =
                classifyMethod === 'local'
                    ? await classifySign(strokesForBox(runeStrokes, centerBox))
                    : signs.length
                      ? await identifyCenterSign(extractedCenter.base64, signImages, signs)
                      : null;
            centerSign = {
                image: extractedCenter.dataUrl,
                match: centerMatch,
                clockPosition: 'Mitte'
            };
        }

        const extractedRunes = extractRuneImages(canvas, boxes);

        const matches = [];
        for (let i = 0; i < extractedRunes.length; i++) {
            const match =
                classifyMethod === 'local'
                    ? await classifyRune(strokesForBox(runeStrokes, boxes[i]))
                    : await identifySingleRune(
                          extractedRunes[i].base64,
                          runeImages,
                          runes
                      );
            const clockPosition = calculateClockPosition(
                boxes[i],
                canvasWidth,
                canvasHeight
            );
            matches.push({
                image: extractedRunes[i].dataUrl,
                match: match,
                clockPosition: clockPosition
            });
        }
        
        const recognizedNames = matches
            .filter(m => m.match)
            .map(m => m.match.rune.name);
        if (centerSign?.match) {
            recognizedNames.unshift(`${centerSign.match.sign.name} (Mitte)`);
        }
        
        return {
            count,
            boxes,
            centerBox,
            centerSign,
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
            centerBox: null,
            centerSign: null,
            matches: [],
            images: [canvas.toDataURL('image/png')],
            message: `Fehler: ${error.message}`
        };
    }
}

// Iterativer Abgleich (lokal, ohne API): findet alle Runen im Bild.
// Nimmt – wie die Recognizer in recognizers.js – ein Input-Objekt
// {canvas, strokes} entgegen, akzeptiert aber auch ein rohes Canvas.
export async function itterativeAnalysis(input) {
    const canvas = input?.canvas ?? input;
    return detectRunes(canvas);
}

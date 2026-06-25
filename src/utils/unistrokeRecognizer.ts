export type Point = {
    x: number;
    y: number;
};

export type RuneTemplate = {
    name: string;
    points: Point[];
    id?: string;
    imagePath?: string;
};

export type RecognizeRuneMatch = {
    template: RuneTemplate;
    score: number;
    distance: number;
};

const RESAMPLE_POINTS = 64;
const NORMALIZATION_SIZE = 250;
const MIN_POINTS = 4;

const templateCache = new WeakMap<RuneTemplate, number[]>();

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(points: Point[]): Point {
    let sumX = 0;
    let sumY = 0;

    for (const point of points) {
        sumX += point.x;
        sumY += point.y;
    }

    return {
        x: sumX / points.length,
        y: sumY / points.length
    };
}

function pathLength(points: Point[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
        length += distance(points[i - 1], points[i]);
    }
    return length;
}

function resample(points: Point[], n = RESAMPLE_POINTS): Point[] {
    if (points.length === 0) return [];
    if (points.length === 1) {
        return Array.from({length: n}, () => ({...points[0]}));
    }

    const targetInterval = pathLength(points) / (n - 1);
    if (!Number.isFinite(targetInterval) || targetInterval === 0) {
        return Array.from({length: n}, (_, index) => ({...points[index % points.length]}));
    }

    const source = points.map((point) => ({...point}));
    const sampled: Point[] = [source[0]];
    let accumulatedDistance = 0;
    let i = 1;

    while (i < source.length) {
        const previous = source[i - 1];
        const current = source[i];
        const segmentLength = distance(previous, current);

        if (segmentLength === 0) {
            i += 1;
            continue;
        }

        if (accumulatedDistance + segmentLength >= targetInterval) {
            const ratio = (targetInterval - accumulatedDistance) / segmentLength;
            const insertedPoint: Point = {
                x: previous.x + ratio * (current.x - previous.x),
                y: previous.y + ratio * (current.y - previous.y)
            };

            sampled.push(insertedPoint);
            source.splice(i, 0, insertedPoint);
            accumulatedDistance = 0;
            // Über den eingefügten Punkt hinweg weiterlaufen – sonst wird das
            // Reststück erneut vermessen und es entstehen zu viele Punkte.
            i += 1;
        } else {
            accumulatedDistance += segmentLength;
            i += 1;
        }
    }

    if (sampled.length === n - 1) {
        sampled.push(source[source.length - 1]);
    }

    while (sampled.length < n) {
        sampled.push({...sampled[sampled.length - 1]});
    }

    return sampled;
}

function rotateBy(points: Point[], angle: number): Point[] {
    const center = centroid(points);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return points.map((point) => {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        return {
            x: dx * cos - dy * sin + center.x,
            y: dx * sin + dy * cos + center.y
        };
    });
}

function indicativeAngle(points: Point[]): number {
    const center = centroid(points);
    const first = points[0];
    return Math.atan2(center.y - first.y, center.x - first.x);
}

function scaleToSquare(points: Point[], size = NORMALIZATION_SIZE): Point[] {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of points) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
    }

    const width = Math.max(maxX - minX, 1e-6);
    const height = Math.max(maxY - minY, 1e-6);

    return points.map((point) => ({
        x: ((point.x - minX) / width) * size,
        y: ((point.y - minY) / height) * size
    }));
}

function translateToOrigin(points: Point[]): Point[] {
    const center = centroid(points);
    return points.map((point) => ({
        x: point.x - center.x,
        y: point.y - center.y
    }));
}

function vectorize(points: Point[]): number[] {
    const vector: number[] = [];
    for (const point of points) {
        vector.push(point.x, point.y);
    }

    let magnitude = 0;
    for (const value of vector) {
        magnitude += value * value;
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude === 0) return vector.map(() => 0);
    return vector.map((value) => value / magnitude);
}

function cosineDistance(a: number[], b: number[]): number {
    const length = Math.min(a.length, b.length);
    if (length === 0) return 1;

    let dot = 0;
    for (let i = 0; i < length; i += 1) {
        dot += a[i] * b[i];
    }

    const similarity = clamp(dot, -1, 1);
    return Math.acos(similarity) / Math.PI;
}

export function normalizeStroke(points: Point[]): Point[] {
    if (points.length < MIN_POINTS) return [];

    const sampled = resample(points, RESAMPLE_POINTS);
    const angle = indicativeAngle(sampled);
    const rotated = rotateBy(sampled, -angle);
    const scaled = scaleToSquare(rotated, NORMALIZATION_SIZE);
    return translateToOrigin(scaled);
}

function getTemplateVector(template: RuneTemplate): number[] {
    const cached = templateCache.get(template);
    if (cached) return cached;

    const normalized = normalizeStroke(template.points);
    const vector = vectorize(normalized);
    templateCache.set(template, vector);
    return vector;
}

export function recognizeRune(
    userStroke: Point[],
    templates: RuneTemplate[]
): RecognizeRuneMatch | null {
    if (!templates.length) return null;

    const normalizedUserStroke = normalizeStroke(userStroke);
    if (!normalizedUserStroke.length) return null;

    const userVector = vectorize(normalizedUserStroke);

    let bestMatch: RecognizeRuneMatch | null = null;

    for (const template of templates) {
        const templateVector = getTemplateVector(template);
        if (!templateVector.length) continue;

        const distanceValue = cosineDistance(userVector, templateVector);
        const score = clamp(1 - distanceValue, 0, 1);

        if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
                template,
                score,
                distance: distanceValue
            };
        }
    }

    return bestMatch;
}

export function createNormalizedTemplate(
    name: string,
    stroke: Point[],
    extras: Pick<RuneTemplate, 'id' | 'imagePath'> = {}
): RuneTemplate {
    return {
        name,
        points: normalizeStroke(stroke),
        ...extras
    };
}

// Mehrere Proben derselben Geste zu einer Durchschnittsform zusammenführen.
// Jede Probe wird normalisiert (resampled auf RESAMPLE_POINTS, rotiert,
// skaliert, zentriert), danach werden die Punkte index-weise gemittelt.
// Voraussetzung: alle Proben mit gleichem Startpunkt und gleicher Richtung
// gezeichnet, sonst sind die Punktfolgen nicht deckungsgleich.
export function averageStrokes(samples: Point[][]): Point[] {
    const normalized = samples
        .map((sample) => normalizeStroke(sample))
        .filter((points) => points.length === RESAMPLE_POINTS);

    if (!normalized.length) return [];

    const averaged: Point[] = [];
    for (let i = 0; i < RESAMPLE_POINTS; i += 1) {
        let sumX = 0;
        let sumY = 0;
        for (const points of normalized) {
            sumX += points[i].x;
            sumY += points[i].y;
        }
        averaged.push({
            x: sumX / normalized.length,
            y: sumY / normalized.length
        });
    }

    return averaged;
}

export function createAveragedTemplate(
    name: string,
    samples: Point[][],
    extras: Pick<RuneTemplate, 'id' | 'imagePath'> = {}
): RuneTemplate {
    return {
        name,
        points: averageStrokes(samples),
        ...extras
    };
}

export function logTemplateFromStroke(
    name: string,
    stroke: Point[],
    extras: Pick<RuneTemplate, 'id' | 'imagePath'> = {}
): RuneTemplate {
    const template = createNormalizedTemplate(name, stroke, extras);
    const serialized = JSON.stringify(template.points, null, 2);
    console.log(`Template ${name}: ${serialized}`);
    return template;
}

// $P Point-Cloud Recognizer (Vatavu, Anthony & Wobbrock, 2012).
// Eine Geste wird als Punktwolke behandelt: Vergleich über ein gieriges
// Nächster-Punkt-Matching, das unabhängig von Strichreihenfolge und
// Strichzahl ist. Damit lassen sich auch mehrteilige Glyphen abgleichen –
// anders als beim $1-Unistroke-Ansatz.

export type Point = {
    x: number;
    y: number;
};

export type CloudPoint = {
    x: number;
    y: number;
    id: number; // Strich-Zugehörigkeit (für korrektes Resampling pro Strich)
};

export type PointCloud = {
    name: string;
    points: CloudPoint[];
    id?: string;
    imagePath?: string;
};

export type CloudMatch = {
    template: PointCloud;
    score: number;
    distance: number;
};

const NUM_POINTS = 32;
const ORIGIN: Point = {x: 0, y: 0};

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

// Pfadlänge, aber nur innerhalb desselben Strichs (kein Sprung über Pen-up).
function pathLength(points: CloudPoint[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
        if (points[i].id === points[i - 1].id) {
            length += distance(points[i - 1], points[i]);
        }
    }
    return length;
}

// Gleichmäßiges Resampling auf n Punkte (kanonische $P/$1-Form mit
// for-Schleife: das splice + i++ schaltet korrekt über den eingefügten Punkt).
function resample(points: CloudPoint[], n = NUM_POINTS): CloudPoint[] {
    const interval = pathLength(points) / (n - 1);
    let accumulated = 0;
    const source = points.map((point) => ({...point}));
    const sampled: CloudPoint[] = [{...source[0]}];

    for (let i = 1; i < source.length; i += 1) {
        if (source[i].id !== source[i - 1].id) continue;

        const segment = distance(source[i - 1], source[i]);
        if (accumulated + segment >= interval) {
            const ratio = (interval - accumulated) / segment;
            const inserted: CloudPoint = {
                x: source[i - 1].x + ratio * (source[i].x - source[i - 1].x),
                y: source[i - 1].y + ratio * (source[i].y - source[i - 1].y),
                id: source[i].id
            };
            sampled.push(inserted);
            source.splice(i, 0, inserted);
            accumulated = 0;
        } else {
            accumulated += segment;
        }
    }

    // Floating-Point kann einen Punkt zu wenig liefern – auffüllen.
    while (sampled.length < n) {
        sampled.push({...source[source.length - 1]});
    }
    if (sampled.length > n) {
        sampled.length = n;
    }

    return sampled;
}

function centroid(points: CloudPoint[]): Point {
    let sumX = 0;
    let sumY = 0;
    for (const point of points) {
        sumX += point.x;
        sumY += point.y;
    }
    return {x: sumX / points.length, y: sumY / points.length};
}

// Uniforme Skalierung in das Einheitsquadrat (Seitenverhältnis bleibt erhalten).
function scale(points: CloudPoint[]): CloudPoint[] {
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

    const size = Math.max(maxX - minX, maxY - minY, 1e-6);
    return points.map((point) => ({
        x: (point.x - minX) / size,
        y: (point.y - minY) / size,
        id: point.id
    }));
}

function translateToOrigin(points: CloudPoint[], to: Point = ORIGIN): CloudPoint[] {
    const center = centroid(points);
    return points.map((point) => ({
        x: point.x - center.x + to.x,
        y: point.y - center.y + to.y,
        id: point.id
    }));
}

export function normalize(points: CloudPoint[]): CloudPoint[] {
    return translateToOrigin(scale(resample(points, NUM_POINTS)));
}

// Gewichtete Summe der Distanzen über ein gieriges Nächster-Punkt-Matching,
// beginnend ab Index `start`.
function cloudDistance(
    pts1: CloudPoint[],
    pts2: CloudPoint[],
    start: number
): number {
    const n = pts1.length;
    const matched = new Array<boolean>(n).fill(false);
    let sum = 0;
    let i = start;

    do {
        let min = Number.POSITIVE_INFINITY;
        let index = -1;
        for (let j = 0; j < n; j += 1) {
            if (matched[j]) continue;
            const d = distance(pts1[i], pts2[j]);
            if (d < min) {
                min = d;
                index = j;
            }
        }
        if (index >= 0) matched[index] = true;
        const weight = 1 - ((i - start + n) % n) / n;
        sum += weight * min;
        i = (i + 1) % n;
    } while (i !== start);

    return sum;
}

function greedyCloudMatch(points: CloudPoint[], template: PointCloud): number {
    const n = NUM_POINTS;
    const step = Math.floor(Math.pow(n, 0.5)); // ε = 0.5 → n^(1-ε)
    let min = Number.POSITIVE_INFINITY;

    for (let i = 0; i < n; i += step) {
        const d1 = cloudDistance(points, template.points, i);
        const d2 = cloudDistance(template.points, points, i);
        min = Math.min(min, d1, d2);
    }

    return min;
}

// Strich-Gruppen ({x,y}[][]) in eine Punktwolke mit Strich-IDs überführen.
export function strokesToCloud(strokes: Point[][]): CloudPoint[] {
    const cloud: CloudPoint[] = [];
    strokes.forEach((stroke, id) => {
        for (const point of stroke) {
            cloud.push({x: point.x, y: point.y, id});
        }
    });
    return cloud;
}

export function createPointCloud(
    name: string,
    strokes: Point[][],
    extras: Pick<PointCloud, 'id' | 'imagePath'> = {}
): PointCloud {
    return {
        name,
        points: normalize(strokesToCloud(strokes)),
        ...extras
    };
}

export function recognize(
    strokes: Point[][],
    templates: PointCloud[]
): CloudMatch | null {
    if (!templates.length) return null;

    const cloud = strokesToCloud(strokes);
    if (cloud.length < 2) return null;

    const candidate = normalize(cloud);

    let best: CloudMatch | null = null;
    for (const template of templates) {
        if (!template.points.length) continue;
        const d = greedyCloudMatch(candidate, template);
        // $P-Heuristik: Distanz in [0..~2] → Score in [0..1].
        const score = Math.max((2 - d) / 2, 0);
        if (!best || score > best.score) {
            best = {template, score, distance: d};
        }
    }

    return best;
}

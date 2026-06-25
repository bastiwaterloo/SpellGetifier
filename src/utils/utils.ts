type Point = {
    x: number;
    y: number;
};

type Stroke = Point[];

type CircleFit = {
    center: Point;
    radius: number;
};

const MIN_POINT_COUNT = 5;
const RESAMPLE_POINTS = 64;

const RADIAL_ERROR_RATIO = 0.08;
const CLOSURE_TOLERANCE = 0.08;
const ELLIPSE_RATIO_THRESHOLD = 1.35;
const CLOSURE_WINDOW_RATIO = 0.08;

const getMean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

const clampScore = (value: number) =>
    Math.max(0, Math.min(100, Math.round(value)));

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(points: Stroke): number {
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
        length += distance(points[index - 1], points[index]);
    }
    return length;
}

function resample(points: Stroke, sampleCount = RESAMPLE_POINTS): Stroke {
    if (points.length === 0) return [];
    if (points.length === 1) {
        return Array.from({length: sampleCount}, () => ({...points[0]}));
    }

    const targetInterval = pathLength(points) / (sampleCount - 1);
    if (!Number.isFinite(targetInterval) || targetInterval === 0) {
        return Array.from({length: sampleCount}, (_, index) => ({
            ...points[index % points.length]
        }));
    }

    const source = points.map((point) => ({...point}));
    const sampled: Stroke = [source[0]];
    let accumulatedDistance = 0;
    let index = 1;

    while (index < source.length) {
        const previous = source[index - 1];
        const current = source[index];
        const segmentLength = distance(previous, current);

        if (segmentLength === 0) {
            index += 1;
            continue;
        }

        if (accumulatedDistance + segmentLength >= targetInterval) {
            const ratio = (targetInterval - accumulatedDistance) / segmentLength;
            sampled.push({
                x: previous.x + ratio * (current.x - previous.x),
                y: previous.y + ratio * (current.y - previous.y)
            });
            source[index - 1] = sampled[sampled.length - 1];
            accumulatedDistance = 0;
        } else {
            accumulatedDistance += segmentLength;
            index += 1;
        }
    }

    if (sampled.length < sampleCount) {
        sampled.push({...source[source.length - 1]});
    }

    return sampled.slice(0, sampleCount);
}

function fitCircle(points: Stroke): CircleFit | null {
    if (points.length < MIN_POINT_COUNT) {
        return null;
    }

    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let sumXX = 0;
    let sumYY = 0;
    let sumXY = 0;
    let sumXZ = 0;
    let sumYZ = 0;
    const count = points.length;

    for (const point of points) {
        const x2 = point.x * point.x;
        const y2 = point.y * point.y;
        const z = x2 + y2;
        sumX += point.x;
        sumY += point.y;
        sumZ += z;
        sumXX += x2;
        sumYY += y2;
        sumXY += point.x * point.y;
        sumXZ += point.x * z;
        sumYZ += point.y * z;
    }

    const matrix = [
        [sumXX, sumXY, sumX],
        [sumXY, sumYY, sumY],
        [sumX, sumY, count]
    ];
    const rhs = [-sumXZ, -sumYZ, -sumZ];
    const solution = solveLinearSystem3x3(matrix, rhs);

    if (!solution) {
        return null;
    }

    const [circleA, circleB, circleC] = solution;
    const center = {x: -circleA / 2, y: -circleB / 2};
    const radiusSquared =
        (center.x * center.x + center.y * center.y) - circleC;

    if (!Number.isFinite(radiusSquared) || radiusSquared <= 0) {
        return null;
    }

    return {
        center,
        radius: Math.sqrt(radiusSquared)
    };
}

function solveLinearSystem3x3(
    matrix: number[][],
    rhs: number[]
): number[] | null {
    const augmented = matrix.map((row, rowIndex) => [...row, rhs[rowIndex]]);

    for (let pivotIndex = 0; pivotIndex < 3; pivotIndex += 1) {
        let maxRow = pivotIndex;
        for (let rowIndex = pivotIndex + 1; rowIndex < 3; rowIndex += 1) {
            if (
                Math.abs(augmented[rowIndex][pivotIndex]) >
                Math.abs(augmented[maxRow][pivotIndex])
            ) {
                maxRow = rowIndex;
            }
        }

        if (Math.abs(augmented[maxRow][pivotIndex]) < 1e-10) {
            return null;
        }

        if (maxRow !== pivotIndex) {
            [augmented[pivotIndex], augmented[maxRow]] = [
                augmented[maxRow],
                augmented[pivotIndex]
            ];
        }

        for (let rowIndex = pivotIndex + 1; rowIndex < 3; rowIndex += 1) {
            const factor =
                augmented[rowIndex][pivotIndex] / augmented[pivotIndex][pivotIndex];
            for (
                let columnIndex = pivotIndex;
                columnIndex <= 3;
                columnIndex += 1
            ) {
                augmented[rowIndex][columnIndex] -=
                    factor * augmented[pivotIndex][columnIndex];
            }
        }
    }

    const solution = [0, 0, 0];
    for (let rowIndex = 2; rowIndex >= 0; rowIndex -= 1) {
        let value = augmented[rowIndex][3];
        for (let columnIndex = rowIndex + 1; columnIndex < 3; columnIndex += 1) {
            value -= augmented[rowIndex][columnIndex] * solution[columnIndex];
        }
        solution[rowIndex] = value / augmented[rowIndex][rowIndex];
    }

    return solution;
}

function scoreRoundness(points: Stroke, fit: CircleFit): number {
    if (fit.radius <= 0) return 0;

    const radialErrors = points.map((point) =>
        Math.abs(distance(point, fit.center) - fit.radius)
    );
    const meanRadialError = getMean(radialErrors);
    const tolerance = fit.radius * RADIAL_ERROR_RATIO;

    return clampScore(100 * (1 - meanRadialError / tolerance));
}

function scoreEllipticity(points: Stroke, center: Point): number {
    const centeredX = points.map((point) => point.x - center.x);
    const centeredY = points.map((point) => point.y - center.y);
    const count = points.length;

    const covarianceXX =
        centeredX.reduce((sum, value) => sum + value * value, 0) / count;
    const covarianceYY =
        centeredY.reduce((sum, value) => sum + value * value, 0) / count;
    const covarianceXY =
        centeredX.reduce((sum, value, index) => sum + value * centeredY[index], 0) /
        count;

    const trace = covarianceXX + covarianceYY;
    const determinant = covarianceXX * covarianceYY - covarianceXY * covarianceXY;
    const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - determinant));
    const majorEigenvalue = trace / 2 + discriminant;
    const minorEigenvalue = trace / 2 - discriminant;

    if (minorEigenvalue <= 0) {
        return 100;
    }

    const aspectRatio = Math.sqrt(majorEigenvalue / minorEigenvalue);
    return clampScore(
        100 *
            (1 -
                Math.max(0, aspectRatio - 1) /
                    Math.max(ELLIPSE_RATIO_THRESHOLD - 1, 1e-6))
    );
}

function scoreClosure(points: Stroke, fit: CircleFit): number {
    if (fit.radius <= 0 || points.length < 2) return 0;

    const windowSize = Math.max(
        3,
        Math.ceil(points.length * CLOSURE_WINDOW_RATIO)
    );
    const startWindow = points.slice(0, windowSize);
    const endWindow = points.slice(-windowSize);

    let minGap = Infinity;
    for (const startPoint of startWindow) {
        for (const endPoint of endWindow) {
            minGap = Math.min(minGap, distance(startPoint, endPoint));
        }
    }

    minGap = Math.min(
        minGap,
        distance(points[0], points[points.length - 1])
    );

    const circumference = 2 * Math.PI * fit.radius;
    const closureRatio = minGap / circumference;

    return clampScore(100 * (1 - closureRatio / CLOSURE_TOLERANCE));
}

function scoreCoverage(points: Stroke, center: Point): number {
    const angles = points
        .map((point) => Math.atan2(point.y - center.y, point.x - center.x))
        .sort((a, b) => a - b);

    let maxGap = 0;
    for (let index = 0; index < angles.length; index += 1) {
        const nextAngle = angles[(index + 1) % angles.length];
        const gap =
            index === angles.length - 1
                ? nextAngle + 2 * Math.PI - angles[index]
                : nextAngle - angles[index];
        maxGap = Math.max(maxGap, gap);
    }

    const coveredAngle = 2 * Math.PI - maxGap;
    return clampScore((coveredAngle / (2 * Math.PI)) * 100);
}

function geometricMean(...scores: number[]): number {
    if (scores.some((score) => score <= 0)) {
        return 0;
    }

    const product = scores.reduce((accumulator, score) => accumulator * score, 1);
    return clampScore(product ** (1 / scores.length));
}

function scoreCircleStroke(points: Stroke): number {
    if (points.length < MIN_POINT_COUNT) {
        return 0;
    }

    const sampled = resample(points);
    const fit = fitCircle(sampled);

    if (!fit) {
        return 0;
    }

    const roundness = scoreRoundness(sampled, fit);
    const ellipticity = scoreEllipticity(sampled, fit.center);
    const closure = scoreClosure(sampled, fit);
    const coverage = scoreCoverage(sampled, fit.center);

    return geometricMean(roundness, ellipticity, closure, coverage);
}

export function calculateCircleScore(strokes: Stroke[]): number {
    if (!strokes.length) {
        return 0;
    }

    const candidates = strokes.filter((stroke) => stroke.length >= MIN_POINT_COUNT);
    if (!candidates.length) {
        return 0;
    }

    return Math.max(...candidates.map((stroke) => scoreCircleStroke(stroke)));
}

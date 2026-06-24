type Point = {
    x: number;
    y: number;
};

type Stroke = Point[];

const MIN_POINT_COUNT = 5;

const getCenter = (points: Stroke) => {
    const center = points.reduce(
        (accumulator, point) => ({
            x: accumulator.x + point.x,
            y: accumulator.y + point.y
        }),
        {x: 0, y: 0}
    );

    return {
        x: center.x / points.length,
        y: center.y / points.length
    };
};

const getMean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

export function applyQuadraticScoreDamping(score: number): number {
    return Math.round((score / 100) ** 2 * 100);
}

export function calculateCircleScore(
    strokes: Stroke[],
    shouldApplyDamping = true
): number {
    const allPoints = strokes.flat();

    if (allPoints.length < MIN_POINT_COUNT) {
        return 0;
    }

    const center = getCenter(allPoints);
    const distances = allPoints.map((point) =>
        Math.hypot(point.x - center.x, point.y - center.y)
    );
    const meanRadius = getMean(distances);
    const radiusVariance = getMean(
        distances.map((distance) => (distance - meanRadius) ** 2)
    );
    const radiusStdDev = Math.sqrt(radiusVariance);

    const firstPoint = allPoints[0];
    const lastPoint = allPoints[allPoints.length - 1];
    const closureGap = Math.hypot(
        firstPoint.x - lastPoint.x,
        firstPoint.y - lastPoint.y
    );

    const shapePenalty = Math.min(radiusStdDev / Math.max(meanRadius, 1), 1);
    const closurePenalty =
        Math.min(closureGap / Math.max(meanRadius, 1), 1) * 0.25;
    const rawScore = Math.max(
        0,
        Math.round((1 - Math.min(1, shapePenalty + closurePenalty)) * 100)
    );

    return shouldApplyDamping ? applyQuadraticScoreDamping(rawScore) : rawScore;
}

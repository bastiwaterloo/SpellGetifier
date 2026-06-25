import {describe, expect, it} from 'vitest';
import {calculateCircleScore} from '../utils.ts';

function makeCircle({
    centerX = 200,
    centerY = 200,
    radius = 80,
    pointCount = 64,
    noise = 0,
    startAngle = 0,
    endAngle = Math.PI * 2,
    close = true,
    scaleX = 1,
    scaleY = 1
} = {}) {
    const points = [];
    const span = endAngle - startAngle;
    const count = close ? pointCount : pointCount + 1;

    for (let index = 0; index < count; index += 1) {
        const angle = startAngle + (span * index) / (pointCount - 1);
        const radialNoise = noise ? (Math.sin(index * 1.7) * noise) / 2 : 0;
        const r = radius + radialNoise;
        points.push({
            x: centerX + r * Math.cos(angle) * scaleX,
            y: centerY + r * Math.sin(angle) * scaleY
        });
    }

    if (!close && points.length > 1) {
        points.pop();
    }

    return points;
}

describe('calculateCircleScore', () => {
    it('gibt nahezu 100 % für einen geschlossenen Kreis zurück', () => {
        const score = calculateCircleScore([makeCircle()]);
        expect(score).toBeGreaterThanOrEqual(95);
    });

    it('gibt einen deutlich niedrigeren Wert für einen Halbkreis zurück', () => {
        const score = calculateCircleScore(
            [makeCircle({endAngle: Math.PI, close: false})]
        );
        expect(score).toBeLessThan(35);
    });

    it('bestraft unsaubere Radien', () => {
        const clean = calculateCircleScore([makeCircle()]);
        const wobbly = calculateCircleScore([makeCircle({noise: 24})]);
        expect(wobbly).toBeLessThan(clean);
    });

    it('bestraft offene Enden', () => {
        const closed = calculateCircleScore([makeCircle()]);
        const open = calculateCircleScore(
            [makeCircle({close: false, endAngle: Math.PI * 1.9})]
        );
        expect(open).toBeLessThan(closed);
    });

    it('bestraft Ellipsen stärker als Kreise', () => {
        const circle = calculateCircleScore([makeCircle()]);
        const ellipse = calculateCircleScore([
            makeCircle({scaleX: 1.45, scaleY: 1})
        ]);
        expect(ellipse).toBeLessThan(circle);
    });

    it('wählt den kreisförmigsten Strich bei mehreren Strichen', () => {
        const circle = makeCircle();
        const line = Array.from({length: 20}, (_, index) => ({
            x: 50 + index * 4,
            y: 50
        }));
        const score = calculateCircleScore([line, circle]);
        expect(score).toBeGreaterThanOrEqual(95);
    });

    it('gibt 0 zurück bei zu wenigen Punkten', () => {
        expect(calculateCircleScore([[{x: 0, y: 0}, {x: 1, y: 1}]])).toBe(0);
    });
});

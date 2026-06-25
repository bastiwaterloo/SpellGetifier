import {describe, it, expect} from 'vitest';
import {computeQuality, buildAttackParams, POWER_FLOORS} from '../attackMapping.js';

const preset = {
    defaults: {
        particleCount: 900,
        riseSpeed: 1.8,
        spread: 0.5,
        flameHeight: 2.0,
        turbulence: 1.2,
        particleSize: 16,
        intensity: 1
    }
};

describe('computeQuality', () => {
    it('combines circle score and confidence', () => {
        expect(computeQuality({circleScore: 100, confidence: 100})).toBe(1);
        expect(computeQuality({circleScore: 0, confidence: 0})).toBe(0);
        expect(computeQuality({circleScore: 100, confidence: 0})).toBeCloseTo(0.5);
    });

    it('uses a single signal fully when the other is missing', () => {
        expect(computeQuality({circleScore: 80})).toBeCloseTo(0.8);
        expect(computeQuality({confidence: 60})).toBeCloseTo(0.6);
    });

    it('returns 0 with no signals and clamps to [0,1]', () => {
        expect(computeQuality({})).toBe(0);
        expect(computeQuality({circleScore: 150, confidence: 150})).toBe(1);
    });
});

describe('buildAttackParams', () => {
    it('returns full defaults at quality 1', () => {
        expect(buildAttackParams(preset, 1)).toEqual(preset.defaults);
    });

    it('floors the power params at quality 0, keeps character params', () => {
        const weak = buildAttackParams(preset, 0);
        expect(weak.particleCount).toBe(Math.round(900 * POWER_FLOORS.particleCount));
        expect(weak.intensity).toBeCloseTo(POWER_FLOORS.intensity);
        expect(weak.spread).toBe(preset.defaults.spread); // Charakter unverändert
        expect(weak.turbulence).toBe(preset.defaults.turbulence);
    });

    it('scales power params monotonically with quality', () => {
        const low = buildAttackParams(preset, 0.25);
        const high = buildAttackParams(preset, 0.75);
        expect(high.particleCount).toBeGreaterThan(low.particleCount);
        expect(high.intensity).toBeGreaterThan(low.intensity);
        expect(high.flameHeight).toBeGreaterThan(low.flameHeight);
    });
});

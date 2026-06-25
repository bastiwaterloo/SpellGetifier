import { describe, it, expect } from 'vitest';
import {
  DETECTION_RESOLUTION,
  ITERATIVE_SIZES,
  ITERATIVE_ROTATIONS,
  MATCH_THRESHOLD,
  PENALTY_WEIGHT,
  NMS_RELATIVE,
} from '../../config.js';

describe('iterative detection constants', () => {
  it('defines a detection resolution within the WebGL-safe range', () => {
    expect(DETECTION_RESOLUTION).toBe(250);
    expect(DETECTION_RESOLUTION).toBeLessThanOrEqual(350);
  });

  it('defines the expected sizes', () => {
    expect(ITERATIVE_SIZES).toEqual([16, 24, 32, 48, 64, 96, 128]);
  });

  it('defines 72 rotations stepping by 5 degrees from 0 to 355', () => {
    expect(ITERATIVE_ROTATIONS).toHaveLength(72);
    expect(ITERATIVE_ROTATIONS[0]).toBe(0);
    expect(ITERATIVE_ROTATIONS[1]).toBe(5);
    expect(ITERATIVE_ROTATIONS[71]).toBe(355);
  });

  it('defines scoring constants', () => {
    expect(MATCH_THRESHOLD).toBe(0.6);
    expect(PENALTY_WEIGHT).toBe(1.0);
    expect(NMS_RELATIVE).toBe(0.5);
  });
});

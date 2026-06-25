import { describe, it, expect } from 'vitest';
import {
  DETECTION_RESOLUTION,
  ITERATIVE_SIZES,
  ITERATIVE_ROTATIONS,
  MATCH_THRESHOLD,
  NMS_RELATIVE,
} from '../../config.js';

describe('iterative detection constants', () => {
  it('defines a detection resolution within the WebGL-safe range', () => {
    expect(DETECTION_RESOLUTION).toBe(250);
    expect(DETECTION_RESOLUTION).toBeLessThanOrEqual(350);
  });

  it('defines the expected sizes', () => {
    expect(ITERATIVE_SIZES).toEqual([32, 48, 64, 96, 128, 192, 256]);
  });

  it('defines 36 rotations stepping by 10 degrees from 0 to 350', () => {
    expect(ITERATIVE_ROTATIONS).toHaveLength(36);
    expect(ITERATIVE_ROTATIONS[0]).toBe(0);
    expect(ITERATIVE_ROTATIONS[1]).toBe(10);
    expect(ITERATIVE_ROTATIONS[35]).toBe(350);
  });

  it('defines scoring constants', () => {
    expect(MATCH_THRESHOLD).toBe(0.5);
    expect(NMS_RELATIVE).toBe(0.5);
  });
});

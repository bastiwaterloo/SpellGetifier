import { describe, it, expect, beforeAll } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { computeScoreMap } from '../scoreMap.js';

beforeAll(async () => {
  await tf.setBackend('cpu');
  await tf.ready();
});

const mask = (rows) => ({
  data: Float32Array.from(rows.flat()),
  width: rows[0].length,
  height: rows.length,
});

describe('computeScoreMap', () => {
  it('scores a perfect overlap as 1 with no penalty', () => {
    // 2x2 drawing identical to 2x2 template, one valid position
    const drawing = mask([[1, 1], [1, 1]]);
    const template = mask([[1, 1], [1, 1]]);
    const out = computeScoreMap(drawing, template, 1.0);
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(out.scores[0]).toBeCloseTo(1.0, 5);
  });

  it('applies the penalty for drawing ink off the template', () => {
    // template ink is the top row only; footprint is the full 2x2 box.
    // drawing fills the whole 2x2 -> coverage 2/2 = 1, penalty 2 px over
    // (footprintArea 4 - inkCount 2) = 2 -> penaltyRatio 1 -> score 1 - 1 = 0
    const drawing = mask([[1, 1], [1, 1]]);
    const template = mask([[1, 1], [0, 0]]);
    const out = computeScoreMap(drawing, template, 1.0);
    expect(out.scores[0]).toBeCloseTo(0.0, 5);
  });
});

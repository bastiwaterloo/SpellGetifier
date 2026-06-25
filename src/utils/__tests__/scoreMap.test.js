import { describe, it, expect, beforeAll } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { computeBatchedScoreMap } from '../scoreMap.js';

beforeAll(async () => {
  await tf.setBackend('cpu');
  await tf.ready();
});

const mask = (rows) => ({
  data: Float32Array.from(rows.flat()),
  width: rows[0].length,
  height: rows.length,
});

describe('computeBatchedScoreMap', () => {
  it('scores a perfect overlap as 1 with the penalty term suppressed', () => {
    // 2x2 drawing identical to a 2x2 fully-inked template: area === inkCount,
    // so the penalty denominator is 0 and the term is suppressed -> score 1.
    const drawing = mask([[1, 1], [1, 1]]);
    const dt = tf.tensor4d(drawing.data, [1, 2, 2, 1]);
    const { results, outWidth, outHeight } = computeBatchedScoreMap(dt, [mask([[1, 1], [1, 1]])], 1.0);
    dt.dispose();
    expect(outWidth).toBe(1);
    expect(outHeight).toBe(1);
    expect(results[0].score).toBeCloseTo(1.0, 5);
  });

  it('applies the penalty for drawing ink off the template', () => {
    // Template ink is the top row only; the drawing fills the whole 2x2.
    // coverage 2/2 = 1, penalty 2 over denom (4-2) = 1 -> score 1 - 1 = 0.
    const drawing = mask([[1, 1], [1, 1]]);
    const dt = tf.tensor4d(drawing.data, [1, 2, 2, 1]);
    const { results } = computeBatchedScoreMap(dt, [mask([[1, 1], [0, 0]])], 1.0);
    dt.dispose();
    expect(results[0].score).toBeCloseTo(0.0, 5);
  });

  it('localizes the matching template channel and ranks it above a non-match', () => {
    // 5x5 drawing with an L-shape at (col 1, row 1).
    const drawing = mask([
      [0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ]);
    const dt = tf.tensor4d(drawing.data, [1, 5, 5, 1]);
    const L = mask([[1, 0, 0], [1, 0, 0], [1, 1, 1]]);
    const box = mask([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
    const { results, outWidth, outHeight } = computeBatchedScoreMap(dt, [L, box], 1.0);
    dt.dispose();
    expect(outWidth).toBe(3);
    expect(outHeight).toBe(3);
    expect(results[0].score).toBeCloseTo(1.0, 5);
    expect(results[0].col).toBe(1);
    expect(results[0].row).toBe(1);
    expect(results[1].score).toBeLessThan(results[0].score);
  });

  it('scores a blank template as 0', () => {
    const drawing = mask([[1, 1], [1, 1]]);
    const dt = tf.tensor4d(drawing.data, [1, 2, 2, 1]);
    const { results } = computeBatchedScoreMap(dt, [mask([[0, 0], [0, 0]])], 1.0);
    dt.dispose();
    expect(results[0].score).toBe(0);
  });
});

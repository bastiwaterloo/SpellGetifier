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

describe('computeBatchedScoreMap (IoU)', () => {
  it('scores a perfect overlap as IoU 1', () => {
    // 2x2 drawing identical to a 2x2 template: intersection 4, union 4 -> 1.
    const drawing = mask([[1, 1], [1, 1]]);
    const dt = tf.tensor4d(drawing.data, [1, 2, 2, 1]);
    const { results, outWidth, outHeight } = computeBatchedScoreMap(dt, [mask([[1, 1], [1, 1]])]);
    dt.dispose();
    expect(outWidth).toBe(1);
    expect(outHeight).toBe(1);
    expect(results[0].score).toBeCloseTo(1.0, 4);
  });

  it('penalizes drawn ink the template does not explain', () => {
    // Template ink is the top row only; the drawing fills the whole 2x2.
    // intersection 2, union = templateInk(2) + drawingInk(4) - 2 = 4 -> IoU 0.5.
    const drawing = mask([[1, 1], [1, 1]]);
    const dt = tf.tensor4d(drawing.data, [1, 2, 2, 1]);
    const { results } = computeBatchedScoreMap(dt, [mask([[1, 1], [0, 0]])]);
    dt.dispose();
    expect(results[0].score).toBeCloseTo(0.5, 4);
  });

  it('localizes the matching template channel and ranks it above a partial cover', () => {
    // 5x5 drawing with an L-shape (5 ink px) at (col 1, row 1).
    const drawing = mask([
      [0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ]);
    const dt = tf.tensor4d(drawing.data, [1, 5, 5, 1]);
    const L = mask([[1, 0, 0], [1, 0, 0], [1, 1, 1]]); // matches exactly -> IoU 1
    const box = mask([[1, 1, 1], [1, 1, 1], [1, 1, 1]]); // covers L but adds ink -> IoU 5/9
    const { results, outWidth, outHeight } = computeBatchedScoreMap(dt, [L, box]);
    dt.dispose();
    expect(outWidth).toBe(3);
    expect(outHeight).toBe(3);
    expect(results[0].score).toBeCloseTo(1.0, 4);
    expect(results[0].col).toBe(1);
    expect(results[0].row).toBe(1);
    expect(results[1].score).toBeCloseTo(5 / 9, 4);
    expect(results[1].score).toBeLessThan(results[0].score);
  });

  it('scores a blank template as 0', () => {
    const drawing = mask([[1, 1], [1, 1]]);
    const dt = tf.tensor4d(drawing.data, [1, 2, 2, 1]);
    const { results } = computeBatchedScoreMap(dt, [mask([[0, 0], [0, 0]])]);
    dt.dispose();
    expect(results[0].score).toBe(0);
  });
});

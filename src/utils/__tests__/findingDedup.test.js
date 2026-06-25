import { describe, it, expect } from 'vitest';
import { dedupeFindings } from '../findingDedup.js';

const make = (over) => ({
  id: 1, name: 'Bolt', imagePath: '/x.png',
  size: 64, x: 100, y: 100, rotation: 0, score: 0.7, ...over,
});

describe('dedupeFindings', () => {
  it('returns findings sorted by score descending', () => {
    const out = dedupeFindings(
      [make({ x: 0, y: 0, score: 0.65 }), make({ x: 300, y: 300, score: 0.9 })],
      0.5,
    );
    expect(out.map((f) => f.score)).toEqual([0.9, 0.65]);
  });

  it('suppresses a lower-scoring finding within nmsRelative * size', () => {
    // size 64, nmsRelative 0.5 -> suppression radius 32 px
    const out = dedupeFindings(
      [make({ x: 100, y: 100, score: 0.9 }), make({ x: 120, y: 100, score: 0.7 })],
      0.5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(0.9);
  });

  it('keeps two findings that are farther apart than the radius', () => {
    const out = dedupeFindings(
      [make({ x: 100, y: 100, score: 0.9 }), make({ x: 200, y: 100, score: 0.7 })],
      0.5,
    );
    expect(out).toHaveLength(2);
  });
});

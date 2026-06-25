import { describe, it, expect } from 'vitest';
import { dedupeFindings, suppressSigilFragments } from '../findingDedup.js';

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

  it('keeps the higher-scoring finding when overlapping detections differ in size', () => {
    // A spurious larger match must not beat a better smaller one at the same spot.
    const out = dedupeFindings(
      [
        make({ name: 'Convergence', size: 128, x: 250, y: 250, score: 0.79 }),
        make({ name: 'Collection', size: 192, x: 250, y: 250, score: 0.54 }),
      ],
      0.5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Convergence');
  });

  it('preserves a type field on the kept finding', () => {
    const out = dedupeFindings([make({ type: 'sigil', name: 'Fire' })], 0.5);
    expect(out[0].type).toBe('sigil');
  });

  it('suppresses small fragment matches inside a larger highest-scoring rune', () => {
    // The big rune scores highest and is kept first; its max-size radius
    // (0.5 * 128 = 64) absorbs the nearby smaller fragment hits.
    const out = dedupeFindings(
      [
        make({ name: 'Bend', size: 128, x: 182, y: 168, score: 0.83 }),
        make({ name: 'Enlarge', size: 24, x: 172, y: 196, score: 0.6 }),
        make({ name: 'Radial', size: 16, x: 193, y: 133, score: 0.58 }),
      ],
      0.5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Bend');
  });
});

describe('suppressSigilFragments', () => {
  // A drawn sigil (center) plus ring runes around it. Fragment matches that
  // land INSIDE the sigil are spurious; real ring runes sit outside it.
  const f = (over) => ({
    id: 1, name: 'x', type: 'sign', imagePath: '/x.png',
    size: 32, x: 0, y: 0, rotation: 0, score: 0.6, ...over,
  });

  it('removes sign fragments whose center is inside a sigil footprint', () => {
    const sigil = f({ type: 'sigil', name: 'Fire', size: 200, x: 250, y: 250, score: 0.6 });
    // even though the fragment scores higher, it is inside the sigil glyph
    const fragment = f({ type: 'sign', name: 'Coil', size: 32, x: 260, y: 285, score: 0.62 });

    const out = suppressSigilFragments([sigil, fragment]);

    expect(out.map((o) => o.name)).toEqual(['Fire']);
  });

  it('keeps ring runes whose center is outside the sigil footprint', () => {
    const sigil = f({ type: 'sigil', name: 'Fire', size: 200, x: 250, y: 250 });
    const ringRune = f({ type: 'sign', name: 'Bolt', size: 48, x: 430, y: 250 });

    const out = suppressSigilFragments([sigil, ringRune]);

    expect(out.map((o) => o.name).sort()).toEqual(['Bolt', 'Fire']);
  });

  it('leaves findings untouched when no sigil is present', () => {
    const a = f({ name: 'Coil', x: 100, y: 100 });
    const b = f({ name: 'Bolt', x: 300, y: 300 });

    expect(suppressSigilFragments([a, b])).toHaveLength(2);
  });
});

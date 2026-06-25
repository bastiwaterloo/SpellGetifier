import { describe, expect, it } from 'vitest';

import { runesToSpell } from '../spell.js';

describe('runesToSpell', () => {
    it('returns the fallback spell for an empty rune list', () => {
        const spell = runesToSpell([]);

        expect(spell).toEqual({
            name: 'Platscher',
            description: 'Das ist nicht sehr effektiv',
            damage: 0
        });
    });

    it('returns the fallback spell when only ring runes (no sigil) are found', () => {
        const runes = [
            { name: 'Column', type: 'sign', score: 88 },
            { name: 'Region', type: 'sign', score: 72 }
        ];

        expect(runesToSpell(runes)).toEqual({
            name: 'Platscher',
            description: 'Das ist nicht sehr effektiv',
            damage: 0
        });
    });

    it('creates the Fire spell when a Fire sigil is found', () => {
        const runes = [
            { name: 'Column', type: 'sign', score: 70 },
            { name: 'Fire', type: 'sigil', score: 65 }
        ];

        expect(runesToSpell(runes)).toEqual({
            name: 'Feuerball',
            description: 'Eine Kugel aus lodernden Flammen.',
            damage: 30
        });
    });

    it('creates the Water spell when a Water sigil is found', () => {
        expect(runesToSpell([{ name: 'Water', type: 'sigil', score: 60 }])).toEqual({
            name: 'Wasserstrahl',
            description: 'Ein harter Strahl aus Wasser.',
            damage: 20
        });
    });

    it('creates the Light spell when a Light sigil is found', () => {
        expect(runesToSpell([{ name: 'Light', type: 'sigil', score: 55 }])).toEqual({
            name: 'Lichtblitz',
            description: 'Ein blendender Strahl aus Licht.',
            damage: 25
        });
    });

    it('uses the first (highest-scoring) sigil when several are found', () => {
        // findings arrive sorted by score descending, so the first sigil wins
        const runes = [
            { name: 'Light', type: 'sigil', score: 80 },
            { name: 'Fire', type: 'sigil', score: 40 }
        ];

        expect(runesToSpell(runes).name).toBe('Lichtblitz');
    });

    it('returns the fallback spell for an unknown sigil', () => {
        expect(runesToSpell([{ name: 'Earth', type: 'sigil', score: 70 }])).toEqual({
            name: 'Platscher',
            description: 'Das ist nicht sehr effektiv',
            damage: 0
        });
    });
});

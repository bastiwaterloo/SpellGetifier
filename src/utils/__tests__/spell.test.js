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

    it('returns the fallback spell regardless of the runes given', () => {
        const runes = [
            { name: 'feuer', size: 64, x: 10, y: 20, rotation: 0, score: 88 },
            { name: 'wasser', size: 48, x: 30, y: 40, rotation: 90, score: 72 }
        ];

        const spell = runesToSpell(runes);

        expect(spell).toEqual({
            name: 'Platscher',
            description: 'Das ist nicht sehr effektiv',
            damage: 0
        });
    });
});

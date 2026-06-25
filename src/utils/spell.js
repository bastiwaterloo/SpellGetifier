// Wandelt eine Liste erkannter Runen (die `findings` der iterativen Erkennung)
// in einen Zauber um.
//
// Wird ein Siegel (Element) gefunden, entsteht ein einfacher Zauber des
// passenden Elements; sonst kommt der Platzhalter-Zauber zurück. Die findings
// kommen nach Score absteigend sortiert an, also gewinnt das erste (sicherste)
// Siegel.

const FALLBACK_SPELL = {
    name: 'Platscher',
    description: 'Das ist nicht sehr effektiv',
    damage: 0
};

// Einfacher Zauber je Element, indiziert über den Siegel-Namen (finding.name).
const ELEMENT_SPELLS = {
    Fire: {
        name: 'Feuerball',
        description: 'Eine Kugel aus lodernden Flammen.',
        damage: 30
    },
    Water: {
        name: 'Wasserstrahl',
        description: 'Ein harter Strahl aus Wasser.',
        damage: 20
    },
    Light: {
        name: 'Lichtblitz',
        description: 'Ein blendender Strahl aus Licht.',
        damage: 25
    }
};

export function runesToSpell(runes = []) {
    const sigil = runes.find((rune) => rune.type === 'sigil');
    if (sigil) {
        const spell = ELEMENT_SPELLS[sigil.name];
        if (spell) return spell;
    }
    return FALLBACK_SPELL;
}

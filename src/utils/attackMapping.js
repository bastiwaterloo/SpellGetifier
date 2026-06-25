// Mapping-Schicht: aus der Zeichenqualität wird die Stärke einer Attacke.
// Reine Funktionen, entkoppelt von Rendering und Erkennung.
//
//   Erkennung (Kreis-Score, Konfidenz)
//     -> computeQuality  -> Q in [0,1]
//     -> buildAttackParams(preset, Q) -> skalierte Animations-Parameter
//
// Idee: je besser gezeichnet, desto stärker die Attacke. Q skaliert nur die
// "Power"-Parameter; Element-Charakter (spread, turbulence, Farbe) bleibt.

import {PARTICLE_PARAM_CONTROLS} from '../config/elementPresets.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));

// Gültige Wertebereiche je Parameter (aus den Slider-Definitionen).
const PARAM_RANGES = Object.fromEntries(
    PARTICLE_PARAM_CONTROLS.map(({key, min, max}) => [key, [min, max]])
);

// Verdichtet verfügbare Qualitätssignale (jeweils 0..100) zu einem Q in [0,1].
// Fehlende Signale (null) werden ignoriert; das Gewicht verteilt sich auf den
// Rest, sodass ein einzelnes Signal voll zählt.
export function computeQuality({circleScore = null, confidence = null} = {}) {
    const parts = [];
    if (circleScore != null) parts.push([0.5, clamp01(circleScore / 100)]);
    if (confidence != null) parts.push([0.5, clamp01(confidence / 100)]);
    if (parts.length === 0) return 0;

    const weightSum = parts.reduce((sum, [weight]) => sum + weight, 0);
    const value = parts.reduce((sum, [weight, signal]) => sum + weight * signal, 0);
    return clamp01(value / weightSum);
}

// Anteil des Voll-Looks bei Q=0 (Boden). Bei Q=1 -> 100 % der Preset-Defaults.
// Nur diese "Power"-Parameter werden skaliert; alles andere bleibt unverändert.
export const POWER_FLOORS = {
    particleCount: 0.15,
    intensity: 0.35,
    flameHeight: 0.6,
    particleSize: 0.7,
    riseSpeed: 0.8
};

// Skaliert die Power-Parameter eines Presets anhand der Qualität Q.
export function buildAttackParams(preset, quality) {
    const defaults = preset.defaults;
    const q = clamp01(quality);
    const scaled = {...defaults};

    for (const [key, floor] of Object.entries(POWER_FLOORS)) {
        if (typeof defaults[key] !== 'number') continue;
        const factor = floor + (1 - floor) * q;
        scaled[key] = defaults[key] * factor;
    }

    scaled.particleCount = Math.round(scaled.particleCount);
    return scaled;
}

// Runen-Modifier: Multiplikatoren je Parameter, grob aus der Bedeutung der
// Signs (config/config.json `explanation`) abgeleitet. Mehrere erkannte Runen
// multiplizieren sich; Keys = Dateiname der Rune (RUNE_NAMES / fileName).
export const RUNE_MODIFIERS = {
    Column: {flameHeight: 1.6, spread: 0.4, riseSpeed: 1.3}, // Säule/Strahl nach oben
    Levitation: {riseSpeed: 1.3, flameHeight: 1.2}, // Schweben / Auftrieb
    Pull: {spread: 0.5, turbulence: 0.7}, // zieht nach innen zusammen
    Crush: {turbulence: 1.5, particleCount: 1.2, particleSize: 0.8}, // zertrümmern
    Dancing_Puppet: {turbulence: 1.8}, // erratische, "tanzende" Bewegung
    Direction: {spread: 0.5}, // gerichtet, gebündelt
    Convergence: {spread: 0.3, particleSize: 0.9}, // Konvergenz auf einen Punkt
    Collection: {spread: 1.3, particleCount: 1.2}, // sammelt Material ringsum
    Billowing: {particleSize: 1.6, turbulence: 1.3, riseSpeed: 0.8}, // wabernde Wolke
    Repetition: {particleCount: 1.4}, // Wiederholung -> dichter
    Weave: {flameHeight: 1.4, particleSize: 0.7}, // gestreckte, dünne Bänder
    Coil_Sign: {turbulence: 1.6}, // Spiral-/Coil-Form
    Entwine: {turbulence: 1.4, spread: 1.2}, // umschlingen
    Sign_of_Wind: {spread: 1.4, turbulence: 1.3, riseSpeed: 1.2}, // Wind
    Gather: {spread: 1.3, particleCount: 1.2}, // sammeln (wie Collection)
    Glaives: {riseSpeed: 1.5, spread: 0.5}, // durchdringend, schnell
    Solidify: {particleSize: 1.3, riseSpeed: 0.8, turbulence: 0.6}, // verfestigen
    Bend: {spread: 1.4, turbulence: 1.2}, // umhüllen
    Sign_of_concealment_redraw: {intensity: 0.6, particleCount: 0.7}, // verbergen / dimmen
    Sign_of_reflection_redraw: {spread: 1.2}, // Reflexion / Illusion
    Diamond: {particleSize: 0.7, flameHeight: 0.8}, // Reduktion -> kleiner
    Window: {spread: 1.3, particleSize: 1.2}, // Expansion
    Bolt: {riseSpeed: 1.6, spread: 0.6}, // Geschosse, schnell + gebündelt
    Rain: {particleCount: 1.4, riseSpeed: 0.7, particleSize: 0.8}, // Regen
    Orb: {flameHeight: 0.8, particleSize: 1.2}, // kugelförmiger Raum
    Purify_Sign: {turbulence: 0.6, intensity: 1.1}, // reinigen -> klar, hell
    Link_Sign: {spread: 1.1}, // verbinden (dezent)
    Stasis_Sign: {riseSpeed: 0.5, turbulence: 0.4}, // Stillstand
    Sign_of_projection_redraw: {spread: 1.5, riseSpeed: 1.2} // nach außen projizieren
};

// Wendet die Modifier der erkannten Ring-Runen auf die Parameter an und
// begrenzt das Ergebnis auf die gültigen Slider-Bereiche.
export function applyRuneModifiers(params, runeFiles = []) {
    const out = {...params};

    for (const file of runeFiles) {
        const mod = RUNE_MODIFIERS[file];
        if (!mod) continue;
        for (const [key, factor] of Object.entries(mod)) {
            if (typeof out[key] === 'number') out[key] *= factor;
        }
    }

    for (const [key, [min, max]] of Object.entries(PARAM_RANGES)) {
        if (typeof out[key] === 'number') {
            out[key] = Math.max(min, Math.min(max, out[key]));
        }
    }
    out.particleCount = Math.round(out.particleCount);
    return out;
}

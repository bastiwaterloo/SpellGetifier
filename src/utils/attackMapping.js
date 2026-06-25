// Mapping-Schicht: aus der Zeichenqualität wird die Stärke einer Attacke.
// Reine Funktionen, entkoppelt von Rendering und Erkennung.
//
//   Erkennung (Kreis-Score, Konfidenz)
//     -> computeQuality  -> Q in [0,1]
//     -> buildAttackParams(preset, Q) -> skalierte Animations-Parameter
//
// Idee: je besser gezeichnet, desto stärker die Attacke. Q skaliert nur die
// "Power"-Parameter; Element-Charakter (spread, turbulence, Farbe) bleibt.

const clamp01 = (value) => Math.max(0, Math.min(1, value));

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

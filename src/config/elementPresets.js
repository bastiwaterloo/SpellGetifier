// Presets für die Element-Partikel-Animationen (Three.js).
// Jedes Preset ist self-contained: Farbverlauf, Spawn-Verhalten, Schwerkraft,
// Kamerafokus und Standard-Parameter. ElementStage bleibt dadurch generisch.

// Obergrenze der vorab allokierten Partikel-Buffer.
export const MAX_PARTICLES = 2000;

// Generische Slider-Definitionen: [key, label, min, max, step].
// Keys entsprechen den Feldern im params-Objekt.
export const PARTICLE_PARAM_CONTROLS = [
  { key: 'particleCount', label: 'Partikel', min: 50, max: 2000, step: 10 },
  { key: 'riseSpeed', label: 'Geschwindigkeit', min: 0.1, max: 5, step: 0.1 },
  { key: 'spread', label: 'Streuung', min: 0, max: 2, step: 0.05 },
  { key: 'flameHeight', label: 'Höhe', min: 0.5, max: 5, step: 0.1 },
  { key: 'turbulence', label: 'Turbulenz', min: 0, max: 2, step: 0.05 },
  { key: 'particleSize', label: 'Größe', min: 1, max: 40, step: 1 },
  { key: 'intensity', label: 'Intensität', min: 0, max: 1, step: 0.01 }
];

// --- Farbverläufe (t: 0 jung -> 1 alt), schreiben in ein THREE.Color-artiges out ---
function fireColor(t, out) {
  if (t < 0.5) {
    const k = t / 0.5; // weiß-gelb -> orange
    out.r = 1.0;
    out.g = 0.9 - 0.45 * k;
    out.b = 0.55 - 0.45 * k;
  } else {
    const k = (t - 0.5) / 0.5; // orange -> dunkelrot
    out.r = 1.0 - 0.5 * k;
    out.g = 0.45 - 0.4 * k;
    out.b = 0.1 - 0.1 * k;
  }
}

function waterColor(t, out) {
  if (t < 0.5) {
    const k = t / 0.5; // schaumig weiß-cyan -> hellblau
    out.r = 0.85 - 0.65 * k;
    out.g = 0.95 - 0.25 * k;
    out.b = 1.0;
  } else {
    const k = (t - 0.5) / 0.5; // hellblau -> tiefblau
    out.r = 0.2 - 0.15 * k;
    out.g = 0.7 - 0.4 * k;
    out.b = 1.0 - 0.2 * k;
  }
}

function lightColor(t, out) {
  if (t < 0.5) {
    const k = t / 0.5; // weiß -> gold
    out.r = 1.0;
    out.g = 1.0 - 0.15 * k;
    out.b = 0.95 - 0.55 * k;
  } else {
    const k = (t - 0.5) / 0.5; // gold -> bernstein
    out.r = 1.0 - 0.2 * k;
    out.g = 0.85 - 0.4 * k;
    out.b = 0.4 - 0.3 * k;
  }
}

const rand = (min, max) => min + Math.random() * (max - min);

// --- Spawn-Verhalten: liefert Startposition/-geschwindigkeit + Lebensdauer ---
// Feuer: steigt vom Boden auf.
function fireSpawn(p) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * p.spread * 0.4;
  return {
    x: Math.cos(angle) * radius,
    y: -1.0,
    z: Math.sin(angle) * radius,
    vx: rand(-0.5, 0.5) * p.spread,
    vy: rand(0.8, 1.4),
    vz: rand(-0.5, 0.5) * p.spread,
    life: p.flameHeight * rand(0.6, 1.4)
  };
}

// Wasser: Springbrunnen – schießt nach oben/außen, Schwerkraft zieht in einem
// Bogen zurück nach unten. Liest sich klar als Wasser.
function waterSpawn(p) {
  const angle = Math.random() * Math.PI * 2;
  const out = Math.random() * 0.5 * p.spread;
  return {
    x: Math.cos(angle) * out * 0.3,
    y: -0.9,
    z: Math.sin(angle) * out * 0.3,
    vx: Math.cos(angle) * out,
    vy: rand(1.8, 2.6),
    vz: Math.sin(angle) * out,
    life: p.flameHeight * rand(0.85, 1.15)
  };
}

// Licht: strahlt radial aus dem Zentrum, leichter Auftrieb.
function lightSpawn(p) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const speed = rand(0.4, 1.2) * (0.5 + p.spread);
  return {
    x: 0,
    y: 0.2,
    z: 0,
    vx: Math.sin(phi) * Math.cos(theta) * speed,
    vy: Math.cos(phi) * speed + 0.3,
    vz: Math.sin(phi) * Math.sin(theta) * speed,
    life: p.flameHeight * rand(0.6, 1.3)
  };
}

// Per-Element-Presets, indiziert über die Siegel-Bilddatei (file in ENABLED_SIGNS).
export const ELEMENT_PRESETS = {
  Fire_sigil: {
    id: 'fire',
    label: 'Feuer',
    color: fireColor,
    spawn: fireSpawn,
    gravity: [0, 0, 0],
    cameraTarget: [0, 0.9, 0],
    blending: 'additive',
    opacity: 1,
    defaults: {
      particleCount: 600,
      riseSpeed: 1.6,
      spread: 0.6,
      flameHeight: 2.2,
      turbulence: 0.8,
      particleSize: 14,
      intensity: 1
    }
  },
  Water: {
    id: 'water',
    label: 'Wasser',
    renderMode: 'shader',
    color: waterColor,        // kept for reference; WaterStage colors in-shader
    spawn: waterSpawn,        // kept for reference; WaterStage spawns internally
    gravity: [0, -2.6, 0],
    cameraTarget: [0, 0.1, 0],
    blending: 'normal',
    opacity: 0.9,
    water: {
      baseY: -0.9,
      poolRadius: 2.0
    },
    defaults: {
      particleCount: 1200,
      riseSpeed: 1.2,
      spread: 0.6,
      flameHeight: 1.6,
      turbulence: 0.12,
      particleSize: 9,
      intensity: 1
    }
  },
  Light: {
    id: 'light',
    label: 'Licht',
    color: lightColor,
    spawn: lightSpawn,
    gravity: [0, 0.25, 0],
    cameraTarget: [0, 0.3, 0],
    blending: 'additive',
    opacity: 1,
    defaults: {
      particleCount: 700,
      riseSpeed: 1.0,
      spread: 0.9,
      flameHeight: 2.0,
      turbulence: 0.5,
      particleSize: 12,
      intensity: 1
    }
  }
};

export function getPresetByFile(file) {
  return ELEMENT_PRESETS[file] || null;
}

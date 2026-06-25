# Fire Animation Rework — Design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)
**Branch:** `animations`

## Problem

The Fire element does not read as fire. It uses the shared generic `ElementStage`
→ `THREE.Points` renderer: additive orange dots rising from the ground with no
flame shape, no upward taper, no flame tongues, and no embers. It reads as a
generic orange glow blob (and in dense/small-canvas conditions the additive
particles saturate to a flat white box).

## Goal

A "magical roaring fire": brighter, faster, more turbulent than a realistic
campfire, with licking flame tongues, lots of rising sparks/embers, and a strong
warm glow. Built as a dedicated shader stage mirroring the water rework. Light
(which also uses `ElementStage`) and Water must be unaffected.

## Approach (chosen: dedicated additive shader stage)

A new `FireStage` component renders Fire with a custom additive `ShaderMaterial`
on an `InstancedBufferGeometry`, reusing the velocity-stretch billboard technique
proven in `WaterStage`. The generic `Points` renderer (Light) and `WaterStage`
are left untouched.

Rejected alternatives: improving the shared `Points` renderer (cannot do flame
tongues / stretched tapered shapes, and would pollute the generic renderer); and
flame+sparks without a glow layer (the glow bloom materially sells the "roaring"
look, kept in scope).

## Architecture & isolation

- **New `src/components/FireStage.jsx`** — same props as the other stages
  (`preset`, `params`, `igniteKey`). Owns its scene, camera, renderer, instanced
  geometry, shaders, render loop, anime.js ignite + flicker, and cleanup.
  Self-contained.
- **`src/components/DrawingCanvas.jsx`** — replace the water-only ternary with a
  small stage map so multiple shader stages coexist:
  ```js
  const SHADER_STAGES = { water: WaterStage, fire: FireStage };
  const StageComponent =
    selectedPreset.renderMode === 'shader'
      ? SHADER_STAGES[selectedPreset.id]
      : ElementStage;
  ```
  Then render `<StageComponent key=… preset=… params=… igniteKey=… />`.
- **`src/config/elementPresets.js`** — Fire preset gains `renderMode: 'shader'`
  and retuned `defaults`. (Fire keeps `gravity: [0, 0, 0]`,
  `cameraTarget: [0, 0.9, 0]`, `blending: 'additive'`.)
- **Untouched:** `ElementStage.jsx` (Light), `WaterStage.jsx`, Water/Light presets.

## Rendering engine (FireStage)

`THREE.InstancedBufferGeometry` (a unit `PlaneGeometry(1,1)` instanced N times) +
a custom `ShaderMaterial`, `transparent: true`, `depthWrite: false`,
`depthTest: true`, `side: THREE.DoubleSide` (the velocity-stretch basis flips quad
winding — same requirement found in `WaterStage`), `blending:
THREE.AdditiveBlending`.

Per-instance attributes (same layout as `WaterStage`): `iOffset(vec3)`,
`iVelocity(vec3)`, `iLife(float)`, `iSize(float)`, `iSeed(float)`, `iKind(float)`.

**Vertex shader:** billboard each quad to the camera, then stretch it along the
particle's screen-space velocity (flames move mostly upward, so they elongate
vertically). Flame tongues stretch strongly; sparks and glow stay round
(`iKind > 0.5 → no stretch`). Scale by `iSize`.

**Fragment shader:** soft body falloff. Color ramps by `iLife`:
hot white-yellow `(1.0, 0.95, 0.75)` → orange `(1.0, 0.45, 0.1)` → deep red
`(0.6, 0.08, 0.02)`. Brightness scaled by `uIntensity` and faded over life.
Per-particle brightness is moderate so additive overlap reads orange with only
the dense core going hot-white (avoids a uniform white blowout). Output
`vec4(col * alpha, alpha)`-style additive contribution; no hard discard needed
beyond a small alpha cutoff.

## Particle kinds (single instanced pool, no cross-particle messaging)

1. **Flame tongues** (`kind = 0`, majority) — spawn near the base in a cone
   (`spread`), strong upward velocity (`riseSpeed`), heavy lateral turbulence so
   they lick/curl; short-to-medium life (`flameHeight`); stretch vertically.
2. **Sparks / embers** (`kind = 1`) — a fixed index fraction (e.g. every 7th
   slot): tiny `iSize`, fast upward, long life, drift with turbulence, and
   twinkle (brightness oscillates via `seed + time` in the shader). Round.
3. **Glow bloom** (`kind = 2`) — a few large, soft, slow particles near the base
   providing a warm pulsing bloom that grounds the flame. Round, no stretch,
   large `iSize`, low per-pixel brightness (broad soft falloff).

Physics: same Euler integration as the other stages (velocity += turbulence +
buoyancy·dt; position += velocity·speed·dt) re-implemented inside `FireStage`.
Fire uses `gravity: [0,0,0]`; a small upward buoyancy may be added to flame
tongues so they accelerate upward as they rise.

## Dynamics

- **Ignite ramp** (anime.js) preserved — the cast/replay button ramps the fire in.
- **Flicker loop reinstated** — fire SHOULD flicker (water dropped it). An
  anime.js loop drives a `flicker` value (~0.82–1.15) multiplied into brightness,
  combined with heavy turbulence for the roaring feel.

## Params / sliders (keys unchanged)

| key | fire meaning |
|-----|--------------|
| `particleCount` | pool draw count (≈900 default) |
| `riseSpeed`     | upward velocity multiplier (≈1.8) |
| `spread`        | base cone width (≈0.5) |
| `flameHeight`   | flame lifetime / height (≈2.0) |
| `turbulence`    | licking/curl strength (≈1.2) |
| `particleSize`  | base flame size (≈16) |
| `intensity`     | overall brightness multiplier (1) |

Exact defaults tuned by eye during implementation.

## Files

- **New:** `src/components/FireStage.jsx`.
- **Edit:** `src/config/elementPresets.js` — Fire preset: `renderMode`, retuned
  defaults.
- **Edit:** `src/components/DrawingCanvas.jsx` — `SHADER_STAGES` map.
- **Unchanged:** `ElementStage.jsx`, `WaterStage.jsx`, Water/Light presets.

## Verification

Visual feature, no test runner. Verify with `npm run build` (exit 0, no errors)
and the Vite dev server (cast the Fire sigil; check the browser console for no
shader errors).

**Known preview limitation:** additive blending saturates to flat white in the
headless software-GL preview. To verify *structure* despite this, temporarily
lower the `Intensität` (and if needed `Partikel`) sliders in the preview to a
non-saturating regime and confirm: flame tongues stretch upward and curl, sparks
rise and twinkle, the glow pulses at the base, and Fire flickers. The final color
balance on a real GPU is confirmed by the user.

Confirm regression: Water still renders correctly (normal blending) and Light is
unchanged.

## Out of scope / YAGNI

- No smoke simulation, no real fluid/combustion sim.
- No new slider controls; existing keys reused.
- No changes to recognition, drawing, Water, or Light.

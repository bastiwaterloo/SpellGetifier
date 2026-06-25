# Water Animation Rework — Design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)
**Branch:** `animations`

## Problem

The Water element does not read as water. Mechanically it is the same generic
particle system as Fire and Light (`ElementStage.jsx` → `THREE.Points`), only
recolored blue with downward gravity. Three properties of that shared renderer
make Water look like dying embers rather than liquid:

1. **Per-particle "fade" multiplies the color toward black.** With additive
   blending (Fire/Light) this dims a glow correctly. With Water's normal
   blending a droplet stays fully opaque and just turns dark blue → black as it
   ages — it never thins out.
2. **`THREE.Points` sprites cannot stretch along velocity.** They are flat,
   square, axis-aligned, and uniformly sized. Falling water reads as water
   largely *because* fast droplets elongate into streaks; round dots cannot.
3. **One shared soft-glow texture + uniform size** gives every element the same
   "ember" sprite, with no specular highlight and no size variation (mist vs.
   fat droplet).

## Goal

A convincing "wet" fountain/jet for the Water element: droplets that stretch
when fast, thin out via transparency (not blacken), catch a specular highlight,
splash into foam where the jet lands, throw light mist, and sit over a gently
rippling pool. Fire and Light must be unaffected.

## Approach (chosen: A — dedicated water shader)

Give Water its own rendering path built on a custom `ShaderMaterial`, leaving the
generic `Points` renderer (and therefore Fire/Light) untouched. Approach B
(extending the shared `Points` renderer) was rejected because `THREE.Points`
cannot do velocity-stretching or per-particle size, and it would pollute the
generic renderer with water-only branches. Approach C (texture/color tweak only)
was rejected as insufficient.

## Architecture & isolation

- **New `src/components/WaterStage.jsx`** — same props as `ElementStage`
  (`preset`, `params`, `igniteKey`). Owns its own Three.js scene, camera,
  renderer, instanced geometry, shaders, render loop, and cleanup. Self-contained
  and independently understandable.
- **`src/components/DrawingCanvas.jsx`** — single branch at the existing render
  site: `preset.renderMode === 'shader' ? <WaterStage … /> : <ElementStage … />`.
  Props passed are identical (`key={preset.id}`, `preset`, `params`,
  `igniteKey`).
- **`src/config/elementPresets.js`** — Water preset gains `renderMode: 'shader'`,
  retuned `defaults`, and a small `water` config block (base-plane Y, body color,
  foam color). Fire and Light presets unchanged.
- **`ElementStage.jsx`, Fire, Light — not modified.** No regression surface.

## Rendering engine (WaterStage)

`THREE.InstancedBufferGeometry`: one unit quad (2 triangles) instanced N times.
Material is a custom `ShaderMaterial`, `transparent: true`,
`blending: THREE.NormalBlending`, `depthWrite: false`, `depthTest: true`.

Per-instance attributes:

| attribute | type | purpose |
|-----------|------|---------|
| `iOffset`   | vec3  | world position |
| `iVelocity` | vec3  | for screen-space stretch direction/magnitude |
| `iLife`     | float | normalized age `t` (0 young → 1 dead), drives alpha fade |
| `iSize`     | float | per-particle base size (mist vs droplet) |
| `iSeed`     | float | per-particle randomness (highlight jitter, etc.) |
| `iKind`     | float | 0 = jet, 1 = splash foam, 2 = mist (drives color/shape) |

**Vertex shader:** billboard the quad toward the camera, then stretch it along
the projected (screen-space) velocity — round when slow, elongated streak when
fast, with a clamped maximum aspect so it never becomes a needle. Scale by
`iSize`. Pass `t`, `iSeed`, `iKind`, and the local quad UV to the fragment
shader.

**Fragment shader:** soft round droplet body (radial falloff) plus a small
offset **bright specular highlight** near the top of the droplet. Alpha =
`bodyFalloff * lifeAlpha`, where `lifeAlpha` eases 1 → 0 over `t` (droplet thins
out, never blackens). Body color light-cyan, deepening with depth; highlight
near-white; foam (`iKind == 1`) whiter and rounder.

## Particle kinds (single instanced pool, no cross-particle messaging)

All three kinds live in one pool of size `MAX_PARTICLES`; behavior is decided at
spawn/respawn time from the particle's index and state. No particle needs to
write to another particle's slot.

1. **Jet droplets** (majority) — spawn at the nozzle (`y ≈ baseY`) with outward +
   strong upward velocity (current `waterSpawn` shape), arc under gravity, stretch
   when fast. `iKind = 0`.
2. **Splash foam** — when a jet droplet returns to the base plane
   (`y ≤ baseY && vy < 0`) it **shatters in place**: it is repositioned to its
   impact point and re-velocitied into a short-lived, whitish, low outward+up foam
   arc (`iKind = 1`), instead of immediately respawning at the nozzle. This yields
   a continuous foam ring wherever droplets land. When the foam life ends it
   respawns as a normal jet droplet at the nozzle.
3. **Mist** — a fixed index fraction (e.g. every 6th slot) spawns at the jet crown:
   tiny `iSize`, slow velocity, long life, very low alpha, gentle drift.
   `iKind = 2`.

Physics integration stays the same Euler scheme already in `ElementStage`
(velocity += gravity·dt + small turbulence; position += velocity·speed·dt),
re-implemented inside `WaterStage`'s loop with the base-plane collision check
added.

## Pool surface

A separate flat `THREE.CircleGeometry` disc centered at `baseY`, with its own
small `ShaderMaterial`: animated concentric ripples
(`sin(radius * k - time * w)`) modulating a blue → teal gradient with a
low-opacity specular sheen, additive highlights kept subtle. Sits beneath the
fountain to ground it; the existing low camera target (`[0, 0.1, 0]`) already
frames it. Rendered before the droplets.

## Look, color & dynamics

- Body color `≈ (0.55, 0.80, 1.00)` near the crown, deepening toward
  `(0.15, 0.45, 0.85)`; foam/highlight near-white.
- **Fade through alpha**, eased — never multiply color toward black.
- The `dyn.ignite` startup ramp (anime.js) is preserved so the cast/replay
  ("Replay") button still ramps the effect in.
- The **fire flicker loop is dropped for water** (brightness flicker is a fire
  tell). Water uses a steady intensity plus the pool's own ripple shimmer.

## Params / sliders (keys unchanged)

Reuse every existing param key so `ElementDebugPanel` keeps working with no
changes:

| key | water meaning |
|-----|---------------|
| `particleCount` | pool draw count |
| `riseSpeed`     | overall velocity multiplier |
| `spread`        | jet cone radius |
| `flameHeight`   | jet lifetime / fountain height |
| `turbulence`    | small lateral noise |
| `particleSize`  | base droplet size |
| `intensity`     | overall brightness/opacity multiplier |

Defaults retuned for the wet look (expected direction: more particles, smaller
base size than the current 9, low turbulence). Exact values tuned by eye during
implementation.

## Files

- **New:** `src/components/WaterStage.jsx` (component, instanced system, inline
  GLSL for droplets and pool, splash + mist logic, cleanup).
- **New (optional):** `src/components/WaterStage.css` — only if needed; otherwise
  reuse the existing `.element-stage--water` dark-blue radial background.
- **Edit:** `src/config/elementPresets.js` — Water preset: `renderMode`, retuned
  defaults, `water` config block.
- **Edit:** `src/components/DrawingCanvas.jsx` — `renderMode` branch.
- **Unchanged:** `ElementStage.jsx`, Fire, Light.

## Verification

The change is purely visual; there is no meaningful unit test for a shader. Verify
by running the Vite dev server, casting the Water sigil, and observing /
screenshotting that:

1. Fast droplets visibly **stretch** into streaks; slow ones stay round.
2. Droplets **fade transparently** (thin out), not to black.
3. A **foam ring** appears where the jet lands.
4. **Mist** drifts at the crown.
5. The **pool ripples** beneath the fountain.
6. **Fire and Light are visually unchanged** (regression check).

## Out of scope / YAGNI

- No refraction, caustics, or real fluid simulation.
- No reflection of surroundings in the pool (faux sheen only).
- No new slider controls; existing keys are reused.
- No changes to recognition, drawing, or any non-Water element.

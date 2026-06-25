# Fire Animation Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Fire element a "magical roaring fire" — stretched licking flame tongues, twinkling rising sparks, and a pulsing warm glow — without touching Water or Light.

**Architecture:** A new self-contained `FireStage.jsx` renders Fire with a custom additive `ShaderMaterial` on an `InstancedBufferGeometry` (billboarded, velocity-stretched quads), reusing the technique proven in `WaterStage`. `DrawingCanvas` selects the stage component via a `SHADER_STAGES` map keyed by `preset.id`. The generic `Points` renderer (Light) and `WaterStage` are untouched.

**Tech Stack:** React 18, Three.js 0.184, anime.js 4, Vite 6, inline GLSL.

## Global Constraints

- Water and Light must remain visually unchanged — do NOT edit `WaterStage.jsx`, `ElementStage.jsx`, or the Water/Light presets.
- Reuse the existing param keys (`particleCount`, `riseSpeed`, `spread`, `flameHeight`, `turbulence`, `particleSize`, `intensity`) — no new sliders.
- `MAX_PARTICLES = 2000` (from `elementPresets.js`) is the buffer ceiling.
- No new runtime dependencies; Three.js and anime.js only.
- Fire material: `transparent: true`, `depthWrite: false`, `depthTest: true`, `side: THREE.DoubleSide`, `blending: THREE.AdditiveBlending`.
- Fire preset keeps `gravity: [0, 0, 0]`, `cameraTarget: [0, 0.9, 0]`, `blending: 'additive'`.
- Flame spawn base plane Y: `-1.0` (matches the original `fireSpawn`).

## Verification model (read before starting)

Purely visual feature, **no test runner**. Each task is verified by:

1. **`npm run build`** — must exit 0.
2. **`npm run dev`**, then in the browser select the Fire sigil and observe.
3. **Browser console** — no `THREE.WebGLProgram` / shader compile errors.
4. **Regression:** Water still renders correctly; Light unchanged.

**Known preview limitation:** additive blending saturates to flat white in the headless software-GL preview. To verify *structure* despite this, lower the `Intensität` slider (and if needed `Partikel`) in the debug panel to a non-saturating regime, confirm the described shapes/motion, then restore. Final color balance on a real GPU is confirmed by the user.

## File Structure

- **Create `src/components/FireStage.jsx`** — Fire-only renderer: scene/camera/renderer/cleanup, instanced-quad geometry, flame vertex+fragment GLSL, JS particle physics (flame/spark/glow), anime.js ignite + flicker. One responsibility: render the Fire element.
- **Modify `src/config/elementPresets.js`** — Fire preset only: add `renderMode: 'shader'`, retuned `defaults`.
- **Modify `src/components/DrawingCanvas.jsx`** — replace the water-only ternary with a `SHADER_STAGES` map.
- **Untouched:** `WaterStage.jsx`, `ElementStage.jsx`, Water/Light presets.

---

### Task 1: Roaring flame tongues (wiring + additive shader + physics + flicker)

Delivers the core: selecting Fire renders a continuous mass of upward-stretched, licking flame tongues with a hot-core→orange→red ramp, ignite ramp, and flicker. Single kind (flame); sparks/glow come later but the shader already branches on kind.

**Files:**
- Create: `src/components/FireStage.jsx`
- Modify: `src/config/elementPresets.js:115-133` (Fire preset)
- Modify: `src/components/DrawingCanvas.jsx` (imports + `SHADER_STAGES` map at the render site)

**Interfaces:**
- Consumes: `MAX_PARTICLES` from `../config/elementPresets.js`; props `{ preset, params, igniteKey }`.
- Produces: default-exported React component `FireStage`; `Fire_sigil` preset gains `renderMode: 'shader'`.

- [ ] **Step 1: Add `renderMode` + retuned defaults to the Fire preset**

In `src/config/elementPresets.js`, replace the `Fire_sigil: { ... }` block (lines 115-133) with:

```javascript
  Fire_sigil: {
    id: 'fire',
    label: 'Feuer',
    renderMode: 'shader',
    color: fireColor,         // kept for reference; FireStage colors in-shader
    spawn: fireSpawn,         // kept for reference; FireStage spawns internally
    gravity: [0, 0, 0],
    cameraTarget: [0, 0.9, 0],
    blending: 'additive',
    opacity: 1,
    defaults: {
      particleCount: 900,
      riseSpeed: 1.8,
      spread: 0.5,
      flameHeight: 2.0,
      turbulence: 1.2,
      particleSize: 16,
      intensity: 1
    }
  },
```

- [ ] **Step 2: Replace the renderer branch in `DrawingCanvas.jsx` with a stage map**

In `src/components/DrawingCanvas.jsx`, the import added during the water work is:

```javascript
import WaterStage from './WaterStage.jsx';
```

Add directly below it:

```javascript
import FireStage from './FireStage.jsx';
```

Then replace the entire water-only ternary block (the `{selectedPreset.renderMode === 'shader' ? ( <WaterStage … /> ) : ( <ElementStage … /> )}` expression) with:

```javascript
                    {(() => {
                        const SHADER_STAGES = {water: WaterStage, fire: FireStage};
                        const StageComponent =
                            selectedPreset.renderMode === 'shader'
                                ? SHADER_STAGES[selectedPreset.id]
                                : ElementStage;
                        return (
                            <StageComponent
                                key={selectedPreset.id}
                                preset={selectedPreset}
                                params={elementParams}
                                igniteKey={igniteKey}
                            />
                        );
                    })()}
```

- [ ] **Step 3: Create `FireStage.jsx` (full file)**

Create `src/components/FireStage.jsx` with exactly this content:

```javascript
import {useRef, useEffect} from 'react';
import * as THREE from 'three';
import {animate} from 'animejs';
import {MAX_PARTICLES} from '../config/elementPresets.js';
import './ElementStage.css';

const rand = (min, max) => min + Math.random() * (max - min);

// Flame base plane (matches the original fireSpawn origin).
const BASE_Y = -1.0;
// Number of low pool slots reserved for the warm glow bloom.
const GLOW_COUNT = 14;

// Billboard each instanced quad, then stretch it along the particle's
// screen-space velocity (flames rise, so they elongate vertically). Sparks and
// glow (kind > 0.5) stay round. Built-in ShaderMaterial attributes/uniforms
// (position, uv, modelViewMatrix, projectionMatrix) are injected automatically.
const FLAME_VERT = `
  attribute vec3 iOffset;
  attribute vec3 iVelocity;
  attribute float iLife;
  attribute float iSize;
  attribute float iSeed;
  attribute float iKind;

  varying vec2 vUv;
  varying float vLife;
  varying float vSeed;
  varying float vKind;

  void main() {
    vUv = uv;
    vLife = iLife;
    vSeed = iSeed;
    vKind = iKind;

    vec4 mvCenter = modelViewMatrix * vec4(iOffset, 1.0);
    vec3 mvVel = (modelViewMatrix * vec4(iVelocity, 0.0)).xyz;

    vec2 vdir = mvVel.xy;
    float speed = length(vdir);
    vec2 along = speed > 0.0001 ? normalize(vdir) : vec2(0.0, 1.0);
    vec2 perp = vec2(-along.y, along.x);

    float stretch = clamp(speed * 0.5, 0.0, 2.2);
    if (iKind > 0.5) stretch = 0.0;

    float lenScale = iSize * (1.0 + stretch);
    float widScale = iSize * (1.0 - 0.30 * stretch / 2.2);

    vec2 offset = perp * (position.x * widScale) + along * (position.y * lenScale);
    mvCenter.xy += offset;
    gl_Position = projectionMatrix * mvCenter;
  }
`;

// Additive fire. Body falloff * life fade. Color ramps hot->orange->red.
// Sparks twinkle; glow is a broad soft low-brightness bloom. Output vec4(col, a)
// so AdditiveBlending (SrcAlpha, One) adds col*a to the framebuffer.
const FLAME_FRAG = `
  precision mediump float;
  uniform float uIntensity;
  uniform float uTime;

  varying vec2 vUv;
  varying float vLife;
  varying float vSeed;
  varying float vKind;

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float body = smoothstep(1.0, 0.05, r);
    float fade = 1.0 - vLife;

    vec3 hot = vec3(1.0, 0.95, 0.75);
    vec3 mid = vec3(1.0, 0.45, 0.10);
    vec3 cool = vec3(0.6, 0.08, 0.02);
    vec3 col = vLife < 0.5
      ? mix(hot, mid, vLife / 0.5)
      : mix(mid, cool, (vLife - 0.5) / 0.5);

    float bright = body * fade * 0.6;

    if (vKind > 0.5 && vKind < 1.5) {
      // sparks: hotter, twinkling
      col = mix(vec3(1.0, 0.85, 0.5), vec3(1.0, 0.5, 0.15), vLife);
      float tw = 0.6 + 0.4 * sin(uTime * 20.0 + vSeed * 30.0);
      bright = body * fade * tw;
    } else if (vKind > 1.5) {
      // glow bloom: broad, soft, dim
      col = vec3(1.0, 0.5, 0.2);
      bright = smoothstep(1.0, 0.0, r) * 0.22 * fade;
    }

    float a = bright * uIntensity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }
`;

// Map the world-unit particle size from the pixel-ish particleSize slider.
const sizeWorld = (particleSize) => particleSize * 0.011;

// Flame tongue: rises from the base in a cone, strong upward velocity.
function spawnFlame(p) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * p.spread * 0.4;
  return {
    x: Math.cos(angle) * radius,
    y: BASE_Y,
    z: Math.sin(angle) * radius,
    vx: rand(-0.5, 0.5) * p.spread,
    vy: rand(1.2, 2.0),
    vz: rand(-0.5, 0.5) * p.spread,
    age: 0,
    life: p.flameHeight * rand(0.5, 1.1),
    seed: Math.random(),
    size: sizeWorld(p.particleSize) * rand(0.8, 1.3),
    kind: 0
  };
}

// Spark/ember: tiny, fast, long-lived, drifty, twinkling.
function spawnSpark(p) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * p.spread * 0.5;
  return {
    x: Math.cos(angle) * radius,
    y: BASE_Y + rand(0.0, 0.4),
    z: Math.sin(angle) * radius,
    vx: rand(-0.3, 0.3),
    vy: rand(1.6, 2.8),
    vz: rand(-0.3, 0.3),
    age: 0,
    life: p.flameHeight * rand(1.2, 2.0),
    seed: Math.random(),
    size: sizeWorld(p.particleSize) * rand(0.18, 0.34),
    kind: 1
  };
}

// Glow bloom: large, soft, slow, near the base.
function spawnGlow(p) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * p.spread * 0.3;
  return {
    x: Math.cos(angle) * radius,
    y: BASE_Y + rand(0.1, 0.6),
    z: Math.sin(angle) * radius,
    vx: rand(-0.1, 0.1),
    vy: rand(0.1, 0.4),
    vz: rand(-0.1, 0.1),
    age: 0,
    life: p.flameHeight * rand(1.0, 1.6),
    seed: Math.random(),
    size: sizeWorld(p.particleSize) * rand(3.0, 4.5),
    kind: 2
  };
}

function spawnFor(i, p) {
  if (i < GLOW_COUNT) return spawnGlow(p);
  if (i % 7 === 0) return spawnSpark(p);
  return spawnFlame(p);
}

function FireStage({preset, params, igniteKey}) {
  const mountRef = useRef(null);
  const paramsRef = useRef(params);
  const dynRef = useRef({ignite: 0, flicker: 1});

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    dynRef.current.ignite = 0;
    animate(dynRef.current, {ignite: 1, duration: 650, ease: 'outQuad'});
  }, [igniteKey]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const width = mount.clientWidth || 360;
    const height = mount.clientHeight || 360;
    const [gx, gy, gz] = preset.gravity;
    const [tx, ty, tz] = preset.cameraTarget;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, ty, 5);
    camera.lookAt(tx, ty, tz);

    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const offsets = new Float32Array(MAX_PARTICLES * 3);
    const velocities = new Float32Array(MAX_PARTICLES * 3);
    const lifes = new Float32Array(MAX_PARTICLES);
    const sizes = new Float32Array(MAX_PARTICLES);
    const seeds = new Float32Array(MAX_PARTICLES);
    const kinds = new Float32Array(MAX_PARTICLES);
    const particles = new Array(MAX_PARTICLES);

    const respawn = (i, p, staggered) => {
      const s = spawnFor(i, p);
      if (staggered) s.age = Math.random() * s.life;
      particles[i] = s;
    };
    for (let i = 0; i < MAX_PARTICLES; i++) respawn(i, paramsRef.current, true);

    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.attributes.position);
    geometry.setAttribute('uv', base.attributes.uv);
    geometry.setAttribute('iOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('iVelocity', new THREE.InstancedBufferAttribute(velocities, 3));
    geometry.setAttribute('iLife', new THREE.InstancedBufferAttribute(lifes, 1));
    geometry.setAttribute('iSize', new THREE.InstancedBufferAttribute(sizes, 1));
    geometry.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute('iKind', new THREE.InstancedBufferAttribute(kinds, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: {uIntensity: {value: 1}, uTime: {value: 0}},
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });

    const flames = new THREE.Mesh(geometry, material);
    flames.frustumCulled = false;
    scene.add(flames);

    const clock = new THREE.Clock();
    let rafId = 0;

    const renderLoop = () => {
      rafId = requestAnimationFrame(renderLoop);
      const p = paramsRef.current;
      const dyn = dynRef.current;
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;
      const speed = p.riseSpeed;
      const count = Math.min(Math.round(p.particleCount), MAX_PARTICLES);

      material.uniforms.uIntensity.value = p.intensity * dyn.ignite * dyn.flicker;
      material.uniforms.uTime.value = time;

      for (let i = 0; i < count; i++) {
        let part = particles[i];
        part.age += dt;
        if (part.age >= part.life) {
          respawn(i, p, false);
          part = particles[i];
        }

        // Licking turbulence + slight upward buoyancy on flame tongues.
        part.vx += Math.sin(time * 3.5 + part.seed * 12) * p.turbulence * dt;
        part.vz += Math.cos(time * 2.7 + part.seed * 9) * p.turbulence * dt;
        const buoyancy = part.kind === 0 ? 1.2 : 0.0;
        part.vx += gx * dt;
        part.vy += (gy + buoyancy) * dt;
        part.vz += gz * dt;

        part.x += part.vx * speed * dt;
        part.y += part.vy * speed * dt;
        part.z += part.vz * speed * dt;

        const o = i * 3;
        offsets[o] = part.x;
        offsets[o + 1] = part.y;
        offsets[o + 2] = part.z;
        velocities[o] = part.vx * speed;
        velocities[o + 1] = part.vy * speed;
        velocities[o + 2] = part.vz * speed;
        lifes[i] = Math.min(part.age / part.life, 1);
        sizes[i] = part.size;
        seeds[i] = part.seed;
        kinds[i] = part.kind;
      }

      geometry.instanceCount = count;
      geometry.attributes.iOffset.needsUpdate = true;
      geometry.attributes.iVelocity.needsUpdate = true;
      geometry.attributes.iLife.needsUpdate = true;
      geometry.attributes.iSize.needsUpdate = true;
      geometry.attributes.iSeed.needsUpdate = true;
      geometry.attributes.iKind.needsUpdate = true;
      renderer.render(scene, camera);
    };
    renderLoop();

    const handleResize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    // Flicker loop (anime.js) drives dyn.flicker up and down — roaring fire.
    const flicker = animate(dynRef.current, {
      flicker: [0.82, 1.18],
      duration: 700,
      ease: 'inOutSine',
      loop: true,
      alternate: true
    });

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if (flicker && flicker.pause) flicker.pause();
      base.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [preset]);

  return (
    <div
      ref={mountRef}
      className={`element-stage element-stage--${preset.id}`}
      aria-label={`${preset.label}-Animation`}
    />
  );
}

export default FireStage;
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exits 0, no errors.

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`, select the Fire sigil.
Expected (lower `Intensität` if the view saturates to white):
- A mass of upward flame tongues rising from the base, stretched vertically and curling with turbulence.
- Color reads hot/light at the core, orange in the body, red at the cooling tips.
- The whole effect flickers (brightness pulses).
- Console has no shader errors.
- Water and Light are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/FireStage.jsx src/config/elementPresets.js src/components/DrawingCanvas.jsx
git commit -m "feat(fire): additive shader flame-tongue renderer with flicker"
```

---

### Task 2: Twinkling sparks/embers

Sparks already spawn (`spawnSpark`, every 7th slot) and the shader already twinkles them. This task confirms and, if needed, tunes their density/brightness. No structural change is expected; it is a verification + small-tune task.

**Files:**
- Modify (if tuning needed): `src/components/FireStage.jsx` (`spawnSpark` ranges, the `% 7` fraction, or the spark `bright` in the shader)

**Interfaces:**
- Consumes: particle state shape `{x,y,z,vx,vy,vz,age,life,seed,size,kind}`; `spawnFor` index rules.
- Produces: no new symbols.

- [ ] **Step 1: Verify sparks in browser**

Run: `npm run dev`, select Fire, lower `Intensität` so the view does not fully saturate.
Expected: small bright points rise faster and higher than the flame body, drift sideways with turbulence, and visibly twinkle (flicker individually).

- [ ] **Step 2: Tune if sparks are too sparse/dense or too dim/bright**

Only if needed. To make sparks more numerous, change the fraction in `spawnFor`:

```javascript
function spawnFor(i, p) {
  if (i < GLOW_COUNT) return spawnGlow(p);
  if (i % 5 === 0) return spawnSpark(p);
  return spawnFlame(p);
}
```

To make sparks brighter, raise the spark brightness multiplier in `FLAME_FRAG` (the sparks branch), e.g. change `float tw = 0.6 + 0.4 * sin(...)` to `float tw = 0.8 + 0.5 * sin(...)`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit (only if a tune was made)**

```bash
git add src/components/FireStage.jsx
git commit -m "feat(fire): tune spark density/brightness"
```

If no change was needed, skip the commit and note "sparks verified, no tune required".

---

### Task 3: Glow bloom at the base

Glow already spawns (`spawnGlow`, first `GLOW_COUNT` slots) and the shader renders a broad soft bloom. This task confirms and tunes it so the flame feels grounded and "roaring".

**Files:**
- Modify (if tuning needed): `src/components/FireStage.jsx` (`GLOW_COUNT`, `spawnGlow` size/position, or the glow `bright` in the shader)

**Interfaces:**
- Consumes: particle state shape; `GLOW_COUNT`.
- Produces: no new symbols.

- [ ] **Step 1: Verify the glow in browser**

Run: `npm run dev`, select Fire at default `Intensität`.
Expected: a soft warm orange bloom sits at the base of the flame and pulses with the flicker, giving the fire a grounded glow (distinct from the sharper flame tongues).

- [ ] **Step 2: Tune if the glow is too weak/strong**

Only if needed. To make the bloom larger, raise the multiplier in `spawnGlow`:

```javascript
    size: sizeWorld(p.particleSize) * rand(4.0, 5.5),
```

To make it brighter/dimmer, change `0.22` in the glow branch of `FLAME_FRAG`:

```javascript
      bright = smoothstep(1.0, 0.0, r) * 0.30 * fade;
```

To add more glow blobs, raise `GLOW_COUNT` (e.g. `20`).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit (only if a tune was made)**

```bash
git add src/components/FireStage.jsx
git commit -m "feat(fire): tune base glow bloom"
```

If no change was needed, note "glow verified, no tune required".

---

### Task 4: Tune defaults + full regression pass

Final tuning and confirmation that the whole effect reads as a magical roaring fire and that Water/Light are unaffected.

**Files:**
- Modify: `src/config/elementPresets.js` (Fire `defaults` only, if tuning needed)

**Interfaces:**
- Consumes: nothing new.
- Produces: final tuned `Fire_sigil.defaults`.

- [ ] **Step 1: Tune by eye**

Run: `npm run dev`, select Fire, and use the debug sliders (`Partikel`, `Geschwindigkeit`, `Streuung`, `Höhe`, `Turbulenz`, `Größe`, `Intensität`) to find the best look (strong roaring flame, visible sparks, grounded glow, good flicker). Note the values. If additive saturates, find the highest `Intensität` that still reads as fire rather than a white blob.

- [ ] **Step 2: Write the settled values into `Fire_sigil.defaults`**

In `src/config/elementPresets.js`, update `Fire_sigil.defaults` with the values from Step 1 (keep all seven keys; example shape):

```javascript
    defaults: {
      particleCount: 900,
      riseSpeed: 1.8,
      spread: 0.5,
      flameHeight: 2.0,
      turbulence: 1.2,
      particleSize: 16,
      intensity: 1
    }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Full verification**

Run: `npm run dev` and confirm:
1. Flame tongues stretch upward and curl (lower `Intensität` if needed to see structure).
2. Color reads hot core → orange → red.
3. Sparks rise and twinkle.
4. The base glow pulses.
5. The fire flickers; the "Erneut zünden" (replay) button re-ramps it in.
6. **Water still renders correctly; Light is unchanged** — switch to each and confirm.
7. No console errors on any element.

- [ ] **Step 5: Commit**

```bash
git add src/config/elementPresets.js
git commit -m "feat(fire): tune roaring-fire defaults"
```

---

## Self-Review

**Spec coverage:**
- Dedicated `FireStage` + `SHADER_STAGES` map, Water/Light untouched → Task 1. ✓
- Additive instanced-quad `ShaderMaterial`, billboard + velocity stretch, `DoubleSide` → Task 1. ✓
- Hot→orange→red color ramp, moderate brightness to avoid white blowout → Task 1 (`FLAME_FRAG`). ✓
- Flame tongues (kind 0) → Task 1; sparks/embers (kind 1, every 7th, twinkle) → Tasks 1+2; glow bloom (kind 2, first `GLOW_COUNT`) → Tasks 1+3. ✓
- Ignite ramp preserved + flicker loop reinstated → Task 1 (`dynRef` has `ignite` and `flicker`; flicker `animate` loop present). ✓
- Param keys reused, defaults retuned → Task 1 + Task 4. ✓
- Visual verification with additive-white workaround → every task + Task 4. ✓

**Placeholder scan:** No TBD/TODO. All code steps show complete code. Tasks 2/3 are verify-then-tune with concrete example edits and explicit "skip commit if no change" guidance; the only "by eye" step (Task 4 Step 1) is inherent to visual tuning and is followed by a concrete write-back.

**Type consistency:** Particle state shape `{x,y,z,vx,vy,vz,age,life,seed,size,kind}` is defined in Task 1 and unchanged in Tasks 2-4. Instanced attribute names (`iOffset,iVelocity,iLife,iSize,iSeed,iKind`) match between the GLSL declarations and the `setAttribute`/`needsUpdate` calls. `sizeWorld`/`rand`/`spawnFor`/`GLOW_COUNT`/`BASE_Y` are module-scope in Task 1 and reused consistently. `kind` values 0/1/2 match the fragment shader's `vKind` branches. Uniforms (`uIntensity`, `uTime`) match between `FLAME_FRAG` and the material/driver. The `SHADER_STAGES` keys (`water`, `fire`) match `preset.id` values.

# Water Animation Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Water element read as liquid — a wet fountain of velocity-stretched droplets that fade transparently, catch a highlight, splash into foam, throw mist, and sit over a rippling pool — without touching Fire or Light.

**Architecture:** A new self-contained `WaterStage.jsx` renders Water with a custom `ShaderMaterial` on an `InstancedBufferGeometry` (billboarded, velocity-stretched quads). `DrawingCanvas` picks `WaterStage` over the generic `ElementStage` via a `preset.renderMode === 'shader'` branch. The generic `Points` renderer used by Fire/Light is untouched.

**Tech Stack:** React 18, Three.js 0.184, anime.js 4, Vite 6, inline GLSL.

## Global Constraints

- Fire and Light must remain visually unchanged — do NOT edit `ElementStage.jsx` or the Fire/Light presets.
- Reuse the existing param keys (`particleCount`, `riseSpeed`, `spread`, `flameHeight`, `turbulence`, `particleSize`, `intensity`) so `ElementDebugPanel` keeps working — no new sliders.
- `MAX_PARTICLES = 2000` (from `elementPresets.js`) is the buffer ceiling.
- No new runtime dependencies; Three.js and anime.js only.
- Material setup for water droplets: `transparent: true`, `depthWrite: false`, `blending: THREE.NormalBlending`.
- Base plane Y for the fountain/pool: `-0.9` (matches the current water spawn origin), exposed as `preset.water.baseY`.

## Verification model (read before starting)

This is a purely visual feature in a project with **no test runner**. Each task is verified by:

1. **`npm run build`** — must exit 0 (catches JS/import/syntax errors).
2. **`npm run dev`**, then in the browser: draw/select the Water sigil to open its stage, and **observe the described behavior**.
3. **Browser devtools console** — must show **no `THREE.WebGLProgram` / shader compile errors** (GLSL errors surface at runtime, not at build).
4. **Regression:** Fire and Light stages still look exactly as before.

When a step says "Verify", perform all four unless it says otherwise.

## File Structure

- **Create `src/components/WaterStage.jsx`** — Water-only renderer: Three scene/camera/renderer/cleanup, instanced-quad geometry, droplet vertex+fragment GLSL, JS particle physics (jet/foam/mist), pool mesh+GLSL, anime.js ignite ramp. One responsibility: render the Water element.
- **Modify `src/config/elementPresets.js`** — Water preset only: add `renderMode: 'shader'`, a `water` config block, and retuned `defaults`.
- **Modify `src/components/DrawingCanvas.jsx`** — one-line renderer branch.
- **Untouched:** `ElementStage.jsx`, `ElementStage.css`, Fire/Light presets.

---

### Task 1: Working wet jet (wiring + instanced-quad shader + physics)

Delivers the core: selecting Water renders a continuously looping fountain of round-to-stretched droplets that fade transparently with a specular highlight. Single particle kind (jet). Foam/mist/pool come later but the shader already supports their color branches.

**Files:**
- Create: `src/components/WaterStage.jsx`
- Modify: `src/config/elementPresets.js:134-152` (Water preset)
- Modify: `src/components/DrawingCanvas.jsx:351-358` (renderer branch)

**Interfaces:**
- Consumes: `MAX_PARTICLES` from `../config/elementPresets.js`; props `{ preset, params, igniteKey }` (same as `ElementStage`).
- Produces: default-exported React component `WaterStage`; `Water` preset gains `renderMode: 'shader'` and `water: { baseY, ... }`.

- [ ] **Step 1: Add `renderMode` + `water` config + retuned defaults to the Water preset**

In `src/config/elementPresets.js`, replace the `Water: { ... }` block (lines 134-152) with:

```javascript
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
```

- [ ] **Step 2: Branch the renderer in `DrawingCanvas.jsx`**

At the top of `src/components/DrawingCanvas.jsx`, beside the existing `ElementStage` import (line 16), add:

```javascript
import WaterStage from './WaterStage.jsx';
```

Replace the `<ElementStage … />` element (lines 353-358) with:

```javascript
                    {selectedPreset.renderMode === 'shader' ? (
                        <WaterStage
                            key={selectedPreset.id}
                            preset={selectedPreset}
                            params={elementParams}
                            igniteKey={igniteKey}
                        />
                    ) : (
                        <ElementStage
                            key={selectedPreset.id}
                            preset={selectedPreset}
                            params={elementParams}
                            igniteKey={igniteKey}
                        />
                    )}
```

- [ ] **Step 3: Create `WaterStage.jsx` (full file)**

Create `src/components/WaterStage.jsx` with exactly this content:

```javascript
import {useRef, useEffect} from 'react';
import * as THREE from 'three';
import {animate} from 'animejs';
import {MAX_PARTICLES} from '../config/elementPresets.js';
import './ElementStage.css';

const rand = (min, max) => min + Math.random() * (max - min);

// Billboard each instanced quad, then stretch it along the particle's
// screen-space velocity (round when slow, streak when fast). Foam/mist (kind>0)
// stay round. Built-in ShaderMaterial uniforms/attributes (position, uv,
// modelViewMatrix, projectionMatrix) are injected automatically.
const DROPLET_VERT = `
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

    float stretch = clamp(speed * 0.35, 0.0, 1.6);
    if (iKind > 0.5) stretch = 0.0;

    float lenScale = iSize * (1.0 + stretch);
    float widScale = iSize * (1.0 - 0.25 * stretch / 1.6);

    vec2 offset = perp * (position.x * widScale) + along * (position.y * lenScale);
    mvCenter.xy += offset;
    gl_Position = projectionMatrix * mvCenter;
  }
`;

// Soft round body + offset specular highlight. Alpha fades with life (thins
// out, never blackens). Color depends on kind: 0 jet, 1 foam, 2 mist.
const DROPLET_FRAG = `
  precision mediump float;
  uniform float uIntensity;

  varying vec2 vUv;
  varying float vLife;
  varying float vSeed;
  varying float vKind;

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float body = smoothstep(1.0, 0.2, r);

    float lifeAlpha = 1.0 - vLife;
    lifeAlpha *= lifeAlpha;

    vec3 jetCol = mix(vec3(0.55, 0.80, 1.00), vec3(0.15, 0.45, 0.85), vLife);
    vec3 foamCol = vec3(0.90, 0.96, 1.00);
    vec3 mistCol = vec3(0.70, 0.85, 1.00);

    vec3 col = jetCol;
    if (vKind > 1.5) col = mistCol;
    else if (vKind > 0.5) col = foamCol;

    float hi = smoothstep(0.30, 0.0, length(vUv - vec2(0.38, 0.32)));
    col += hi * 0.6 * body;

    float alpha = body * lifeAlpha * uIntensity;
    if (vKind > 1.5) alpha *= 0.5;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

// Map the world-unit particle size from the pixel-ish particleSize slider.
const sizeWorld = (particleSize) => particleSize * 0.011;

// Spawn a jet droplet at the nozzle: outward + strong upward velocity.
function spawnJet(p, baseY) {
  const angle = Math.random() * Math.PI * 2;
  const out = Math.random() * 0.5 * p.spread;
  return {
    x: Math.cos(angle) * out * 0.3,
    y: baseY,
    z: Math.sin(angle) * out * 0.3,
    vx: Math.cos(angle) * out,
    vy: rand(1.8, 2.6),
    vz: Math.sin(angle) * out,
    age: 0,
    life: p.flameHeight * rand(0.85, 1.15),
    seed: Math.random(),
    size: sizeWorld(p.particleSize) * rand(0.7, 1.2),
    kind: 0
  };
}

function WaterStage({preset, params, igniteKey}) {
  const mountRef = useRef(null);
  const paramsRef = useRef(params);
  const dynRef = useRef({ignite: 0});

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
    const baseY = preset.water?.baseY ?? -0.9;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, ty, 5);
    camera.lookAt(tx, ty, tz);

    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Per-instance buffers + JS particle state.
    const offsets = new Float32Array(MAX_PARTICLES * 3);
    const velocities = new Float32Array(MAX_PARTICLES * 3);
    const lifes = new Float32Array(MAX_PARTICLES);
    const sizes = new Float32Array(MAX_PARTICLES);
    const seeds = new Float32Array(MAX_PARTICLES);
    const kinds = new Float32Array(MAX_PARTICLES);
    const particles = new Array(MAX_PARTICLES);

    const respawn = (i, p, staggered) => {
      const s = spawnJet(p, baseY);
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
      vertexShader: DROPLET_VERT,
      fragmentShader: DROPLET_FRAG,
      uniforms: {uIntensity: {value: 1}},
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending
    });

    const points = new THREE.Mesh(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

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

      material.uniforms.uIntensity.value = p.intensity * dyn.ignite;

      for (let i = 0; i < count; i++) {
        let part = particles[i];
        part.age += dt;
        if (part.age >= part.life) {
          respawn(i, p, false);
          part = particles[i];
        }

        part.vx += Math.sin(time * 3 + part.seed * 10) * p.turbulence * dt;
        part.vz += Math.cos(time * 2.3 + part.seed * 7) * p.turbulence * dt;
        part.vx += gx * dt;
        part.vy += gy * dt;
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

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
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

export default WaterStage;
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exits 0, no errors.

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`, open the app, cast/select the Water sigil.
Expected:
- A continuous fountain of blue droplets jets up from the base and arcs down, looping forever.
- Fast droplets visibly **stretch** into short streaks; slow ones near the apex are round.
- Droplets **fade out transparently** (thin away), they do NOT turn black.
- Each droplet shows a small bright **highlight** offset toward its top-left.
- Console has **no shader/THREE errors**.
- Fire and Light stages are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/WaterStage.jsx src/config/elementPresets.js src/components/DrawingCanvas.jsx
git commit -m "feat(water): shader-based wet fountain renderer (jet droplets)"
```

---

### Task 2: Splash foam at the base

A jet droplet returning to the base plane shatters in place into a short whitish foam arc, creating a foam ring where the jet lands.

**Files:**
- Modify: `src/components/WaterStage.jsx` (render-loop collision block)

**Interfaces:**
- Consumes: particle state objects from Task 1 (`{x,y,z,vx,vy,vz,age,life,seed,size,kind}`), `baseY`.
- Produces: foam particles set `kind = 1` (the fragment shader's foam branch already exists).

- [ ] **Step 1: Add the collision-shatter block**

In `src/components/WaterStage.jsx`, inside the render loop, locate the integration lines that end with:

```javascript
        part.x += part.vx * speed * dt;
        part.y += part.vy * speed * dt;
        part.z += part.vz * speed * dt;
```

Immediately AFTER those three lines, insert:

```javascript
        // Jet droplet hits the base -> shatter in place into short foam.
        if (part.kind === 0 && part.y <= baseY && part.vy < 0) {
          const a = Math.random() * Math.PI * 2;
          const sp = rand(0.2, 0.6);
          part.kind = 1;
          part.y = baseY;
          part.vx = Math.cos(a) * sp;
          part.vz = Math.sin(a) * sp;
          part.vy = rand(0.6, 1.1);
          part.age = 0;
          part.life = rand(0.25, 0.5);
          part.size = sizeWorld(p.particleSize) * rand(0.5, 0.9);
        }
```

(`rand` and `sizeWorld` are already defined at module scope from Task 1.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, cast Water.
Expected: a ring of small, near-white **foam** flecks bursts outward and up where droplets land at the base, then fades. Jet still behaves as in Task 1. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/WaterStage.jsx
git commit -m "feat(water): splash foam where the jet lands"
```

---

### Task 3: Drifting mist at the crown

A fixed fraction of particles spawn as fine, slow, long-lived, low-alpha mist that drifts near the top of the fountain.

**Files:**
- Modify: `src/components/WaterStage.jsx` (add `spawnMist`, per-kind gravity, respawn fraction)

**Interfaces:**
- Consumes: same particle state shape; `gy` from `preset.gravity`.
- Produces: mist particles set `kind = 2` with a reduced gravity factor.

- [ ] **Step 1: Add `spawnMist` at module scope**

In `src/components/WaterStage.jsx`, directly below the `spawnJet` function, add:

```javascript
// Spawn fine mist near the fountain crown: small, slow, long-lived, drifty.
function spawnMist(p, baseY) {
  const angle = Math.random() * Math.PI * 2;
  const out = Math.random() * 0.4 * p.spread;
  return {
    x: Math.cos(angle) * out,
    y: baseY + rand(0.8, 1.6),
    z: Math.sin(angle) * out,
    vx: rand(-0.15, 0.15),
    vy: rand(0.05, 0.25),
    vz: rand(-0.15, 0.15),
    age: 0,
    life: p.flameHeight * rand(1.6, 2.4),
    seed: Math.random(),
    size: sizeWorld(p.particleSize) * rand(0.35, 0.6),
    kind: 2
  };
}
```

- [ ] **Step 2: Make `respawn` produce mist for every 6th slot**

In the `useEffect`, replace the `respawn` function from Task 1:

```javascript
    const respawn = (i, p, staggered) => {
      const s = spawnJet(p, baseY);
      if (staggered) s.age = Math.random() * s.life;
      particles[i] = s;
    };
```

with:

```javascript
    const respawn = (i, p, staggered) => {
      const s = i % 6 === 0 ? spawnMist(p, baseY) : spawnJet(p, baseY);
      if (staggered) s.age = Math.random() * s.life;
      particles[i] = s;
    };
```

- [ ] **Step 3: Reduce gravity for mist in the integration**

In the render loop, replace the gravity-application lines:

```javascript
        part.vx += gx * dt;
        part.vy += gy * dt;
        part.vz += gz * dt;
```

with:

```javascript
        const gFactor = part.kind === 2 ? 0.15 : 1.0;
        part.vx += gx * dt;
        part.vy += gy * gFactor * dt;
        part.vz += gz * dt;
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`, cast Water.
Expected: a faint haze of tiny, slow **mist** specks drifts around/above the fountain crown without falling like the jet. Jet + foam still behave as before. No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/WaterStage.jsx
git commit -m "feat(water): drifting mist at the fountain crown"
```

---

### Task 4: Rippling pool surface

A translucent disc at the base with an animated concentric-ripple shader grounds the fountain.

**Files:**
- Modify: `src/components/WaterStage.jsx` (add pool GLSL + mesh + per-frame `uTime`, dispose)

**Interfaces:**
- Consumes: `baseY`, `preset.water.poolRadius`, `clock.elapsedTime`, `dyn.ignite`, `p.intensity`.
- Produces: a `THREE.Mesh` added to the same scene, rendered each frame; disposed on cleanup.

- [ ] **Step 1: Add pool shaders at module scope**

In `src/components/WaterStage.jsx`, below `DROPLET_FRAG`, add:

```javascript
const POOL_VERT = `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const POOL_FRAG = `
  precision mediump float;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uRadius;
  varying vec2 vPos;
  void main() {
    float radius = length(vPos);
    float ripple = sin(radius * 9.0 - uTime * 2.2) * 0.5 + 0.5;
    float ripple2 = sin(radius * 18.0 - uTime * 3.1) * 0.5 + 0.5;
    float sheen = 0.35 * ripple + 0.15 * ripple2;
    vec3 col = mix(vec3(0.06, 0.20, 0.38), vec3(0.20, 0.55, 0.85), sheen);
    float edge = smoothstep(uRadius, uRadius * 0.6, radius);
    float alpha = edge * (0.45 + 0.25 * sheen) * uIntensity;
    gl_FragColor = vec4(col, alpha);
  }
`;
```

- [ ] **Step 2: Create the pool mesh after the droplet mesh is added**

In the `useEffect`, directly after `scene.add(points);` (from Task 1), add:

```javascript
    const poolRadius = preset.water?.poolRadius ?? 2.0;
    const poolGeo = new THREE.CircleGeometry(poolRadius, 64);
    const poolMat = new THREE.ShaderMaterial({
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      uniforms: {
        uTime: {value: 0},
        uIntensity: {value: 1},
        uRadius: {value: poolRadius}
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = baseY;
    scene.add(pool);
```

- [ ] **Step 3: Drive the pool uniforms each frame**

In the render loop, right after the existing line `material.uniforms.uIntensity.value = p.intensity * dyn.ignite;`, add:

```javascript
      poolMat.uniforms.uTime.value = time;
      poolMat.uniforms.uIntensity.value = p.intensity * dyn.ignite;
```

- [ ] **Step 4: Dispose the pool in cleanup**

In the cleanup return, after `material.dispose();`, add:

```javascript
      poolGeo.dispose();
      poolMat.dispose();
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Verify in browser**

Run: `npm run dev`, cast Water.
Expected: a translucent blue **disc with animated concentric ripples** sits flat at the base beneath the fountain, fading out at its rim. Jet/foam/mist still behave as before. No console errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/WaterStage.jsx
git commit -m "feat(water): rippling pool surface beneath the fountain"
```

---

### Task 5: Tune defaults + full regression pass

Final visual tuning and confirmation that the whole effect reads as water and that Fire/Light are untouched.

**Files:**
- Modify: `src/config/elementPresets.js:134-152` (Water `defaults` only, if tuning needed)

**Interfaces:**
- Consumes: nothing new.
- Produces: final tuned `Water.defaults`.

- [ ] **Step 1: Tune by eye**

Run: `npm run dev`, cast Water, and use the on-stage debug panel sliders (`Partikel`, `Geschwindigkeit`, `Streuung`, `Höhe`, `Turbulenz`, `Größe`, `Intensität`) to find values where the effect reads best (denser jet, clear streaks, visible foam ring + mist + pool). Note the values you settle on.

- [ ] **Step 2: Write the settled values into `Water.defaults`**

In `src/config/elementPresets.js`, update the `Water.defaults` object with the values found in Step 1 (keep all seven keys; example shape):

```javascript
    defaults: {
      particleCount: 1200,
      riseSpeed: 1.2,
      spread: 0.6,
      flameHeight: 1.6,
      turbulence: 0.12,
      particleSize: 9,
      intensity: 1
    }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Full verification checklist (from the spec)**

Run: `npm run dev` and confirm ALL of:
1. Fast droplets visibly **stretch**; slow ones stay round.
2. Droplets **fade transparently**, not to black.
3. A **foam ring** appears where the jet lands.
4. **Mist** drifts at the crown.
5. The **pool ripples** beneath the fountain.
6. The "Replay" button re-ramps the effect in (ignite still works).
7. **Fire and Light are visually unchanged** — switch to each and confirm.
8. No console errors on any element.

- [ ] **Step 5: Commit**

```bash
git add src/config/elementPresets.js
git commit -m "feat(water): tune fountain defaults for the wet look"
```

---

## Self-Review

**Spec coverage:**
- Dedicated `WaterStage` + `renderMode` branch, Fire/Light untouched → Task 1. ✓
- Instanced-quad `ShaderMaterial`, billboard + velocity stretch, per-particle alpha/size/seed → Task 1. ✓
- Specular highlight, alpha fade (not black), water color gradient → Task 1 (fragment shader). ✓
- Jet droplets → Task 1; splash foam (shatter at base) → Task 2; mist (index fraction, reduced gravity) → Task 3. ✓
- Pool surface (CircleGeometry + ripple shader) → Task 4. ✓
- `dyn.ignite` preserved, flicker dropped → Task 1 (`dynRef` has only `ignite`, no flicker loop). ✓
- Param keys reused, defaults retuned → Task 1 + Task 5. ✓
- Visual verification via dev server → every task. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the only "by eye" step (Task 5 Step 1) is inherent to visual tuning and is followed by a concrete write-back step.

**Type consistency:** Particle state shape `{x,y,z,vx,vy,vz,age,life,seed,size,kind}` is defined in Task 1 and used unchanged in Tasks 2-3. Instanced attribute names (`iOffset,iVelocity,iLife,iSize,iSeed,iKind`) match between the GLSL declarations and the `setAttribute`/`needsUpdate` calls. `sizeWorld`/`rand` are module-scope in Task 1 and reused in Tasks 2-3. `kind` values 0/1/2 match the fragment shader's `vKind` branches. Pool uniforms (`uTime,uIntensity,uRadius`) match between `POOL_FRAG` and the `poolMat` uniforms/driver.

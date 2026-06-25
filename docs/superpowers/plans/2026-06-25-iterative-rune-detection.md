# Iterative Rune Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `itterativeAnalysis` stub with a real, local rune detector that scans the drawing canvas and returns a list of all detected runes, each with size, position, rotation, and match score.

**Architecture:** A TensorFlow.js scan loops over `rune × size × rotation`. Each iteration runs the drawing's binary ink mask through `conv2d` against a template mask (and an all-ones footprint filter) to score every position at once. Local maxima above a threshold become candidates; a pure non-max-suppression pass merges duplicates across sizes/rotations into final findings. The result extends the existing `{match, confidence, message}` schema with a `findings` array so the Gemini spell and the display keep working.

**Tech Stack:** React 18 (JSX, no TS), Vite, `@tensorflow/tfjs` (WebGL backend, WebGPU if available), Vitest for unit tests on pure logic.

## Global Constraints

- No TypeScript — plain JS/JSX only.
- UI text is in German.
- Drawing canvas is `CANVAS_WIDTH × CANVAS_HEIGHT` = `500 × 500` (from `config.js`); the canvas backing store is DPR-scaled, so always re-rasterize to 500×500 before reading pixels.
- Ink is dark-on-white (drawing and rune PNGs alike).
- `recognizeRune` (Gemini spell) must remain unchanged and keep working.
- TensorFlow.js tensors are not GC'd — every scan iteration must run inside `tf.tidy()` and any retained tensor must be `.dispose()`d.
- Detection parameters live in `config.js`: `ITERATIVE_SIZES = [8,16,24,32,48,64,96,128]`, `ITERATIVE_ROTATIONS` = every 5° (72 angles), `MATCH_THRESHOLD = 0.6`, `PENALTY_WEIGHT = 1.0`, `NMS_RELATIVE = 0.5`.
- Result schema: `{ match, confidence, message, findings: [{ id, name, imagePath, size, x, y, rotation, score }] }`; `findings` sorted by `score` descending.

---

### Task 1: Create work branch, add dependencies, set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `src/utils/__tests__/smoke.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable `npm test` command for later tasks.

- [ ] **Step 1: Create the work branch**

```bash
git checkout -b iterative-rune-detection
```

Expected: `Switched to a new branch 'iterative-rune-detection'`

- [ ] **Step 2: Install dependencies**

```bash
npm install @tensorflow/tfjs
npm install -D vitest
```

- [ ] **Step 3: Add the test script to package.json**

In `package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
```

- [ ] **Step 5: Write a smoke test**

`src/utils/__tests__/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';

describe('test runner', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the smoke test**

Run: `npm test`
Expected: PASS (1 test passed).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/utils/__tests__/smoke.test.js
git commit -m "chore: add tfjs, set up vitest, create work branch"
```

---

### Task 2: Add detection constants to config.js

**Files:**
- Modify: `src/config.js`
- Test: `src/utils/__tests__/config.test.js`

**Interfaces:**
- Produces: `ITERATIVE_SIZES: number[]`, `ITERATIVE_ROTATIONS: number[]`, `MATCH_THRESHOLD: number`, `PENALTY_WEIGHT: number`, `NMS_RELATIVE: number` exported from `src/config.js`.

- [ ] **Step 1: Write the failing test**

`src/utils/__tests__/config.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  ITERATIVE_SIZES,
  ITERATIVE_ROTATIONS,
  MATCH_THRESHOLD,
  PENALTY_WEIGHT,
  NMS_RELATIVE,
} from '../../config.js';

describe('iterative detection constants', () => {
  it('defines the expected sizes', () => {
    expect(ITERATIVE_SIZES).toEqual([8, 16, 24, 32, 48, 64, 96, 128]);
  });

  it('defines 72 rotations stepping by 5 degrees from 0 to 355', () => {
    expect(ITERATIVE_ROTATIONS).toHaveLength(72);
    expect(ITERATIVE_ROTATIONS[0]).toBe(0);
    expect(ITERATIVE_ROTATIONS[1]).toBe(5);
    expect(ITERATIVE_ROTATIONS[71]).toBe(355);
  });

  it('defines scoring constants', () => {
    expect(MATCH_THRESHOLD).toBe(0.6);
    expect(PENALTY_WEIGHT).toBe(1.0);
    expect(NMS_RELATIVE).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- config`
Expected: FAIL (constants not exported).

- [ ] **Step 3: Add the constants**

Append to `src/config.js`:

```js
export const ITERATIVE_SIZES = [8, 16, 24, 32, 48, 64, 96, 128]
export const ITERATIVE_ROTATIONS = Array.from({ length: 72 }, (_, i) => i * 5)
export const MATCH_THRESHOLD = 0.6
export const PENALTY_WEIGHT = 1.0
export const NMS_RELATIVE = 0.5
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/utils/__tests__/config.test.js
git commit -m "feat: add iterative detection constants"
```

---

### Task 3: Binary ink mask helper

**Files:**
- Create: `src/utils/maskUtils.js`
- Test: `src/utils/__tests__/maskUtils.test.js`

**Interfaces:**
- Produces: `imageDataToMask({ data, width, height }, threshold = 128) -> { data: Float32Array, width, height }` where `data[i] = 1` for ink (dark, opaque) pixels and `0` otherwise. `data` is row-major, length `width * height`.
- Produces: `sumMask(mask) -> number` returning the count of ink pixels.

- [ ] **Step 1: Write the failing test**

`src/utils/__tests__/maskUtils.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { imageDataToMask, sumMask } from '../maskUtils.js';

// helper: build an RGBA buffer from a 2D array of 0 (white) / 1 (black)
function rgba(pixels) {
  const height = pixels.length;
  const width = pixels[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = pixels[y][x] ? 0 : 255; // 1 -> black, 0 -> white
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('imageDataToMask', () => {
  it('marks dark opaque pixels as ink', () => {
    const mask = imageDataToMask(rgba([[1, 0], [0, 1]]));
    expect(Array.from(mask.data)).toEqual([1, 0, 0, 1]);
    expect(mask.width).toBe(2);
    expect(mask.height).toBe(2);
  });

  it('treats fully transparent pixels as non-ink', () => {
    const img = rgba([[1]]);
    img.data[3] = 0; // alpha 0
    const mask = imageDataToMask(img);
    expect(mask.data[0]).toBe(0);
  });
});

describe('sumMask', () => {
  it('counts ink pixels', () => {
    const mask = imageDataToMask(rgba([[1, 1], [0, 1]]));
    expect(sumMask(mask)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- maskUtils`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement maskUtils.js**

`src/utils/maskUtils.js`:

```js
// Convert an ImageData-like object to a binary ink mask.
// Ink = dark and opaque. Returns a Float32Array (1 = ink, 0 = background).
export function imageDataToMask({ data, width, height }, threshold = 128) {
  const mask = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const opaque = data[i + 3] > 0;
    mask[p] = opaque && luminance < threshold ? 1 : 0;
  }
  return { data: mask, width, height };
}

export function sumMask(mask) {
  let total = 0;
  for (let i = 0; i < mask.data.length; i++) total += mask.data[i];
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- maskUtils`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/maskUtils.js src/utils/__tests__/maskUtils.test.js
git commit -m "feat: add binary ink mask helper"
```

---

### Task 4: Finding deduplication (non-max suppression)

**Files:**
- Create: `src/utils/findingDedup.js`
- Test: `src/utils/__tests__/findingDedup.test.js`

**Interfaces:**
- Consumes: candidate objects `{ id, name, imagePath, size, x, y, rotation, score }` (x/y are centers in canvas px).
- Produces: `dedupeFindings(candidates, nmsRelative) -> findings[]` — sorted by `score` descending; greedily keeps the highest-scoring candidate and suppresses any later candidate whose center is within `nmsRelative * keptSize` (Euclidean distance) of an already-kept finding.

- [ ] **Step 1: Write the failing test**

`src/utils/__tests__/findingDedup.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { dedupeFindings } from '../findingDedup.js';

const make = (over) => ({
  id: 1, name: 'Bolt', imagePath: '/x.png',
  size: 64, x: 100, y: 100, rotation: 0, score: 0.7, ...over,
});

describe('dedupeFindings', () => {
  it('returns findings sorted by score descending', () => {
    const out = dedupeFindings(
      [make({ x: 0, y: 0, score: 0.65 }), make({ x: 300, y: 300, score: 0.9 })],
      0.5,
    );
    expect(out.map((f) => f.score)).toEqual([0.9, 0.65]);
  });

  it('suppresses a lower-scoring finding within nmsRelative * size', () => {
    // size 64, nmsRelative 0.5 -> suppression radius 32 px
    const out = dedupeFindings(
      [make({ x: 100, y: 100, score: 0.9 }), make({ x: 120, y: 100, score: 0.7 })],
      0.5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(0.9);
  });

  it('keeps two findings that are farther apart than the radius', () => {
    const out = dedupeFindings(
      [make({ x: 100, y: 100, score: 0.9 }), make({ x: 200, y: 100, score: 0.7 })],
      0.5,
    );
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- findingDedup`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement findingDedup.js**

`src/utils/findingDedup.js`:

```js
// Greedy non-max suppression over detection candidates.
// Keeps the highest-scoring candidate, then drops any remaining candidate
// whose center is within nmsRelative * keptSize of one already kept.
export function dedupeFindings(candidates, nmsRelative) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const kept = [];

  for (const candidate of sorted) {
    const tooClose = kept.some((k) => {
      const dx = k.x - candidate.x;
      const dy = k.y - candidate.y;
      const radius = nmsRelative * k.size;
      return dx * dx + dy * dy < radius * radius;
    });
    if (!tooClose) kept.push(candidate);
  }

  return kept;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- findingDedup`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/findingDedup.js src/utils/__tests__/findingDedup.test.js
git commit -m "feat: add finding deduplication"
```

---

### Task 5: Score map computation (coverage + penalty)

**Files:**
- Create: `src/utils/scoreMap.js`
- Test: `src/utils/__tests__/scoreMap.test.js`

**Interfaces:**
- Consumes: `imageDataToMask`/`sumMask` shapes — masks are `{ data: Float32Array, width, height }`.
- Produces: `computeScoreMap(drawingMask, templateMask, penaltyWeight) -> { scores: Float32Array, width, height }` where output dimensions are `drawing - template + 1` (valid convolution), and `scores[r*width + c]` is the score for placing the template's top-left at drawing pixel `(c, r)`. Score = `coverage/inkCount − penaltyWeight · penalty/(footprintArea − inkCount)`, with `penalty = inkUnderFootprint − coverage`. If `inkCount` is 0 the score is 0; if `footprintArea === inkCount` the penalty term is 0.
- Produces: `getBackendReady() -> Promise<void>` — sets and awaits the TF.js backend (WebGL in the browser; tests force CPU).

- [ ] **Step 1: Write the failing test**

`src/utils/__tests__/scoreMap.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { computeScoreMap } from '../scoreMap.js';

beforeAll(async () => {
  await tf.setBackend('cpu');
  await tf.ready();
});

const mask = (rows) => ({
  data: Float32Array.from(rows.flat()),
  width: rows[0].length,
  height: rows.length,
});

describe('computeScoreMap', () => {
  it('scores a perfect overlap as 1 with no penalty', () => {
    // 2x2 drawing identical to 2x2 template, one valid position
    const drawing = mask([[1, 1], [1, 1]]);
    const template = mask([[1, 1], [1, 1]]);
    const out = computeScoreMap(drawing, template, 1.0);
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(out.scores[0]).toBeCloseTo(1.0, 5);
  });

  it('applies the penalty for drawing ink off the template', () => {
    // template ink is the top row only; footprint is the full 2x2 box.
    // drawing fills the whole 2x2 -> coverage 2/2 = 1, penalty 2 px over
    // (footprintArea 4 - inkCount 2) = 2 -> penaltyRatio 1 -> score 1 - 1 = 0
    const drawing = mask([[1, 1], [1, 1]]);
    const template = mask([[1, 1], [0, 0]]);
    const out = computeScoreMap(drawing, template, 1.0);
    expect(out.scores[0]).toBeCloseTo(0.0, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scoreMap`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement scoreMap.js**

`src/utils/scoreMap.js`:

```js
import * as tf from '@tensorflow/tfjs';

let backendReady = null;

// Set the fastest available backend once. WebGL is the browser default;
// callers in tests may set 'cpu' before importing this.
export function getBackendReady() {
  if (!backendReady) {
    backendReady = (async () => {
      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
    })();
  }
  return backendReady;
}

// Cross-correlation of the drawing with the template (tf.conv2d does not
// flip the kernel, so it already computes correlation). Returns a plain
// score map; all tensors are released before returning.
export function computeScoreMap(drawingMask, templateMask, penaltyWeight) {
  const { width: dw, height: dh } = drawingMask;
  const { width: tw, height: th } = templateMask;

  return tf.tidy(() => {
    const drawing = tf.tensor4d(drawingMask.data, [1, dh, dw, 1]);
    const template = tf.tensor4d(templateMask.data, [th, tw, 1, 1]);
    const ones = tf.ones([th, tw, 1, 1]);

    let inkCount = 0;
    for (let i = 0; i < templateMask.data.length; i++) inkCount += templateMask.data[i];
    const footprintArea = tw * th;

    const coverage = tf.conv2d(drawing, template, 1, 'valid');
    const inkUnderFootprint = tf.conv2d(drawing, ones, 1, 'valid');
    const penalty = inkUnderFootprint.sub(coverage);

    const coverageRatio = inkCount > 0 ? coverage.div(inkCount) : coverage.mul(0);
    const denom = footprintArea - inkCount;
    const penaltyRatio = denom > 0 ? penalty.div(denom) : penalty.mul(0);
    const score = coverageRatio.sub(penaltyRatio.mul(penaltyWeight));

    const [, outH, outW] = score.shape;
    const scores = score.dataSync();
    return { scores: Float32Array.from(scores), width: outW, height: outH };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- scoreMap`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/utils/scoreMap.js src/utils/__tests__/scoreMap.test.js
git commit -m "feat: add coverage+penalty score map"
```

---

### Task 6: Template mask generation (sizes × rotations)

**Files:**
- Create: `src/utils/templateMasks.js`

**Interfaces:**
- Consumes: `RUNE_NAMES`, `RUNES_PATH`, `ITERATIVE_SIZES`, `ITERATIVE_ROTATIONS` from `config.js`; `imageDataToMask` from `maskUtils.js`.
- Produces: `loadTemplateMasks() -> Promise<TemplateVariant[]>` where each variant is `{ id, name, imagePath, size, rotation, mask }` and `mask` is `{ data: Float32Array, width, height }`. Results are cached after the first call. `name` is the human-readable name (`RUNE_NAMES[i]` with underscores replaced by spaces); `id` is `index + 1`; `imagePath` is `${RUNES_PATH}/${RUNE_NAMES[i]}.png`.
- Produces: `rasterizeRotatedScaled(image, size, rotationDeg) -> { data, width, height }` — draws `image` scaled to `size × size` and rotated by `rotationDeg` onto an offscreen canvas sized to the rotated bounding box, on a white background, and returns its ImageData. (Exported for reuse; uses the DOM, so it is verified in-app rather than unit-tested.)

- [ ] **Step 1: Implement templateMasks.js**

`src/utils/templateMasks.js`:

```js
import {
  RUNE_NAMES,
  RUNES_PATH,
  ITERATIVE_SIZES,
  ITERATIVE_ROTATIONS,
} from '../config.js';
import { imageDataToMask } from './maskUtils.js';

let cache = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draw the image scaled to size×size, rotated by rotationDeg, onto a white
// canvas big enough to hold the rotated square. Returns its ImageData.
export function rasterizeRotatedScaled(image, size, rotationDeg) {
  const radians = (rotationDeg * Math.PI) / 180;
  const diag = Math.ceil(size * Math.SQRT2);
  const canvas = document.createElement('canvas');
  canvas.width = diag;
  canvas.height = diag;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, diag, diag);
  ctx.translate(diag / 2, diag / 2);
  ctx.rotate(radians);
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  return ctx.getImageData(0, 0, diag, diag);
}

export async function loadTemplateMasks() {
  if (cache) return cache;

  const variants = [];
  for (let index = 0; index < RUNE_NAMES.length; index++) {
    const fileName = RUNE_NAMES[index];
    const imagePath = `${RUNES_PATH}/${fileName}.png`;
    const image = await loadImage(imagePath);

    for (const size of ITERATIVE_SIZES) {
      for (const rotation of ITERATIVE_ROTATIONS) {
        const imageData = rasterizeRotatedScaled(image, size, rotation);
        variants.push({
          id: index + 1,
          name: fileName.replace(/_/g, ' '),
          imagePath,
          size,
          rotation,
          mask: imageDataToMask(imageData),
        });
      }
    }
  }

  cache = variants;
  return cache;
}
```

- [ ] **Step 2: Sanity-check the module imports**

Run: `node --input-type=module -e "import('./src/utils/maskUtils.js').then(()=>console.log('ok'))"`
Expected: prints `ok` (confirms `maskUtils` import path used by `templateMasks` resolves; `templateMasks` itself needs the DOM and is exercised in Task 9).

- [ ] **Step 3: Commit**

```bash
git add src/utils/templateMasks.js
git commit -m "feat: add template mask generation"
```

---

### Task 7: Scan orchestration

**Files:**
- Create: `src/utils/iterativeRecognition.js`

**Interfaces:**
- Consumes: `loadTemplateMasks` (Task 6), `computeScoreMap` + `getBackendReady` (Task 5), `dedupeFindings` (Task 4), `imageDataToMask` (Task 3), `MATCH_THRESHOLD`/`PENALTY_WEIGHT`/`NMS_RELATIVE`/`CANVAS_WIDTH`/`CANVAS_HEIGHT` from `config.js`.
- Produces: `detectRunes(canvas) -> Promise<{ match, confidence, message, findings }>`.
  - `findings`: array of `{ id, name, imagePath, size, x, y, rotation, score }` sorted by score desc, where `x`/`y` are finding centers in 500×500 canvas coordinates and `score` is 0–100.
  - `match`: the top finding's rune fields `{ id, name, imagePath }` or `null` when none.
  - `confidence`: top finding's `score` (0–100) or `0`.
  - `message`: `"N Runen gefunden"` (N = findings.length), or `"Keine Runen gefunden"` when empty.
- Produces: `canvasToMask(canvas) -> { data, width, height }` — re-rasterizes the (DPR-scaled) canvas to `CANVAS_WIDTH × CANVAS_HEIGHT` on white and returns its ink mask.

- [ ] **Step 1: Implement iterativeRecognition.js**

`src/utils/iterativeRecognition.js`:

```js
import * as tf from '@tensorflow/tfjs';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MATCH_THRESHOLD,
  PENALTY_WEIGHT,
  NMS_RELATIVE,
} from '../config.js';
import { imageDataToMask } from './maskUtils.js';
import { loadTemplateMasks } from './templateMasks.js';
import { computeScoreMap, getBackendReady } from './scoreMap.js';
import { dedupeFindings } from './findingDedup.js';

// Re-rasterize the canvas (its backing store is DPR-scaled) to logical
// 500x500 on a white background, then threshold to an ink mask.
export function canvasToMask(canvas) {
  const off = document.createElement('canvas');
  off.width = CANVAS_WIDTH;
  off.height = CANVAS_HEIGHT;
  const ctx = off.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.drawImage(canvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  return imageDataToMask(imageData);
}

export async function detectRunes(canvas) {
  await getBackendReady();
  const drawingMask = canvasToMask(canvas);
  const templates = await loadTemplateMasks();

  const candidates = [];
  let lastRuneId = null;

  for (const variant of templates) {
    const { scores, width, height } = computeScoreMap(
      drawingMask,
      variant.mask,
      PENALTY_WEIGHT,
    );

    // Keep the single best position for this rune/size/rotation; cross-scale
    // and cross-position duplicates are merged later by dedupeFindings.
    let bestScore = -Infinity;
    let bestIndex = -1;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestIndex = i;
      }
    }

    if (bestScore >= MATCH_THRESHOLD && bestIndex >= 0) {
      const col = bestIndex % width;
      const row = Math.floor(bestIndex / width);
      candidates.push({
        id: variant.id,
        name: variant.name,
        imagePath: variant.imagePath,
        size: variant.size,
        rotation: variant.rotation,
        x: col + variant.mask.width / 2,
        y: row + variant.mask.height / 2,
        score: bestScore,
      });
    }

    // Yield to the UI between runes so the "Wirke Zauber…" indicator updates.
    if (variant.id !== lastRuneId) {
      lastRuneId = variant.id;
      await tf.nextFrame();
    }
  }

  const findings = dedupeFindings(candidates, NMS_RELATIVE).map((f) => ({
    ...f,
    score: Math.round(f.score * 100),
  }));

  if (findings.length === 0) {
    return { match: null, confidence: 0, message: 'Keine Runen gefunden', findings: [] };
  }

  const top = findings[0];
  return {
    match: { id: top.id, name: top.name, imagePath: top.imagePath },
    confidence: top.score,
    message: `${findings.length} Runen gefunden`,
    findings,
  };
}
```

- [ ] **Step 2: Sanity-check import resolution**

Run: `node --input-type=module -e "import('./src/utils/findingDedup.js').then(m=>console.log(typeof m.dedupeFindings))"`
Expected: prints `function` (confirms the dedup dependency resolves; full `detectRunes` needs the DOM/WebGL and is verified in Task 9).

- [ ] **Step 3: Commit**

```bash
git add src/utils/iterativeRecognition.js
git commit -m "feat: add iterative rune scan orchestration"
```

---

### Task 8: Wire the spell and render the findings list

**Files:**
- Modify: `src/utils/runeRecognition.jsx:130-139` (replace the `itterativeAnalysis` stub)
- Modify: `src/components/DrawingCanvas.jsx` (result panel, ~lines 294-309)
- Modify: `src/components/DrawingCanvas.css` (styles for the findings list)

**Interfaces:**
- Consumes: `detectRunes` from `iterativeRecognition.js`; the result schema with `findings`.
- Produces: `itterativeAnalysis(canvas)` now returns the real detection result; the result panel lists findings.

- [ ] **Step 1: Replace the itterativeAnalysis stub**

In `src/utils/runeRecognition.jsx`, replace the placeholder function (lines 130-139) with:

```jsx
import { detectRunes } from './iterativeRecognition.js';

// Iterativer Abgleich (lokal, ohne API): findet alle Runen im Bild.
export async function itterativeAnalysis(canvas) {
    return detectRunes(canvas);
}
```

Add the `import { detectRunes }` line to the top of the file with the other imports, and remove the old stub body.

- [ ] **Step 2: Render the findings list in the result panel**

In `src/components/DrawingCanvas.jsx`, inside the `{recognitionResult && (...)}` block, after the existing `{recognitionResult.match && (...)}` preview, add:

```jsx
                    {recognitionResult.findings && recognitionResult.findings.length > 0 && (
                        <ul className="drawing__findings">
                            {recognitionResult.findings.map((finding, index) => (
                                <li key={index} className="drawing__finding">
                                    <strong>{finding.name}</strong>
                                    {` · ${finding.size}px · (${Math.round(finding.x)}, ${Math.round(finding.y)}) · ${finding.rotation}° · ${finding.score}%`}
                                </li>
                            ))}
                        </ul>
                    )}
```

- [ ] **Step 3: Add styles**

Append to `src/components/DrawingCanvas.css`:

```css
.drawing__findings {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    text-align: left;
    font-size: 0.85rem;
}

.drawing__finding {
    padding: 0.15rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/runeRecognition.jsx src/components/DrawingCanvas.jsx src/components/DrawingCanvas.css
git commit -m "feat: wire iterative spell and render findings list"
```

---

### Task 9: End-to-end manual verification

**Files:** none (manual verification).

**Interfaces:**
- Consumes: the full pipeline via the running app.

- [ ] **Step 1: Confirm the unit suite is green**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run the dev server**

Run: `npm run dev`
Expected: Vite serves at http://localhost:5173.

- [ ] **Step 3: Draw and cast the iterative spell**

In the browser: draw one or more runes resembling alphabet entries, open the "Zauber wirken ▾" dropdown, and choose "Alter Zauber". Confirm:
- The "Wirke Zauber…" indicator appears and the page stays responsive during the scan.
- A findings list appears below the canvas with name · size · (x, y) · rotation° · score for each detection.
- The top finding's rune image preview shows.
- Drawing on an empty/garbage canvas yields "Keine Runen gefunden".

- [ ] **Step 4: Confirm the Gemini spell still works**

Cast "ZaubAIrn" and confirm it still returns its single-match result unchanged.

- [ ] **Step 5: Note results**

Record in the commit message whether detection quality and runtime are acceptable; if runtime is too slow, the first dials are coarser `ITERATIVE_ROTATIONS` or fewer `ITERATIVE_SIZES` in `config.js`.

- [ ] **Step 6: Commit any tuning**

```bash
git add -A
git commit -m "chore: tune iterative detection constants after manual verification"
```

(Skip if no changes were needed.)

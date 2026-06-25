# TensorFlow.js — Reference

How TensorFlow.js works and how it could fit into SpellGetifier's rune/spell
detection. This is background research, not a committed dependency.

## What it is

TensorFlow.js (TFJS) is a JavaScript library for training and running machine
learning models directly in the browser or Node.js — no Python and no server
round-trip required. This suits SpellGetifier's client-only, no-backend
architecture.

## Core mechanics

### 1. Tensors + manual memory management

The fundamental data type is the `Tensor`, an immutable n-dimensional array.
All math operates on tensors:

```js
const a = tf.tensor([1, 2, 3, 4], [2, 2]);
const b = a.matMul(a);
```

JS has no destructors, so GPU memory isn't freed automatically. Either call
`tensor.dispose()` manually or wrap work in `tf.tidy(() => { ... })`, which
disposes all intermediate tensors when the function returns.

### 2. Backends (the execution engine)

TFJS abstracts *where* the math runs behind swappable backends. The same model
code runs on any of them:

- **WebGL** — classic default; encodes tensors as textures, runs ops as GLSL
  fragment shaders on the GPU.
- **WebGPU** — newer and faster; uses compute shaders.
- **WASM** — CPU SIMD via XNNPACK; good for small models or no-GPU devices.
- **CPU** — plain JS fallback.

Select with `await tf.setBackend('webgl')`.

### 3. Two API layers

- **Ops API** (`tf.matMul`, `tf.conv2d`, …) — low-level, NumPy-like.
- **Layers API** (`tf.sequential`, `tf.layers.dense`, …) — Keras-style
  high-level model building.

### 4. Autodiff for training

TFJS records ops on a tape and computes gradients automatically (`tf.grad`,
`optimizer.minimize`), so models can be trained in-browser, not just run for
inference.

## Typical workflows

- **Run a pre-trained model:** load via `tf.loadLayersModel(url)` or
  `tf.loadGraphModel(url)` (often converted from a Python Keras/SavedModel
  using the `tensorflowjs_converter`), then `model.predict(tensor)`.
- **Use a packaged model:** libraries like `@tensorflow-models/*` (PoseNet,
  handpose, MobileNet) wrap everything.
- **Transfer learning:** load a frozen base model and train a small head on
  user data live in the browser.

## Relevance to SpellGetifier

To classify drawn runes/spells, the pipeline would be:

1. Rasterize the canvas → `tf.browser.fromPixels(canvas)`
2. Resize / normalize the tensor to the model's expected input
3. `model.predict(tensor)` → logits
4. `argMax` → rune label + confidence

This runs fully client-side, consistent with the existing no-backend design.
See [`.concepts/ItterativeAlgorythm.md`](../.concepts/ItterativeAlgorythm.md)
for the current rune-detection approach.

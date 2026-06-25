# Iterative Rune Detection — Design Spec

**Date:** 2026-06-25
**Status:** Approved for planning

## Goal

Implement the `itterativeAnalysis` spell as a real, local (no-API) rune detector.
It scans the drawing canvas for occurrences of runes from the alphabet and returns a
**list of all findings**, each with rune identity, size, position, rotation, and a match score.

This replaces the placeholder stub in `src/utils/runeRecognition.jsx`. The existing
Gemini-based `recognizeRune` spell is left untouched.

## Source concept

From `.concepts/ItterativeAlgorythm.md` — a brute-force nested loop:

```
for(rune)
  for(size)
    for(stepVertical)
      for(stepHorizontal)
        for(rotation)
          matchWithPainting = calculateMatch()
          if(matchWithPainting > threshold)
            saveFinding(rune, size, position, rotation)
```

## Key design decisions

| Decision | Choice |
|---|---|
| Output | List of all findings (multi-rune detection) |
| Match metric | Coverage + penalty |
| Performance priority | Correctness over speed (waiting is acceptable) |
| Tech stack | TensorFlow.js (`@tensorflow/tfjs`), WebGL backend (WebGPU if available) |
| Display | Textual list below the canvas |

## Algorithm

### Convolution reframing

The `stepVertical × stepHorizontal` position loops are a 2D cross-correlation.
TensorFlow's `conv2d` evaluates the match score at **every** position in a single pass,
so the explicit position loops disappear. The real loop is:

```
for rune (36)
  for size (8)
    for rotation (72)
      scoreMap = computeScore(drawingMask, templateMask)   // conv passes, all positions at once
      candidates += localMaximaAboveThreshold(scoreMap)
findings = nonMaxSuppress(candidates)
```

Total: `36 × 8 × 72 ≈ 20,700` conv passes. On a GPU each is a few ms → tens of seconds
to ~1–2 minutes per cast. Acceptable per the performance decision. If too slow, dial back
rotations or sizes.

### Binary ink masks

Both the drawing and each rune template are converted to **binary ink masks**: `1` where
the pixel is dark (ink), `0` where white. The drawing is black-on-white; rune PNGs in
`/assets/alphabet/<name>.png` are likewise dark ink on white.

### Coverage + penalty metric

For a template `T` (binary ink mask at a given size & rotation) with rectangular footprint
`F` (all-ones box of T's dimensions):

- `coverage(x,y)      = corr(drawing, T)`  — template ink the drawing fills
- `inkInFootprint(x,y)= corr(drawing, F)`  — total drawing ink under the footprint box
- `penalty(x,y)       = inkInFootprint − coverage`  — drawing ink inside the box but off the template
- **score(x,y)** = `coverage / inkCount(T)  −  λ · penalty / (area(F) − inkCount(T))`

where `λ = PENALTY_WEIGHT`. Each correlation term is a `conv2d`. The penalty term rejects
blobs that cover the rune but spill ink everywhere around it. Score is reported as a
percentage (0–100) for display.

### Deduplication (non-max suppression)

Brute force yields clusters of high scores around each true location and across neighboring
sizes/rotations. Dedup in two stages:

1. **Within a score map:** keep local maxima ≥ `MATCH_THRESHOLD`, suppressing other maxima
   within a radius of `NMS_RELATIVE × size` of the finding.
2. **Across sizes/rotations:** merge findings whose centers fall within that same relative
   radius, keeping the highest score (which fixes the reported size & rotation).

The merge distance is **relative to each finding's size** (not a fixed pixel count) so small
runes (8–16 px) can sit close together while large runes still dedup correctly.

## Output schema

The iterative spell returns the existing result schema **plus** a `findings` array, so the
display and the Gemini `recognizeRune` spell (single match) both keep working:

```js
{
  match: <top finding's rune object | null>,   // existing field; drives the rune-image preview
  confidence: <top finding's score 0–100>,      // existing field
  message: "N Runen gefunden",                   // existing field
  findings: [
    { id, name, imagePath, size, x, y, rotation, score },
    ...
  ]
}
```

- `x`, `y` are the finding's center in canvas coordinates.
- `rotation` is in degrees.
- `size` is the template edge length in px.
- `findings` is sorted by `score` descending; empty array means nothing found.

## Display

The result panel in `DrawingCanvas.jsx` renders `findings` as a list below the canvas, one
row per finding: `name · size px · (x, y) · rotation° · score`. The existing single-match
preview (rune image for `match`) is kept and shows the top finding. When `findings` is empty,
show the existing "nothing found" message. The Gemini spell path (no `findings` key) is
unaffected.

## Constants (`config.js`)

| Constant | Default | Meaning |
|---|---|---|
| `ITERATIVE_SIZES` | `[8, 16, 24, 32, 48, 64, 96, 128]` | template edge lengths in px (geometric spread; drawings expected 8–128 px) |
| `ITERATIVE_ROTATIONS` | `[0, 5, 10, … 355]` | every 5° → 72 angles |
| `MATCH_THRESHOLD` | `0.6` | min score (0–1) to count as a finding |
| `PENALTY_WEIGHT` | `1.0` | λ in the score formula |
| `NMS_RELATIVE` | `0.5` | suppression/merge radius as a fraction of finding size |

## Structure

- **New module** `src/utils/iterativeRecognition.js` — the TensorFlow.js algorithm:
  template loading + rasterization, mask generation, the scan loop, scoring, and NMS.
- `itterativeAnalysis` in `src/utils/runeRecognition.jsx` becomes a thin wrapper that calls
  the new module. `recognizeRune` is untouched.
- `src/components/DrawingCanvas.jsx` — extend the result panel to render the `findings` list.
- `src/config.js` — add the constants above.
- `package.json` — add `@tensorflow/tfjs`.

## TensorFlow.js handling

- Templates are loaded and rasterized to base masks **once**, then cached.
- Rotated/scaled template variants are generated via an offscreen 2D canvas (crisp masks)
  and converted to tensors.
- `drawing` is the conv input `[1, H, W, 1]`; each template is the filter `[fh, fw, 1, 1]`;
  the footprint correlation uses an all-ones filter.
- Every loop iteration is wrapped in `tf.tidy()`, and any persistent tensors are explicitly
  `.dispose()`d, to avoid leaking GPU memory across ~20k iterations.
- Runs on the main thread but `await tf.nextFrame()` between runes so the "Wirke Zauber…"
  indicator stays responsive.
- Backend: WebGL by default; use WebGPU if available.

## Out of scope

- Canvas overlay boxes for findings (list-only display chosen).
- Web Worker / OffscreenCanvas execution (main-thread async with yielding is sufficient).
- Changes to the Gemini `recognizeRune` spell.
- Performance tuning beyond the documented constants (revisit only if casts are too slow).

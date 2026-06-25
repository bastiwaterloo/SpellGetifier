# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SpellGetifier is a client-only single-page app built with React 18 and Vite. The user draws freehand runes/signs on a canvas; the app recognizes them via three interchangeable approaches (a local $1 unistroke recognizer, Google Gemini Vision, and a local TensorFlow.js template matcher) and can also score how circular a stroke is. There is no backend, router, or state-management library, and all UI text is in German.

The source is mostly plain JS/JSX, with a few TypeScript (`.ts`) files for the geometry-heavy recognizer/scoring logic. Vite (esbuild) compiles TS transparently; there is no separate `tsc`/typecheck step.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server (default http://localhost:5173)
npm run build      # Production build to dist/
npm run preview    # Serve the production build locally
npm test           # Run the Vitest suite once
npm run test:watch # Vitest in watch mode
```

Tests are Vitest, discovered at `src/**/*.test.js` (config in `vitest.config.js`, `environment: 'node'`). No linter or formatter is configured.

**Dependencies:** `react`, `react-dom`, `@google/genai` (Gemini Vision), `@tensorflow/tfjs` (iterative matcher).

## Architecture

Entry: `main.jsx` mounts `<App>` in `StrictMode`. `App.jsx` is a header + main shell rendering the single `DrawingCanvas`. Almost all behavior lives in `components/DrawingCanvas.jsx`.

### Drawing canvas (`components/DrawingCanvas.jsx`)

Drawing uses refs, not React state, to avoid re-renders mid-stroke:
- `setupCanvas` scales the backing store by `devicePixelRatio` (HiDPI) while CSS keeps the display size at `CANVAS_WIDTH`×`CANVAS_HEIGHT`. Stroke style/width are set per stroke in `startDrawing`.
- `getPos` normalizes mouse and touch events to canvas-local coordinates; the same `startDrawing`/`draw`/`stopDrawing` handlers serve both.
- Strokes are recorded as points in `pointsRef` (an array of strokes, each an array of `{x, y}`) — this point data, not the pixels, feeds the unistroke recognizer, circle scoring, and the trainer. The eraser (`destination-out`) also removes recorded points within its radius so the data matches the visible drawing.

UI actions: **Radieren** (eraser toggle), **Löschen** (clear), a **Zauber wirken** dropdown (cast the active recognizer, or "Alter Zauber" = iterative matcher), a **Debug** dropdown (pick the recognizer, toggle training mode), and **Kreis bewerten** (circle score). When training mode is on, a **Template-Trainer** panel captures stroke samples and emits unistroke-template JSON for pasting into `runeTemplates.ts`.

Recognition results share the shape `{ match, confidence, message }`; the iterative matcher additionally returns a `findings` array (one entry per detected rune with `size`, `x`, `y`, `rotation`, `score`), which the result panel renders as a list.

### Configuration & alphabet data

- `config.js` — canvas/stroke constants, asset paths (`RUNES_PATH` = `…/modifiers`, `SIGNS_PATH` = `…/signs`), the full `RUNE_NAMES`/`SIGN_NAMES` filename lists, and the iterative-detection constants (`DETECTION_RESOLUTION`, `DILATION_RADIUS`, `TEMPLATE_MARGIN_FACTOR`, `ROTATION_BATCH_SIZE`, `ITERATIVE_SIZES`, `ITERATIVE_ROTATIONS`, `MATCH_THRESHOLD`, `NMS_RELATIVE`). It also derives `ENABLED_RUNES`/`ENABLED_SIGNS` from `config/config.json`.
- `config/config.json` — the data source for which alphabet entries are active and their display names. Each entry has `type` (`"sign"` → runes/modifiers panel on the right, `"sigil"` → signs panel on the left), a `disabled` flag, `image_filename`, and `name`. `config.js` keeps only `disabled === false` entries and maps each to `{ file, label }`.
- Assets live in `public/assets/alphabet/modifiers/` (runes) and `public/assets/alphabet/signs/` (sigils).
- `components/RuneAlphabet.jsx` renders a reference panel (`{ file, label }[]`) beside the canvas; `DrawingCanvas` mounts two — signs (left) and runes (right).

### Recognizers

`utils/recognizers.js` is a registry exposing a uniform interface `recognize({ canvas, strokes }) -> { match, confidence, message }` plus `loadTemplates()`. Default is `unistroke`. The Debug menu switches the active one; "Zauber wirken" casts it.

1. **Unistroke / $1 recognizer (default, local).** `utils/unistrokeRecognition.jsx` orchestrates; `utils/unistrokeRecognizer.ts` does the math (resample to 64 points, rotate to indicative angle, scale, translate, cosine distance). `extractRunePoints` first strips the bounding circle (using circle scoring) so only the inner glyph is matched. Templates are in `utils/runeTemplates.ts`; the trainer in `DrawingCanvas` generates new ones.
2. **Gemini Vision (KI).** `utils/runeRecognition.jsx` (`recognizeRune`) sends the rendered canvas plus all reference rune images to Gemini via `utils/geminiApi.jsx` and parses a `{ runeId, confidence }` JSON reply.
3. **Iterative template matcher ("Alter Zauber").** `utils/iterativeRecognition.js` (`detectRunes`, wrapped as `itterativeAnalysis` in `runeRecognition.jsx`) — a local TensorFlow.js multi-rune detector. It rasterizes each rune at many sizes/rotations, correlates against the (downscaled, stroke-dilated) drawing using IoU scoring via `conv2d`, and returns all findings above threshold. Supporting modules: `utils/maskUtils.js` (binary ink masks + morphological dilation), `utils/templateMasks.js` (load rune images, rasterize rotated/scaled/margined masks), `utils/scoreMap.js` (batched multi-channel `conv2d` IoU score map + TF.js backend setup), `utils/findingDedup.js` (size-aware non-max suppression).

### Circle scoring

`utils/utils.ts` `calculateCircleScore` returns a 0–100 score for how circular the recorded points are (with `applyQuadraticScoreDamping`). Used by "Kreis bewerten" and internally by the unistroke recognizer to isolate the glyph from its surrounding circle.

### Tests

Vitest unit tests under `src/utils/__tests__/` cover the iterative pipeline's pure logic: `maskUtils` (thresholding, dilation), `scoreMap` (IoU score map — forces the TF.js CPU backend), `findingDedup` (NMS), and `config` constants. The TF.js/canvas pieces and the Gemini/unistroke paths are verified manually in the running app.

## Docs

Design specs and implementation plans for the iterative matcher live under `docs/superpowers/specs/` and `docs/superpowers/plans/`; `docs/TensorFlowJS.md` is a TensorFlow.js reference.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SpellGetifier is a small client-only single-page app built with React 18 (plain JS/JSX, no TypeScript) and Vite. It renders a freehand drawing canvas with mouse and touch support, plus clear and save-as-PNG actions. There is no backend, router, or state-management library. UI text is in German.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server (default http://localhost:5173)
npm run build      # Production build to dist/
npm run preview    # Serve the production build locally
```

There is no test runner, linter, or formatter configured.

## Architecture

The app is intentionally tiny — four meaningful source files under `src/`:

- `main.jsx` — entry point; mounts `<App>` in React `StrictMode` into `#root`.
- `App.jsx` — layout shell (header + main); renders the single `DrawingCanvas`.
- `components/DrawingCanvas.jsx` — all drawing logic.
- `config.js` — shared constants (`CANVAS_WIDTH`, `CANVAS_HEIGHT`, `STROKE_COLOR`, `STROKE_WIDTH`).

### Drawing canvas

`DrawingCanvas` holds all mutable state in refs (`canvasRef`, `contextRef`, `isDrawingRef`) rather than React state — drawing happens by mutating the 2D context directly on pointer events, so re-renders are avoided. Key points:

- `setupCanvas` runs once on mount and scales the canvas backing store by `window.devicePixelRatio` for HiDPI sharpness, while CSS keeps the displayed size at `CANVAS_WIDTH`×`CANVAS_HEIGHT`. Stroke style/width are applied per stroke in `startDrawing`.
- `getPos` normalizes mouse and touch events to canvas-local coordinates via `getBoundingClientRect`. Mouse and touch handlers share the same `startDrawing`/`draw`/`stopDrawing` functions.
- `clearCanvas` wipes the context; `downloadCanvas` exports via `canvas.toDataURL('image/png')` and a synthetic anchor click.

### Note on README vs. code

The README advertises color selection and adjustable stroke width, but the current code uses fixed constants from `config.js` (no UI controls for color/width yet). Treat `config.js` as the source of truth; those features would need to be wired up.

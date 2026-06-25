# Rework Evaluation UX — Design

**Date:** 2026-06-25
**Branch:** `rework-evaluation-ux`

## Problem

The drawing canvas has two overlapping "evaluation" flows that confuse users:

1. **`Auswerten`** (primary button) computes a circle score and shows `Score: X von 100`.
2. **`Speichern`** (secondary button) runs Gemini-based rune recognition *and* downloads
   the drawing as a PNG, showing a separate recognition result box.

The `Speichern` label hides the recognition behavior, the result hint text ("…klicke dann
auf Speichern") is mismatched with the score it describes, and there is no room to add a
second analysis method.

## Goal

Make the two evaluation actions explicit and themed, and create space for a second
(non-AI) rune analysis method that will be implemented later.

## Scope

In scope:
- Relabel the circle-score action.
- Replace the `Speichern` button with a `Zauber wirken` dropdown offering two spells.
- Wire both spells into the existing shared result display.
- Add a stub `itterativeAnalysis` function.
- Remove the PNG download.

Out of scope:
- The real `itterativeAnalysis` algorithm (a later task).
- Any change to the circle-score computation itself.
- Any change to the Gemini recognition logic itself.

## Design

### Actions row

Four controls, left → right:

| Control | Type | Behavior |
|---|---|---|
| `Radieren` | toggle button | Unchanged (eraser on/off). |
| `Löschen` | button | Unchanged (clear canvas). |
| `Zauber wirken ▾` | dropdown (menu) button | New. Replaces `Speichern`. Opens a menu of spells. |
| `Kreis bewerten` | primary button | Same handler as today's `Auswerten` (`calculateCircleScore`), relabeled. |

### "Zauber wirken" dropdown

- Clicking the button toggles a menu containing two items:
  - **`ZaubAIrn`** → calls existing `recognizeRune(canvas)` (Gemini AI matching).
  - **`Alter Zauber`** → calls new `itterativeAnalysis(canvas)`.
- The menu closes on item selection, outside click, or `Escape`.
- The button and both items are disabled when there is nothing drawn (`!hasDrawing`)
  or while a cast is in progress (`isRecognizing`).
- Accessibility: button has `aria-haspopup="menu"` and `aria-expanded`; the menu uses
  `role="menu"` and items use `role="menuitem"`.

### Spell results (shared display)

- Both spells reuse the existing recognition result box and loading state — no new result
  UI is introduced.
- While a cast runs, show `Wirke Zauber…` (generic, replaces the old `Erkenne Rune…`).
- Casting flow (shared by both spells), mirroring today's `downloadCanvas` minus the
  download:
  1. set `isRecognizing = true`, clear previous result;
  2. `await spell(canvas)`;
  3. on success set the result; on throw set `{ match: null, confidence: 0, message: 'Fehler bei der Erkennung' }`;
  4. `finally` set `isRecognizing = false`.
- The PNG download (`link.download = 'zeichnung.png'` …) is **removed**.

### `itterativeAnalysis` stub

- Lives in `src/utils/runeRecognition.js` next to `recognizeRune`.
- Signature matches `recognizeRune`: `async function itterativeAnalysis(canvas)`.
- Returns the same result shape so it plugs into the shared display unchanged:
  `{ match: null, confidence: 0, message: 'Alter Zauber: noch nicht implementiert' }`.
- The real iterative algorithm replaces the body later with no UI changes required.

### Circle score

- Unchanged computation and `Score: X von 100` display.
- Update the stale default hint text (currently "Zeichne eine Rune und klicke dann auf
  Speichern.") to no longer reference `Speichern`.

## Components / boundaries

- **`DrawingCanvas.jsx`** — owns the actions row, dropdown open/close state, the shared
  `castSpell(spellFn)` handler, and the relabeled circle-score button.
- **`runeRecognition.js`** — exports `recognizeRune` (existing) and `itterativeAnalysis`
  (new stub); both take a canvas and return `{ match, confidence, message }`.
- **`DrawingCanvas.css`** — dropdown button + menu styling, reusing existing button classes.

## Result-shape contract

Every spell is an `async (canvas) => { match, confidence, message }`:
- `match`: matched rune object (`{ name, imagePath, … }`) or `null`.
- `confidence`: integer 0–100.
- `message`: user-facing German string shown in the result box.

This is the single interface between spells and the result display, so new spells need no
UI work.

## Testing

Manual verification (puppeteer), no automated test suite exists:
- `Zauber wirken` opens/closes the menu (click, outside-click, Escape).
- Button/items disabled with an empty canvas and during a cast.
- `ZaubAIrn` triggers recognition (loading text → result box).
- `Alter Zauber` shows the `noch nicht implementiert` placeholder via the same box.
- `Kreis bewerten` still produces `Score: X von 100`.
- No PNG is downloaded by any control.
- Build passes (`npm run build`).

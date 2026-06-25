# Recognize Sigils in "Alter Zauber"

**Date:** 2026-06-25
**Status:** Approved — ready for implementation
**Branch:** `runes-to-spell`

## Problem

The iterative detector ("Alter Zauber", `detectRunes`) only scans the enabled
**runes/modifiers** (`ENABLED_RUNES`, the `"sign"` type from `modifiers/`). The
two enabled **sigils** — Fire (`Fire_sigil.png`) and Light (`Light.png`), the
`"sigil"` type from `signs/` — appear in the left "Siegel" reference panel but
are never fed to any recognizer, so they can never be detected.

We want "Alter Zauber" to also detect the enabled sigils, and we want each
finding to carry whether it is a `sign` or a `sigil` so future spell logic can
combine an element (sigil) with modifiers (signs).

## Scope

- **In:** Add the enabled sigils to the iterative detection template set; tag
  every finding with its `type`.
- **Out:** Other recognizers (unistroke/$P/Gemini) stay unchanged; no
  sigil-specific size grid or threshold (the shared `ITERATIVE_SIZES` grid is
  fine for two sigils); no spell calculation (`runesToSpell` stays the
  fallback).

Generalizing to "all enabled sigils" (rather than hard-coding Fire/Light) is
intentional: Fire and Light are simply the sigils currently enabled in
`config/config.json`. Enabling more later makes them detectable automatically.

## Design

### 1. `utils/templateMasks.js` — split assembly from image loading

Today `loadRuneImages()` both decides *which* templates exist and loads their
`Image` objects, so the selection logic can't be unit-tested (it needs a
browser `Image`). Split the two concerns:

- **New pure function `buildTemplateDescriptors()`** returns the combined
  template list with no image loading:

  ```js
  // [{ id, name, type, imagePath }]
  buildTemplateDescriptors()
  ```

  It concatenates:
  - `ENABLED_RUNES` → `{ type: 'sign',  imagePath: `${RUNES_PATH}/${file}.png` }`
  - `ENABLED_SIGNS` → `{ type: 'sigil', imagePath: `${SIGNS_PATH}/${file}.png` }`

  `name` is the config `label`. `id` is a sequential 1-based index across the
  whole combined list (runes first, then sigils), so ids stay unique.

- **Rename `loadRuneImages()` → `loadTemplateImages()`**. It now maps
  `buildTemplateDescriptors()` to `{ ...descriptor, image: await loadImage(...) }`.
  The module-level `cache` behavior is unchanged. (Single caller:
  `iterativeRecognition.js`.)

### 2. `utils/iterativeRecognition.js` — tag candidates

`detectRunes` already loops over the loaded templates and pushes candidates.
Two changes:
- Call `loadTemplateImages()` instead of `loadRuneImages()`.
- Add `type: template.type` to each pushed candidate.

`dedupeFindings` spreads `...f` when building findings, so `type` flows through
NMS unchanged. The returned `findings` therefore each carry
`{ id, name, type, imagePath, size, x, y, rotation, score }`.

### 3. `components/DrawingCanvas.jsx` — show the type

The findings list renders the type alongside the existing fields, capitalized,
e.g.:

```
Fire · Sigil · 64px · (89, 61) · 60° · 64%
```

### Data flow

```
Alter Zauber
  → loadTemplateImages()            // enabled runes + enabled sigils, typed
  → conv2d IoU scoring (all sizes/rotations, every template)
  → candidates (each carries type)
  → dedupeFindings (NMS)            // type preserved
  → findings[] tagged sign|sigil
  → rendered in findings list
  → runesToSpell(findings)          // still the fallback spell for now
```

## Testing (TDD)

Pure logic, runnable under the existing node Vitest setup:

- **`buildTemplateDescriptors`** (`utils/__tests__/templateMasks.test.js`):
  - includes every enabled rune tagged `'sign'` and every enabled sigil tagged
    `'sigil'`;
  - Fire and Light appear with `type: 'sigil'` and a `SIGNS_PATH`-based
    `imagePath`;
  - ids are unique and sequential across the combined list.
- **`dedupeFindings`** (existing `findingDedup.test.js`): a `type` field on a
  candidate survives NMS onto the kept finding.

The TF.js/`Image`/canvas pieces (`loadTemplateImages`, `detectRunes`,
rendering) remain verified manually in the running app, consistent with the
rest of the iterative pipeline.

## Risks

- **Performance:** two extra templates × sizes × rotations is negligible
  relative to the ~29 runes already scanned.
- **Rename churn:** `loadRuneImages` has a single import site; the rename is
  mechanical.

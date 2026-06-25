# Rework Evaluation UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Speichern` button with a `Zauber wirken` dropdown offering two spells (AI and a stubbed iterative analysis), relabel the circle-score button, and remove the PNG download.

**Architecture:** All UI lives in `DrawingCanvas.jsx`; both spells are `async (canvas) => { match, confidence, message }` functions in `runeRecognition.js` that funnel into the existing shared result box. A small open/close state drives the dropdown menu.

**Tech Stack:** React 18 (JSX, no TypeScript in this component), Vite. No automated test runner exists, so each task verifies with `npm run build` plus puppeteer-driven manual checks against the dev server.

## Global Constraints

- No new dependencies.
- UI copy is German; use these labels verbatim: button `Kreis bewerten`, dropdown button `Zauber wirken ▾`, menu items `ZaubAIrn` and `Alter Zauber`, loading text `Wirke Zauber…`, stub message `Alter Zauber: noch nicht implementiert`, generic error `Fehler bei der Erkennung`.
- Spell contract: every spell is `async (canvas) => { match, confidence, message }` where `match` is a rune object or `null`, `confidence` is an integer 0–100, `message` is a German string.
- Do not change the circle-score computation (`getCircleScore`) or the Gemini logic inside `recognizeRune`.
- The PNG download must be fully removed (no `link.download` / `toDataURL` save path).
- There is no test runner: "verify" means run the build and/or drive the app with puppeteer; never claim a unit-test pass.

---

### Task 1: Add `itterativeAnalysis` stub

**Files:**
- Modify: `src/utils/runeRecognition.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `export async function itterativeAnalysis(canvas)` returning `{ match: null, confidence: 0, message: 'Alter Zauber: noch nicht implementiert' }`. Same result shape as `recognizeRune`.

- [ ] **Step 1: Append the stub to `runeRecognition.js`**

Add at the end of the file (after `recognizeRune`):

```js
// Platzhalter-Zauber: der eigentliche iterative Abgleich folgt später.
// Gleiches Ergebnis-Schema wie recognizeRune, damit die Anzeige unverändert bleibt.
export async function itterativeAnalysis(canvas) {
    void canvas;
    return {
        match: null,
        confidence: 0,
        message: 'Alter Zauber: noch nicht implementiert'
    };
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/runeRecognition.js
git commit -m "Add itterativeAnalysis spell stub"
```

---

### Task 2: Replace actions with the spell dropdown and relabel circle score

**Files:**
- Modify: `src/components/DrawingCanvas.jsx`

**Interfaces:**
- Consumes: `recognizeRune` and `itterativeAnalysis` from `runeRecognition.js`; existing `canvasRef`, `hasDrawing`, `isRecognizing`, `recognitionResult`, `setRecognitionResult`, `setIsRecognizing`, `calculateCircleScore`.
- Produces: a `castSpell(spell)` handler and `isSpellMenuOpen` state used only within this component.

- [ ] **Step 1: Import `itterativeAnalysis`**

Change the recognition import (currently `import {recognizeRune, loadRuneTemplates} from '../utils/runeRecognition.js';`) to:

```js
import {recognizeRune, loadRuneTemplates, itterativeAnalysis} from '../utils/runeRecognition.js';
```

- [ ] **Step 2: Add dropdown state and a container ref**

After the existing `const [isErasing, setIsErasing] = useState(false);` line, add:

```js
    const [isSpellMenuOpen, setIsSpellMenuOpen] = useState(false);
    const spellMenuRef = useRef(null);
```

- [ ] **Step 3: Close the menu on outside click / Escape**

Add this effect just after the existing `useEffect(() => { setupCanvas(); loadRuneTemplates(); }, [setupCanvas]);` block:

```js
    useEffect(() => {
        if (!isSpellMenuOpen) return undefined;
        const handlePointerDown = (event) => {
            if (spellMenuRef.current && !spellMenuRef.current.contains(event.target)) {
                setIsSpellMenuOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsSpellMenuOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isSpellMenuOpen]);
```

- [ ] **Step 4: Replace `downloadCanvas` with `castSpell`**

Delete the entire `downloadCanvas` function (the `const downloadCanvas = async () => { … };` block, lines ~154-178) and replace it with:

```js
    const castSpell = async (spell) => {
        const canvas = canvasRef.current;
        setIsSpellMenuOpen(false);
        setIsRecognizing(true);
        setRecognitionResult(null);

        try {
            const result = await spell(canvas);
            setRecognitionResult(result);
        } catch (error) {
            console.error('Fehler beim Wirken des Zaubers:', error);
            setRecognitionResult({
                match: null,
                confidence: 0,
                message: 'Fehler bei der Erkennung'
            });
        }

        setIsRecognizing(false);
    };
```

- [ ] **Step 5: Replace the `Speichern` button with the dropdown**

Replace the `Speichern` button block:

```jsx
                <button
                    type="button"
                    className="drawing__button drawing__button--secondary"
                    onClick={downloadCanvas}
                >
                    Speichern
                </button>
```

with:

```jsx
                <div className="drawing__dropdown" ref={spellMenuRef}>
                    <button
                        type="button"
                        className="drawing__button drawing__button--secondary"
                        onClick={() => setIsSpellMenuOpen((open) => !open)}
                        disabled={!hasDrawing || isRecognizing}
                        aria-haspopup="menu"
                        aria-expanded={isSpellMenuOpen}
                    >
                        Zauber wirken ▾
                    </button>
                    {isSpellMenuOpen && (
                        <ul className="drawing__menu" role="menu">
                            <li role="none">
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="drawing__menu-item"
                                    onClick={() => castSpell(recognizeRune)}
                                >
                                    ZaubAIrn
                                </button>
                            </li>
                            <li role="none">
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="drawing__menu-item"
                                    onClick={() => castSpell(itterativeAnalysis)}
                                >
                                    Alter Zauber
                                </button>
                            </li>
                        </ul>
                    )}
                </div>
```

- [ ] **Step 6: Relabel the circle-score button**

In the primary button block, change the visible text `Auswerten` to `Kreis bewerten` (leave `onClick={calculateCircleScore}` and `disabled={!hasDrawing}` unchanged):

```jsx
                <button
                    type="button"
                    className="drawing__button drawing__button--primary"
                    onClick={calculateCircleScore}
                    disabled={!hasDrawing}
                >
                    Kreis bewerten
                </button>
```

- [ ] **Step 7: Update loading text and stale hint**

Change the loading paragraph `Erkenne Rune...` to `Wirke Zauber…`:

```jsx
            {isRecognizing && (
                <div className="drawing__recognition">
                    <p>Wirke Zauber…</p>
                </div>
            )}
```

Change the default score hint `Zeichne eine Rune und klicke dann auf Speichern.` to:

```jsx
                    <p>Zeichne etwas und werte den Kreis aus oder wirke einen Zauber.</p>
```

- [ ] **Step 8: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built` with no errors (in particular, no "downloadCanvas is not defined").

- [ ] **Step 9: Verify behavior in the running app**

Start the dev server (`npm run dev`) and drive it with puppeteer:
- With an empty canvas, the `Zauber wirken ▾` button is disabled (`!hasDrawing`).
- Draw a stroke, then click `Zauber wirken ▾`: a menu with `ZaubAIrn` and `Alter Zauber` appears.
- Click outside the menu and press Escape: the menu closes.
- Click `Alter Zauber`: the result box shows `Alter Zauber: noch nicht implementiert` (the loading text `Wirke Zauber…` may flash first).
- Click `ZaubAIrn`: the loading text appears, then a recognition result/error box (depends on `VITE_GEMINI_API_KEY`).
- Click `Kreis bewerten`: the `Score: X von 100` line still appears.
- Confirm no file download is triggered by any control.

- [ ] **Step 10: Commit**

```bash
git add src/components/DrawingCanvas.jsx
git commit -m "Replace Speichern with Zauber wirken dropdown and relabel circle score"
```

---

### Task 3: Style the spell dropdown

**Files:**
- Modify: `src/components/DrawingCanvas.css`

**Interfaces:**
- Consumes: the `drawing__dropdown`, `drawing__menu`, and `drawing__menu-item` class names emitted by Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add dropdown styles**

Append to `src/components/DrawingCanvas.css`:

```css
.drawing__dropdown {
    position: relative;
    display: inline-block;
}

.drawing__menu {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 100%;
    margin: 0;
    padding: 0.25rem;
    list-style: none;
    background: #1a1a2e;
    border: 1px solid #2a2a40;
    border-radius: 8px;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
}

.drawing__menu-item {
    width: 100%;
    padding: 0.4rem 0.75rem;
    text-align: left;
    white-space: nowrap;
    font-size: 0.9rem;
    color: #fff;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

.drawing__menu-item:hover {
    background: #31314f;
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 3: Verify the menu renders correctly**

With the dev server running, draw a stroke, open `Zauber wirken ▾`, and take a puppeteer screenshot. Confirm the menu floats below the button (not inline in the actions row), both items are readable, and items highlight on hover.

- [ ] **Step 4: Commit**

```bash
git add src/components/DrawingCanvas.css
git commit -m "Style the Zauber wirken dropdown menu"
```

---

## Self-Review

**Spec coverage:**
- Relabel circle button → Task 2 Step 6. ✓
- `Zauber wirken` dropdown with `ZaubAIrn` + `Alter Zauber` → Task 2 Steps 5. ✓
- Shared result box + generic `Wirke Zauber…` loading → Task 2 Steps 4, 7. ✓
- `itterativeAnalysis` stub in `runeRecognition.js` → Task 1. ✓
- Remove PNG download → Task 2 Step 4 (deletes `downloadCanvas`). ✓
- Update stale hint text → Task 2 Step 7. ✓
- Dropdown menu styling → Task 3. ✓
- Accessibility (`aria-haspopup`, `aria-expanded`, `role="menu"`/`menuitem`) → Task 2 Step 5. ✓
- Disabled when `!hasDrawing` or `isRecognizing` → Task 2 Step 5. ✓

**Placeholder scan:** No TBD/TODO; the only "not implemented" string is the intentional stub message. All code steps show full code. ✓

**Type/name consistency:** `itterativeAnalysis` spelled identically in Task 1 (definition), Task 2 Step 1 (import), and Task 2 Step 5 (usage). Class names `drawing__dropdown`/`drawing__menu`/`drawing__menu-item` match between Task 2 (JSX) and Task 3 (CSS). `castSpell` defined and used within Task 2. ✓

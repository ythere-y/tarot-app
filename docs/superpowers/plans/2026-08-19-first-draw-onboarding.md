# First Draw Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-visit, mode-aware guided flow that takes a new user from input selection through topic selection and their first interpreted card, with recoverable camera errors and reusable help.

**Architecture:** Put onboarding transitions and persistence in a small DOM-independent controller, then connect semantic interaction events from the existing single-page Three.js application. Keep presentation in accessible HTML/CSS overlays inside `index.html`; do not move or rewrite rendering, card data, AI reading, or gesture classification.

**Tech Stack:** Browser ES modules, vanilla DOM/CSS, Three.js, MediaPipe Hands, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-19-first-draw-onboarding-design.md`

## Global Constraints

- Do not change draw randomness, upright/reversed probability, tarot meanings, AI reading API, elemental effects, or gesture thresholds.
- Camera startup must follow an explicit gesture-mode choice on first visit.
- The guide must remain usable at narrow viewport widths and with reduced motion.
- Failure of camera access, storage, or AI reading must never block ordinary mouse drawing.

---

### Task 1: Onboarding state controller

**Files:**
- Create: `src/client/onboarding.js`
- Create: `tests/client/onboarding.test.mjs`

**Interfaces:**
- Consumes: optional `{ storage, completedKey }` dependencies.
- Produces: `createOnboardingController({ storage, completedKey })` returning `{ getState(), selectMode(mode), selectTopic(topic), start(), notify(event), replay(mode), skip(), complete() }`.
- State shape: `{ phase, mode, topic, active, firstVisit, completed }`.

- [ ] **Step 1: Write failing controller tests**

Cover initial first visit, `mouse` skipping hand detection, `gesture` requiring `hand-visible`, ordered `deck-targeted/card-grabbed/card-revealed`, duplicate/out-of-order events, completion persistence, replay without clearing completion, skip, and throwing storage fallback.

```js
const controller = createOnboardingController({ storage });
assert.equal(controller.getState().phase, 'welcome');
controller.selectMode('mouse');
controller.selectTopic('love');
controller.start();
assert.equal(controller.getState().phase, 'target-deck');
controller.notify('deck-targeted');
assert.equal(controller.getState().phase, 'grab');
```

- [ ] **Step 2: Verify the new tests fail**

Run: `node --test tests/client/onboarding.test.mjs`

Expected: FAIL because `src/client/onboarding.js` does not exist.

- [ ] **Step 3: Implement the minimal finite-state controller**

Use explicit phase/event maps for gesture and mouse. Validate mode/topic values, return snapshots rather than mutable internal state, catch storage read/write failures, and persist only when `complete()` is called.

```js
const PATHS = {
  gesture: ['locate-input', 'target-deck', 'grab', 'reveal', 'result-explainer'],
  mouse: ['target-deck', 'grab', 'reveal', 'result-explainer'],
};
const EVENT_FOR_PHASE = {
  'locate-input': 'hand-visible',
  'target-deck': 'deck-targeted',
  grab: 'card-grabbed',
  reveal: 'card-revealed',
};
```

- [ ] **Step 4: Verify controller tests pass**

Run: `node --test tests/client/onboarding.test.mjs`

Expected: all onboarding controller tests PASS.

- [ ] **Step 5: Commit controller and tests**

```powershell
git add -- src/client/onboarding.js tests/client/onboarding.test.mjs
git commit -m "feat: add onboarding state controller"
```

### Task 2: Accessible onboarding UI and application integration

**Files:**
- Modify: `index.html`
- Modify: `tests/smoke/app-smoke.test.mjs`

**Interfaces:**
- Consumes: `createOnboardingController` from Task 1 and existing `toggleMode`, `readingController.setTopic`, `onResults`, `updateInteraction`, `createHeldCard`, and `confirmResult` integration points.
- Produces: DOM elements `#onboarding-dialog`, `#onboarding-guide`, `#onboarding-help`, `#onboarding-camera-error`, and one render function driven by controller snapshots.

- [ ] **Step 1: Add failing smoke assertions**

Assert the page imports the controller, exposes the required element IDs, uses `role="dialog"`, has `aria-live="polite"`, includes camera privacy copy, provides mouse fallback and skip/help actions, and no longer starts `cameraUtils` unconditionally at module initialization.

```js
for (const id of ['onboarding-dialog', 'onboarding-guide', 'onboarding-help', 'onboarding-camera-error']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(html, /createOnboardingController/);
assert.match(html, /摄像头画面仅在浏览器本地用于手势识别/);
```

- [ ] **Step 2: Verify smoke test fails**

Run: `node --test tests/smoke/app-smoke.test.mjs`

Expected: FAIL on the missing onboarding markup/import.

- [ ] **Step 3: Add responsive accessible markup and styles**

Add a first-visit dialog with mode and topic panels, a compact stage guide with progress/copy/actions, a result explainer, and a persistent help button. Use visible `:focus-visible`, narrow-screen rules, reduced-motion compatibility, `aria-modal`, labelled dialog regions, and no dependency on the hidden mobile `.gesture-guide`.

- [ ] **Step 4: Wire onboarding state to real interaction events**

On first visit, defer camera startup until gesture selection; on returning completed visits, preserve the current default behavior. Route topic selection through the same function for existing and onboarding buttons. Notify `hand-visible` in `onResults`, `deck-targeted` from raycasting, `card-grabbed` after card creation, and `card-revealed` in `confirmResult`. Camera failure must expose an immediate mouse action; mode changes reset active help to the matching path. Focus enters dialogs and returns to the trigger on close.

- [ ] **Step 5: Verify smoke and controller suites pass**

Run: `node --test tests/smoke/app-smoke.test.mjs tests/client/onboarding.test.mjs`

Expected: all selected tests PASS.

- [ ] **Step 6: Commit UI integration**

```powershell
git add -- index.html tests/smoke/app-smoke.test.mjs
git commit -m "feat: guide users through their first tarot draw"
```

### Task 3: Regression and browser verification

**Files:**
- Modify only if verification finds a scoped defect: `index.html`, `src/client/onboarding.js`, or their tests.

**Interfaces:**
- Consumes: completed controller and UI integration.
- Produces: verified first-visit mouse path, camera recovery path, returning-user behavior, responsive presentation, and regression-safe test suite.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: all existing and new tests PASS with no unhandled rejection.

- [ ] **Step 2: Exercise first-visit mouse flow in a browser**

Clear only `ether-tarot:onboarding-complete`, reload, select mouse, select a non-default topic, follow target/grab/release prompts, reveal a card, dismiss the result explainer, reload, and confirm the welcome dialog stays closed while “操作帮助” replays the mouse guide.

- [ ] **Step 3: Exercise gesture recovery and responsive behavior**

Clear the completion key, choose gesture, deny camera access, confirm the inline error is readable and “改用鼠标” continues the same flow. Check 390px and desktop widths and verify keyboard focus, Escape skip, and reduced-motion rendering.

- [ ] **Step 4: Run final verification after any fixes**

Run: `npm test`

Expected: all tests PASS. Run `git diff --check` and expect no whitespace errors.

- [ ] **Step 5: Commit scoped verification fixes if needed**

```powershell
git add -- index.html src/client/onboarding.js tests/client/onboarding.test.mjs tests/smoke/app-smoke.test.mjs
git commit -m "fix: polish onboarding recovery and accessibility"
```


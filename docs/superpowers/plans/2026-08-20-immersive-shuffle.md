# Immersive Tarot Shuffle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, input-locking 78-card 3D shuffle ritual and connect it to the first-draw onboarding flow in a CHATAROT-inspired black-and-gold interface.

**Architecture:** A DOM-independent shuffle controller owns phase timing and deterministic card transforms. The existing page creates 78 lightweight meshes with shared Three.js resources, renders shuffle status/actions, forwards semantic events to onboarding, and keeps the existing reading pipeline unchanged.

**Tech Stack:** Browser ES modules, Three.js, vanilla DOM/CSS, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-20-chatarot-inspired-shuffle-design.md`

## Global Constraints

- Recreate the observable animation choreography independently; do not copy reference code, brand assets, card backs, or wording.
- Use all 78 logical card IDs and shared Three.js geometry/material resources.
- Do not change draw randomness, upright/reversed probability, meanings, AI requests, history, or elemental effects.
- Lock mouse and gesture drawing until shuffle is ready.
- Support skip and `prefers-reduced-motion` without duplicate completion callbacks or stranded cards.

---

### Task 1: Deterministic shuffle sequence

**Files:**
- Create: `src/client/shuffle-sequence.js`
- Create: `tests/client/shuffle-sequence.test.mjs`

**Interfaces:**
- Produces: `createShuffleSequence({ reducedMotion=false, radius=3.4, deckY=-2 })`.
- Methods: `start(cards)`, `update(deltaSeconds)`, `skip()`, `reset(cards)`, `getState()`, and `onComplete(callback)`.
- Card contract: `{ position:{x,y,z}, rotation:{x,y,z}, scale:{x,y,z} }`; Three.js vectors and plain test objects are both accepted.

- [ ] **Step 1: Write failing unit tests**

Cover the normal phase order `converge -> sphere -> orbit -> cut -> merge -> ready`, 78 finite near-uniform sphere positions, two full orbit turns, left/right cut groups, central interleaved merge, input-ready state, one-shot completion, skip, reset, and reduced-motion `converge -> merge -> ready`.

```js
const cards = Array.from({ length: 78 }, fakeCard);
const sequence = createShuffleSequence();
sequence.start(cards);
advance(sequence, 10);
assert.equal(sequence.getState().phase, 'ready');
assert.ok(cards.every(card => Math.abs(card.position.x) < 0.001));
```

- [ ] **Step 2: Verify tests fail because the module is absent**

Run: `node --test tests/client/shuffle-sequence.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` for `src/client/shuffle-sequence.js`.

- [ ] **Step 3: Implement minimal phase controller**

Use elapsed seconds, explicit duration maps, smoothstep interpolation, Fibonacci sphere targets, a live orbit angle of `4 * Math.PI * easedProgress`, deterministic per-index tilt, alternating cut piles, and central merge targets. `skip()` writes final transforms then completes once.

- [ ] **Step 4: Verify shuffle tests pass**

Run: `node --test tests/client/shuffle-sequence.test.mjs`

Expected: all shuffle tests PASS.

- [ ] **Step 5: Commit controller**

```powershell
git add -- src/client/shuffle-sequence.js tests/client/shuffle-sequence.test.mjs
git commit -m "feat: add immersive 78-card shuffle sequence"
```

### Task 2: Add shuffle step to onboarding

**Files:**
- Modify: `src/client/onboarding.js`
- Modify: `tests/client/onboarding.test.mjs`

**Interfaces:**
- Consumes: semantic event `shuffle-complete`.
- Produces: `shuffle` as the first operational phase after mode/topic selection and replay when the deck is not ready; `notify('shuffle-complete')` advances gesture to `locate-input` and mouse to `target-deck`.

- [ ] **Step 1: Write failing onboarding tests**

Update mouse and gesture expectations so `start()` enters `shuffle`, out-of-order draw events are ignored, and `shuffle-complete` advances to the mode-specific path.

- [ ] **Step 2: Verify onboarding tests fail on the old first phase**

Run: `node --test tests/client/onboarding.test.mjs`

Expected: FAIL because the old controller starts at `target-deck` or `locate-input`.

- [ ] **Step 3: Implement the new shuffle transition**

Add `shuffle` to both paths and map it to `shuffle-complete`; keep completion persistence, skip, and ordered-event behavior unchanged.

- [ ] **Step 4: Verify onboarding tests pass**

Run: `node --test tests/client/onboarding.test.mjs`

Expected: all onboarding tests PASS.

- [ ] **Step 5: Commit onboarding transition**

```powershell
git add -- src/client/onboarding.js tests/client/onboarding.test.mjs
git commit -m "feat: guide first draw through shuffling"
```

### Task 3: Three.js mesh integration and black-gold controls

**Files:**
- Modify: `index.html`
- Modify: `tests/smoke/app-smoke.test.mjs`

**Interfaces:**
- Consumes: `createShuffleSequence`, onboarding `shuffle-complete`, `STATE.locked`, `cardGroup`, `backTexture`, and the render loop.
- Produces: `#shuffle-status`, `#shuffle-action`, `#shuffle-skip`, a 78-mesh shared-resource deck, and `startShuffle()/finishShuffle()` application functions.

- [ ] **Step 1: Add failing served-page contract assertions**

Assert the served app imports `createShuffleSequence`, contains the three shuffle controls and accessible status, includes the black/gold shuffle stage, invokes `shuffleSequence.update(dt)`, and preserves the onboarding/AI contracts.

- [ ] **Step 2: Verify smoke tests fail on missing shuffle UI**

Run: `node --test tests/smoke/app-smoke.test.mjs`

Expected: FAIL on `id="shuffle-action"`.

- [ ] **Step 3: Replace the single deck box with 78 shared-resource meshes**

Create one thin `BoxGeometry` and one card-back material, instantiate 78 meshes at `(0,-2,index*0.006)`, disable raycasting for all except the top ready card, and add the existing gold outline only to the top mesh. When a card is drawn, hide the top visual mesh and promote the next visible mesh as the deck hit target.

- [ ] **Step 4: Add shuffle stage markup and black-gold visual hierarchy**

Place small uppercase shuffle status above the deck, a high-contrast “开始洗牌” button below it, and a secondary “跳过动画” action visible only while active. Shift mint/violet emphasis toward warm gold/ivory, reduce side-panel prominence, preserve Ether Tarot identity, and keep narrow-screen controls within the viewport.

- [ ] **Step 5: Wire sequence lifecycle and input lock**

`startShuffle()` sets `STATE.locked`, starts all visible card meshes, updates button/status for each phase, and enables skip. `finishShuffle()` unlocks input, promotes the top hit mesh, changes the button to “重新洗牌”, and calls `advanceOnboarding('shuffle-complete')` once. Reject start while held/reading/active; update the sequence every render frame. Reduced motion comes from `matchMedia`.

- [ ] **Step 6: Verify selected tests pass**

Run: `node --test tests/client/shuffle-sequence.test.mjs tests/client/onboarding.test.mjs tests/smoke/app-smoke.test.mjs`

Expected: all selected tests PASS.

- [ ] **Step 7: Commit integration**

```powershell
git add -- index.html tests/smoke/app-smoke.test.mjs
git commit -m "feat: add interactive black-gold shuffle ritual"
```

### Task 4: Regression and real rendering verification

**Files:**
- Modify only when a verified scoped defect requires it: `index.html`, `src/client/shuffle-sequence.js`, `src/client/onboarding.js`, or their tests.

**Interfaces:**
- Produces: tested full-flow branch ready for integration.

- [ ] **Step 1: Run all automated tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Verify real desktop rendering**

Use a fresh browser profile: choose mouse and a topic, confirm the guide waits at shuffle, start the full animation, confirm 78 visible moving cards and locked drawing, skip/replay safely, complete a draw, and reopen help.

- [ ] **Step 3: Verify narrow and reduced-motion rendering**

At a narrow viewport, confirm no horizontal clipping and accessible buttons. With reduced motion, confirm the sequence uses only converge/merge and becomes ready in about 600ms.

- [ ] **Step 4: Final checks**

Run `npm test` and `git diff --check`; expect all tests PASS and no whitespace errors. Remove only temporary screenshots, profiles, and server logs created by this implementation.


# Tarot Central Altar MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable central-altar tarot draw flow where the deck is immediately visible and every gesture step has explicit visual feedback.

**Architecture:** Preserve the existing single-page Three.js and MediaPipe application while extracting the interaction transition rules into a small pure JavaScript module. The Three.js scene owns deck/card visuals, the pure state reducer owns allowed transitions, and the DOM guidance layer renders the current instruction.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Three.js 0.160, MediaPipe Hands, Node.js built-in test runner.

## Global Constraints

- Preserve the existing 78-card random draw and upright/reversed rules.
- Keep OPEN for pointer movement, PINCH for grab/drag, and FIST only for confirmation.
- Do not replace or train the MediaPipe model.
- Mouse input must use the same interaction states and feedback as gesture input.
- The deck must remain visible if its texture fails to load.
- This MVP does not add accounts, sharing, new spreads, or cloud state.

---

### Task 1: Interaction State Reducer

**Files:**
- Create: `src/interaction-state.mjs`
- Create: `tests/interaction-state.test.mjs`

**Interfaces:**
- Consumes: normalized events `{ type: "POINTER_ENTER_DECK" | "POINTER_LEAVE_DECK" | "GRAB" | "ENTER_REVEAL_ZONE" | "LEAVE_REVEAL_ZONE" | "CONFIRM" | "RESET" }`
- Produces: `createInteractionState()` and `transitionInteraction(state, event)` with phases `IDLE`, `AIMING`, `DRAGGING`, `READY_TO_CONFIRM`, and `REVEALED`

- [ ] **Step 1: Write reducer tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  createInteractionState,
  transitionInteraction,
} from "../src/interaction-state.mjs";

test("requires aiming before a card can be grabbed", () => {
  const idle = createInteractionState();
  assert.equal(transitionInteraction(idle, { type: "GRAB" }).phase, "IDLE");
  const aiming = transitionInteraction(idle, { type: "POINTER_ENTER_DECK" });
  assert.equal(transitionInteraction(aiming, { type: "GRAB" }).phase, "DRAGGING");
});

test("only confirms a card inside the reveal zone", () => {
  let state = createInteractionState();
  state = transitionInteraction(state, { type: "POINTER_ENTER_DECK" });
  state = transitionInteraction(state, { type: "GRAB" });
  assert.equal(transitionInteraction(state, { type: "CONFIRM" }).phase, "DRAGGING");
  state = transitionInteraction(state, { type: "ENTER_REVEAL_ZONE" });
  assert.equal(transitionInteraction(state, { type: "CONFIRM" }).phase, "REVEALED");
});

test("reset returns every phase to idle", () => {
  const revealed = { phase: "REVEALED" };
  assert.deepEqual(
    transitionInteraction(revealed, { type: "RESET" }),
    createInteractionState(),
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/interaction-state.test.mjs`  
Expected: FAIL because `src/interaction-state.mjs` does not exist.

- [ ] **Step 3: Implement the reducer**

```js
export function createInteractionState() {
  return { phase: "IDLE" };
}

export function transitionInteraction(state, event) {
  if (event.type === "RESET") return createInteractionState();

  const transitions = {
    IDLE: {
      POINTER_ENTER_DECK: "AIMING",
    },
    AIMING: {
      POINTER_LEAVE_DECK: "IDLE",
      GRAB: "DRAGGING",
    },
    DRAGGING: {
      ENTER_REVEAL_ZONE: "READY_TO_CONFIRM",
    },
    READY_TO_CONFIRM: {
      LEAVE_REVEAL_ZONE: "DRAGGING",
      CONFIRM: "REVEALED",
    },
  };

  return {
    phase: transitions[state.phase]?.[event.type] ?? state.phase,
  };
}
```

- [ ] **Step 4: Run reducer tests**

Run: `node --test tests/interaction-state.test.mjs`  
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/interaction-state.mjs tests/interaction-state.test.mjs
git commit -m "test: define tarot interaction states"
```

### Task 2: Central Altar Deck and Guidance UI

**Files:**
- Modify: `index.html`
- Create: `tarot_img/card-back.svg`

**Interfaces:**
- Consumes: `interaction.phase` from Task 1
- Produces: `deckRoot`, `setDeckVisualState(phase)`, `renderGuidance(phase)`, and a visible `#interaction-guidance`

- [ ] **Step 1: Add a failing static contract test**

Append to `tests/interaction-state.test.mjs`:

```js
import { readFile } from "node:fs/promises";

test("page exposes central altar guidance and local deck fallback", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="interaction-guidance"/);
  assert.match(html, /function setDeckVisualState/);
  assert.match(html, /tarot_img\/card-back\.svg/);
});
```

- [ ] **Step 2: Run tests and verify the new test fails**

Run: `node --test tests/interaction-state.test.mjs`  
Expected: the first 3 tests pass and the page contract test fails.

- [ ] **Step 3: Add the guidance layer**

Add `#interaction-guidance` above `#history-panel` with these phase messages:

```js
const GUIDANCE_COPY = {
  IDLE: "将手移向命运牌堆",
  AIMING: "捏合抓取一张",
  DRAGGING: "将牌拖入中央揭示区",
  READY_TO_CONFIRM: "握拳确认揭示",
  REVEALED: "命运之牌已经揭示",
};
```

The guidance must be centered, use gold text, and never intercept pointer events.

- [ ] **Step 4: Replace the single dark deck mesh with a layered altar**

Create `tarot_img/card-back.svg` with a dark-purple background, double gold border, and central eight-point star. Create `deckRoot` as a `THREE.Group` containing five thin card meshes. Offset each layer by `0.035` on Y and Z, use a gold emissive edge material, and load the local `tarot_img/card-back.svg` texture. Add a procedural canvas-texture fallback with the same visual motif so texture failure never makes the deck disappear.

Implement:

```js
function setDeckVisualState(phase) {
  const active = phase === "AIMING";
  deckRoot.position.y = active ? -0.55 : -0.7;
  deckGlow.material.opacity = active ? 0.75 : 0.35;
  deckRoot.scale.setScalar(active ? 1.08 : 1);
}
```

Place the altar at `(0, -0.7, 0)` and attach `{ isDeck: true }` to every raycastable layer.

- [ ] **Step 5: Add the reveal zone**

Add a translucent rounded plane behind the held card target, hidden in `IDLE` and `AIMING`, visible in `DRAGGING` and `READY_TO_CONFIRM`, and brighter in `READY_TO_CONFIRM`. Its hit area must be independent from its material opacity.

- [ ] **Step 6: Run tests**

Run: `node --test tests/interaction-state.test.mjs`  
Expected: all 4 tests pass.

- [ ] **Step 7: Commit**

```powershell
git add -- index.html tarot_img/card-back.svg tests/interaction-state.test.mjs
git commit -m "feat: add central altar deck guidance"
```

### Task 3: Connect Gesture and Mouse Input to the Shared Flow

**Files:**
- Modify: `index.html`
- Modify: `tests/interaction-state.test.mjs`

**Interfaces:**
- Consumes: `transitionInteraction`, raycast results, `STATE.gesture`, and mouse button state
- Produces: `dispatchInteraction(event)`, synchronized guidance/deck/reveal visuals, and confirmation only from `READY_TO_CONFIRM`

- [ ] **Step 1: Add a failing integration contract test**

Append:

```js
test("page routes input through the interaction reducer", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /function dispatchInteraction/);
  assert.match(html, /READY_TO_CONFIRM/);
  assert.match(html, /transitionInteraction/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/interaction-state.test.mjs`  
Expected: the new integration contract test fails.

- [ ] **Step 3: Import and initialize the reducer**

At the beginning of the module script:

```js
import {
  createInteractionState,
  transitionInteraction,
} from "./src/interaction-state.mjs";

let interaction = createInteractionState();

function dispatchInteraction(event) {
  interaction = transitionInteraction(interaction, event);
  renderGuidance(interaction.phase);
  setDeckVisualState(interaction.phase);
  setRevealZoneVisualState(interaction.phase);
}
```

- [ ] **Step 4: Drive aiming from raycast state**

Track whether the pointer currently hits a deck layer. Dispatch `POINTER_ENTER_DECK` only on the false-to-true edge and `POINTER_LEAVE_DECK` only on the true-to-false edge. Do not dispatch continuously every animation frame.

- [ ] **Step 5: Drive grab, reveal-zone entry, and confirmation**

- PINCH or mouse-down may dispatch `GRAB` only during `AIMING`.
- Creating the held card must happen only when the reducer reaches `DRAGGING`.
- Card position inside the reveal-zone bounds dispatches `ENTER_REVEAL_ZONE`; leaving dispatches `LEAVE_REVEAL_ZONE`.
- FIST may dispatch `CONFIRM` only during `READY_TO_CONFIRM`.
- The existing reveal/result animation starts only after the reducer reaches `REVEALED`.

- [ ] **Step 6: Remove the conflicting fist-to-ash behavior**

Keep the ash visual available only from an explicit result action. The gesture loop must not call `triggerAshEffect()` directly from FIST.

- [ ] **Step 7: Run tests**

Run: `node --test tests/interaction-state.test.mjs`  
Expected: all 5 tests pass.

- [ ] **Step 8: Commit**

```powershell
git add -- index.html tests/interaction-state.test.mjs
git commit -m "feat: connect inputs to altar draw flow"
```

### Task 4: Browser Smoke Verification

**Files:**
- Modify: `README.md` only if the run instructions are no longer accurate

**Interfaces:**
- Consumes: the completed local app
- Produces: verified runnable MVP at `http://localhost:8080`

- [ ] **Step 1: Run automated tests**

Run: `node --test tests/interaction-state.test.mjs`  
Expected: all 5 tests pass with zero failures.

- [ ] **Step 2: Start the local server**

Run: `python -m http.server 8080 --bind 127.0.0.1`  
Expected: the server listens on `127.0.0.1:8080`.

- [ ] **Step 3: Verify page and local assets**

Run:

```powershell
$page = Invoke-WebRequest http://localhost:8080/ -UseBasicParsing
$module = Invoke-WebRequest http://localhost:8080/src/interaction-state.mjs -UseBasicParsing
if ($page.StatusCode -ne 200 -or $module.StatusCode -ne 200) { throw "Smoke test failed" }
```

Expected: both requests return HTTP 200.

- [ ] **Step 4: Manually verify mouse fallback**

Open `http://localhost:8080`, switch to mouse mode, and confirm:

1. The layered gold-purple deck is obvious without instructions.
2. Hovering the deck raises it and changes the prompt.
3. Mouse-down on the deck draws exactly one card.
4. Dragging into the reveal zone changes the prompt.
5. Confirmation reveals the card and does not trigger ash.
6. The remaining count decreases exactly once.

- [ ] **Step 5: Verify responsive layout**

Check viewport widths 1440px, 768px, and 390px. Expected: the deck, prompt, status, and held card remain visible without overlap.

- [ ] **Step 6: Commit any run-instruction correction**

If README changes were required:

```powershell
git add -- README.md
git commit -m "docs: update local run instructions"
```

If README remains accurate, do not create an empty commit.

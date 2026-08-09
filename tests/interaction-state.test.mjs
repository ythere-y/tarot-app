import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as interactionState from "../src/interaction-state.mjs";

const {
  createInteractionState,
  transitionInteraction,
  isPointInsideRevealZone,
  createInputEdgeState,
  resetInputEdgeState,
  updateInputEdgeState,
} = interactionState;

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

test("rejects a reveal-zone point with valid x/y but distant z", () => {
  assert.equal(
    isPointInsideRevealZone(
      { x: 0.2, y: -0.1, z: -7.7 },
      { halfWidth: 1, halfHeight: 1, halfDepth: 0.5 },
    ),
    false,
  );
});

test("accepts a reveal-zone point within all three bounds", () => {
  assert.equal(
    isPointInsideRevealZone(
      { x: 0.2, y: -0.1, z: 0.3 },
      { halfWidth: 1, halfHeight: 1, halfDepth: 0.5 },
    ),
    true,
  );
});

test("rejects a reveal-zone point outside any boundary", () => {
  assert.equal(
    isPointInsideRevealZone(
      { x: 1.01, y: 0, z: 0 },
      { halfWidth: 1, halfHeight: 1, halfDepth: 0.5 },
    ),
    false,
  );
});

test("reset clears every input edge", () => {
  let inputEdges = createInputEdgeState();
  for (const edgeName of [
    "pointerOverDeck",
    "heldCardInRevealZone",
    "grabActive",
    "fistActive",
  ]) {
    inputEdges = updateInputEdgeState(inputEdges, edgeName, true).state;
  }

  assert.deepEqual(resetInputEdgeState(inputEdges), createInputEdgeState());
});

test("recognizes a grab rising edge after reset", () => {
  let inputEdges = createInputEdgeState();
  inputEdges = updateInputEdgeState(inputEdges, "grabActive", true).state;
  inputEdges = resetInputEdgeState(inputEdges);

  const nextGrab = updateInputEdgeState(inputEdges, "grabActive", true);
  assert.equal(nextGrab.rising, true);
  assert.equal(updateInputEdgeState(nextGrab.state, "grabActive", true).rising, false);
});

test("recognizes a fist rising edge after reset", () => {
  let inputEdges = createInputEdgeState();
  inputEdges = updateInputEdgeState(inputEdges, "fistActive", true).state;
  inputEdges = resetInputEdgeState(inputEdges);

  const nextFist = updateInputEdgeState(inputEdges, "fistActive", true);
  assert.equal(nextFist.rising, true);
  assert.equal(updateInputEdgeState(nextFist.state, "fistActive", true).rising, false);
});

test("page exposes central altar guidance and embedded deck fallback", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="interaction-guidance"/);
  assert.match(html, /function setDeckVisualState/);
  assert.match(html, /function createDeckFallbackTexture/);
  assert.match(html, /new THREE\.CanvasTexture/);
  assert.doesNotMatch(html, /tarot_img\/card-back\.svg/);
});

test("page raycasts nested central altar layers", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /cardGroup\.add\(deckRoot\)/);
  assert.match(html, /layer\.userData = \{ isDeck: true \}/);
  assert.match(html, /raycaster\.intersectObjects\(cardGroup\.children,\s*true\)/);
});

test("page renders every visual from one phase entry point", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(
    html,
    /function renderInteractionPhase\(phase\) \{\s*renderGuidance\(phase\);\s*setDeckVisualState\(phase\);\s*setRevealZoneVisualState\(phase\);\s*\}/,
  );
  assert.match(html, /renderInteractionPhase\("IDLE"\)/);
});

test("page creates held cards at the central altar", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /deckRoot\.getWorldPosition\(new THREE\.Vector3\(\)\)/);
  assert.match(html, /mesh\.position\.copy\(deckWorldPosition\)/);
});

test("page routes input through the interaction reducer", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /function dispatchInteraction/);
  assert.match(html, /READY_TO_CONFIRM/);
  assert.match(html, /transitionInteraction/);
});

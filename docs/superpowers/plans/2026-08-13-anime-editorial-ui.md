# Anime.js Editorial UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Ether Tarot's DOM interface into the approved restrained oracle-editorial design with Anime.js motion while preserving all Three.js and draw behavior.

**Architecture:** Serve one allow-listed Anime.js ESM file through the existing Node server. Add a dependency-injected DOM-only motion controller, then connect it to explicit UI state transitions in `index.html` while preserving every existing business-critical ID and Three.js state mutation.

**Tech Stack:** HTML/CSS, JavaScript ES modules, Anime.js 4, Node.js built-in test runner

## Global Constraints

- Do not change Three.js rendering, gesture recognition, card data, or draw rules.
- Load Anime.js locally without exposing `node_modules`.
- Respect `prefers-reduced-motion: reduce` and degrade safely when elements or animation APIs are missing.
- Animate primarily `transform`, `opacity`, and CSS variables.
- Keep desktop and narrow-screen controls clear of the central card interaction area.

---

### Task 1: Allow-listed Anime.js asset

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server.mjs`
- Modify: `tests/server/http-server.test.mjs`

**Interfaces:**
- Consumes: installed `animejs` ESM distribution.
- Produces: `GET /vendor/anime.esm.js` with JavaScript content; all other `/vendor/*` paths return 404.

- [ ] Add a failing HTTP test that requests the allow-listed module and a forbidden sibling path.
- [ ] Run the server test and confirm the allowed request fails before implementation.
- [ ] Install Anime.js and add the single-file static mapping with path containment checks.
- [ ] Run the server test and confirm both allow and deny behavior pass.

### Task 2: DOM-only motion controller

**Files:**
- Create: `src/client/ui-motion.js`
- Create: `tests/client/ui-motion.test.mjs`

**Interfaces:**
- Consumes: `{ animate, createTimeline, stagger }`, a root with `querySelector(All)`, and a reduced-motion boolean.
- Produces: `createUiMotion({ anime, root, reducedMotion })` returning `intro`, `updateStatus`, `focusReading`, `releaseReading`, `revealResult`, `revealHistory`, `setAiState`, and `destroy`.

- [ ] Write failing behavior tests using small real fake elements and a recording animation adapter.
- [ ] Confirm failure because the module is absent.
- [ ] Implement cancellation per target, ordered result timeline, direct final-state reduced-motion behavior, missing-element tolerance, and destroy cleanup.
- [ ] Run the focused tests and confirm all controller behavior passes.

### Task 3: Editorial layout and state integration

**Files:**
- Modify: `index.html`
- Modify: `tests/smoke/app-smoke.test.mjs`

**Interfaces:**
- Consumes: `createUiMotion()` and existing UI events.
- Produces: editorial hero/control/status/result/history DOM with all legacy IDs retained and motion calls at loading, topic, deck, gesture, reading, result, and history state changes.

- [ ] Extend the smoke test with semantic landmarks, editorial copy, local Anime.js import, motion module import, and reduced-motion CSS expectations.
- [ ] Confirm the smoke test fails against the old page.
- [ ] Replace the inline visual system and regroup DOM while retaining required IDs.
- [ ] Wire motion calls into existing state changes without moving Three.js logic.
- [ ] Run focused client/smoke tests, then the complete `npm test` suite.
- [ ] Start the local server and inspect desktop plus narrow screenshots; adjust only CSS/layout until controls, result, and history avoid the central card stage.

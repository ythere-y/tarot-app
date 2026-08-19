# Corner Layout and Card Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore local card artwork and place archive, controls, guide, and single-line branding in the requested corners.

**Architecture:** Keep the single-page structure and existing Three.js texture pipeline. Add the source JPEG assets to the branch, correct URL construction at the data boundary, and express desktop/mobile placement solely in the main stylesheet.

**Tech Stack:** HTML/CSS, Three.js, Node.js static server, Node test runner

## Global Constraints

- Use the 79 existing images in `D:\VS_code\project\tarot-app\tarot_img`.
- Preserve the current black-gold visual system and card texture fallback.
- Do not obstruct the central shuffle and draw area.

---

### Task 1: Card artwork delivery

**Files:**
- Modify: `index.html`
- Add: `tarot_img/*.jpg`
- Test: `tests/smoke/app-smoke.test.mjs`

- [ ] Add a smoke test that requests `/tarot_img/00.jpg` and checks for a JPEG response, then verify it fails because the worktree has no image files.
- [ ] Copy the 79 source images into `tarot_img` and change both major and minor data URLs to root-relative `/tarot_img/...` values.
- [ ] Run the smoke test and confirm it passes.

### Task 2: Four-corner responsive layout

**Files:**
- Modify: `index.html`
- Test: `tests/smoke/app-smoke.test.mjs`

- [ ] Add failing layout assertions for bottom-left archive, bottom-right controls, top-right guide, and a non-wrapping `ETHER TAROT` heading.
- [ ] Update markup and CSS with fixed corner positioning plus narrow-screen size constraints.
- [ ] Run the smoke test, full suite, and a browser draw verification.

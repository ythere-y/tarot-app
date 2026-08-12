# Minor Arcana Element Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 56 张小阿尔卡纳牌加入可测试、受性能预算约束的火、水、风、土四元素粒子特效，并保留大牌独立特效扩展口。

**Architecture:** 纯函数模块负责牌组到元素、正逆位和性能档位参数映射；生命周期控制器只管理状态与渲染器实例；Three.js 渲染器负责 GPU 粒子表现。页面仅在抽牌、确认、动画循环和清理节点调用统一控制器，避免把花色分支散落到交互代码。

**Tech Stack:** 原生 ES modules、Three.js、Node.js `node:test`、现有单页应用。

## Global Constraints

- 仅覆盖 56 张小牌；22 张大牌返回 `null`，本轮不产生元素特效。
- 权杖=火、圣杯=水、宝剑=风、金币=土。
- 正位表现向外、向上、稳定；逆位保持同一元素但向内、向下、扰动更强。
- 粒子预算：standard=800、low=250、reduced=80；同一时刻仅允许一个活动实例。
- 色板：火 `#FFE29A/#FF8A2A/#D9381E`，水 `#D9FAFF/#42C8E8/#2464C7`，风 `#F3F7FF/#9EDCFF/#A8A3C7`，土 `#D9A83E/#6F9B52/#76513A`。

---

### Task 1: 小牌元素与表现参数

**Files:**
- Create: `src/client/effects/minor-effect-profile.js`
- Create: `tests/client/minor-effect-profile.test.mjs`
- Modify: `index.html:157-195`

**Interfaces:**
- Produces: `getMinorElement(card): 'fire'|'water'|'air'|'earth'|null`
- Produces: `createMinorEffectProfile(card, orientation, tier): object|null`
- Produces: `getParticleBudget(tier): 800|250|80`

- [ ] **Step 1: Write failing mapping and profile tests** covering all four suits, majors, unknown suits, upright/reversed direction and all budgets.
- [ ] **Step 2: Run `node --test tests/client/minor-effect-profile.test.mjs`** and verify failure is caused by the missing module.
- [ ] **Step 3: Implement immutable element definitions and validated profile creation**, including `flow`, `verticalDirection`, `turbulence`, `palette`, and `particleCount`.
- [ ] **Step 4: Add `suit` to minor-card data in `index.html`**, leaving major data unchanged.
- [ ] **Step 5: Run the focused test and `npm test`**, expecting all tests to pass.
- [ ] **Step 6: Commit** with `feat: add minor arcana effect profiles`.

### Task 2: 特效生命周期控制器

**Files:**
- Create: `src/client/effects/minor-effect-controller.js`
- Create: `tests/client/minor-effect-controller.test.mjs`

**Interfaces:**
- Consumes: `createMinorEffectProfile(card, orientation, tier)`
- Produces: `createMinorEffectController({ rendererFactory, tier })`
- Controller methods: `prepare(card, orientation, anchor)`, `reveal()`, `settle()`, `update(dt)`, `dispose()`, `getState()`.
- Renderer contract: `{ reveal(), settle(), update(dt), dispose() }`.

- [ ] **Step 1: Write failing lifecycle tests** for idle→prepared→revealing→settled→disposed, major no-op behavior, invalid transition safety, and replacement disposal.
- [ ] **Step 2: Run `node --test tests/client/minor-effect-controller.test.mjs`** and verify the missing-module failure.
- [ ] **Step 3: Implement the controller** with one active renderer, explicit states, idempotent disposal, and forwarded updates only while active.
- [ ] **Step 4: Run focused and full tests**, expecting all tests to pass.
- [ ] **Step 5: Commit** with `feat: add elemental effect lifecycle`.

### Task 3: Four-element Three.js renderer

**Files:**
- Create: `src/client/effects/three-element-renderer.js`
- Create: `tests/client/three-element-renderer.test.mjs`

**Interfaces:**
- Produces: `createThreeElementRenderer({ THREE, scene, profile, anchor })` implementing the renderer contract.
- Renderer diagnostic: `getSnapshot()` returns phase, particle count and disposed status for deterministic tests.

- [ ] **Step 1: Write failing renderer contract tests** using a minimal Three-compatible adapter to verify particle count, phase changes, position updates, and geometry/material disposal.
- [ ] **Step 2: Run `node --test tests/client/three-element-renderer.test.mjs`** and verify failure is caused by the missing module.
- [ ] **Step 3: Implement one Points-based renderer** with element-specific motion equations: flame lift/flicker, water orbit/ripple, air spiral/streak, earth fall/orbit; reversed profiles invert vertical/radial flow and increase turbulence.
- [ ] **Step 4: Implement reveal and settle envelopes** through uniforms/opacity/size and remove resources on dispose.
- [ ] **Step 5: Run focused and full tests**, expecting all tests to pass without resource warnings.
- [ ] **Step 6: Commit** with `feat: render four minor arcana elements`.

### Task 4: 页面接入与回归验证

**Files:**
- Modify: `index.html:140-210,363-490,685-710`
- Modify: `tests/smoke/app-smoke.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: controller and Three renderer factory.
- Integration events: card creation→`prepare`, confirmation→`reveal` then `settle`, animation→`update(dt)`, replacement/reset→`dispose`.

- [ ] **Step 1: Add failing smoke assertions** for module imports, controller creation, lifecycle hooks, and suit metadata.
- [ ] **Step 2: Run `node --test tests/smoke/app-smoke.test.mjs`** and verify the new integration assertions fail.
- [ ] **Step 3: Import and instantiate the controller** using the existing Three.js scene and a capability-derived tier (`prefers-reduced-motion` first, otherwise hardware concurrency/device memory).
- [ ] **Step 4: Wire lifecycle calls** into held-card creation, confirmation, animation delta updates and cleanup; keep existing ash transition while ensuring element resources survive long enough for the reading reveal and are disposed deterministically.
- [ ] **Step 5: Document element mappings, reversed behavior, budgets and major-card deferral** in README.
- [ ] **Step 6: Run `npm test` and a local HTTP smoke request**, expecting a zero exit code and HTTP 200.
- [ ] **Step 7: Commit** with `feat: integrate minor arcana elemental effects`.

### Task 5: Final visual and resource validation

**Files:**
- Modify only files proven necessary by failing validation.

**Interfaces:**
- Validates all interfaces from Tasks 1–4 without introducing new public APIs.

- [ ] **Step 1: Run `npm test`** and record total passing tests.
- [ ] **Step 2: Start the server on an available localhost port** and verify `index.html` plus all three effect modules return HTTP 200.
- [ ] **Step 3: Exercise representative cards** (one upright and one reversed from each suit, plus one major) and confirm correct element, reversed motion, major no-op and single active instance.
- [ ] **Step 4: Inspect cleanup after repeated draws** and verify old Points objects are removed and their geometry/material disposed.
- [ ] **Step 5: Commit any validation-driven fix** with a narrowly scoped message; otherwise leave the verified implementation commits unchanged.

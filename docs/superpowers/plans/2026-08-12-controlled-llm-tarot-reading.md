# Controlled LLM Tarot Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a directly runnable, server-proxied OpenAI reading that generates bounded Chinese reflection text from one drawn card and one of five fixed topics.

**Architecture:** A dependency-light Node HTTP server owns static serving and `POST /api/reading`; a focused reading service validates all input/output and calls the OpenAI Responses API with JSON Schema structured output. The browser keeps the existing draw mechanics, adds fixed-topic controls, and calls the same-origin endpoint with cancellation and stale-response protection.

**Tech Stack:** Node.js 20+, native `http`/`fetch`/`node:test`, OpenAI Responses API, existing HTML/CSS/ES modules, Three.js and MediaPipe browser scripts.

## Global Constraints

- Accept only topics `general`, `love`, `career`, `wealth`, and `growth`; no user-authored question or prompt.
- Accept only orientations `upright` and `reversed`.
- Keep `OPENAI_API_KEY` server-side; default `OPENAI_MODEL` to `gpt-5.4-nano` and `PORT` to `8080`.
- Preserve local standard meaning as the source of truth and fallback.
- Return only `headline`, `reading`, `action`, and `disclaimer`; validate every field and render as text.
- Do not store readings or requests.
- Generated text is entertainment and self-reflection, never deterministic prediction or professional advice.

---

### Task 1: Reading Service Boundary

**Files:**
- Create: `src/server/reading-service.mjs`
- Test: `tests/server/reading-service.test.mjs`

**Interfaces:**
- Produces: `validateReadingRequest(value)`, `validateReadingOutput(value)`, `createReadingService({ apiKey, model, fetchImpl, timeoutMs })`.
- `createReadingService(...).generate(request, { signal })` resolves to the four-field reading object or throws a typed safe error.

- [ ] **Step 1: Write failing tests** for valid five-topic/two-orientation requests; unknown keys/enums; empty/oversize fields; valid and invalid output; missing key; OpenAI success, timeout, and malformed response using an injected `fetchImpl`.
- [ ] **Step 2: Run `node --test tests/server/reading-service.test.mjs`** and confirm failure because the module does not exist.
- [ ] **Step 3: Implement strict validation and generation.** Build a fixed developer instruction, send card facts as JSON user content, request strict JSON Schema output through `text.format`, use an abort timeout, extract `response.output_text` with output-item fallback, and map upstream details to stable `ReadingServiceError` codes.
- [ ] **Step 4: Re-run the focused test** and confirm all cases pass.
- [ ] **Step 5: Commit** `src/server/reading-service.mjs` and its test as `feat: add controlled tarot reading service`.

### Task 2: Secure HTTP and Static Server

**Files:**
- Create: `src/server/rate-limit.mjs`
- Create: `server.mjs`
- Test: `tests/server/http-server.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Consumes: `createReadingService` and `validateReadingRequest` from Task 1.
- Produces: `createAppServer(options)` returning a Node server; CLI entry starts on configured port.

- [ ] **Step 1: Write failing integration tests** using an ephemeral port for static root, successful JSON API, bad method, bad content type, malformed/oversize JSON, traversal, missing-key degradation, safe upstream errors, security headers, and per-IP rate limiting.
- [ ] **Step 2: Run `node --test tests/server/http-server.test.mjs`** and confirm missing server modules fail.
- [ ] **Step 3: Implement the server.** Resolve static paths under the repository root, stream binary assets, cap bodies at 8 KiB, require JSON POST, return consistent `{ error: { code, message } }`, add CSP/nosniff/referrer headers, and rate-limit `/api/reading` in memory.
- [ ] **Step 4: Update project commands and configuration.** Set `start` to `node server.mjs`, add `test` as `node --test`, ignore `.env`, and provide the three documented environment variables in `.env.example`.
- [ ] **Step 5: Run focused and full tests** and confirm they pass.
- [ ] **Step 6: Commit** server/config changes as `feat: serve protected AI reading endpoint`.

### Task 3: Fixed-Topic Reading UI

**Files:**
- Create: `src/client/reading.js`
- Test: `tests/client/reading.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Produces: `READING_TOPICS`, `createReadingController({ fetchImpl, view })`; controller methods `setTopic(topic)`, `requestReading(card)`, and `cancel()`.
- `card` is `{ cardName, orientation, standardMeaning }`; `view` exposes `showLoading`, `showSuccess`, and `showError`.

- [ ] **Step 1: Write failing controller tests** for default/general and five topics, exact request body, loading/success/failure states, one in-flight request, abort on new reading, and ignored stale response.
- [ ] **Step 2: Run `node --test tests/client/reading.test.mjs`** and confirm module-not-found failure.
- [ ] **Step 3: Implement the controller** without DOM dependencies so Node tests can inject fetch and view doubles.
- [ ] **Step 4: Add UI and integration.** Add five accessible topic buttons, loading/result/error regions, retry button, entertainment label, responsive styling, text-only rendering, and call `requestReading` once from `confirmResult()` after standard meaning is visible.
- [ ] **Step 5: Run controller and full tests** and confirm pass.
- [ ] **Step 6: Commit** UI/controller changes as `feat: show topic-based AI tarot readings`.

### Task 4: Documentation and End-to-End Verification

**Files:**
- Modify: `README.md`
- Test: `tests/smoke/app-smoke.test.mjs`

**Interfaces:**
- Consumes: the commands and environment variables established in Tasks 1–3.
- Produces: a reproducible local setup and smoke acceptance suite.

- [ ] **Step 1: Add a failing smoke test** that starts `server.mjs` with a stub reading service, loads `/`, verifies the five topic labels and AI result elements, then calls `/api/reading` and validates the four response fields.
- [ ] **Step 2: Run the smoke test** and confirm any missing UI/docs contract fails.
- [ ] **Step 3: Update README** with Node 20+, `npm install`, PowerShell environment-variable setup, `npm start`, `npm test`, model override, fallback behavior, privacy boundary, and entertainment disclaimer.
- [ ] **Step 4: Run `npm test`** and confirm the complete suite passes.
- [ ] **Step 5: Start with no key** and verify `/` returns HTML while `/api/reading` returns the documented safe configuration error.
- [ ] **Step 6: If `OPENAI_API_KEY` is present, make one live reading request; otherwise report that live generation requires the user’s key without exposing or fabricating one.**
- [ ] **Step 7: Run `git diff --check` and `git status --short`**, review only intended changes, and commit as `docs: document controlled AI readings`.


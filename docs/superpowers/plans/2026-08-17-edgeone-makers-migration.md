# EdgeOne Makers Minimal Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing tarot game run on EdgeOne Makers with a single `/api/reading` Cloud Function that calls DeepSeek directly.

**Architecture:** Keep the current game as static files and add one Node.js Makers function at `cloud-functions/api/reading.js`. Reuse the existing reading service, keep the legacy Node server for non-Makers local use, and replace its Anime.js vendor route in the browser with a pinned CDN import.

**Tech Stack:** Static HTML/JavaScript, Node.js 20 Cloud Functions, DeepSeek OpenAI-compatible API, Node test runner, EdgeOne Makers CLI.

## Global Constraints

- Keep `deepseek-v4-pro` and call `https://api.deepseek.com/chat/completions` directly.
- Send `thinking: { type: "disabled" }`, omit `reasoning_effort`, and set `max_tokens: 500`.
- Read `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` from runtime environment variables; never commit the real key or `.env`.
- Do not add KV, rate limiting, a database, Express, middleware, or unrelated refactors.
- Preserve the existing game UI, gestures, card assets, and legacy `server.mjs` workflow.
- Preview only through `edgeone makers dev` at `http://127.0.0.1:8088/`; never use `file://` or a substitute static server.
- Preserve the user's existing uncommitted `.gitignore` changes and do not include them in task commits.

---

### Task 1: Use a bounded non-thinking DeepSeek request

**Files:**
- Modify: `tests/server/reading-service.test.mjs`
- Modify: `src/server/reading-service.mjs`

**Interfaces:**
- Consumes: `createReadingService({ apiKey, model, fetchImpl, timeoutMs })`.
- Produces: the unchanged `service.generate(request)` API with corrected DeepSeek request parameters.

- [ ] **Step 1: Change the request-contract test to require non-thinking mode**

Rename the DeepSeek request test to `calls DeepSeek V4 Pro without thinking and parses JSON output`. Assert the exact new parameters:

```js
assert.deepEqual(requestBody.thinking, { type: 'disabled' });
assert.equal('reasoning_effort' in requestBody, false);
assert.equal(requestBody.max_tokens, 500);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/server/reading-service.test.mjs`

Expected: FAIL because the service still sends `thinking.enabled`, `reasoning_effort: high`, and `max_tokens: 350`.

- [ ] **Step 3: Apply the minimal request parameter change**

In `createReadingService`, send:

```js
thinking: { type: 'disabled' },
response_format: { type: 'json_object' },
max_tokens: 500,
```

Remove the `reasoning_effort` property.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/server/reading-service.test.mjs`

Expected: all reading-service tests PASS.

- [ ] **Step 5: Commit the parameter change**

```bash
git add src/server/reading-service.mjs tests/server/reading-service.test.mjs
git commit -m "fix: use bounded DeepSeek non-thinking output"
```

### Task 2: Add the Makers reading Cloud Function

**Files:**
- Create: `cloud-functions/api/reading.js`
- Create: `tests/server/makers-reading-function.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createReadingService` and `ReadingServiceError` from `src/server/reading-service.mjs`.
- Produces: `onRequestPost(context) -> Promise<Response>` at `/api/reading`.

- [ ] **Step 1: Write a failing Cloud Function test**

The test imports `onRequestPost`, replaces `globalThis.fetch` for the success case, and calls the handler with a Makers-shaped context:

```js
const context = {
  request: new Request('https://example.test/api/reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validRequest),
  }),
  env: { DEEPSEEK_API_KEY: 'test-key', DEEPSEEK_MODEL: 'deepseek-v4-pro' },
};

const response = await onRequestPost(context);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), validOutput);
```

Add a second test with `env: {}` and assert status `503` plus error code `AI_NOT_CONFIGURED`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/server/makers-reading-function.test.mjs`

Expected: FAIL with module-not-found for `cloud-functions/api/reading.js`.

- [ ] **Step 3: Implement the minimal Makers handler**

Create `cloud-functions/api/reading.js` with:

```js
import { createReadingService, ReadingServiceError } from '../../src/server/reading-service.mjs';

export async function onRequestPost({ request, env = {} }) {
  try {
    const service = createReadingService({
      apiKey: env.DEEPSEEK_API_KEY,
      model: env.DEEPSEEK_MODEL,
    });
    return Response.json(await service.generate(await request.json()));
  } catch (error) {
    const safe = error instanceof ReadingServiceError
      ? error
      : new ReadingServiceError('INTERNAL_ERROR', '服务暂不可用');
    return Response.json({
      error: { code: safe.code, message: safe.message.replace(/^\w+:\s*/, '') },
    }, { status: safe.status });
  }
}
```

Add `node --check cloud-functions/api/reading.js` to the existing `build` script.

- [ ] **Step 4: Run the Cloud Function test and full suite**

Run: `node --test tests/server/makers-reading-function.test.mjs`

Expected: 2 tests PASS.

Run: `npm test`

Expected: all active tests PASS.

- [ ] **Step 5: Commit the Makers function**

```bash
git add cloud-functions/api/reading.js tests/server/makers-reading-function.test.mjs package.json
git commit -m "feat: add Makers DeepSeek reading function"
```

### Task 3: Make browser assets deployable as static files

**Files:**
- Modify: `tests/smoke/app-smoke.test.mjs`
- Modify: `index.html`
- Modify: `README.md`

**Interfaces:**
- Consumes: the existing static game and `/api/reading` request contract.
- Produces: a browser entry that no longer depends on the legacy server's `/vendor/anime.esm.js` route.

- [ ] **Step 1: Add a failing static-import assertion**

In the smoke test, assert:

```js
assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/animejs@4\.5\.0\/\+esm/);
assert.doesNotMatch(html, /from ['"]\/vendor\/anime\.esm\.js['"]/);
```

- [ ] **Step 2: Run the smoke test and verify RED**

Run: `node --test tests/smoke/app-smoke.test.mjs`

Expected: FAIL because `index.html` still imports `/vendor/anime.esm.js`.

- [ ] **Step 3: Replace the browser import and document Makers development**

Change the Anime.js import in `index.html` to:

```js
import { animate as animeAnimate, createTimeline, stagger } from 'https://cdn.jsdelivr.net/npm/animejs@4.5.0/+esm';
```

Update the README to state that DeepSeek uses non-thinking mode with `max_tokens: 500`, and add this Makers command:

```bash
PAGES_SOURCE=skills edgeone makers dev --name tarot-app --skip-env-sync
```

Document `http://127.0.0.1:8088/` as the Makers preview URL and state that production secrets belong in Makers environment variables.

- [ ] **Step 4: Run smoke, build, and full tests**

Run: `node --test tests/smoke/app-smoke.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `npm test`

Expected: all active tests PASS.

- [ ] **Step 5: Commit the static deployment changes**

```bash
git add index.html README.md tests/smoke/app-smoke.test.mjs
git commit -m "docs: prepare static game for Makers runtime"
```

### Task 4: Verify the Makers runtime and real DeepSeek path

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: the static app, `/api/reading` Cloud Function, local `.env`, and EdgeOne Makers CLI.
- Produces: verification evidence only; this task does not deploy production.

- [ ] **Step 1: Verify CLI and repository safety**

Run: `edgeone -v`

Expected: version `1.6.7` or newer.

Run: `git check-ignore -v .env` and `git ls-files --error-unmatch .env`

Expected: `.env` is ignored and is not tracked.

- [ ] **Step 2: Run the complete automated verification**

Run: `npm test`

Expected: all active tests PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Start the Makers development runtime**

Run in the background:

```bash
PAGES_SOURCE=skills edgeone makers dev --name tarot-app --skip-env-sync
```

Expected: the Makers server listens on port `8088` without an interactive prompt.

- [ ] **Step 4: Preview and exercise the application over HTTP**

Open `http://127.0.0.1:8088/` through the environment's browser preview tool. Verify that the page loads over HTTP, static card assets resolve, and a reading request reaches `/api/reading`.

- [ ] **Step 5: Run one real DeepSeek request without exposing secrets**

Use the local `.env` and call the Makers `/api/reading` endpoint with a fixed test card. Record only HTTP status, returned field names, and elapsed time. Do not print the key or complete generated text.

- [ ] **Step 6: Final repository check**

Run: `git status --short --branch`

Expected: only the user's pre-existing `.gitignore` modification remains; no `.env`, build output, auth file, or generated secret is tracked.

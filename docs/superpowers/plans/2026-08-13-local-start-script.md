# Local Start Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows PowerShell shortcut that reads `.env` `PORT`, terminates listeners on that port, and runs `npm start`.

**Architecture:** Keep the production entry point in one root-level PowerShell script. Exercise it through an integration test that creates an isolated temporary project with a fake `npm.cmd`, allowing port parsing, listener termination, and invocation behavior to be verified without affecting the real application.

**Tech Stack:** PowerShell 5.1+, Node.js built-in test runner, Windows TCP/process cmdlets

## Global Constraints

- Default to port `8090` when `.env` is absent or has no `PORT`.
- Accept whitespace, comments, and quoted numeric values in `.env`.
- Reject values outside `1..65535` before terminating processes.
- Terminate every unique process listening on the selected TCP port without confirmation.
- Run `npm start` in the project root and preserve its exit code.

---

### Task 1: Script integration behavior

**Files:**
- Create: `tests/scripts/start-local.test.mjs`
- Create: `start-local.ps1`
- Modify: `README.md`

**Interfaces:**
- Consumes: `.env` containing optional `PORT=<integer>` and the commands `node`, `npm`, `Get-NetTCPConnection`, and `Stop-Process`.
- Produces: `./start-local.ps1`, which starts the project in the current terminal and returns the `npm start` exit code.

- [ ] **Step 1: Write failing integration tests**

Create temporary project directories containing the script and a fake `npm.cmd`. Verify the default port, quoted/commented `PORT`, invalid-port rejection, termination of a real temporary listener, project-root working directory, and propagation of the fake npm exit code.

- [ ] **Step 2: Verify RED**

Run `node --test tests/scripts/start-local.test.mjs` and confirm failure because `start-local.ps1` does not exist.

- [ ] **Step 3: Implement the minimal script**

Resolve `$PSScriptRoot`, parse and validate `.env`, verify `node`/`npm`, terminate unique listener PIDs, wait up to five seconds for release, then execute `npm start` from the project root inside `try/finally` and return `$LASTEXITCODE`.

- [ ] **Step 4: Document usage**

Add PowerShell invocation, execution-policy fallback, automatic termination warning, `Ctrl+C` shutdown, and `.env` example to `README.md`.

- [ ] **Step 5: Verify GREEN and regression suite**

Run `node --test tests/scripts/start-local.test.mjs`, then `npm test`. Both commands must exit zero.

- [ ] **Step 6: Manual smoke verification**

Use an isolated temporary project and temporary TCP listener to confirm the listener is terminated and fake `npm start` is invoked; do not use port `8090`.

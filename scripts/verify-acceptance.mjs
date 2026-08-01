/* global document, fetch, HTMLCanvasElement, performance */

import console from 'node:console';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { chromium } from 'playwright-core';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const host = '127.0.0.1';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.task', 'application/octet-stream'],
  ['.wasm', 'application/wasm'],
]);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}

function requestPathFor(file) {
  return `/${relative(distRoot, file)
    .split(sep)
    .map(encodeURIComponent)
    .join('/')}`;
}

function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://localhost');
      const pathname = decodeURIComponent(requestUrl.pathname);
      const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = resolve(distRoot, relativePath);
      if (file !== distRoot && !file.startsWith(`${distRoot}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!(await stat(file)).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': contentTypes.get(extname(file)) ?? 'application/octet-stream',
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}

async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Acceptance server did not expose a TCP port');
  }
  return `http://${host}:${address.port}`;
}

async function closeServer(server) {
  await new Promise((resolveClose, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolveClose();
    });
  });
}

async function findChrome() {
  const configured = process.env.TAROT_CHROME_PATH;
  const candidates = [
    configured,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through documented platform defaults.
    }
  }
  throw new Error(
    'Chrome/Chromium was not found. Set TAROT_CHROME_PATH to its executable.',
  );
}

await access(resolve(distRoot, 'index.html'));
const files = await listFiles(distRoot);
const server = createStaticServer();
const origin = await listen(server);
let browser;

try {
  for (const path of ['/', ...files.map(requestPathFor)]) {
    const response = await fetch(new URL(path, origin));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${path}`);
    }
    await response.arrayBuffer();
  }

  browser = await chromium.launch({
    executablePath: await findChrome(),
    headless: true,
  });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const failures = [];
  page.on('requestfailed', (request) => {
    failures.push(`${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('pageerror', (error) => {
    failures.push(`page error: ${error.message}`);
  });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (type === 'webgl' || type === 'webgl2') {
        return null;
      }
      return original.call(this, type, ...args);
    };
  });

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('[data-ui="scene-host"]').waitFor();
  if (await page.locator('[data-ui="scene-host"]').getAttribute('data-renderer') !== '2d') {
    throw new Error('The forced WebGL failure did not activate the 2D fallback');
  }

  const drawControl = page.locator('[data-action="advance-draw"]');
  await drawControl.focus();
  await page.keyboard.press('Enter');
  await drawControl.getByText('放置到中央揭示区', { exact: true }).waitFor();
  await page.keyboard.press('Space');
  await drawControl.getByText('确认并翻开此牌', { exact: true }).waitFor();
  await page.keyboard.press('Enter');
  await drawControl.getByText('归档此牌并继续', { exact: true }).waitFor();
  await page.keyboard.press('Space');
  try {
    await page.waitForFunction(() => (
      document.querySelector('[data-ui="remaining"]')?.textContent
        ?.includes('余牌 77 / 78') === true
    ), undefined, { timeout: 5_000 });
  } catch {
    const state = await page.locator('body').evaluate(() => ({
      action: document.querySelector('[data-action="advance-draw"]')?.textContent?.trim(),
      phase: document.querySelector('[data-ui="phase"]')?.textContent?.trim(),
      remaining: document.querySelector('[data-ui="remaining"]')?.textContent?.trim(),
    }));
    throw new Error(`Keyboard archive did not finish: ${JSON.stringify(state)}`);
  }

  if (await page.locator('[data-ui="history-item"]').count() !== 1) {
    throw new Error('Keyboard smoke flow did not add exactly one history item');
  }
  const externalRequests = await page.evaluate((expectedOrigin) => (
    performance.getEntriesByType('resource')
      .map((entry) => new URL(entry.name).origin)
      .filter((resourceOrigin) => resourceOrigin !== expectedOrigin)
  ), origin);
  if (externalRequests.length > 0) {
    failures.push(`external resource origins: ${[...new Set(externalRequests)].join(', ')}`);
  }
  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  console.log(
    `Acceptance smoke passed: ${files.length} dist files returned HTTP 200; `
      + 'Chrome completed the keyboard 2D draw cycle.',
  );
} finally {
  await browser?.close();
  await closeServer(server);
}

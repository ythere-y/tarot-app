import assert from 'node:assert/strict';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const sourceScript = path.resolve('start-local.ps1');

async function fixture(envText = '') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tarot-start-'));
  await copyFile(sourceScript, path.join(root, 'start-local.ps1'));
  if (envText) await writeFile(path.join(root, '.env'), envText, 'utf8');
  await writeFile(path.join(root, 'package.json'), '{"scripts":{"start":"exit 0"}}', 'utf8');
  await writeFile(
    path.join(root, 'npm.cmd'),
    '@echo off\r\necho %CD%\r\necho %*\r\nexit /b 7\r\n',
    'utf8',
  );
  return root;
}

function runScript(root) {
  return spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'start-local.ps1')],
    {
      cwd: os.tmpdir(),
      encoding: 'utf8',
      env: { ...process.env, PATH: `${root};${process.env.PATH}` },
    },
  );
}

test('uses the default port and invokes npm start from the script directory', async () => {
  const root = await fixture();
  try {
    const wrapper = path.join(root, 'default-wrapper.ps1');
    await writeFile(wrapper, [
      'function Get-NetTCPConnection { @() }',
      `& '${path.join(root, 'start-local.ps1').replaceAll("'", "''")}'`,
      'exit $LASTEXITCODE',
    ].join('\r\n'), 'utf8');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapper], {
      cwd: os.tmpdir(), encoding: 'utf8', env: { ...process.env, PATH: `${root};${process.env.PATH}` },
    });
    assert.equal(result.status, 7);
    assert.match(result.stdout, /Using port 8090/);
    assert.match(result.stdout, new RegExp(root.replaceAll('\\', '\\\\'), 'i'));
    assert.match(result.stdout, /start/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reads a quoted PORT with an inline comment and terminates its listener', async () => {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  const listener = spawn(process.execPath, ['-e', `require('net').createServer().listen(${port}, '127.0.0.1'); setInterval(()=>{},1000)`], { stdio: 'ignore' });
  let root;
  try {
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const check = () => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => { socket.destroy(); resolve(); });
        socket.once('error', () => Date.now() < deadline ? setTimeout(check, 50) : reject(new Error('listener did not start')));
      };
      check();
    });
    root = await fixture(`PORT = "${port}" # integration test\r\n`);
    const result = runScript(root);
    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stdout, new RegExp(`Using port ${port}`));
    assert.match(result.stdout, new RegExp(`PID ${listener.pid}`));
    if (listener.exitCode === null) await once(listener, 'exit');
  } finally {
    if (listener.exitCode === null) listener.kill('SIGKILL');
    if (root) await rm(root, { recursive: true, force: true });
  }
});

test('rejects an invalid port before invoking npm', async () => {
  const root = await fixture('PORT=70000\r\n');
  try {
    const result = runScript(root);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Invalid PORT/);
    assert.doesNotMatch(result.stdout, /start/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const appPath = fileURLToPath(new URL('../src/app.mjs', import.meta.url));
const serverPath = fileURLToPath(new URL('../../../dist/server.js', import.meta.url));
const root = await mkdtemp(path.join(os.tmpdir(), 'praxis-linux-real-service-'));
const runtimeRoot = path.join(root, 'runtime');
const runtimeStatePath = path.join(runtimeRoot, 'praxis-control', 'service.json');
let service;
let gui;
let serviceSpawnError;

function capture(child) {
  const output = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output.stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output.stderr += chunk; });
  return output;
}

async function unusedPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  assert(address && typeof address === 'object');
  await new Promise((resolve) => probe.close(resolve));
  return address.port;
}

async function waitForRuntime(output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (serviceSpawnError) throw serviceSpawnError;
    if (service.exitCode !== null) {
      throw new Error(`Praxis service exited before readiness (${service.exitCode})\n${output.stdout}\n${output.stderr}`);
    }
    try {
      return JSON.parse(await readFile(runtimeStatePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await delay(100);
  }
  throw new Error(`Praxis service did not become ready\n${output.stdout}\n${output.stderr}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`process ${child.pid} did not exit within ${timeoutMs} ms`));
    }, timeoutMs);
    const onExit = (code) => { cleanup(); resolve(code); };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  try {
    await waitForExit(child, 3_000);
  } catch {
    child.kill('SIGKILL');
    await waitForExit(child, 3_000).catch(() => undefined);
  }
}

try {
  const port = await unusedPort();
  service = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      APP_HOST: '127.0.0.1',
      APP_PORT: String(port),
      PRAXIS_DATA_DIR: path.join(root, 'data'),
      XDG_RUNTIME_DIR: runtimeRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  service.once('error', (error) => { serviceSpawnError = error; });
  const serviceOutput = capture(service);
  const runtime = await waitForRuntime(serviceOutput);
  assert.equal(runtime.url, `http://127.0.0.1:${port}`);

  const metaResponse = await fetch(`${runtime.url}/api/meta`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(metaResponse.status, 200);
  assert.equal((await metaResponse.json()).backend, 'pglite');

  const hasDisplay = Boolean(process.env.DISPLAY);
  const command = hasDisplay ? 'dbus-run-session' : 'xvfb-run';
  const args = hasDisplay
    ? ['--', 'gjs', '-m', appPath, '--smoke-test-connected']
    : ['-a', 'dbus-run-session', '--', 'gjs', '-m', appPath, '--smoke-test-connected'];
  gui = spawn(command, args, {
    env: { ...process.env, XDG_RUNTIME_DIR: runtimeRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const guiOutput = capture(gui);
  const guiTimeout = setTimeout(() => gui.kill('SIGTERM'), 15_000);
  const guiExit = await waitForExit(gui, 18_000);
  clearTimeout(guiTimeout);
  assert.equal(guiExit, 0, `GTK real-service smoke failed\n${guiOutput.stdout}\n${guiOutput.stderr}`);
  assert.match(guiOutput.stdout, /PRAXIS_GUI_SMOKE_CONNECTED/);

  const shutdownResponse = await fetch(`${runtime.url}/api/system/shutdown`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: runtime.shutdownToken }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(shutdownResponse.status, 200);
  assert.equal(await waitForExit(service, 12_000), 0, serviceOutput.stderr);
  await assert.rejects(readFile(runtimeStatePath, 'utf8'), { code: 'ENOENT' });
  console.log('Linux GTK real PGlite service smoke: PASS');
} finally {
  await terminate(gui);
  await terminate(service);
  await rm(root, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appPath = fileURLToPath(new URL('../src/app.mjs', import.meta.url));
const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'praxis-linux-gui-'));
const requests = new Set();

const responses = {
  '/api/meta': { apiVersion: 1, rulesetVersion: 'linux-smoke', backend: 'pglite' },
  '/api/dashboard': {
    activeProjects: [],
    latestCheckin: { main_action: '验证 Linux 原生客户端' },
    awaitingReview: 2,
    reviewedLast7Days: 3,
    activeWip: 1,
    wipLimit: 3,
  },
  '/api/graph': { nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] },
};

const server = http.createServer((request, response) => {
  requests.add(request.url);
  const body = responses[request.url];
  if (!body) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ERROR', message: 'not found' }));
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
});

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');

  const stateDirectory = path.join(runtimeRoot, 'praxis-control');
  await mkdir(stateDirectory, { recursive: true });
  await writeFile(path.join(stateDirectory, 'service.json'), JSON.stringify({
    pid: process.pid,
    host: '127.0.0.1',
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    startedAt: new Date().toISOString(),
    shutdownToken: 's'.repeat(32),
    apiToken: 'a'.repeat(32),
  }));

  const hasDisplay = Boolean(process.env.DISPLAY);
  const command = hasDisplay ? 'dbus-run-session' : 'xvfb-run';
  const args = hasDisplay
    ? ['--', 'gjs', '-m', appPath, '--smoke-test-connected']
    : ['-a', 'dbus-run-session', '--', 'gjs', '-m', appPath, '--smoke-test-connected'];
  const child = spawn(command, args, {
    env: { ...process.env, XDG_RUNTIME_DIR: runtimeRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  let timedOut = false;
  let forceKill;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    forceKill = setTimeout(() => child.kill('SIGKILL'), 2_000);
  }, 15_000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  clearTimeout(timeout);
  clearTimeout(forceKill);

  assert.equal(timedOut, false, `GTK connected smoke timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  assert.equal(exitCode, 0, `GTK connected smoke failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  assert.match(stdout, /PRAXIS_GUI_SMOKE_CONNECTED/);
  assert.deepEqual([...requests].sort(), ['/api/dashboard', '/api/graph', '/api/meta']);
  console.log('Linux GTK connected smoke: PASS');
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(runtimeRoot, { recursive: true, force: true });
}

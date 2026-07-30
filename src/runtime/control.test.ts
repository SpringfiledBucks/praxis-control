import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireRuntimeLock,
  getReachableRuntimeState,
  readRuntimeLock,
  runtimeLockPath,
  runtimeStatePath,
  writeRuntimeState,
} from './control.js';

const roots: string[] = [];

async function temporaryRuntime(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'praxis-runtime-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('runtime control', () => {
  it('writes runtime state atomically', async () => {
    const root = await temporaryRuntime();
    await writeRuntimeState(root, {
      pid: process.pid,
      host: '127.0.0.1',
      port: 54321,
      url: 'http://127.0.0.1:54321',
      startedAt: new Date().toISOString(),
      shutdownToken: 's'.repeat(32),
      apiToken: 'a'.repeat(32),
    });
    expect(JSON.parse(await readFile(runtimeStatePath(root), 'utf8'))).toMatchObject({ port: 54321 });
  });

  it('rejects concurrent owners and releases only its own lock', async () => {
    const root = await temporaryRuntime();
    const lock = await acquireRuntimeLock(root);
    await expect(acquireRuntimeLock(root)).rejects.toThrow('拒绝并发启动');
    expect(await readRuntimeLock(root)).toMatchObject({ pid: process.pid });
    await lock.release();
    expect(await readRuntimeLock(root)).toBeNull();
  });

  it('recovers a stale lock owned by a dead process', async () => {
    const root = await temporaryRuntime();
    await writeFile(runtimeLockPath(root), JSON.stringify({
      pid: 2_147_483_647,
      startedAt: new Date(0).toISOString(),
    }));
    const lock = await acquireRuntimeLock(root);
    expect(lock.pid).toBe(process.pid);
    await lock.release();
  });

  it('removes state that points to a non-Praxis listener', async () => {
    const root = await temporaryRuntime();
    const impostor = createServer((_request, response) => response.end('{}'));
    await new Promise<void>((resolve, reject) => {
      impostor.once('error', reject);
      impostor.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = impostor.address();
      expect(address && typeof address === 'object').toBe(true);
      const port = typeof address === 'object' && address ? address.port : 0;
      await writeRuntimeState(root, {
        pid: process.pid,
        host: '127.0.0.1',
        port,
        url: `http://127.0.0.1:${port}`,
        startedAt: new Date().toISOString(),
        shutdownToken: 's'.repeat(32),
        apiToken: 'a'.repeat(32),
      });
      await expect(getReachableRuntimeState(root)).resolves.toBeNull();
      await expect(readFile(runtimeStatePath(root), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await new Promise<void>((resolve, reject) => impostor.close((error) => error ? reject(error) : resolve()));
    }
  });
});

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

const runtimeStateSchema = z.object({
  pid: z.number().int().positive(),
  host: z.string(),
  port: z.number().int().positive(),
  url: z.url(),
  startedAt: z.iso.datetime(),
  shutdownToken: z.string().min(32),
  apiToken: z.string().min(32),
});

const runtimeLockSchema = z.object({
  pid: z.number().int().positive(),
  startedAt: z.iso.datetime(),
});

export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type RuntimeLockState = z.infer<typeof runtimeLockSchema>;

export type RuntimeLock = {
  path: string;
  pid: number;
  release: () => Promise<void>;
};

export function runtimeStatePath(runtimeDirectory: string): string {
  return path.join(runtimeDirectory, 'service.json');
}

export function runtimeLockPath(runtimeDirectory: string): string {
  return path.join(runtimeDirectory, 'service.lock');
}

export async function writeRuntimeState(runtimeDirectory: string, state: RuntimeState): Promise<void> {
  await mkdir(runtimeDirectory, { recursive: true });
  const target = runtimeStatePath(runtimeDirectory);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);
}

export async function readRuntimeState(runtimeDirectory: string): Promise<RuntimeState | null> {
  try {
    const parsed = runtimeStateSchema.safeParse(JSON.parse(await readFile(runtimeStatePath(runtimeDirectory), 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    return null;
  }
}

export async function readRuntimeLock(runtimeDirectory: string): Promise<RuntimeLockState | null> {
  try {
    const parsed = runtimeLockSchema.safeParse(JSON.parse(await readFile(runtimeLockPath(runtimeDirectory), 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function removeRuntimeState(runtimeDirectory: string, expectedPid?: number): Promise<void> {
  if (expectedPid !== undefined) {
    const current = await readRuntimeState(runtimeDirectory);
    if (current && current.pid !== expectedPid) return;
  }
  await rm(runtimeStatePath(runtimeDirectory), { force: true });
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireRuntimeLock(runtimeDirectory: string, pid = process.pid): Promise<RuntimeLock> {
  await mkdir(runtimeDirectory, { recursive: true });
  const target = runtimeLockPath(runtimeDirectory);
  const payload = `${JSON.stringify({ pid, startedAt: new Date().toISOString() }, null, 2)}\n`;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      await writeFile(target, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      let released = false;
      return {
        path: target,
        pid,
        release: async () => {
          if (released) return;
          released = true;
          const current = await readRuntimeLock(runtimeDirectory);
          if (current?.pid === pid) await rm(target, { force: true });
        },
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;

      const existing = await readRuntimeLock(runtimeDirectory);
      if (existing) {
        if (isProcessAlive(existing.pid)) {
          throw new Error(`数据目录正由 Praxis Control 进程 ${existing.pid} 使用；拒绝并发启动。`);
        }
        await rm(target, { force: true });
        continue;
      }

      // A competing process may have created the file but not completed its write yet.
      const age = await stat(target).then((value) => Date.now() - value.mtimeMs).catch(() => 0);
      if (age < 2_000) {
        await delay(100);
        continue;
      }
      await rm(target, { force: true });
    }
  }

  throw new Error(`无法取得启动锁：${target}`);
}

export async function getLiveRuntimeState(runtimeDirectory: string): Promise<RuntimeState | null> {
  const state = await readRuntimeState(runtimeDirectory);
  if (!state) return null;
  if (isProcessAlive(state.pid)) return state;
  await removeRuntimeState(runtimeDirectory, state.pid);
  return null;
}

export async function getReachableRuntimeState(runtimeDirectory: string): Promise<RuntimeState | null> {
  const state = await getLiveRuntimeState(runtimeDirectory);
  if (!state) return null;
  try {
    const response = await fetch(`${state.url}/api/system/runtime`, {
      headers: { authorization: `Bearer ${state.apiToken}` },
      signal: AbortSignal.timeout(1_500),
    });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok || body.status !== 'ok' || typeof body.apiVersion !== 'number' || typeof body.rulesetVersion !== 'string') {
      throw new Error('unexpected runtime identity');
    }
    return state;
  } catch {
    await removeRuntimeState(runtimeDirectory, state.pid);
    return null;
  }
}

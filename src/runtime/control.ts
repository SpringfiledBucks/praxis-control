import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
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

export type RuntimeState = z.infer<typeof runtimeStateSchema>;

export function runtimeStatePath(runtimeDirectory: string): string {
  return path.join(runtimeDirectory, 'service.json');
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

export async function getLiveRuntimeState(runtimeDirectory: string): Promise<RuntimeState | null> {
  const state = await readRuntimeState(runtimeDirectory);
  if (!state) return null;
  if (isProcessAlive(state.pid)) return state;
  await removeRuntimeState(runtimeDirectory, state.pid);
  return null;
}

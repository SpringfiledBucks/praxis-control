import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { ensureSeedData } from './application/bootstrap.js';
import { loadConfig } from './config.js';
import { createDatabase } from './infrastructure/db.js';
import { runMigrations } from './infrastructure/migrations.js';
import { getLiveRuntimeState, removeRuntimeState, writeRuntimeState } from './runtime/control.js';

const config = loadConfig();
const existing = await getLiveRuntimeState(config.runtimeDir);
if (existing) {
  console.error(`Praxis Control 已运行：${existing.url}`);
  process.exit(2);
}

const database = await createDatabase(config);
if (config.runMigrations) await runMigrations(database);
await ensureSeedData(database, config.rulesetVersion);

const csrfToken = randomBytes(32).toString('hex');
const shutdownToken = randomBytes(32).toString('hex');
const apiToken = randomBytes(32).toString('hex');
let shuttingDown = false;
let resolveShutdown: (() => void) | undefined;

const app = createApp(database, config, {
  csrfToken,
  shutdownToken,
  apiToken,
  requestShutdown: () => resolveShutdown?.(),
  ...(database.backup ? { requestBackup: () => database.backup!(config.backupDir) } : {}),
});
const server = createServer(app);

await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(config.port, config.host, resolve);
});

const url = `http://${config.host}:${config.port}`;
await writeRuntimeState(config.runtimeDir, {
  pid: process.pid,
  host: config.host,
  port: config.port,
  url,
  startedAt: new Date().toISOString(),
  shutdownToken,
  apiToken,
});
console.log(`Praxis Control (${database.backend}): ${url}`);

async function shutdown(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`正在安全关闭：${reason}`);
  const forcedExit = setTimeout(() => process.exit(1), 10_000);
  forcedExit.unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.close();
  await removeRuntimeState(config.runtimeDir, process.pid);
  clearTimeout(forcedExit);
}

const requestedShutdown = new Promise<void>((resolve) => { resolveShutdown = resolve; });
process.once('SIGINT', () => resolveShutdown?.());
process.once('SIGTERM', () => resolveShutdown?.());
await requestedShutdown;
await shutdown('收到关闭请求');

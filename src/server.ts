import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { ensureSeedData } from './application/bootstrap.js';
import { loadConfig } from './config.js';
import { createDatabase, type Database } from './infrastructure/db.js';
import { runMigrations } from './infrastructure/migrations.js';
import { createModelGateway, type ModelGateway } from './ai/gateway.js';
import {
  acquireRuntimeLock,
  getReachableRuntimeState,
  removeRuntimeState,
  writeRuntimeState,
} from './runtime/control.js';

const config = loadConfig();
const instanceLock = await acquireRuntimeLock(config.runtimeDir);
let database: Database | undefined;
let server: Server | undefined;
let forcedExit: NodeJS.Timeout | undefined;

try {
  const existing = await getReachableRuntimeState(config.runtimeDir);
  if (existing) throw new Error(`Praxis Control 已运行：${existing.url}`);

  database = await createDatabase(config);
  if (config.runMigrations) await runMigrations(database);
  await ensureSeedData(database, config.rulesetVersion);

  let gateway: ModelGateway | undefined;
  if (config.aiMode === 'http' && config.aiApiBaseUrl && config.aiModel && config.aiApiKey) {
    gateway = await createModelGateway('http', {
      baseUrl: config.aiApiBaseUrl,
      model: config.aiModel,
      apiKey: config.aiApiKey,
      timeoutMs: config.aiTimeoutMs,
      maxRetries: config.aiMaxRetries,
    });
  } else {
    gateway = await createModelGateway('disabled');
  }

  const csrfToken = randomBytes(32).toString('hex');
  const shutdownToken = randomBytes(32).toString('hex');
  const apiToken = randomBytes(32).toString('hex');
  let resolveShutdown: (() => void) | undefined;
  const requestedShutdown = new Promise<void>((resolve) => { resolveShutdown = resolve; });

  const app = createApp(database, config, {
    csrfToken,
    shutdownToken,
    apiToken,
    requestShutdown: () => resolveShutdown?.(),
    ...(database.backup ? { requestBackup: () => database!.backup!(config.backupDir) } : {}),
  }, gateway);
  server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(config.port, config.host, resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('服务未返回可用的 TCP 监听地址');
  const port = (address as AddressInfo).port;
  const urlHost = config.host.includes(':') ? `[${config.host}]` : config.host;
  const url = `http://${urlHost}:${port}`;
  await writeRuntimeState(config.runtimeDir, {
    pid: process.pid,
    host: config.host,
    port,
    url,
    startedAt: new Date().toISOString(),
    shutdownToken,
    apiToken,
  });
  console.log(`Praxis Control (${database.backend}): ${url}`);

  process.once('SIGINT', () => resolveShutdown?.());
  process.once('SIGTERM', () => resolveShutdown?.());
  await requestedShutdown;
  console.log('正在安全关闭：收到关闭请求');
  forcedExit = setTimeout(() => process.exit(1), 10_000);
  forcedExit.unref();
} finally {
  try {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    try {
      if (database) await database.close();
    } finally {
      try {
        await removeRuntimeState(config.runtimeDir, process.pid);
      } finally {
        await instanceLock.release();
        if (forcedExit) clearTimeout(forcedExit);
      }
    }
  }
}

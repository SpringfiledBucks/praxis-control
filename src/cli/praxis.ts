import { spawn, type ChildProcess } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { loadConfig } from '../config.js';
import { restorePGliteBackup } from '../infrastructure/backup.js';
import { createDatabase } from '../infrastructure/db.js';
import { runMigrations } from '../infrastructure/migrations.js';
import { importPortableSnapshot } from '../application/import.js';
import { getReachableRuntimeState, readRuntimeLock, type RuntimeState } from '../runtime/control.js';

const config = loadConfig();
const command = process.argv[2] ?? 'help';
const args = process.argv.slice(3);

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredOption(name: string): string {
  const value = option(name);
  if (!value) throw new Error(`请使用 ${name} <值> 提供必需参数。`);
  return value;
}

async function runtime(required = true): Promise<RuntimeState | null> {
  const state = await getReachableRuntimeState(config.runtimeDir);
  if (!state && required) throw new Error('Praxis Control 尚未运行，请先执行 praxis start。');
  return state;
}

async function api<T>(state: RuntimeState, route: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${state.url}${route}`, {
    ...init,
    headers: {
      authorization: `Bearer ${state.apiToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(body.message || `请求失败：HTTP ${response.status}`);
  return body;
}

function openBrowser(url: string): void {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true })
    : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function waitForStart(child: ChildProcess, logPath: string, spawnError: () => Error | undefined): Promise<RuntimeState> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const failure = spawnError();
    if (failure) throw new Error(`服务进程创建失败：${failure.message}。日志：${logPath}`);
    if (child.exitCode !== null) {
      throw new Error(`服务启动失败（退出码 ${child.exitCode}）。请查看日志：${logPath}`);
    }
    const state = await getReachableRuntimeState(config.runtimeDir);
    if (state) return state;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`服务未能在 60 秒内启动。请执行 praxis doctor 并查看日志：${logPath}`);
}

async function start(): Promise<RuntimeState> {
  const existing = await runtime(false);
  if (existing) return existing;
  const serverEntry = path.resolve('dist', 'server.js');
  await mkdir(config.logDir, { recursive: true });
  const logPath = path.join(config.logDir, 'service.log');
  const log = await open(logPath, 'a', 0o600);
  let child: ChildProcess;
  let childSpawnError: Error | undefined;
  try {
    child = spawn(process.execPath, [serverEntry], {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
      windowsHide: true,
      env: process.env,
    });
    child.once('error', (error) => { childSpawnError = error; });
  } finally {
    await log.close();
  }
  child.unref();
  return waitForStart(child, logPath, () => childSpawnError);
}

async function fixedPortAvailable(): Promise<boolean | null> {
  if (config.port === 0) return null;
  const probe = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(config.port, config.host, resolve);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (probe.listening) await new Promise<void>((resolve) => probe.close(() => resolve()));
  }
}

async function stop(): Promise<void> {
  const state = await runtime();
  if (!state) return;
  const response = await fetch(`${state.url}/api/system/shutdown`, {
    method: 'POST',
    headers: { authorization: `Bearer ${state.apiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ token: state.shutdownToken }),
  });
  if (!response.ok) throw new Error(`关闭请求失败：HTTP ${response.status}`);
  console.log('已提交安全关闭请求。');
}

async function readJsonFile(): Promise<unknown> {
  const file = option('--file');
  if (!file) throw new Error('请使用 --file <JSON 文件> 提供输入。');
  return JSON.parse(await readFile(path.resolve(file), 'utf8'));
}

async function dashboard(state: RuntimeState): Promise<Record<string, unknown>> {
  return api(state, '/api/dashboard');
}

async function tui(): Promise<void> {
  const state = await start();
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    let running = true;
    while (running) {
      console.clear();
      const data = await dashboard(state) as {
        activeWip?: number;
        wipLimit?: number;
        awaitingReview?: number;
        reviewedLast7Days?: number;
        latestCheckin?: Record<string, unknown> | null;
      };
      console.log('PRAXIS CONTROL · 实践控制台');
      console.log(`服务 ${state.url} · ${config.databaseMode}`);
      console.log('');
      console.log(`核心在制品    ${data.activeWip ?? 0} / ${data.wipLimit ?? 3}`);
      console.log(`待结果复盘     ${data.awaitingReview ?? 0}`);
      console.log(`近 7 日已闭环  ${data.reviewedLast7Days ?? 0}`);
      if (data.latestCheckin) console.log(`最近行动       ${String(data.latestCheckin.main_action ?? '')}`);
      console.log('');
      console.log('[1] 刷新  [2] 打开 Web  [3] 显示 JSON  [4] 安全关闭服务  [q] 退出 TUI');
      const answer = (await terminal.question('> ')).trim().toLowerCase();
      if (answer === '2') openBrowser(state.url);
      if (answer === '3') {
        console.log(JSON.stringify(data, null, 2));
        await terminal.question('按回车继续…');
      }
      if (answer === '4') {
        await stop();
        running = false;
      }
      if (answer === 'q') running = false;
    }
  } finally {
    terminal.close();
  }
}

async function main(): Promise<void> {
  if (command === 'start') {
    const state = await start();
    if (!hasFlag('--no-open')) openBrowser(state.url);
    console.log(`Praxis Control 已运行：${state.url}`);
    return;
  }
  if (command === 'open') {
    const state = await start();
    openBrowser(state.url);
    return;
  }
  if (command === 'stop') return stop();
  if (command === 'status') {
    const state = await runtime(false);
    console.log(JSON.stringify(state ? { running: true, ...state, apiToken: '[redacted]', shutdownToken: '[redacted]' } : { running: false }, null, 2));
    return;
  }
  if (command === 'dashboard') {
    console.log(JSON.stringify(await dashboard(await start()), null, 2));
    return;
  }
  if (command === 'analyze') {
    console.log(JSON.stringify(await api(await start(), '/api/checkins/analyze', { method: 'POST', body: JSON.stringify(await readJsonFile()) }), null, 2));
    return;
  }
  if (command === 'checkin') {
    console.log(JSON.stringify(await api(await start(), '/api/checkins', { method: 'POST', body: JSON.stringify(await readJsonFile()) }), null, 2));
    return;
  }
  if (command === 'checkin-get') {
    const id = encodeURIComponent(requiredOption('--id'));
    console.log(JSON.stringify(await api(await start(), `/api/checkins/${id}`), null, 2));
    return;
  }
  if (command === 'checkin-status') {
    const id = encodeURIComponent(requiredOption('--id'));
    const status = requiredOption('--status');
    console.log(JSON.stringify(await api(await start(), `/api/checkins/${id}/lifecycle`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }), null, 2));
    return;
  }
  if (command === 'outcome') {
    const id = encodeURIComponent(requiredOption('--id'));
    console.log(JSON.stringify(await api(await start(), `/api/checkins/${id}/outcome`, {
      method: 'POST',
      body: JSON.stringify(await readJsonFile()),
    }), null, 2));
    return;
  }
  if (command === 'backup') {
    console.log(JSON.stringify(await api(await start(), '/api/system/backup', { method: 'POST', body: '{}' }), null, 2));
    return;
  }
  if (command === 'audit-verify') {
    console.log(JSON.stringify(await api(await start(), '/api/audit/verify'), null, 2));
    return;
  }
  if (command === 'export') {
    const targetOption = option('--target');
    if (!targetOption) throw new Error('请使用 export --target <JSON 文件>。');
    const target = path.resolve(targetOption);
    const snapshot = await api(await start(), '/api/export');
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'EEXIST') throw new Error(`导出目标已存在，不会覆盖：${target}`);
      throw error;
    }
    console.log(JSON.stringify({ status: 'created', target }, null, 2));
    return;
  }
  if (command === 'restore') {
    if (config.databaseMode !== 'pglite') throw new Error('当前 restore 命令只支持 PGlite 轻量版备份。');
    const backupFile = option('--file');
    const targetDirectory = option('--target');
    if (!backupFile || !targetDirectory) throw new Error('请使用 restore --file <备份文件> --target <不存在的独立目录>。');
    console.log(JSON.stringify(await restorePGliteBackup({
      backupFile,
      targetDirectory,
      sourceDataDirectory: config.pgliteDataDir,
    }), null, 2));
    return;
  }
  if (command === 'import-portable') {
    if (config.databaseMode !== 'postgres') throw new Error('便携快照导入只允许用于 PostgreSQL 全量版。');
    if (!hasFlag('--confirm-empty-postgres')) {
      throw new Error('必须显式添加 --confirm-empty-postgres；导入器仍会独立验证目标业务表为空。');
    }
    const file = option('--file');
    if (!file) throw new Error('请使用 import-portable --file <JSON 文件> --confirm-empty-postgres。');
    const targetDatabase = await createDatabase(config);
    try {
      await runMigrations(targetDatabase);
      const snapshot = JSON.parse(await readFile(path.resolve(file), 'utf8'));
      console.log(JSON.stringify({ status: 'imported', counts: await importPortableSnapshot(targetDatabase, snapshot) }, null, 2));
    } finally {
      await targetDatabase.close();
    }
    return;
  }
  if (command === 'doctor') {
    const state = await runtime(false);
    const lock = await readRuntimeLock(config.runtimeDir);
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    let dataParentWritable = true;
    try {
      await access(path.dirname(config.dataDir), fsConstants.W_OK);
    } catch {
      dataParentWritable = false;
    }
    let service: Record<string, unknown> = { running: false };
    if (state) {
      try {
        service = {
          running: true,
          pid: state.pid,
          url: state.url,
          health: await api(state, '/health'),
          audit: await api(state, '/api/audit/verify'),
        };
      } catch (error) {
        service = { running: true, pid: state.pid, url: state.url, reachable: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    console.log(JSON.stringify({
      node: process.version,
      platform: process.platform,
      databaseMode: config.databaseMode,
      configuredPort: config.port === 0 ? 'auto' : config.port,
      dataDir: config.dataDir,
      pgliteDataDir: config.pgliteDataDir,
      runtimeDir: config.runtimeDir,
      serviceLog: path.join(config.logDir, 'service.log'),
      checks: {
        nodeSupported: nodeMajor >= 24,
        dataParentWritable,
        postgresConfigurationPresent: config.databaseMode !== 'postgres' || Boolean(config.databaseUrl),
        fixedPortAvailable: state ? null : await fixedPortAvailable(),
        startupLock: lock ? { present: true, pid: lock.pid } : { present: false },
      },
      service,
    }, null, 2));
    return;
  }
  if (command === 'tui') return tui();

  console.log(`Praxis Control CLI

用法：praxis <命令>

  start [--no-open]       启动服务并打开 Web
  open                    打开 Web；必要时自动启动
  stop                    安全关闭服务
  status                  查看进程状态
  dashboard               输出工作台 JSON
  analyze --file FILE     分析一份 JSON 输入但不保存
  checkin --file FILE     保存一份 JSON 日常决策
  checkin-get --id ID     获取一份日常决策及可执行状态
  checkin-status --id ID --status STATUS
                          推进或取消决策执行状态
  outcome --id ID --file FILE
                          记录或修正决策结果复盘
  backup                  创建经过数据库接口导出的本地备份
  audit-verify            校验全部追加式审计链
  export --target FILE    导出可移植 JSON 快照且不覆盖已有文件
  restore --file F --target DIR
                          恢复 PGlite 备份到不存在的独立目录
  import-portable --file F --confirm-empty-postgres
                          将已校验快照事务导入空 PostgreSQL 全量库
  doctor                  输出跨平台环境诊断
  tui                     启动终端交互界面
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

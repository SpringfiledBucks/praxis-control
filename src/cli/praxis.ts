import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { loadConfig } from '../config.js';
import { getLiveRuntimeState, type RuntimeState } from '../runtime/control.js';

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

async function runtime(required = true): Promise<RuntimeState | null> {
  const state = await getLiveRuntimeState(config.runtimeDir);
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

async function waitForStart(): Promise<RuntimeState> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const state = await getLiveRuntimeState(config.runtimeDir);
    if (state) {
      try {
        await api(state, '/health');
        return state;
      } catch {
        // The process may have written its state before the HTTP listener is ready.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('服务未能在 20 秒内启动，请执行 praxis doctor 查看环境。');
}

async function start(): Promise<RuntimeState> {
  const existing = await runtime(false);
  if (existing) return existing;
  const serverEntry = path.resolve('dist', 'server.js');
  const child = spawn(process.execPath, [serverEntry], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  return waitForStart();
}

async function stop(): Promise<void> {
  const state = await runtime();
  if (!state) return;
  const response = await fetch(`${state.url}/api/system/shutdown`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
        awaitingReview?: number;
        reviewedLast7Days?: number;
        latestCheckin?: Record<string, unknown> | null;
      };
      console.log('PRAXIS CONTROL · 实践控制台');
      console.log(`服务 ${state.url} · ${config.databaseMode}`);
      console.log('');
      console.log(`核心 WIP       ${data.activeWip ?? 0} / 3`);
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
  if (command === 'backup') {
    console.log(JSON.stringify(await api(await start(), '/api/system/backup', { method: 'POST', body: '{}' }), null, 2));
    return;
  }
  if (command === 'doctor') {
    const state = await runtime(false);
    console.log(JSON.stringify({
      node: process.version,
      platform: process.platform,
      databaseMode: config.databaseMode,
      dataDir: config.dataDir,
      pgliteDataDir: config.pgliteDataDir,
      runtimeDir: config.runtimeDir,
      service: state ? { running: true, pid: state.pid, url: state.url } : { running: false },
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
  backup                  创建经过数据库接口导出的本地备份
  doctor                  输出跨平台环境诊断
  tui                     启动终端交互界面
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

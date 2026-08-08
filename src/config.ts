import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { resolveAppDirectories } from './platform/paths.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_HOST: z.string().default('127.0.0.1'),
  APP_PORT: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.coerce.number().int().min(0).max(65535).default(0),
  ),
  DATABASE_MODE: z.enum(['pglite', 'postgres']).default('pglite'),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_NAME: z.string().min(1).default('praxis_control'),
  DATABASE_USER: z.string().min(1).default('praxis_control'),
  DATABASE_PASSWORD_FILE: z.string().min(1).optional(),
  PGLITE_DATA_DIR: z.string().min(1).optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  ACCESS_MODE: z.enum(['local', 'tailscale', 'password']).default('local'),
  TAILSCALE_ALLOWED_USER: z.string().min(1).optional(),
  ACCESS_PASSWORD_FILE: z.string().min(1).optional(),
  SESSION_SECRET_FILE: z.string().min(1).optional(),
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  RUN_MIGRATIONS: z.enum(['true', 'false']).default('true'),
  AI_MODE: z.enum(['disabled', 'http']).default('disabled'),
  AI_API_BASE_URL: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  AI_API_KEY_FILE: z.string().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  RULESET_VERSION: z.string().default('2026.07.28-mvp1'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseMode: 'pglite' | 'postgres';
  databaseUrl?: string;
  pgliteDataDir: string;
  dataDir: string;
  backupDir: string;
  logDir: string;
  runtimeDir: string;
  databaseSsl: boolean;
  accessMode: 'local' | 'tailscale' | 'password';
  tailscaleAllowedUser?: string;
  accessPassword?: string;
  sessionSecret?: string;
  sessionCookieSecure: boolean;
  runMigrations: boolean;
  aiMode: 'disabled' | 'http';
  aiApiBaseUrl?: string;
  aiModel?: string;
  aiApiKey?: string;
  aiTimeoutMs: number;
  aiMaxRetries: number;
  rulesetVersion: string;
};

function readSingleLineSecret(file: string, label: string): string {
  const value = readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  if (!value || value.includes('\n') || value.includes('\r')) {
    throw new Error(`${label} 必须包含单行非空密钥`);
  }
  return value;
}

function databaseUrlFromSecretFile(env: z.infer<typeof envSchema>): string | undefined {
  if (!env.DATABASE_PASSWORD_FILE) return undefined;
  const password = readSingleLineSecret(env.DATABASE_PASSWORD_FILE, 'DATABASE_PASSWORD_FILE');
  const url = new URL('postgresql://localhost');
  url.hostname = env.DATABASE_HOST;
  url.port = String(env.DATABASE_PORT);
  url.username = env.DATABASE_USER;
  url.password = password;
  url.pathname = `/${env.DATABASE_NAME}`;
  return url.toString();
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = envSchema.parse(source);
  if (env.DATABASE_URL && env.DATABASE_PASSWORD_FILE) {
    throw new Error('DATABASE_URL 与 DATABASE_PASSWORD_FILE 不能同时设置');
  }
  const databaseUrl = env.DATABASE_URL ?? databaseUrlFromSecretFile(env);
  if (env.DATABASE_MODE === 'postgres' && !databaseUrl) {
    throw new Error('DATABASE_MODE=postgres 时必须设置 DATABASE_URL 或 DATABASE_PASSWORD_FILE');
  }
  if (env.ACCESS_MODE === 'tailscale' && !env.TAILSCALE_ALLOWED_USER) {
    throw new Error('ACCESS_MODE=tailscale 时必须设置 TAILSCALE_ALLOWED_USER');
  }
  if (env.ACCESS_MODE === 'password' && (!env.ACCESS_PASSWORD_FILE || !env.SESSION_SECRET_FILE)) {
    throw new Error('ACCESS_MODE=password 时必须设置 ACCESS_PASSWORD_FILE 和 SESSION_SECRET_FILE');
  }
  if (env.APP_PORT === 0 && (env.DATABASE_MODE !== 'pglite' || env.ACCESS_MODE !== 'local')) {
    throw new Error('自动端口只允许用于本机 PGlite 轻量模式；全量版或远程访问必须显式设置 APP_PORT');
  }
  let accessPassword: string | undefined;
  let sessionSecret: string | undefined;
  if (env.ACCESS_MODE === 'password') {
    accessPassword = readSingleLineSecret(env.ACCESS_PASSWORD_FILE!, 'ACCESS_PASSWORD_FILE');
    sessionSecret = readSingleLineSecret(env.SESSION_SECRET_FILE!, 'SESSION_SECRET_FILE');
    if (accessPassword.length < 16) throw new Error('ACCESS_PASSWORD_FILE 至少需要 16 个字符');
    if (sessionSecret.length < 32) throw new Error('SESSION_SECRET_FILE 至少需要 32 个字符');
  }
  if (env.NODE_ENV === 'production' && env.ACCESS_MODE === 'password' && env.SESSION_COOKIE_SECURE !== 'true') {
    throw new Error('生产密码模式必须启用 SESSION_COOKIE_SECURE=true');
  }
  let aiApiKey: string | undefined;
  if (env.AI_MODE === 'http') {
    if (!env.AI_API_BASE_URL || !env.AI_MODEL || !env.AI_API_KEY_FILE) {
      throw new Error('AI_MODE=http 时必须设置 AI_API_BASE_URL, AI_MODEL 和 AI_API_KEY_FILE');
    }
    aiApiKey = readSingleLineSecret(env.AI_API_KEY_FILE, 'AI_API_KEY_FILE');
  }
  const directories = resolveAppDirectories(source);
  return {
    nodeEnv: env.NODE_ENV,
    host: env.APP_HOST,
    port: env.APP_PORT,
    databaseMode: env.DATABASE_MODE,
    ...(databaseUrl ? { databaseUrl } : {}),
    pgliteDataDir: env.PGLITE_DATA_DIR ? env.PGLITE_DATA_DIR : directories.databaseDir,
    dataDir: directories.dataDir,
    backupDir: directories.backupDir,
    logDir: directories.logDir,
    runtimeDir: directories.runtimeDir,
    databaseSsl: env.DATABASE_SSL === 'true',
    accessMode: env.ACCESS_MODE,
    ...(env.TAILSCALE_ALLOWED_USER ? { tailscaleAllowedUser: env.TAILSCALE_ALLOWED_USER.trim().toLowerCase() } : {}),
    ...(accessPassword ? { accessPassword } : {}),
    ...(sessionSecret ? { sessionSecret } : {}),
    sessionCookieSecure: env.SESSION_COOKIE_SECURE === 'true',
    runMigrations: env.RUN_MIGRATIONS === 'true',
    aiMode: env.AI_MODE,
    ...(env.AI_API_BASE_URL ? { aiApiBaseUrl: env.AI_API_BASE_URL } : {}),
    ...(env.AI_MODEL ? { aiModel: env.AI_MODEL } : {}),
    ...(aiApiKey ? { aiApiKey } : {}),
    aiTimeoutMs: env.AI_TIMEOUT_MS,
    aiMaxRetries: env.AI_MAX_RETRIES,
    rulesetVersion: env.RULESET_VERSION,
  };
}

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { resolveAppDirectories } from './platform/paths.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_HOST: z.string().default('127.0.0.1'),
  APP_PORT: z.coerce.number().int().min(1).max(65535).default(4310),
  DATABASE_MODE: z.enum(['pglite', 'postgres']).default('pglite'),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_NAME: z.string().min(1).default('praxis_control'),
  DATABASE_USER: z.string().min(1).default('praxis_control'),
  DATABASE_PASSWORD_FILE: z.string().min(1).optional(),
  PGLITE_DATA_DIR: z.string().min(1).optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  ACCESS_MODE: z.enum(['local', 'tailscale']).default('local'),
  TAILSCALE_ALLOWED_USER: z.string().min(1).optional(),
  RUN_MIGRATIONS: z.enum(['true', 'false']).default('true'),
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
  runtimeDir: string;
  databaseSsl: boolean;
  accessMode: 'local' | 'tailscale';
  tailscaleAllowedUser?: string;
  runMigrations: boolean;
  rulesetVersion: string;
};

function databaseUrlFromSecretFile(env: z.infer<typeof envSchema>): string | undefined {
  if (!env.DATABASE_PASSWORD_FILE) return undefined;
  const rawPassword = readFileSync(env.DATABASE_PASSWORD_FILE, 'utf8');
  const password = rawPassword.replace(/\r?\n$/, '');
  if (!password || password.includes('\n') || password.includes('\r')) {
    throw new Error('DATABASE_PASSWORD_FILE 必须包含单行非空密码');
  }
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
    runtimeDir: directories.runtimeDir,
    databaseSsl: env.DATABASE_SSL === 'true',
    accessMode: env.ACCESS_MODE,
    ...(env.TAILSCALE_ALLOWED_USER ? { tailscaleAllowedUser: env.TAILSCALE_ALLOWED_USER.trim().toLowerCase() } : {}),
    runMigrations: env.RUN_MIGRATIONS === 'true',
    rulesetVersion: env.RULESET_VERSION,
  };
}

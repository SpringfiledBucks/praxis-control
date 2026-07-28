import 'dotenv/config';
import { z } from 'zod';
import { resolveAppDirectories } from './platform/paths.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_HOST: z.string().default('127.0.0.1'),
  APP_PORT: z.coerce.number().int().min(1).max(65535).default(4310),
  DATABASE_MODE: z.enum(['pglite', 'postgres']).default('pglite'),
  DATABASE_URL: z.string().min(1).optional(),
  PGLITE_DATA_DIR: z.string().min(1).optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
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
  runMigrations: boolean;
  rulesetVersion: string;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = envSchema.parse(source);
  if (env.DATABASE_MODE === 'postgres' && !env.DATABASE_URL) {
    throw new Error('DATABASE_MODE=postgres 时必须设置 DATABASE_URL');
  }
  const directories = resolveAppDirectories(source);
  return {
    nodeEnv: env.NODE_ENV,
    host: env.APP_HOST,
    port: env.APP_PORT,
    databaseMode: env.DATABASE_MODE,
    ...(env.DATABASE_URL ? { databaseUrl: env.DATABASE_URL } : {}),
    pgliteDataDir: env.PGLITE_DATA_DIR ? env.PGLITE_DATA_DIR : directories.databaseDir,
    dataDir: directories.dataDir,
    backupDir: directories.backupDir,
    runtimeDir: directories.runtimeDir,
    databaseSsl: env.DATABASE_SSL === 'true',
    runMigrations: env.RUN_MIGRATIONS === 'true',
    rulesetVersion: env.RULESET_VERSION,
  };
}

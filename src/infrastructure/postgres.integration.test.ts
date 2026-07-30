import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSeedData } from '../application/bootstrap.js';
import { createProject } from '../application/projects.js';
import { loadConfig, type AppConfig } from '../config.js';
import { createPortableExport } from '../application/export.js';
import { importPortableSnapshot } from '../application/import.js';
import { verifyAuditChain } from './audit.js';
import { createDatabase, type Database } from './db.js';
import { runMigrations } from './migrations.js';

const postgresTestUrl = process.env.POSTGRES_TEST_URL;

describe.runIf(Boolean(postgresTestUrl))('PostgreSQL full profile', () => {
  let config: AppConfig;
  let database: Database;
  let sourceRoot: string;
  let importedCounts: Record<string, number>;

  beforeAll(async () => {
    config = loadConfig({
      NODE_ENV: 'test',
      APP_PORT: '4310',
      DATABASE_MODE: 'postgres',
      DATABASE_URL: postgresTestUrl,
      DATABASE_SSL: 'false',
      RULESET_VERSION: 'postgres-contract-test',
    });
    database = await createDatabase(config);
    await runMigrations(database);

    sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'praxis-postgres-source-'));
    const sourceConfig = loadConfig({ NODE_ENV: 'test', PRAXIS_DATA_DIR: sourceRoot, RULESET_VERSION: config.rulesetVersion });
    const source = await createDatabase(sourceConfig);
    try {
      await runMigrations(source);
      await ensureSeedData(source, sourceConfig.rulesetVersion);
      await createProject(source, sourceConfig.rulesetVersion, {
        title: 'PGlite 到 PostgreSQL 迁移验收',
        kind: 'build',
        currentBottleneck: '尚未验证真实 PostgreSQL 导入',
        exitCondition: '逐表计数与审计链一致',
      });
      importedCounts = await importPortableSnapshot(
        database,
        await createPortableExport(source, sourceConfig.rulesetVersion),
      );
    } finally {
      await source.close();
    }
  });

  afterAll(async () => {
    await database?.close();
    if (sourceRoot) await rm(sourceRoot, { recursive: true, force: true });
  });

  it('runs migrations idempotently against a real PostgreSQL server', async () => {
    expect(database.backend).toBe('postgres');
    expect(await runMigrations(database)).toEqual([]);
    const migrations = await database.query<{ version: string }>('SELECT version FROM governance.schema_migrations ORDER BY version');
    expect(migrations.rows.map((row) => row.version)).toEqual(['001_initial', '002_knowledge_graph', '003_audit_heads']);
    expect(importedCounts.projects).toBeGreaterThan(0);
  });

  it('preserves transactional audit and portable export contracts', async () => {
    const projectId = await createProject(database, config.rulesetVersion, {
      title: 'PostgreSQL 全量版合同验收',
      kind: 'build',
      currentBottleneck: '全量数据库尚未由真实服务验证',
      exitCondition: '迁移、事务、审计与导出合同全部通过',
    });
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await verifyAuditChain(database)).toMatchObject({ valid: true });
    const snapshot = await createPortableExport(database, config.rulesetVersion);
    expect(snapshot.backend).toBe('postgres');
    expect(snapshot.counts.projects).toBeGreaterThan(0);
    expect(snapshot.counts.auditEvents).toBeGreaterThan(0);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSeedData } from '../application/bootstrap.js';
import { createProject } from '../application/projects.js';
import { loadConfig, type AppConfig } from '../config.js';
import { createPortableExport } from '../application/export.js';
import { verifyAuditChain } from './audit.js';
import { createDatabase, type Database } from './db.js';
import { runMigrations } from './migrations.js';

const postgresTestUrl = process.env.POSTGRES_TEST_URL;

describe.runIf(Boolean(postgresTestUrl))('PostgreSQL full profile', () => {
  let config: AppConfig;
  let database: Database;

  beforeAll(async () => {
    config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_MODE: 'postgres',
      DATABASE_URL: postgresTestUrl,
      DATABASE_SSL: 'false',
      RULESET_VERSION: 'postgres-contract-test',
    });
    database = await createDatabase(config);
    await runMigrations(database);
    await ensureSeedData(database, config.rulesetVersion);
  });

  afterAll(async () => {
    await database?.close();
  });

  it('runs migrations idempotently against a real PostgreSQL server', async () => {
    expect(database.backend).toBe('postgres');
    expect(await runMigrations(database)).toEqual([]);
    const migrations = await database.query<{ version: string }>('SELECT version FROM governance.schema_migrations ORDER BY version');
    expect(migrations.rows.map((row) => row.version)).toEqual(['001_initial', '002_knowledge_graph', '003_audit_heads']);
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

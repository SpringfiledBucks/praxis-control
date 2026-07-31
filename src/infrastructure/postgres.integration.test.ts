import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSeedData } from '../application/bootstrap.js';
import { createProject } from '../application/projects.js';
import { CheckinService } from '../application/checkins.js';
import { loadConfig, type AppConfig } from '../config.js';
import { createPortableExport } from '../application/export.js';
import { importPortableSnapshot } from '../application/import.js';
import { loadPortfolioContext } from '../application/portfolio.js';
import { verifyAuditChain } from './audit.js';
import { createDatabase, type Database } from './db.js';
import { runMigrations } from './migrations.js';

const postgresTestUrl = process.env.POSTGRES_TEST_URL;

describe.runIf(Boolean(postgresTestUrl))('PostgreSQL full profile', () => {
  let config: AppConfig;
  let database: Database;
  let sourceRoot: string;
  let importedCounts: Record<string, number>;
  let importedProjectId: string;

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
      importedProjectId = await createProject(source, sourceConfig.rulesetVersion, {
        title: 'PGlite 到 PostgreSQL 迁移验收',
        kind: 'build',
        currentBottleneck: '尚未验证真实 PostgreSQL 导入',
        exitCondition: '逐表计数与审计链一致',
      });
      const input = JSON.parse(await readFile(path.join(process.cwd(), 'src', 'infrastructure', 'test-fixtures', 'daily-input.json'), 'utf8'));
      await new CheckinService(source, sourceConfig.rulesetVersion).create({
        ...input, checkinDate: '2026-07-29', mainAction: '验证跨数据库项目决策关系', projectId: importedProjectId,
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
    expect(migrations.rows.map((row) => row.version)).toEqual(['001_initial', '002_knowledge_graph', '003_audit_heads', '004_decision_project_lifecycle', '005_weekly_review_provenance']);
    expect(importedCounts.projects).toBeGreaterThan(0);
    expect(importedCounts.dailyCheckins).toBeGreaterThan(0);
    const importedDecision = await database.query<{ project_id: string }>(
      'SELECT project_id FROM decision.daily_checkins WHERE project_id = $1',
      [importedProjectId],
    );
    expect(importedDecision.rows).toEqual([{ project_id: importedProjectId }]);
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

  it('serializes concurrent project admission at the PostgreSQL WIP boundary', async () => {
    expect(await loadPortfolioContext(database, config.rulesetVersion)).toMatchObject({ activeWip: 2, wipLimit: 3 });
    const input = (suffix: string) => ({
      title: `并发准入项目 ${suffix}`,
      kind: 'explore',
      currentBottleneck: '验证 PostgreSQL 事务锁不会越过 WIP 上限',
      exitCondition: '两个并发请求只能有一个进入核心队列',
    });
    const results = await Promise.allSettled([
      createProject(database, config.rulesetVersion, input('A')),
      createProject(database, config.rulesetVersion, input('B')),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'WIP_LIMIT_REACHED', statusCode: 409 } });
    expect(await loadPortfolioContext(database, config.rulesetVersion)).toMatchObject({ activeWip: 3, wipLimit: 3 });
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSeedData } from '../application/bootstrap.js';
import { createPortableExport } from '../application/export.js';
import { importPortableSnapshot, parsePortableSnapshot } from '../application/import.js';
import { createProject } from '../application/projects.js';
import { loadConfig } from '../config.js';
import { verifyAuditChain } from './audit.js';
import { createDatabase, type Database } from './db.js';
import { runMigrations } from './migrations.js';

describe('portable snapshot import', () => {
  let root: string;
  let source: Database;
  let target: Database;
  let snapshot: Awaited<ReturnType<typeof createPortableExport>>;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'praxis-portable-import-'));
    const sourceConfig = loadConfig({ NODE_ENV: 'test', PRAXIS_DATA_DIR: path.join(root, 'source'), RULESET_VERSION: 'portable-test' });
    const targetConfig = loadConfig({ NODE_ENV: 'test', PRAXIS_DATA_DIR: path.join(root, 'target'), RULESET_VERSION: 'portable-test' });
    source = await createDatabase(sourceConfig);
    target = await createDatabase(targetConfig);
    await runMigrations(source);
    await runMigrations(target);
    await ensureSeedData(source, sourceConfig.rulesetVersion);
    await createProject(source, sourceConfig.rulesetVersion, {
      title: '验证便携迁移', kind: 'build', currentBottleneck: '尚未验证跨后端导入', exitCondition: '事务导入与审计对账通过',
    });
    snapshot = await createPortableExport(source, sourceConfig.rulesetVersion);
  });

  afterAll(async () => {
    await source?.close();
    await target?.close();
    await rm(root, { recursive: true, force: true });
  });

  it('imports an export into an empty migrated database transactionally', async () => {
    const counts = await importPortableSnapshot(target, snapshot);
    expect(counts.projects).toBeGreaterThan(0);
    expect(await verifyAuditChain(target)).toMatchObject({ valid: true });
    const targetExport = await createPortableExport(target, snapshot.rulesetVersion);
    expect(targetExport.counts).toEqual(snapshot.counts);
    await expect(importPortableSnapshot(target, snapshot)).rejects.toThrow('不是空库');
  });

  it('refuses inconsistent counts and a broken audit chain before writing', () => {
    const wrongCount = structuredClone(snapshot);
    wrongCount.counts.projects = (wrongCount.counts.projects ?? 0) + 1;
    expect(() => parsePortableSnapshot(wrongCount)).toThrow('计数不一致');

    const brokenAudit = structuredClone(snapshot);
    const first = brokenAudit.data.auditEvents?.[0] as Record<string, unknown> | undefined;
    expect(first).toBeTruthy();
    if (!first) throw new Error('测试快照缺少审计事件');
    first.event_hash = 'broken';
    expect(() => parsePortableSnapshot(brokenAudit)).toThrow('审计链无效');
  });
});

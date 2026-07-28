import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensureSeedData } from '../application/bootstrap.js';
import { createProject } from '../application/projects.js';
import { loadConfig, type AppConfig } from '../config.js';
import { restorePGliteBackup } from './backup.js';
import { createDatabase, type Database } from './db.js';
import { runMigrations } from './migrations.js';
import request from 'supertest';

describe('PGlite lightweight profile', () => {
  let root: string;
  let config: AppConfig;
  let database: Database;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'praxis-pglite-test-'));
    config = loadConfig({ PRAXIS_DATA_DIR: root, NODE_ENV: 'test' });
    database = await createDatabase(config);
    await runMigrations(database);
    await ensureSeedData(database, config.rulesetVersion);
  });

  afterAll(async () => {
    await database.close();
    await rm(root, { recursive: true, force: true });
  });

  it('migrates, persists graph data and creates a non-empty backup', async () => {
    await createProject(database, config.rulesetVersion, {
      title: '验证跨平台轻量闭环',
      kind: 'build',
      currentBottleneck: '嵌入式存储尚未经过持久化验证',
      exitCondition: 'PGlite 重启、备份和关系查询均通过',
    });
    const relations = await database.query<{ count: string }>('SELECT count(*)::text AS count FROM core.relations');
    expect(Number(relations.rows[0]?.count)).toBeGreaterThan(0);

    const backup = await database.backup?.(config.backupDir);
    expect(backup).toBeTruthy();
    expect((await stat(backup!)).size).toBeGreaterThan(0);

    const restoreTarget = path.join(root, 'restored-pglite');
    const restored = await restorePGliteBackup({
      backupFile: backup!,
      targetDirectory: restoreTarget,
      sourceDataDirectory: config.pgliteDataDir,
    });
    expect(restored.migrations).toEqual(['001_initial', '002_knowledge_graph']);
    expect(restored.projects).toBeGreaterThan(0);
    await expect(restorePGliteBackup({
      backupFile: backup!,
      targetDirectory: config.pgliteDataDir,
      sourceDataDirectory: config.pgliteDataDir,
    })).rejects.toThrow('相互独立');
    await expect(restorePGliteBackup({
      backupFile: backup!,
      targetDirectory: restoreTarget,
      sourceDataDirectory: config.pgliteDataDir,
    })).rejects.toThrow('恢复目标必须不存在');

    await database.close();
    database = await createDatabase(config);
    expect(await runMigrations(database)).toEqual([]);
    const projects = await database.query<{ title: string }>('SELECT title FROM core.projects WHERE title = $1', ['验证跨平台轻量闭环']);
    expect(projects.rows).toHaveLength(1);
  });

  it('serves Web and protected JSON APIs from the same core', async () => {
    const app = createApp(database, config, {
      csrfToken: 'csrf-test-token',
      apiToken: 'api-test-token-api-test-token-api-test-token',
      shutdownToken: 'shutdown-test-token-shutdown-test-token',
      requestShutdown: () => undefined,
    });

    await request(app).get('/health').expect(200).expect((response) => {
      expect(response.body.backend).toBe('pglite');
    });
    await request(app).get('/api/meta').expect(200).expect((response) => {
      expect(response.body.apiVersion).toBe(1);
      expect(response.body.capabilities.portableExport).toBe(true);
    });
    await request(app).get('/').expect(200).expect(/实践控制台/);
    await request(app).post('/api/checkins/analyze').send({}).expect(403);

    const input = JSON.parse(await readFile(path.join(process.cwd(), 'src', 'infrastructure', 'test-fixtures', 'daily-input.json'), 'utf8'));
    await request(app)
      .post('/api/checkins/analyze')
      .set('authorization', 'Bearer api-test-token-api-test-token-api-test-token')
      .send(input)
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('READY'));
    await request(app)
      .post('/api/checkins')
      .set('authorization', 'Bearer api-test-token-api-test-token-api-test-token')
      .send(input)
      .expect(201);
    await request(app).get('/api/graph').expect(200).expect((response) => {
      expect(response.body.nodes.length).toBeGreaterThan(1);
    });
    await request(app).get('/api/audit/verify').expect(200).expect((response) => {
      expect(response.body.valid).toBe(true);
      expect(response.body.totalEvents).toBeGreaterThan(0);
    });
    await request(app).get('/api/export').expect(403);
    await request(app)
      .get('/api/export')
      .set('authorization', 'Bearer api-test-token-api-test-token-api-test-token')
      .expect((response) => {
        expect(response.status, JSON.stringify(response.body)).toBe(200);
        expect(response.body.format).toBe('praxis-control-portable-json');
        expect(response.body.counts.dailyCheckins).toBeGreaterThan(0);
        expect(response.body.counts.auditEvents).toBeGreaterThan(0);
      });
  });
});

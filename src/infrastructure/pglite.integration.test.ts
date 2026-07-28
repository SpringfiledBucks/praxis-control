import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensureSeedData } from '../application/bootstrap.js';
import { changeProjectStatus, createProject } from '../application/projects.js';
import { loadConfig, type AppConfig } from '../config.js';
import { restorePGliteBackup } from './backup.js';
import { verifyAuditChain } from './audit.js';
import { createDatabase, type Database } from './db.js';
import { runMigrations } from './migrations.js';
import request from 'supertest';
import {
  API_VERSION,
  auditVerificationResponseSchema,
  dailyAnalysisResponseSchema,
  dashboardResponseSchema,
  graphResponseSchema,
  metaResponseSchema,
  portableExportResponseSchema,
} from '../contracts/api.js';

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
    const projectId = await createProject(database, config.rulesetVersion, {
      title: '验证跨平台轻量闭环',
      kind: 'build',
      currentBottleneck: '嵌入式存储尚未经过持久化验证',
      exitCondition: 'PGlite 重启、备份和关系查询均通过',
    });
    await Promise.all([
      changeProjectStatus(database, config.rulesetVersion, projectId, 'maintaining'),
      changeProjectStatus(database, config.rulesetVersion, projectId, 'active'),
    ]);
    expect(await verifyAuditChain(database)).toMatchObject({ valid: true });
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
    expect(restored.migrations).toEqual(['001_initial', '002_knowledge_graph', '003_audit_heads']);
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
      const meta = metaResponseSchema.parse(response.body);
      expect(meta.apiVersion).toBe(API_VERSION);
      expect(meta.capabilities.portableExport).toBe(true);
    });
    await request(app).get('/api/openapi.json').expect(200).expect((response) => {
      expect(response.body.info.version).toBe(`${API_VERSION}.0.0`);
      expect(response.body.paths['/api/dashboard']).toBeTruthy();
    });
    await request(app).get('/').expect(200).expect(/实践控制台/);
    await request(app).post('/api/checkins/analyze').send({}).expect(403);

    const input = JSON.parse(await readFile(path.join(process.cwd(), 'src', 'infrastructure', 'test-fixtures', 'daily-input.json'), 'utf8'));
    await request(app)
      .post('/api/checkins/analyze')
      .set('authorization', 'Bearer api-test-token-api-test-token-api-test-token')
      .send(input)
      .expect(200)
      .expect((response) => expect(dailyAnalysisResponseSchema.parse(response.body).status).toBe('READY'));
    await request(app)
      .post('/api/checkins')
      .set('authorization', 'Bearer api-test-token-api-test-token-api-test-token')
      .send(input)
      .expect(201);
    await request(app).get('/api/dashboard').expect(200).expect((response) => {
      expect(dashboardResponseSchema.parse(response.body).activeWip).toBeGreaterThan(0);
    });
    await request(app).get('/api/graph').expect(200).expect((response) => {
      expect(graphResponseSchema.parse(response.body).nodes.length).toBeGreaterThan(1);
    });
    await request(app).get('/api/audit/verify').expect(200).expect((response) => {
      const verification = auditVerificationResponseSchema.parse(response.body);
      expect(verification.valid).toBe(true);
      expect(verification.totalEvents).toBeGreaterThan(0);
    });
    await request(app).get('/api/export').expect(403);
    await request(app)
      .get('/api/export')
      .set('authorization', 'Bearer api-test-token-api-test-token-api-test-token')
      .expect((response) => {
        expect(response.status, JSON.stringify(response.body)).toBe(200);
        const snapshot = portableExportResponseSchema.parse(response.body);
        expect(snapshot.format).toBe('praxis-control-portable-json');
        expect(snapshot.counts.dailyCheckins).toBeGreaterThan(0);
        expect(snapshot.counts.auditEvents).toBeGreaterThan(0);
      });
  });

  it('enforces the configured Tailscale identity before serving full-profile data', async () => {
    const app = createApp(database, {
      ...config,
      accessMode: 'tailscale',
      tailscaleAllowedUser: 'owner@example.com',
    });

    await request(app).get('/health').expect(200);
    await request(app).get('/').expect(401).expect(/访问未授权/);
    await request(app).get('/api/dashboard').expect(401).expect({ status: 'error', message: '未通过 Tailscale 身份校验。' });
    await request(app).get('/api/dashboard').set('tailscale-user-login', 'intruder@example.com').expect(401);
    await request(app)
      .get('/api/dashboard')
      .set('tailscale-user-login', 'Owner@Example.COM')
      .expect(200);
  });

  it('protects the full-profile Web and API with a signed password session', async () => {
    const app = createApp(database, {
      ...config,
      accessMode: 'password',
      accessPassword: 'correct-horse-battery-staple',
      sessionSecret: 'session-secret-with-at-least-thirty-two-characters',
      sessionCookieSecure: true,
    }, {
      csrfToken: 'password-csrf-token',
      apiToken: 'password-api-token-password-api-token',
      shutdownToken: 'password-shutdown-token',
      requestShutdown: () => undefined,
    });

    await request(app).get('/health').expect(200);
    await request(app).get('/').expect(302).expect('location', '/login');
    await request(app).get('/api/dashboard').expect(401).expect({ status: 'error', message: '未通过访问认证。' });
    await request(app).get('/login').expect(200).expect(/进入实践控制台/);
    await request(app).post('/login').send({ password: 'correct-horse-battery-staple' }).expect(403);
    await request(app).post('/login').type('form').send({ _csrf: 'password-csrf-token', password: 'wrong' }).expect(401);

    const login = await request(app)
      .post('/login')
      .type('form')
      .send({ _csrf: 'password-csrf-token', password: 'correct-horse-battery-staple' })
      .expect(303)
      .expect('location', '/');
    const setCookie = login.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const setCookieHeader = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!;
    const cookie = setCookieHeader.split(';', 1)[0]!;
    expect(setCookieHeader).toContain('__Host-praxis_session=');
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('SameSite=Strict');
    expect(setCookieHeader).toContain('Secure');

    await request(app).get('/').set('cookie', cookie).expect(200);
    await request(app).get('/api/dashboard').set('cookie', cookie).expect(200);
    await request(app)
      .post('/logout')
      .set('cookie', cookie)
      .type('form')
      .send({ _csrf: 'password-csrf-token' })
      .expect(303)
      .expect('location', '/login')
      .expect('set-cookie', /Max-Age=0/);
  });
});

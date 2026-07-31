import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { ensureSeedData } from '../application/bootstrap.js';
import { changeProjectStatus, createProject } from '../application/projects.js';
import { CheckinService } from '../application/checkins.js';
import { loadPortfolioContext } from '../application/portfolio.js';
import { loadWeeklySummary, saveWeeklyReview } from '../application/reviews.js';
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
    expect(restored.migrations).toEqual(['001_initial', '002_knowledge_graph', '003_audit_heads', '004_decision_project_lifecycle', '005_weekly_review_provenance']);
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
    await request(app).get('/api/system/runtime').expect(403);
    await request(app)
      .get('/api/system/runtime')
      .set('authorization', 'Bearer api-test-token-api-test-token-api-test-token')
      .expect(200)
      .expect({ status: 'ok', apiVersion: API_VERSION, rulesetVersion: config.rulesetVersion });
    await request(app).get('/api/openapi.json').expect(200).expect((response) => {
      expect(response.body.info.version).toBe(`${API_VERSION}.0.0`);
      expect(response.body.paths['/api/dashboard']).toBeTruthy();
    });
    await request(app).get('/').expect(200).expect(/实践控制台/);
    await request(app).get('/reviews/weekly').expect(200).expect(/可审计调整/).expect(/系统决策记录/);
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

  it('links decisions to active projects and enforces the execution-review lifecycle', async () => {
    const app = createApp(database, config, {
      csrfToken: 'lifecycle-csrf-token',
      apiToken: 'lifecycle-api-token-lifecycle-api-token',
      shutdownToken: 'lifecycle-shutdown-token',
      requestShutdown: () => undefined,
    });
    const authorization = 'Bearer lifecycle-api-token-lifecycle-api-token';
    const fixture = JSON.parse(await readFile(path.join(process.cwd(), 'src', 'infrastructure', 'test-fixtures', 'daily-input.json'), 'utf8'));
    const active = await database.query<{ id: string; title: string }>(
      "SELECT id, title FROM core.projects WHERE status IN ('active', 'maintaining') ORDER BY created_at LIMIT 1",
    );
    const project = active.rows[0]!;

    const created = await request(app)
      .post('/api/checkins')
      .set('authorization', authorization)
      .send({ ...fixture, checkinDate: '2026-07-29', mainAction: '完成关联项目的执行闭环', projectId: project.id })
      .expect(201);
    const id = created.body.id as string;

    await request(app).get(`/api/checkins/${id}`).expect(200).expect((response) => {
      expect(response.body.record).toMatchObject({
        id, projectId: project.id, projectTitle: project.title, lifecycleStatus: 'planned',
        allowedLifecycleStatuses: ['executing', 'cancelled'],
      });
      expect(response.body.outcome).toBeNull();
    });
    const relation = await database.query<{ relation_type: string; target_id: string }>(
      'SELECT relation_type, target_id FROM core.relations WHERE source_id = $1',
      [id],
    );
    expect(relation.rows).toContainEqual({ relation_type: 'advances', target_id: project.id });

    const outcome = {
      actualResult: '完成了关联、状态推进和结果记录', decisionQuality: 8, executionQuality: 7,
      environmentImpact: 'neutral', varianceSource: 'execution',
      learning: '状态门槛能区分计划与已执行事实', nextAdjustment: '在周复盘中聚合项目结果',
    };
    await request(app).post(`/api/checkins/${id}/outcome`).set('authorization', authorization).send(outcome).expect(409);
    await request(app).post(`/api/checkins/${id}/lifecycle`).set('authorization', authorization).send({ status: 'reviewed' }).expect(400);
    await request(app).post(`/api/checkins/${id}/lifecycle`).set('authorization', authorization).send({ status: 'executing' }).expect(200);
    await request(app).post(`/api/checkins/${id}/lifecycle`).set('authorization', authorization).send({ status: 'awaiting_review' }).expect(200);
    await request(app).get('/api/dashboard').expect(200)
      .expect((response) => expect(response.body.awaitingReview).toBe(1));
    await request(app).post(`/api/checkins/${id}/outcome`).set('authorization', authorization).send(outcome).expect(200);
    await request(app).post(`/api/checkins/${id}/outcome`).set('authorization', authorization)
      .send({ ...outcome, learning: '修正后的认识仍保留审计事件' }).expect(200);
    await request(app).get(`/api/checkins/${id}`).expect(200).expect((response) => {
      expect(response.body.record).toMatchObject({ lifecycleStatus: 'reviewed', allowedLifecycleStatuses: [] });
      expect(response.body.outcome).toMatchObject({ actual_result: outcome.actualResult, decision_quality: 8 });
    });
    await request(app).get(`/checkins/${id}`).expect(200).expect(/修正结果事实/).expect(/保存修正/);
    await request(app).get('/api/dashboard').expect(200)
      .expect((response) => expect(response.body.awaitingReview).toBe(0));
    await request(app).post(`/api/checkins/${id}/lifecycle`).set('authorization', authorization).send({ status: 'executing' }).expect(409);

    const cancelled = await request(app)
      .post('/api/checkins')
      .set('authorization', authorization)
      .send({ ...fixture, checkinDate: '2026-07-30', mainAction: '验证取消后的事实边界', projectId: project.id })
      .expect(201);
    await request(app).post(`/api/checkins/${cancelled.body.id}/lifecycle`).set('authorization', authorization)
      .send({ status: 'cancelled' }).expect(200);
    await request(app).post(`/api/checkins/${cancelled.body.id}/outcome`).set('authorization', authorization).send(outcome).expect(409);
    expect((await new CheckinService(database, config.rulesetVersion).listRecent(10))
      .find((record) => record.id === cancelled.body.id)).toMatchObject({ lifecycleStatus: 'cancelled' });

    const pausedProject = await createProject(database, config.rulesetVersion, {
      title: '暂停项目关联门槛', kind: 'explore', currentBottleneck: '验证非活动项目不能吸收新决策',
      exitCondition: '关联请求被服务端拒绝',
    });
    await changeProjectStatus(database, config.rulesetVersion, pausedProject, 'paused');
    const service = new CheckinService(database, config.rulesetVersion);
    await expect(service.create({ ...fixture, checkinDate: '2026-07-31', projectId: pausedProject }))
      .rejects.toMatchObject({ code: 'PROJECT_NOT_ACCEPTING_DECISIONS', statusCode: 409 });

    const audit = await database.query<{ event_type: string }>(
      'SELECT event_type FROM governance.audit_events WHERE aggregate_id = $1 ORDER BY created_at',
      [id],
    );
    expect(audit.rows.map((event) => event.event_type)).toEqual([
      'CHECKIN_ANALYZED_AND_SAVED', 'CHECKIN_LIFECYCLE_CHANGED', 'CHECKIN_LIFECYCLE_CHANGED',
      'OUTCOME_RECORDED', 'OUTCOME_CORRECTED',
    ]);
    expect(await verifyAuditChain(database)).toMatchObject({ valid: true });
  });

  it('enforces authoritative WIP capacity and ignores client-supplied portfolio counts', async () => {
    let context = await loadPortfolioContext(database, config.rulesetVersion);
    while (context.activeWip < context.wipLimit) {
      await createProject(database, config.rulesetVersion, {
        title: `占用核心容量 ${context.activeWip + 1}`,
        kind: 'build',
        currentBottleneck: '验证核心在制品上限由服务端强制执行',
        exitCondition: '达到上限后拒绝新增项目',
      });
      context = await loadPortfolioContext(database, config.rulesetVersion);
    }

    await expect(createProject(database, config.rulesetVersion, {
      title: '不应进入的第四个项目',
      kind: 'explore',
      currentBottleneck: '客户端可能绕过页面直接调用服务',
      exitCondition: '服务端返回 WIP_LIMIT_REACHED',
    })).rejects.toMatchObject({ code: 'WIP_LIMIT_REACHED', statusCode: 409 });

    const fullPortfolioApp = createApp(database, config, {
      csrfToken: 'portfolio-csrf-token',
      apiToken: 'portfolio-api-token-portfolio-api-token',
      shutdownToken: 'portfolio-shutdown-token',
      requestShutdown: () => undefined,
    });
    await request(fullPortfolioApp)
      .post('/projects')
      .type('form')
      .send({
        _csrf: 'portfolio-csrf-token', title: '绕过页面提交的项目', kind: 'build',
        currentBottleneck: '验证 HTTP 层保持业务冲突语义', exitCondition: '返回 409 而不是写入',
      })
      .expect(409)
      .expect(/核心在制品已达到/);

    const service = new CheckinService(database, config.rulesetVersion);
    const input = JSON.parse(await readFile(path.join(process.cwd(), 'src', 'infrastructure', 'test-fixtures', 'daily-input.json'), 'utf8'));
    const analysis = await service.analyze({ ...input, opensNewCoreProject: true, activeWip: 0, wipLimit: 99 });
    expect(analysis.status).toBe('CAUTION');
    expect(analysis.wipLimit).toBe(context.wipLimit);
    expect(analysis.triggeredRules).toContain('WIP-LIMIT-001');

    const active = await database.query<{ id: string }>(
      "SELECT id FROM core.projects WHERE status IN ('active', 'maintaining') ORDER BY created_at LIMIT 1",
    );
    await expect(changeProjectStatus(database, config.rulesetVersion, active.rows[0]!.id, 'retired'))
      .rejects.toMatchObject({ code: 'INVALID_PROJECT_TRANSITION', statusCode: 409 });
    await changeProjectStatus(database, config.rulesetVersion, active.rows[0]!.id, 'paused');
    await expect(createProject(database, config.rulesetVersion, {
      title: '替换退出项目后的新项目',
      kind: 'breakthrough',
      currentBottleneck: '验证释放容量后可以进入核心队列',
      exitCondition: '创建成功且 WIP 仍等于规则上限',
    })).resolves.toMatch(/^[0-9a-f-]{36}$/);
    expect((await loadPortfolioContext(database, config.rulesetVersion)).activeWip).toBe(context.wipLimit);
  });

  it('keeps repeated weekly reviews on one aggregate audit chain', async () => {
    const computed = await loadWeeklySummary(database, '2026-07-27');
    const input = {
      weekStart: '2026-07-27',
      reported: {
        checkinCount: computed.checkinCount,
        reviewedCount: computed.reviewedCount,
        averageDecisionQuality: computed.averageDecisionQuality,
        averageExecutionQuality: computed.averageExecutionQuality,
      },
      adjustmentReason: '',
      mainContradictionStatus: '主要矛盾仍然有效', currentBottleneck: '业务规则缺少服务端强制',
      evidenceUpdate: 'WIP 绕过测试已经复现', portfolioChange: '暂停低优先级项目',
      nextBreakthrough: '完成第一批组合治理规则',
    };
    const firstId = await saveWeeklyReview(database, config.rulesetVersion, input);
    await expect(saveWeeklyReview(database, config.rulesetVersion, {
      ...input,
      reported: { ...input.reported, checkinCount: input.reported.checkinCount + 1 },
    })).rejects.toMatchObject({ code: 'WEEKLY_ADJUSTMENT_REASON_REQUIRED', statusCode: 409 });
    const adjusted = {
      ...input,
      reported: { ...input.reported, checkinCount: input.reported.checkinCount + 1 },
      adjustmentReason: '补记一条未进入系统的线下决策',
      evidenceUpdate: '服务端强制测试已经通过',
    };
    const secondId = await saveWeeklyReview(database, config.rulesetVersion, adjusted);
    expect(secondId).toBe(firstId);
    const saved = await database.query<{
      computed_snapshot: Record<string, unknown>;
      manual_adjustments: Record<string, unknown>;
      reported_snapshot: Record<string, unknown>;
      adjustment_reason: string;
    }>('SELECT computed_snapshot, manual_adjustments, reported_snapshot, adjustment_reason FROM decision.weekly_reviews WHERE id = $1', [firstId]);
    expect(saved.rows[0]?.computed_snapshot).toMatchObject({ checkinCount: computed.checkinCount });
    expect(saved.rows[0]?.manual_adjustments).toMatchObject({
      checkinCount: { computed: computed.checkinCount, reported: computed.checkinCount + 1 },
    });
    expect(saved.rows[0]?.reported_snapshot).toMatchObject({ checkinCount: computed.checkinCount + 1 });
    expect(saved.rows[0]?.adjustment_reason).toBe('补记一条未进入系统的线下决策');
    const app = createApp(database, config, {
      csrfToken: 'weekly-csrf-token',
      apiToken: 'weekly-api-token-weekly-api-token',
      shutdownToken: 'weekly-shutdown-token-weekly-shutdown-token',
      requestShutdown: () => undefined,
    });
    await request(app).post('/reviews/weekly').type('form').send({
      _csrf: 'weekly-csrf-token',
      weekStart: '2026-07-27',
      reportedCheckinCount: computed.checkinCount,
      reportedReviewedCount: computed.reviewedCount,
      reportedAverageDecisionQuality: computed.averageDecisionQuality ?? '',
      reportedAverageExecutionQuality: computed.averageExecutionQuality ?? '',
      adjustmentReason: '',
      mainContradictionStatus: '主要矛盾仍然有效',
      currentBottleneck: '业务规则缺少服务端强制',
      evidenceUpdate: '页面字段合同已验证',
      portfolioChange: '保持当前组合',
      nextBreakthrough: '进入标准服务部署批次',
    }).expect(302).expect('location', '/?saved=weekly-review');
    const events = await database.query<{ aggregate_id: string }>(
      "SELECT aggregate_id FROM governance.audit_events WHERE aggregate_type = 'weekly_review' ORDER BY created_at",
    );
    expect(events.rows.filter((event) => event.aggregate_id === firstId)).toHaveLength(3);
    expect(await verifyAuditChain(database)).toMatchObject({ valid: true });
  });

  it('enforces the configured Tailscale identity before serving full-profile data', async () => {
    const app = createApp(database, {
      ...config,
      accessMode: 'tailscale',
      tailscaleAllowedUser: 'owner@example.com',
    }, {
      csrfToken: 'tailscale-csrf-token',
      apiToken: 'tailscale-api-token-tailscale-api-token',
      shutdownToken: 'tailscale-shutdown-token',
      requestShutdown: () => undefined,
    });

    await request(app).get('/health').expect(200);
    await request(app).get('/').expect(401).expect(/访问未授权/);
    await request(app).get('/api/dashboard').expect(401).expect({ status: 'error', message: '未通过 Tailscale 身份校验。' });
    await request(app).get('/api/dashboard').set('tailscale-user-login', 'intruder@example.com').expect(401);
    await request(app)
      .get('/api/dashboard')
      .set('authorization', 'Bearer tailscale-api-token-tailscale-api-token')
      .expect(200);
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
    await request(app)
      .get('/api/dashboard')
      .set('authorization', 'Bearer password-api-token-password-api-token')
      .expect(200);
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

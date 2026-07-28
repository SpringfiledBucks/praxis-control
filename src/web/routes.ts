import { Router } from 'express';
import { z } from 'zod';
import { CheckinService } from '../application/checkins.js';
import { loadDashboard } from '../application/dashboard.js';
import { changeProjectStatus, createProject, listProjects } from '../application/projects.js';
import { loadWeeklySummary, saveWeeklyReview } from '../application/reviews.js';
import { loadKnowledgeGraph } from '../application/graph.js';
import { parseDailyBody } from './parsing.js';
import type { Database } from '../infrastructure/db.js';

export type SystemControl = {
  csrfToken: string;
  shutdownToken: string;
  apiToken: string;
  requestShutdown: () => void;
  requestBackup?: () => Promise<string>;
};

export function createRouter(database: Database, rulesetVersion: string, system?: SystemControl): Router {
  const router = Router();
  const checkins = new CheckinService(database, rulesetVersion);

  router.get('/', async (_req, res, next) => {
    try {
      const data = await loadDashboard(database);
      res.render('dashboard', { title: '今日工作台', data });
    } catch (error) { next(error); }
  });

  router.get('/checkins/new', async (_req, res, next) => {
    try {
      const dashboard = await loadDashboard(database);
      const latest = dashboard.latestCheckin;
      res.render('checkin-new', {
        title: '今日决策',
        today: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
        activeWip: dashboard.activeWip,
        latest,
      });
    } catch (error) { next(error); }
  });

  router.post('/api/checkins/analyze', (req, res, next) => {
    try {
      const input = parseDailyBody(req.body);
      res.json(checkins.analyze(input));
    } catch (error) { next(error); }
  });

  router.post('/api/checkins', async (req, res, next) => {
    try {
      const id = await checkins.create(parseDailyBody(req.body));
      res.status(201).json({ status: 'created', id });
    } catch (error) { next(error); }
  });

  router.get('/api/dashboard', async (_req, res, next) => {
    try {
      res.json(await loadDashboard(database));
    } catch (error) { next(error); }
  });

  router.post('/checkins', async (req, res, next) => {
    try {
      const input = parseDailyBody(req.body);
      const id = await checkins.create(input);
      res.redirect(`/checkins/${id}`);
    } catch (error) { next(error); }
  });

  router.get('/checkins/:id', async (req, res, next) => {
    try {
      const record = await checkins.get(req.params.id);
      if (!record) return res.status(404).render('error', { title: '未找到记录', message: '该日常决策不存在。' });
      const outcome = await checkins.getOutcome(req.params.id);
      return res.render('checkin-detail', { title: '决策详情', record, outcome });
    } catch (error) { return next(error); }
  });

  router.post('/checkins/:id/outcome', async (req, res, next) => {
    try {
      const schema = z.object({
        actualResult: z.string().trim().min(2).max(2000),
        decisionQuality: z.coerce.number().int().min(0).max(10),
        executionQuality: z.coerce.number().int().min(0).max(10),
        environmentImpact: z.enum(['helped', 'neutral', 'hindered', 'unknown']),
        varianceSource: z.enum(['planning', 'execution', 'environment', 'model', 'mixed']),
        learning: z.string().trim().min(2).max(2000),
        nextAdjustment: z.string().trim().min(2).max(2000),
      });
      await checkins.recordOutcome(req.params.id, schema.parse(req.body));
      res.redirect(`/checkins/${req.params.id}`);
    } catch (error) { next(error); }
  });

  router.get('/history', async (_req, res, next) => {
    try {
      const records = await checkins.listRecent(60);
      res.render('history', { title: '决策历史', records });
    } catch (error) { next(error); }
  });

  router.get('/graph', async (_req, res, next) => {
    try {
      const graph = await loadKnowledgeGraph(database);
      res.render('graph', { title: '关系图谱', graph });
    } catch (error) { next(error); }
  });

  router.get('/api/graph', async (_req, res, next) => {
    try {
      res.json(await loadKnowledgeGraph(database));
    } catch (error) { next(error); }
  });

  router.get('/projects', async (_req, res, next) => {
    try {
      res.render('projects', { title: '项目组合', projects: await listProjects(database) });
    } catch (error) { next(error); }
  });

  router.post('/projects', async (req, res, next) => {
    try {
      const input = z.object({
        title: z.string().trim().min(2).max(300),
        kind: z.enum(['breakthrough', 'build', 'maintain', 'explore']),
        currentBottleneck: z.string().trim().min(2).max(1000),
        exitCondition: z.string().trim().min(2).max(1000),
      }).parse(req.body);
      await createProject(database, rulesetVersion, input);
      res.redirect('/projects');
    } catch (error) { next(error); }
  });

  router.post('/projects/:id/status', async (req, res, next) => {
    try {
      const status = z.enum(['active', 'maintaining', 'paused', 'retiring', 'retired']).parse(req.body.status);
      await changeProjectStatus(database, rulesetVersion, req.params.id, status);
      res.redirect('/projects');
    } catch (error) { next(error); }
  });

  router.get('/reviews/weekly', async (_req, res, next) => {
    try {
      const summary = await loadWeeklySummary(database);
      const now = new Date();
      const day = now.getDay() || 7;
      now.setDate(now.getDate() - day + 1);
      const weekStart = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
      res.render('weekly-review', { title: '每周复盘', summary, weekStart });
    } catch (error) { next(error); }
  });

  router.post('/reviews/weekly', async (req, res, next) => {
    try {
      const input = z.object({
        weekStart: z.iso.date(),
        checkinCount: z.coerce.number().int().min(0),
        reviewedCount: z.coerce.number().int().min(0),
        averageDecisionQuality: z.preprocess((value) => value === '' ? null : value, z.coerce.number().min(0).max(10).nullable()),
        averageExecutionQuality: z.preprocess((value) => value === '' ? null : value, z.coerce.number().min(0).max(10).nullable()),
        mainContradictionStatus: z.string().trim().min(2).max(2000),
        currentBottleneck: z.string().trim().min(2).max(2000),
        evidenceUpdate: z.string().trim().min(2).max(2000),
        portfolioChange: z.string().trim().min(2).max(2000),
        nextBreakthrough: z.string().trim().min(2).max(2000),
      }).parse(req.body);
      await saveWeeklyReview(database, rulesetVersion, input);
      res.redirect('/?saved=weekly-review');
    } catch (error) { next(error); }
  });

  router.get('/audit', async (_req, res, next) => {
    try {
      const events = await database.query(`SELECT * FROM governance.audit_events ORDER BY created_at DESC LIMIT 100`);
      res.render('audit', { title: '审计时间线', events: events.rows });
    } catch (error) { next(error); }
  });

  router.get('/health', async (_req, res) => {
    try {
      await database.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected', backend: database.backend, rulesetVersion });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unavailable', rulesetVersion });
    }
  });

  router.post('/api/system/shutdown', (req, res) => {
    if (!system || req.body.token !== system.shutdownToken) {
      return res.status(403).json({ status: 'error', message: '关闭令牌无效。' });
    }
    res.json({ status: 'stopping' });
    setTimeout(system.requestShutdown, 50);
  });

  router.post('/api/system/backup', async (_req, res, next) => {
    try {
      if (!system?.requestBackup) return res.status(501).json({ status: 'error', message: '当前存储模式尚未提供应用内备份。' });
      const target = await system.requestBackup();
      return res.json({ status: 'created', target });
    } catch (error) { return next(error); }
  });

  return router;
}

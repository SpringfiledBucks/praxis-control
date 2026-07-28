import path from 'node:path';
import compression from 'compression';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import type { Database } from './infrastructure/db.js';
import { createRouter, type SystemControl } from './web/routes.js';

export function createApp(database: Database, config: AppConfig, system?: SystemControl): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'views'));
  app.locals.rulesetVersion = config.rulesetVersion;
  app.locals.databaseBackend = database.backend;
  app.locals.csrfToken = system?.csrfToken ?? '';
  app.locals.shutdownToken = system?.shutdownToken ?? '';
  app.locals.formatDate = (value: unknown) => new Date(String(value)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  app.locals.json = (value: unknown) => JSON.stringify(value, null, 2);

  app.use(helmet());
  app.use(compression());
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(express.json({ limit: '256kb' }));
  app.use('/static', express.static(path.join(process.cwd(), 'public'), { maxAge: config.nodeEnv === 'production' ? '1d' : 0 }));
  app.use((req, res, next) => {
    if (req.method !== 'POST' || !system) return next();
    if (req.path === '/api/system/shutdown') return next();
    if (req.path.startsWith('/api/') && req.get('authorization') === `Bearer ${system.apiToken}`) return next();
    const supplied = req.path.startsWith('/api/') ? req.get('x-csrf-token') : req.body._csrf;
    if (supplied !== system.csrfToken) {
      const isApi = req.path.startsWith('/api/');
      if (isApi) return res.status(403).json({ status: 'error', message: '请求校验失败，请刷新后重试。' });
      return res.status(403).render('error', { title: '请求校验失败', message: '页面令牌已失效，请刷新后重试。' });
    }
    return next();
  });
  app.use(createRouter(database, config.rulesetVersion, system));

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : '未知错误';
    const isApi = req.path.startsWith('/api/') || req.path === '/health';
    const status = message.includes('duplicate key') ? 409 : message.includes('validation') ? 400 : 500;
    if (isApi) return res.status(status).json({ status: 'error', message });
    return res.status(status).render('error', { title: '操作未完成', message });
  });

  return app;
}

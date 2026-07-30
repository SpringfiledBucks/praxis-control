import path from 'node:path';
import compression from 'compression';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import { BusinessRuleError, ResourceNotFoundError } from './application/errors.js';
import type { Database } from './infrastructure/db.js';
import { LoginRateLimiter, PasswordAccess } from './security/password-access.js';
import { createRouter, type SystemControl } from './web/routes.js';

export function createApp(database: Database, config: AppConfig, system?: SystemControl): Express {
  if (config.accessMode === 'password' && (!system || !config.accessPassword || !config.sessionSecret)) {
    throw new Error('密码访问模式必须提供访问密钥、会话密钥和系统令牌');
  }
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'views'));
  app.locals.rulesetVersion = config.rulesetVersion;
  app.locals.databaseBackend = database.backend;
  app.locals.csrfToken = system?.csrfToken ?? '';
  app.locals.shutdownToken = config.accessMode === 'local' ? system?.shutdownToken ?? '' : '';
  app.locals.accessMode = config.accessMode;
  app.locals.authenticated = config.accessMode === 'local';
  app.locals.formatDate = (value: unknown) => new Date(String(value)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  app.locals.json = (value: unknown) => JSON.stringify(value, null, 2);
  app.locals.lifecycleLabel = (value: string) => ({
    planned: '已计划', executing: '执行中', awaiting_review: '待复盘', reviewed: '已闭环', cancelled: '已取消',
  })[value] ?? value;

  app.use(helmet());
  app.use(compression());
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(express.json({ limit: '256kb' }));
  if (config.accessMode === 'password') app.set('trust proxy', 1);
  const passwordAccess = config.accessMode === 'password'
    ? new PasswordAccess(config.accessPassword!, config.sessionSecret!, config.sessionCookieSecure)
    : undefined;
  const loginRateLimiter = new LoginRateLimiter();
  app.use((req, res, next) => {
    res.locals.authenticated = config.accessMode === 'local';
    if (req.path === '/health' || req.path.startsWith('/static/')) return next();
    if (system && req.path.startsWith('/api/') && req.get('authorization') === `Bearer ${system.apiToken}`) {
      res.locals.authenticated = true;
      res.set('Cache-Control', 'no-store');
      return next();
    }
    if (config.accessMode === 'local') return next();
    res.set('Cache-Control', 'no-store');
    if (config.accessMode === 'tailscale') {
      const identity = req.get('tailscale-user-login')?.trim().toLowerCase();
      if (identity === config.tailscaleAllowedUser) {
        res.locals.authenticated = true;
        return next();
      }
    } else if (passwordAccess) {
      const session = passwordAccess.readSessionCookie(req.get('cookie'));
      if (passwordAccess.verifySession(session)) {
        res.locals.authenticated = true;
        return next();
      }
      if (req.path === '/login') return next();
    }
    if (req.path.startsWith('/api/')) {
      const message = config.accessMode === 'tailscale' ? '未通过 Tailscale 身份校验。' : '未通过访问认证。';
      return res.status(401).json({ status: 'error', message });
    }
    if (config.accessMode === 'password') return res.redirect(302, '/login');
    return res.status(401).render('error', { title: '访问未授权', message: '当前 Tailscale 身份不在允许列表中。' });
  });
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
  if (passwordAccess) {
    app.get('/login', (_req, res) => {
      if (res.locals.authenticated) return res.redirect(302, '/');
      return res.status(200).render('login', { title: '登录', error: '' });
    });
    app.post('/login', (req, res) => {
      if (res.locals.authenticated) return res.redirect(303, '/');
      const rateLimitKey = req.ip ?? 'unknown';
      const retryAfter = loginRateLimiter.retryAfterSeconds(rateLimitKey);
      if (retryAfter > 0) {
        res.set('Retry-After', String(retryAfter));
        return res.status(429).render('login', { title: '登录', error: `尝试次数过多，请在 ${retryAfter} 秒后重试。` });
      }
      if (!passwordAccess.verifyPassword(req.body.password)) {
        loginRateLimiter.recordFailure(rateLimitKey);
        return res.status(401).render('login', { title: '登录', error: '密码不正确。' });
      }
      loginRateLimiter.reset(rateLimitKey);
      res.set('Set-Cookie', passwordAccess.sessionCookie(passwordAccess.issueSession()));
      return res.redirect(303, '/');
    });
    app.post('/logout', (_req, res) => {
      res.set('Set-Cookie', passwordAccess.expiredCookie());
      return res.redirect(303, '/login');
    });
  }
  app.use(createRouter(database, config.rulesetVersion, system));

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : '未知错误';
    const isApi = req.path.startsWith('/api/') || req.path === '/health';
    const status = error instanceof BusinessRuleError ? error.statusCode
      : error instanceof ResourceNotFoundError ? error.statusCode
        : error instanceof ZodError ? 400
          : message.includes('duplicate key') ? 409
            : message.includes('validation') ? 400
              : 500;
    if (isApi) return res.status(status).json({ status: 'error', message });
    return res.status(status).render('error', { title: '操作未完成', message });
  });

  return app;
}

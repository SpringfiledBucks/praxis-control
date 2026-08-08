import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses safe localhost defaults', () => {
    const config = loadConfig({
      LOCALAPPDATA: 'C:\\Temp\\PraxisTest',
      ACCESS_PASSWORD_FILE: 'C:\\missing\\unused-password',
      SESSION_SECRET_FILE: 'C:\\missing\\unused-session',
    });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(0);
    expect(config.databaseMode).toBe('pglite');
    expect(path.isAbsolute(config.pgliteDataDir)).toBe(true);
    expect(path.basename(config.pgliteDataDir)).toBe('pglite');
    expect(config.databaseSsl).toBe(false);
    expect(config.accessMode).toBe('local');
    expect(config.aiMode).toBe('disabled');
    expect(config.logDir).toBe(path.join(config.dataDir, 'logs'));
  });

  it('fails closed when http mode lacks required config', () => {
    expect(() => loadConfig({ AI_MODE: 'http' })).toThrow('AI_MODE=http 时必须设置');
    expect(loadConfig({ AI_MODE: 'disabled' }).aiMode).toBe('disabled');
  });

  it('honors an explicit fixed port and rejects automatic ports for remote profiles', () => {
    expect(loadConfig({ APP_PORT: '4310' }).port).toBe(4310);
    expect(() => loadConfig({ ACCESS_MODE: 'tailscale', TAILSCALE_ALLOWED_USER: 'owner@example.com' }))
      .toThrow('必须显式设置 APP_PORT');
  });

  it('requires an explicit PostgreSQL credential source', () => {
    expect(() => loadConfig({ DATABASE_MODE: 'postgres' })).toThrow('DATABASE_URL');
  });

  it('reads a PostgreSQL password from a secret file without putting it in the environment', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'praxis-config-'));
    const secret = path.join(root, 'database-password');
    writeFileSync(secret, 'p@ss word/with:symbols\n', { mode: 0o600 });
    try {
      const config = loadConfig({
        DATABASE_MODE: 'postgres',
        APP_PORT: '4310',
        DATABASE_HOST: 'database',
        DATABASE_NAME: 'praxis_control',
        DATABASE_USER: 'praxis_control',
        DATABASE_PASSWORD_FILE: secret,
      });
      const url = new URL(config.databaseUrl!);
      expect(url.hostname).toBe('database');
      expect(url.username).toBe('praxis_control');
      expect(url.password).toBe('p%40ss%20word%2Fwith%3Asymbols');
      expect(config.databaseUrl).not.toContain('p@ss word');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires an allowlisted identity in Tailscale access mode', () => {
    expect(() => loadConfig({ ACCESS_MODE: 'tailscale' })).toThrow('TAILSCALE_ALLOWED_USER');
    expect(loadConfig({ ACCESS_MODE: 'tailscale', APP_PORT: '4310', TAILSCALE_ALLOWED_USER: 'User@Example.COM' })).toMatchObject({
      accessMode: 'tailscale',
      tailscaleAllowedUser: 'user@example.com',
    });
  });

  it('loads password access only from sufficiently strong secret files', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'praxis-access-config-'));
    const passwordFile = path.join(root, 'access-password');
    const sessionFile = path.join(root, 'session-secret');
    writeFileSync(passwordFile, 'correct-horse-battery-staple\n', { mode: 0o600 });
    writeFileSync(sessionFile, 'session-secret-with-at-least-thirty-two-characters\n', { mode: 0o600 });
    try {
      expect(() => loadConfig({ ACCESS_MODE: 'password' })).toThrow('ACCESS_PASSWORD_FILE');
      expect(loadConfig({
        ACCESS_MODE: 'password',
        APP_PORT: '4310',
        ACCESS_PASSWORD_FILE: passwordFile,
        SESSION_SECRET_FILE: sessionFile,
      })).toMatchObject({
        accessMode: 'password',
        accessPassword: 'correct-horse-battery-staple',
        sessionCookieSecure: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

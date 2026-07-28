import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses safe localhost defaults', () => {
    const config = loadConfig({ LOCALAPPDATA: 'C:\\Temp\\PraxisTest' });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4310);
    expect(config.databaseMode).toBe('pglite');
    expect(config.pgliteDataDir).toContain('PraxisControl');
    expect(config.databaseSsl).toBe(false);
  });

  it('requires a URL only for PostgreSQL mode', () => {
    expect(() => loadConfig({ DATABASE_MODE: 'postgres' })).toThrow('DATABASE_URL');
  });
});

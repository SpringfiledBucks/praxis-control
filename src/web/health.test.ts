import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import type { Database, QueryResult } from '../infrastructure/db.js';

function databaseWithMissingMigrations(): Database {
  return {
    backend: 'pglite',
    async query<T>(sql: string): Promise<QueryResult<T>> {
      if (sql === 'SELECT 1') return { rows: [] as T[], rowCount: 1 };
      throw new Error('schema_migrations is missing');
    },
    async exec(): Promise<void> {},
    async transaction<T>(): Promise<T> { throw new Error('not used'); },
    async close(): Promise<void> {},
  };
}

describe('health probes', () => {
  it('keeps liveness healthy while readiness rejects an unmigrated database', async () => {
    const app = createApp(databaseWithMissingMigrations(), loadConfig({ NODE_ENV: 'test' }));

    await request(app).get('/health/live').expect(200).expect((response) => {
      expect(response.body).toMatchObject({ status: 'ok', service: 'live' });
    });
    await request(app).get('/health/ready').expect(503).expect((response) => {
      expect(response.body).toMatchObject({ status: 'degraded', database: 'connected', migrations: 'outdated' });
    });
    await request(app).get('/health').expect(503);
  });
});

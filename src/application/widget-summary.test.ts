import { describe, expect, it } from 'vitest';
import type { Database, QueryResult } from '../infrastructure/db.js';
import { loadWidgetSummary } from './widget-summary.js';

function result<T>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length };
}

function widgetDatabase(): Database {
  return {
    backend: 'pglite',
    async query<T>(sql: string): Promise<QueryResult<T>> {
      if (sql.includes('SELECT id, title, kind')) return result([] as T[]);
      if (sql.includes('SELECT id, checkin_date')) return result([] as T[]);
      if (sql.includes('count(*) FILTER')) return result([{ awaiting_review: 2, reviewed_last_7_days: 1 }] as T[]);
      if (sql.includes("parameters->>'wip_limit'")) return result([{ wip_limit: 3 }] as T[]);
      if (sql.includes('SELECT count(*)::int AS count')) return result([{ count: 2 }] as T[]);
      if (sql.includes('SELECT main_action, available_minutes')) {
        return result([{ main_action: '完成云部署验收', available_minutes: 120, reserve_percent: 25 }] as T[]);
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    async exec(): Promise<void> {},
    async transaction<T>(): Promise<T> { throw new Error('not used'); },
    async close(): Promise<void> {},
  };
}

describe('widget summary', () => {
  it('reports planned usable capacity without presenting it as a live balance', async () => {
    const summary = await loadWidgetSummary(widgetDatabase(), 'test', new Date('2026-07-31T02:00:00.000Z'));

    expect(summary).toMatchObject({
      today: '2026-07-31',
      hasTodayPlan: true,
      mainAction: '完成云部署验收',
      capacityText: '今日计划可分配 90 分钟',
      awaitingReview: 2,
      activeWip: 2,
      wipLimit: 3,
      serviceStatus: 'ready',
    });
  });
});

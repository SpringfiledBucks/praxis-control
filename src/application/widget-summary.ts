import type { Database } from '../infrastructure/db.js';
import { formatDateOnly } from '../platform/dates.js';
import { loadDashboard } from './dashboard.js';

export type WidgetSummary = {
  generatedAt: string;
  today: string;
  hasTodayPlan: boolean;
  mainAction: string | null;
  capacityText: string;
  awaitingReview: number;
  reviewText: string;
  activeWip: number;
  wipLimit: number;
  wipText: string;
  serviceStatus: 'ready';
};

type TodayCheckin = {
  main_action: string;
  available_minutes: number | string;
  reserve_percent: number | string;
};

export async function loadWidgetSummary(database: Database, rulesetVersion: string, now = new Date()): Promise<WidgetSummary> {
  const today = formatDateOnly(now);
  const [dashboard, checkins] = await Promise.all([
    loadDashboard(database, rulesetVersion),
    database.query<TodayCheckin>(
      `SELECT main_action, available_minutes, reserve_percent
       FROM decision.daily_checkins
       WHERE checkin_date = $1 AND lifecycle_status <> 'cancelled'
       ORDER BY created_at DESC
       LIMIT 1`,
      [today],
    ),
  ]);
  const checkin = checkins.rows[0];
  const usableMinutes = checkin
    ? Math.max(0, Math.floor(Number(checkin.available_minutes) * (1 - Number(checkin.reserve_percent) / 100)))
    : null;

  return {
    generatedAt: now.toISOString(),
    today,
    hasTodayPlan: Boolean(checkin),
    mainAction: checkin?.main_action ?? null,
    capacityText: usableMinutes === null ? '尚未填写今日可支配时间' : `今日计划可分配 ${usableMinutes} 分钟`,
    awaitingReview: dashboard.awaitingReview,
    reviewText: `待复盘 ${dashboard.awaitingReview} 项`,
    activeWip: dashboard.activeWip,
    wipLimit: dashboard.wipLimit,
    wipText: `核心在制品 ${dashboard.activeWip} / ${dashboard.wipLimit}`,
    serviceStatus: 'ready',
  };
}

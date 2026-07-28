import type { Database } from '../infrastructure/db.js';
import { formatDateOnly } from '../platform/dates.js';

export type DashboardData = {
  activeProjects: Array<{ id: string; title: string; kind: string; current_bottleneck: string }>;
  latestCheckin: Record<string, unknown> | null;
  awaitingReview: number;
  reviewedLast7Days: number;
  activeWip: number;
};

export async function loadDashboard(database: Database): Promise<DashboardData> {
  const [projects, checkins, counters] = await Promise.all([
    database.query<{ id: string; title: string; kind: string; current_bottleneck: string }>(
      `SELECT id, title, kind, current_bottleneck FROM core.projects WHERE status IN ('active','maintaining') ORDER BY created_at`,
    ),
    database.query<Record<string, unknown>>(`SELECT id, checkin_date, main_action, deliverable, analysis_status, lifecycle_status, analysis_snapshot
                FROM decision.daily_checkins WHERE lifecycle_status <> 'cancelled'
                ORDER BY checkin_date DESC, created_at DESC LIMIT 1`),
    database.query<{ awaiting_review: number; reviewed_last_7_days: number }>(`SELECT
      count(*) FILTER (WHERE lifecycle_status <> 'reviewed' AND lifecycle_status <> 'cancelled')::int AS awaiting_review,
      count(*) FILTER (WHERE lifecycle_status = 'reviewed' AND checkin_date >= current_date - 6)::int AS reviewed_last_7_days
      FROM decision.daily_checkins`),
  ]);

  const latestCheckin = checkins.rows[0]
    ? { ...checkins.rows[0], checkin_date: formatDateOnly(checkins.rows[0].checkin_date) }
    : null;

  return {
    activeProjects: projects.rows,
    latestCheckin,
    awaitingReview: Number(counters.rows[0]?.awaiting_review ?? 0),
    reviewedLast7Days: Number(counters.rows[0]?.reviewed_last_7_days ?? 0),
    activeWip: projects.rowCount ?? 0,
  };
}

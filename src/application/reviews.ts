import { randomUUID } from 'node:crypto';
import { appendAuditEvent } from '../infrastructure/audit.js';
import { withTransaction, type Database } from '../infrastructure/db.js';

export async function loadWeeklySummary(database: Database): Promise<Record<string, unknown>> {
  const result = await database.query(`
    SELECT
      count(c.id)::int AS checkin_count,
      count(o.id)::int AS reviewed_count,
      round(avg(o.decision_quality), 2) AS average_decision_quality,
      round(avg(o.execution_quality), 2) AS average_execution_quality,
      mode() WITHIN GROUP (ORDER BY c.main_contradiction) AS common_contradiction,
      mode() WITHIN GROUP (ORDER BY c.bottleneck) AS common_bottleneck
    FROM decision.daily_checkins c
    LEFT JOIN decision.outcomes o ON o.checkin_id = c.id
    WHERE c.checkin_date >= current_date - 6
      AND c.lifecycle_status <> 'cancelled'
  `);
  return result.rows[0] ?? {};
}

export async function saveWeeklyReview(
  database: Database,
  rulesetVersion: string,
  input: {
    weekStart: string;
    checkinCount: number;
    reviewedCount: number;
    averageDecisionQuality: number | null;
    averageExecutionQuality: number | null;
    mainContradictionStatus: string;
    currentBottleneck: string;
    evidenceUpdate: string;
    portfolioChange: string;
    nextBreakthrough: string;
  },
): Promise<string> {
  const id = randomUUID();
  await withTransaction(database, async (client) => {
    await client.query(
      `INSERT INTO decision.weekly_reviews (
        id, week_start, checkin_count, reviewed_count, average_decision_quality,
        average_execution_quality, main_contradiction_status, current_bottleneck,
        evidence_update, portfolio_change, next_breakthrough
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (week_start) DO UPDATE SET
        checkin_count=EXCLUDED.checkin_count, reviewed_count=EXCLUDED.reviewed_count,
        average_decision_quality=EXCLUDED.average_decision_quality,
        average_execution_quality=EXCLUDED.average_execution_quality,
        main_contradiction_status=EXCLUDED.main_contradiction_status,
        current_bottleneck=EXCLUDED.current_bottleneck,
        evidence_update=EXCLUDED.evidence_update,
        portfolio_change=EXCLUDED.portfolio_change,
        next_breakthrough=EXCLUDED.next_breakthrough`,
      [id, input.weekStart, input.checkinCount, input.reviewedCount, input.averageDecisionQuality,
        input.averageExecutionQuality, input.mainContradictionStatus, input.currentBottleneck,
        input.evidenceUpdate, input.portfolioChange, input.nextBreakthrough],
    );
    await appendAuditEvent(client, {
      aggregateType: 'weekly_review', aggregateId: id, eventType: 'WEEKLY_REVIEW_SAVED', payload: input, rulesetVersion,
    });
  });
  return id;
}

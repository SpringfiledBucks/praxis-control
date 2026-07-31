import { randomUUID } from 'node:crypto';
import { appendAuditEvent } from '../infrastructure/audit.js';
import { withTransaction, type Database, type Queryable } from '../infrastructure/db.js';
import { addDateOnlyDays } from '../platform/dates.js';
import { BusinessRuleError } from './errors.js';

export type WeeklyMetrics = {
  checkinCount: number;
  reviewedCount: number;
  averageDecisionQuality: number | null;
  averageExecutionQuality: number | null;
};

export type WeeklySummary = WeeklyMetrics & {
  weekStart: string;
  weekEndExclusive: string;
  latestMainContradiction: string;
  latestBottleneck: string;
};

export type WeeklyReviewInput = {
  weekStart: string;
  reported: WeeklyMetrics;
  adjustmentReason: string;
  mainContradictionStatus: string;
  currentBottleneck: string;
  evidenceUpdate: string;
  portfolioChange: string;
  nextBreakthrough: string;
};

type ManualAdjustment = {
  computed: number | null;
  reported: number | null;
};

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export async function loadWeeklySummary(database: Queryable, weekStart: string): Promise<WeeklySummary> {
  const weekEndExclusive = addDateOnlyDays(weekStart, 7);
  const result = await database.query<{
    checkin_count: number | string;
    reviewed_count: number | string;
    average_decision_quality: number | string | null;
    average_execution_quality: number | string | null;
  }>(`
    SELECT
      count(c.id)::int AS checkin_count,
      count(o.id)::int AS reviewed_count,
      round(avg(o.decision_quality), 2) AS average_decision_quality,
      round(avg(o.execution_quality), 2) AS average_execution_quality
    FROM decision.daily_checkins c
    LEFT JOIN decision.outcomes o ON o.checkin_id = c.id
    WHERE c.checkin_date >= $1
      AND c.checkin_date < $2
      AND c.lifecycle_status <> 'cancelled'
  `, [weekStart, weekEndExclusive]);
  const latest = await database.query<{ main_contradiction: string; bottleneck: string }>(`
    SELECT main_contradiction, bottleneck
    FROM decision.daily_checkins
    WHERE checkin_date >= $1
      AND checkin_date < $2
      AND lifecycle_status <> 'cancelled'
    ORDER BY checkin_date DESC, created_at DESC, id DESC
    LIMIT 1
  `, [weekStart, weekEndExclusive]);
  const row = result.rows[0];
  return {
    weekStart,
    weekEndExclusive,
    checkinCount: Number(row?.checkin_count ?? 0),
    reviewedCount: Number(row?.reviewed_count ?? 0),
    averageDecisionQuality: nullableNumber(row?.average_decision_quality),
    averageExecutionQuality: nullableNumber(row?.average_execution_quality),
    latestMainContradiction: latest.rows[0]?.main_contradiction ?? '',
    latestBottleneck: latest.rows[0]?.bottleneck ?? '',
  };
}

function validateReportedMetrics(metrics: WeeklyMetrics): void {
  if (metrics.reviewedCount > metrics.checkinCount) {
    throw new BusinessRuleError('WEEKLY_REVIEW_COUNT_INVALID', '已闭环数量不能超过决策记录数量。');
  }
  const hasAverages = metrics.averageDecisionQuality !== null || metrics.averageExecutionQuality !== null;
  if (metrics.reviewedCount === 0 && hasAverages) {
    throw new BusinessRuleError('WEEKLY_REVIEW_AVERAGE_INVALID', '没有已闭环记录时不能填写质量平均值。');
  }
  if (metrics.reviewedCount > 0 && (
    metrics.averageDecisionQuality === null || metrics.averageExecutionQuality === null
  )) {
    throw new BusinessRuleError('WEEKLY_REVIEW_AVERAGE_REQUIRED', '存在已闭环记录时需要同时填写两个质量平均值。');
  }
}

function collectAdjustments(computed: WeeklyMetrics, reported: WeeklyMetrics): Record<string, ManualAdjustment> {
  const adjustments: Record<string, ManualAdjustment> = {};
  for (const key of Object.keys(computed) as Array<keyof WeeklyMetrics>) {
    if (computed[key] !== reported[key]) {
      adjustments[key] = { computed: computed[key], reported: reported[key] };
    }
  }
  return adjustments;
}

export async function saveWeeklyReview(
  database: Database,
  rulesetVersion: string,
  input: WeeklyReviewInput,
): Promise<string> {
  const id = randomUUID();
  return withTransaction(database, async (client) => {
    const computed = await loadWeeklySummary(client, input.weekStart);
    const computedMetrics: WeeklyMetrics = {
      checkinCount: computed.checkinCount,
      reviewedCount: computed.reviewedCount,
      averageDecisionQuality: computed.averageDecisionQuality,
      averageExecutionQuality: computed.averageExecutionQuality,
    };
    validateReportedMetrics(input.reported);
    const manualAdjustments = collectAdjustments(computedMetrics, input.reported);
    const adjustmentReason = input.adjustmentReason.trim();
    if (Object.keys(manualAdjustments).length > 0 && adjustmentReason.length < 2) {
      throw new BusinessRuleError('WEEKLY_ADJUSTMENT_REASON_REQUIRED', '修改系统统计时必须填写调整原因。');
    }
    const computedSnapshot = {
      weekStart: computed.weekStart,
      weekEndExclusive: computed.weekEndExclusive,
      ...computedMetrics,
    };
    const reportedSnapshot = { ...input.reported };

    const saved = await client.query<{ id: string }>(
      `INSERT INTO decision.weekly_reviews (
        id, week_start, checkin_count, reviewed_count, average_decision_quality,
        average_execution_quality, main_contradiction_status, current_bottleneck,
        evidence_update, portfolio_change, next_breakthrough, computed_snapshot,
        manual_adjustments, reported_snapshot, adjustment_reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15)
      ON CONFLICT (week_start) DO UPDATE SET
        checkin_count=EXCLUDED.checkin_count, reviewed_count=EXCLUDED.reviewed_count,
        average_decision_quality=EXCLUDED.average_decision_quality,
        average_execution_quality=EXCLUDED.average_execution_quality,
        main_contradiction_status=EXCLUDED.main_contradiction_status,
        current_bottleneck=EXCLUDED.current_bottleneck,
        evidence_update=EXCLUDED.evidence_update,
        portfolio_change=EXCLUDED.portfolio_change,
        next_breakthrough=EXCLUDED.next_breakthrough,
        computed_snapshot=EXCLUDED.computed_snapshot,
        manual_adjustments=EXCLUDED.manual_adjustments,
        reported_snapshot=EXCLUDED.reported_snapshot,
        adjustment_reason=EXCLUDED.adjustment_reason
      RETURNING id`,
      [id, input.weekStart, input.reported.checkinCount, input.reported.reviewedCount,
        input.reported.averageDecisionQuality, input.reported.averageExecutionQuality,
        input.mainContradictionStatus, input.currentBottleneck, input.evidenceUpdate,
        input.portfolioChange, input.nextBreakthrough, JSON.stringify(computedSnapshot),
        JSON.stringify(manualAdjustments), JSON.stringify(reportedSnapshot),
        Object.keys(manualAdjustments).length > 0 ? adjustmentReason : ''],
    );
    const aggregateId = saved.rows[0]!.id;
    await appendAuditEvent(client, {
      aggregateType: 'weekly_review',
      aggregateId,
      eventType: 'WEEKLY_REVIEW_SAVED',
      payload: {
        weekStart: input.weekStart,
        computedSnapshot,
        manualAdjustments,
        reportedSnapshot,
        adjustmentReason: Object.keys(manualAdjustments).length > 0 ? adjustmentReason : '',
        interpretation: {
          mainContradictionStatus: input.mainContradictionStatus,
          currentBottleneck: input.currentBottleneck,
          evidenceUpdate: input.evidenceUpdate,
          portfolioChange: input.portfolioChange,
          nextBreakthrough: input.nextBreakthrough,
        },
      },
      rulesetVersion,
    });
    return aggregateId;
  });
}

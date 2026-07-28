import { randomUUID } from 'node:crypto';
import { analyzeDaily, type DailyAnalysis, type DailyInput } from '../domain/daily.js';
import { appendAuditEvent } from '../infrastructure/audit.js';
import { withTransaction, type Database } from '../infrastructure/db.js';
import { formatDateOnly } from '../platform/dates.js';

export type DailyRecord = DailyInput & {
  id: string;
  analysis: DailyAnalysis;
  rulesetVersion: string;
  lifecycleStatus: string;
  createdAt: Date;
};

export class CheckinService {
  constructor(private readonly database: Database, private readonly rulesetVersion: string) {}

  analyze(input: DailyInput): DailyAnalysis {
    return analyzeDaily(input);
  }

  async create(input: DailyInput): Promise<string> {
    const id = randomUUID();
    const analysis = analyzeDaily(input);

    await withTransaction(this.database, async (client) => {
      await client.query(
        `INSERT INTO decision.daily_checkins (
          id, checkin_date, available_minutes, reserve_percent, energy, attention,
          stage_goal, main_contradiction, bottleneck, main_action, deliverable,
          estimated_minutes, stop_condition, explicit_not_do,
          contradiction_contribution, bottleneck_contribution, evidence_strength,
          risk_level, has_authorization, loss_tolerable, has_recovery_plan,
          opens_new_core_project, active_wip, analysis_status, analysis_snapshot,
          ruleset_version, lifecycle_status
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25::jsonb,$26,$27
        )`,
        [
          id, input.checkinDate, input.availableMinutes, input.reservePercent, input.energy, input.attention,
          input.stageGoal, input.mainContradiction, input.bottleneck, input.mainAction, input.deliverable,
          input.estimatedMinutes, input.stopCondition, input.explicitNotDo,
          input.contradictionContribution, input.bottleneckContribution, input.evidenceStrength,
          input.riskLevel, input.hasAuthorization, input.lossTolerable, input.hasRecoveryPlan,
          input.opensNewCoreProject, input.activeWip, analysis.status, JSON.stringify(analysis),
          this.rulesetVersion, 'planned',
        ],
      );

      await client.query(
        `INSERT INTO core.knowledge_objects(id, object_type, title, status, attributes)
         VALUES ($1, 'decision', $2, 'planned', jsonb_build_object('checkin_date', $3::date))`,
        [id, input.mainAction, input.checkinDate],
      );

      await appendAuditEvent(client, {
        aggregateType: 'daily_checkin',
        aggregateId: id,
        eventType: 'CHECKIN_ANALYZED_AND_SAVED',
        payload: { input, analysis },
        rulesetVersion: this.rulesetVersion,
      });
    });

    return id;
  }

  async get(id: string): Promise<DailyRecord | null> {
    const result = await this.database.query(
      `SELECT *, analysis_snapshot AS analysis
       FROM decision.daily_checkins WHERE id = $1`,
      [id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapCheckin(row) : null;
  }

  async listRecent(limit = 14): Promise<DailyRecord[]> {
    const result = await this.database.query(
      `SELECT *, analysis_snapshot AS analysis
       FROM decision.daily_checkins
       WHERE lifecycle_status <> 'cancelled'
       ORDER BY checkin_date DESC, created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => mapCheckin(row as Record<string, unknown>));
  }

  async recordOutcome(
    id: string,
    outcome: {
      actualResult: string;
      decisionQuality: number;
      executionQuality: number;
      environmentImpact: 'helped' | 'neutral' | 'hindered' | 'unknown';
      varianceSource: 'planning' | 'execution' | 'environment' | 'model' | 'mixed';
      learning: string;
      nextAdjustment: string;
    },
  ): Promise<void> {
    await withTransaction(this.database, async (client) => {
      await client.query(
        `INSERT INTO decision.outcomes (
          id, checkin_id, actual_result, decision_quality, execution_quality,
          environment_impact, variance_source, learning, next_adjustment
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (checkin_id) DO UPDATE SET
          actual_result = EXCLUDED.actual_result,
          decision_quality = EXCLUDED.decision_quality,
          execution_quality = EXCLUDED.execution_quality,
          environment_impact = EXCLUDED.environment_impact,
          variance_source = EXCLUDED.variance_source,
          learning = EXCLUDED.learning,
          next_adjustment = EXCLUDED.next_adjustment`,
        [
          randomUUID(), id, outcome.actualResult, outcome.decisionQuality, outcome.executionQuality,
          outcome.environmentImpact, outcome.varianceSource, outcome.learning, outcome.nextAdjustment,
        ],
      );
      await client.query(
        `UPDATE decision.daily_checkins SET lifecycle_status = 'reviewed', updated_at = now() WHERE id = $1`,
        [id],
      );
      await client.query('UPDATE core.knowledge_objects SET status = $2, updated_at = now() WHERE id = $1', [id, 'reviewed']);
      await appendAuditEvent(client, {
        aggregateType: 'daily_checkin',
        aggregateId: id,
        eventType: 'OUTCOME_RECORDED',
        payload: outcome,
        rulesetVersion: this.rulesetVersion,
      });
    });
  }

  async getOutcome(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.database.query('SELECT * FROM decision.outcomes WHERE checkin_id = $1', [id]);
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  }
}

function mapCheckin(row: Record<string, unknown>): DailyRecord {
  return {
    id: String(row.id),
    checkinDate: formatDateOnly(row.checkin_date),
    availableMinutes: Number(row.available_minutes),
    reservePercent: Number(row.reserve_percent),
    energy: Number(row.energy),
    attention: Number(row.attention),
    stageGoal: String(row.stage_goal),
    mainContradiction: String(row.main_contradiction),
    bottleneck: String(row.bottleneck),
    mainAction: String(row.main_action),
    deliverable: String(row.deliverable),
    estimatedMinutes: Number(row.estimated_minutes),
    stopCondition: String(row.stop_condition),
    explicitNotDo: String(row.explicit_not_do),
    contradictionContribution: Number(row.contradiction_contribution),
    bottleneckContribution: Number(row.bottleneck_contribution),
    evidenceStrength: Number(row.evidence_strength),
    riskLevel: row.risk_level as DailyInput['riskLevel'],
    hasAuthorization: Boolean(row.has_authorization),
    lossTolerable: Boolean(row.loss_tolerable),
    hasRecoveryPlan: Boolean(row.has_recovery_plan),
    opensNewCoreProject: Boolean(row.opens_new_core_project),
    activeWip: Number(row.active_wip),
    analysis: row.analysis as DailyAnalysis,
    rulesetVersion: String(row.ruleset_version),
    lifecycleStatus: String(row.lifecycle_status),
    createdAt: new Date(String(row.created_at)),
  };
}

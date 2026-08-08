import { randomUUID } from 'node:crypto';
import { analyzeDaily, type DailyAnalysis, type DailyInput } from '../domain/daily.js';
import { allowedDecisionStatuses, canTransitionDecision, type DecisionLifecycleStatus } from '../domain/decision-lifecycle.js';
import type { OutcomeInput } from '../domain/outcome.js';
import { appendAuditEvent } from '../infrastructure/audit.js';
import { withTransaction, type Database, type Queryable } from '../infrastructure/db.js';
import { formatDateOnly } from '../platform/dates.js';
import { BusinessRuleError, ResourceNotFoundError } from './errors.js';
import { loadPortfolioContext } from './portfolio.js';

const lifecycleStatusLabels: Record<DecisionLifecycleStatus, string> = {
  planned: '已计划', executing: '执行中', awaiting_review: '待复盘', reviewed: '已闭环', cancelled: '已取消',
};
const projectStatusLabels: Record<string, string> = {
  idea: '想法', validating: '验证中', planned: '已计划', active: '进行中', maintaining: '维护中',
  paused: '已暂停', retiring: '退出中', retired: '已退出',
};
const lifecycleStatusLabel = (value: DecisionLifecycleStatus): string => lifecycleStatusLabels[value] ?? value;
const projectStatusLabel = (value: string): string => projectStatusLabels[value] ?? value;

export type DailyRecord = DailyInput & {
  id: string;
  analysis: DailyAnalysis;
  rulesetVersion: string;
  lifecycleStatus: DecisionLifecycleStatus;
  projectTitle: string | null;
  allowedLifecycleStatuses: readonly DecisionLifecycleStatus[];
  createdAt: Date;
};

export class CheckinService {
  constructor(private readonly database: Database, private readonly rulesetVersion: string) {}

  async analyze(input: DailyInput): Promise<DailyAnalysis> {
    const portfolio = await loadPortfolioContext(this.database, this.rulesetVersion);
    return analyzeDaily({ ...input, ...portfolio });
  }

  async create(input: DailyInput): Promise<string> {
    const id = randomUUID();
    await withTransaction(this.database, async (client) => {
      const portfolio = await loadPortfolioContext(client, this.rulesetVersion);
      const authoritativeInput = { ...input, ...portfolio };
      const analysis = analyzeDaily(authoritativeInput);
      if (authoritativeInput.projectId) await assertProjectAcceptsDecision(client, authoritativeInput.projectId);
      await client.query(
        `INSERT INTO decision.daily_checkins (
          id, checkin_date, available_minutes, reserve_percent, energy, attention,
          stage_goal, main_contradiction, bottleneck, main_action, deliverable,
          estimated_minutes, stop_condition, explicit_not_do,
          contradiction_contribution, bottleneck_contribution, evidence_strength,
          risk_level, has_authorization, loss_tolerable, has_recovery_plan,
          opens_new_core_project, active_wip, project_id, analysis_status, analysis_snapshot,
          ruleset_version, lifecycle_status
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27,$28
        )`,
        [
          id, authoritativeInput.checkinDate, authoritativeInput.availableMinutes, authoritativeInput.reservePercent,
          authoritativeInput.energy, authoritativeInput.attention, authoritativeInput.stageGoal,
          authoritativeInput.mainContradiction, authoritativeInput.bottleneck, authoritativeInput.mainAction,
          authoritativeInput.deliverable, authoritativeInput.estimatedMinutes, authoritativeInput.stopCondition,
          authoritativeInput.explicitNotDo, authoritativeInput.contradictionContribution,
          authoritativeInput.bottleneckContribution, authoritativeInput.evidenceStrength,
          authoritativeInput.riskLevel, authoritativeInput.hasAuthorization, authoritativeInput.lossTolerable,
          authoritativeInput.hasRecoveryPlan, authoritativeInput.opensNewCoreProject, authoritativeInput.activeWip,
          authoritativeInput.projectId, analysis.status, JSON.stringify(analysis),
          this.rulesetVersion, 'planned',
        ],
      );

      await client.query(
        `INSERT INTO core.knowledge_objects(id, object_type, title, status, attributes)
         VALUES ($1, 'decision', $2, 'planned', jsonb_build_object('checkin_date', $3::date))`,
        [id, authoritativeInput.mainAction, authoritativeInput.checkinDate],
      );
      if (authoritativeInput.projectId) {
        const strength = Math.min(1, (
          authoritativeInput.contradictionContribution * 0.55
          + authoritativeInput.bottleneckContribution * 0.45
        ) / 10);
        await client.query(
          `INSERT INTO core.relations(id, source_id, relation_type, target_id, strength, evidence)
           VALUES ($1,$2,'advances',$3,$4,$5)`,
          [randomUUID(), id, authoritativeInput.projectId, strength, '日常决策创建时选择关联项目'],
        );
      }

      await appendAuditEvent(client, {
        aggregateType: 'daily_checkin',
        aggregateId: id,
        eventType: 'CHECKIN_ANALYZED_AND_SAVED',
        payload: { input: authoritativeInput, analysis },
        rulesetVersion: this.rulesetVersion,
      });
    });

    return id;
  }

  async get(id: string): Promise<DailyRecord | null> {
    const result = await this.database.query(
      `SELECT checkin.*, checkin.analysis_snapshot AS analysis, project.title AS project_title
       FROM decision.daily_checkins AS checkin
       LEFT JOIN core.projects AS project ON project.id = checkin.project_id
       WHERE checkin.id = $1`,
      [id],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapCheckin(row) : null;
  }

  async listRecent(limit = 14): Promise<DailyRecord[]> {
    const result = await this.database.query(
      `SELECT checkin.*, checkin.analysis_snapshot AS analysis, project.title AS project_title
       FROM decision.daily_checkins AS checkin
       LEFT JOIN core.projects AS project ON project.id = checkin.project_id
       ORDER BY checkin.checkin_date DESC, checkin.created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => mapCheckin(row as Record<string, unknown>));
  }

  async recordOutcome(
    id: string,
    outcome: OutcomeInput,
  ): Promise<void> {
    await withTransaction(this.database, async (client) => {
      const current = await client.query<{ lifecycle_status: DecisionLifecycleStatus }>(
        'SELECT lifecycle_status FROM decision.daily_checkins WHERE id = $1 FOR UPDATE',
        [id],
      );
      const previousStatus = current.rows[0]?.lifecycle_status;
      if (!previousStatus) throw new ResourceNotFoundError('CHECKIN_NOT_FOUND', '日常决策不存在。');
      if (previousStatus === 'cancelled') {
        throw new BusinessRuleError('CANCELLED_CHECKIN_OUTCOME', '已取消的决策不能记录执行结果；请新建决策保留事实边界。');
      }
      if (previousStatus !== 'awaiting_review' && previousStatus !== 'reviewed') {
        throw new BusinessRuleError(
          'CHECKIN_NOT_READY_FOR_REVIEW',
          '只有待复盘的决策可以首次记录结果；请先确认已经开始执行并推进到待复盘。',
        );
      }
      const existing = await client.query<{ id: string }>('SELECT id FROM decision.outcomes WHERE checkin_id = $1', [id]);
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
        eventType: existing.rowCount ? 'OUTCOME_CORRECTED' : 'OUTCOME_RECORDED',
        payload: { ...outcome, previousStatus },
        rulesetVersion: this.rulesetVersion,
      });
    });
  }

  async changeLifecycle(id: string, status: DecisionLifecycleStatus): Promise<void> {
    await withTransaction(this.database, async (client) => {
      const current = await client.query<{ lifecycle_status: DecisionLifecycleStatus }>(
        'SELECT lifecycle_status FROM decision.daily_checkins WHERE id = $1 FOR UPDATE',
        [id],
      );
      const previousStatus = current.rows[0]?.lifecycle_status;
      if (!previousStatus) throw new ResourceNotFoundError('CHECKIN_NOT_FOUND', '日常决策不存在。');
      if (previousStatus === status) return;
      if (!canTransitionDecision(previousStatus, status)) {
        throw new BusinessRuleError(
          'INVALID_DECISION_TRANSITION',
          `决策状态不能从 ${lifecycleStatusLabel(previousStatus)} 直接变更为 ${lifecycleStatusLabel(status)}。`,
        );
      }
      await client.query(
        'UPDATE decision.daily_checkins SET lifecycle_status = $2, updated_at = now() WHERE id = $1',
        [id, status],
      );
      await client.query(
        'UPDATE core.knowledge_objects SET status = $2, updated_at = now() WHERE id = $1',
        [id, status],
      );
      await appendAuditEvent(client, {
        aggregateType: 'daily_checkin', aggregateId: id, eventType: 'CHECKIN_LIFECYCLE_CHANGED',
        payload: { previousStatus, status }, rulesetVersion: this.rulesetVersion,
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
    projectId: row.project_id ? String(row.project_id) : null,
    activeWip: Number(row.active_wip),
    wipLimit: Number((row.analysis as DailyAnalysis)?.wipLimit ?? 3),
    analysis: row.analysis as DailyAnalysis,
    rulesetVersion: String(row.ruleset_version),
    lifecycleStatus: row.lifecycle_status as DecisionLifecycleStatus,
    projectTitle: row.project_title ? String(row.project_title) : null,
    allowedLifecycleStatuses: allowedDecisionStatuses(row.lifecycle_status as DecisionLifecycleStatus),
    createdAt: new Date(String(row.created_at)),
  };
}

async function assertProjectAcceptsDecision(client: Queryable, projectId: string): Promise<void> {
  const project = await client.query<{ status: string }>('SELECT status FROM core.projects WHERE id = $1 FOR SHARE', [projectId]);
  const status = project.rows[0]?.status;
  if (!status) throw new ResourceNotFoundError('PROJECT_NOT_FOUND', '关联项目不存在。');
  if (status !== 'active' && status !== 'maintaining') {
    throw new BusinessRuleError('PROJECT_NOT_ACCEPTING_DECISIONS', `项目当前状态为 ${projectStatusLabel(status)}，不能关联新的日常决策。`);
  }
}

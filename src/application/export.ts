import type { Database } from '../infrastructure/db.js';

export type PortableExport = {
  format: 'praxis-control-portable-json';
  formatVersion: 1;
  exportedAt: string;
  rulesetVersion: string;
  backend: Database['backend'];
  data: Record<string, unknown[]>;
  counts: Record<string, number>;
};

const exports = [
  ['objectives', 'SELECT * FROM core.objectives ORDER BY id'],
  ['projects', 'SELECT * FROM core.projects ORDER BY id'],
  ['knowledgeObjects', 'SELECT * FROM core.knowledge_objects ORDER BY id'],
  ['relations', 'SELECT * FROM core.relations ORDER BY id'],
  ['ruleVersions', 'SELECT * FROM governance.rule_versions ORDER BY version'],
  ['auditEvents', 'SELECT * FROM governance.audit_events ORDER BY created_at, id'],
  ['schemaMigrations', 'SELECT * FROM governance.schema_migrations ORDER BY version'],
  ['dailyCheckins', `SELECT id, to_char(checkin_date, 'YYYY-MM-DD') AS checkin_date,
    available_minutes, reserve_percent, energy, attention, stage_goal, main_contradiction,
    bottleneck, main_action, deliverable, estimated_minutes, stop_condition, explicit_not_do,
    contradiction_contribution, bottleneck_contribution, evidence_strength, risk_level,
    has_authorization, loss_tolerable, has_recovery_plan, opens_new_core_project, active_wip,
    analysis_status, analysis_snapshot, ruleset_version, lifecycle_status, created_at
    FROM decision.daily_checkins ORDER BY checkin_date, created_at, id`],
  ['outcomes', 'SELECT * FROM decision.outcomes ORDER BY created_at, id'],
  ['weeklyReviews', `SELECT id, to_char(week_start, 'YYYY-MM-DD') AS week_start,
    checkin_count, reviewed_count, average_decision_quality, average_execution_quality,
    main_contradiction_status, current_bottleneck, evidence_update, portfolio_change,
    next_breakthrough, created_at FROM decision.weekly_reviews ORDER BY week_start, id`],
] as const;

export async function createPortableExport(database: Database, rulesetVersion: string): Promise<PortableExport> {
  const results = await Promise.all(exports.map(async ([name, sql]) => [name, (await database.query(sql)).rows] as const));
  const data = Object.fromEntries(results) as Record<string, unknown[]>;
  return {
    format: 'praxis-control-portable-json',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    rulesetVersion,
    backend: database.backend,
    data,
    counts: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length])),
  };
}

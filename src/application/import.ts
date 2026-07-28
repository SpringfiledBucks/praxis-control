import { z } from 'zod';
import { verifyAuditRows, type AuditEventRow } from '../infrastructure/audit.js';
import type { Database, Queryable } from '../infrastructure/db.js';
import type { PortableExport } from './export.js';

const requiredCollections = [
  'objectives',
  'projects',
  'knowledgeObjects',
  'relations',
  'ruleVersions',
  'auditEvents',
  'schemaMigrations',
  'dailyCheckins',
  'outcomes',
  'weeklyReviews',
] as const;

const portableExportSchema = z.object({
  format: z.literal('praxis-control-portable-json'),
  formatVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  rulesetVersion: z.string().min(1),
  backend: z.enum(['pglite', 'postgres']),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  counts: z.record(z.string(), z.number().int().nonnegative()),
});

type ImportTable = {
  collection: (typeof requiredCollections)[number];
  table: string;
  columns: readonly string[];
  jsonColumns?: readonly string[];
};

const importTables: readonly ImportTable[] = [
  {
    collection: 'ruleVersions', table: 'governance.rule_versions',
    columns: ['version', 'name', 'description', 'parameters', 'active', 'created_at'], jsonColumns: ['parameters'],
  },
  {
    collection: 'objectives', table: 'core.objectives',
    columns: ['id', 'title', 'horizon', 'status', 'acceptance', 'non_goals', 'created_at', 'updated_at'],
  },
  {
    collection: 'projects', table: 'core.projects',
    columns: ['id', 'title', 'kind', 'status', 'objective_id', 'current_bottleneck', 'exit_condition', 'created_at', 'updated_at'],
  },
  {
    collection: 'dailyCheckins', table: 'decision.daily_checkins',
    columns: [
      'id', 'checkin_date', 'available_minutes', 'reserve_percent', 'energy', 'attention', 'stage_goal',
      'main_contradiction', 'bottleneck', 'main_action', 'deliverable', 'estimated_minutes', 'stop_condition',
      'explicit_not_do', 'contradiction_contribution', 'bottleneck_contribution', 'evidence_strength',
      'risk_level', 'has_authorization', 'loss_tolerable', 'has_recovery_plan', 'opens_new_core_project',
      'active_wip', 'analysis_status', 'analysis_snapshot', 'ruleset_version', 'lifecycle_status', 'created_at',
    ],
    jsonColumns: ['analysis_snapshot'],
  },
  {
    collection: 'outcomes', table: 'decision.outcomes',
    columns: ['id', 'checkin_id', 'actual_result', 'decision_quality', 'execution_quality', 'environment_impact', 'variance_source', 'learning', 'next_adjustment', 'created_at'],
  },
  {
    collection: 'weeklyReviews', table: 'decision.weekly_reviews',
    columns: ['id', 'week_start', 'checkin_count', 'reviewed_count', 'average_decision_quality', 'average_execution_quality', 'main_contradiction_status', 'current_bottleneck', 'evidence_update', 'portfolio_change', 'next_breakthrough', 'created_at'],
  },
  {
    collection: 'knowledgeObjects', table: 'core.knowledge_objects',
    columns: ['id', 'object_type', 'title', 'status', 'attributes', 'created_at', 'updated_at'], jsonColumns: ['attributes'],
  },
  {
    collection: 'relations', table: 'core.relations',
    columns: ['id', 'source_id', 'relation_type', 'target_id', 'strength', 'evidence', 'attributes', 'created_at'], jsonColumns: ['attributes'],
  },
  {
    collection: 'auditEvents', table: 'governance.audit_events',
    columns: ['id', 'aggregate_type', 'aggregate_id', 'event_type', 'payload', 'ruleset_version', 'previous_hash', 'event_hash', 'created_at'], jsonColumns: ['payload'],
  },
];

const targetCountSql = `SELECT
  (SELECT count(*) FROM governance.rule_versions)::int +
  (SELECT count(*) FROM core.objectives)::int +
  (SELECT count(*) FROM core.projects)::int +
  (SELECT count(*) FROM core.knowledge_objects)::int +
  (SELECT count(*) FROM core.relations)::int +
  (SELECT count(*) FROM decision.daily_checkins)::int +
  (SELECT count(*) FROM decision.outcomes)::int +
  (SELECT count(*) FROM decision.weekly_reviews)::int +
  (SELECT count(*) FROM governance.audit_events)::int AS count`;

export function parsePortableSnapshot(value: unknown): PortableExport {
  const snapshot = portableExportSchema.parse(value) as PortableExport;
  for (const collection of requiredCollections) {
    const rows = snapshot.data[collection];
    if (!rows) throw new Error(`便携快照缺少集合：${collection}`);
    if (snapshot.counts[collection] !== rows.length) {
      throw new Error(`便携快照计数不一致：${collection}`);
    }
  }

  const auditRows = snapshot.data.auditEvents as unknown as AuditEventRow[];
  const verification = verifyAuditRows(auditRows);
  if (!verification.valid) {
    throw new Error(`便携快照审计链无效：${verification.failures.length} 个异常`);
  }
  return snapshot;
}

export async function importPortableSnapshot(database: Database, input: unknown): Promise<Record<string, number>> {
  const snapshot = parsePortableSnapshot(input);
  await database.transaction(async (client) => {
    const targetMigrations = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM governance.schema_migrations ORDER BY version',
    );
    const sourceMigrations = (snapshot.data.schemaMigrations as Array<Record<string, unknown>>)
      .map((row) => ({ version: String(row.version), checksum: String(row.checksum) }))
      .sort((left, right) => left.version.localeCompare(right.version));
    if (JSON.stringify(targetMigrations.rows) !== JSON.stringify(sourceMigrations)) {
      throw new Error('快照与目标数据库迁移版本或校验和不一致。');
    }

    const targetCount = await client.query<{ count: number | string }>(targetCountSql);
    if (Number(targetCount.rows[0]?.count ?? 0) !== 0) {
      throw new Error('导入目标不是空库；不会合并或覆盖现有数据。');
    }

    for (const table of importTables) {
      await insertCollection(client, table, snapshot.data[table.collection] as Record<string, unknown>[]);
    }

    await client.query(`INSERT INTO governance.audit_heads (aggregate_type, aggregate_id, last_event_hash)
      SELECT DISTINCT ON (event.aggregate_type, event.aggregate_id)
        event.aggregate_type, event.aggregate_id, event.event_hash
      FROM governance.audit_events AS event
      WHERE NOT EXISTS (
        SELECT 1 FROM governance.audit_events AS successor
        WHERE successor.aggregate_type = event.aggregate_type
          AND successor.aggregate_id = event.aggregate_id
          AND successor.previous_hash = event.event_hash
      )
      ORDER BY event.aggregate_type, event.aggregate_id, event.created_at DESC, event.id DESC`);
  });

  return Object.fromEntries(requiredCollections.map((name) => [name, snapshot.data[name]!.length]));
}

async function insertCollection(client: Queryable, table: ImportTable, rows: Record<string, unknown>[]): Promise<void> {
  const jsonColumns = new Set(table.jsonColumns ?? []);
  for (const row of rows) {
    const values = table.columns.map((column) => jsonColumns.has(column) ? JSON.stringify(row[column] ?? {}) : row[column] ?? null);
    const placeholders = table.columns.map((column, index) => `$${index + 1}${jsonColumns.has(column) ? '::jsonb' : ''}`);
    await client.query(
      `INSERT INTO ${table.table} (${table.columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values,
    );
  }
}

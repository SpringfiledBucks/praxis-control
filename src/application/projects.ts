import { randomUUID } from 'node:crypto';
import { appendAuditEvent } from '../infrastructure/audit.js';
import { withTransaction, type Database } from '../infrastructure/db.js';

export async function createProject(
  database: Database,
  rulesetVersion: string,
  input: { title: string; kind: string; currentBottleneck: string; exitCondition: string },
): Promise<string> {
  const id = randomUUID();
  await withTransaction(database, async (client) => {
    const objective = await client.query<{ id: string }>(
      `SELECT id FROM core.objectives WHERE status = 'active'
       ORDER BY CASE horizon WHEN 'stage' THEN 0 WHEN 'strategic' THEN 1 ELSE 2 END, created_at
       LIMIT 1`,
    );
    const objectiveId = objective.rows[0]?.id ?? null;
    await client.query(
      `INSERT INTO core.projects(id, title, kind, status, objective_id, current_bottleneck, exit_condition)
       VALUES ($1,$2,$3,'active',$4,$5,$6)`,
      [id, input.title, input.kind, objectiveId, input.currentBottleneck, input.exitCondition],
    );
    await client.query(
      `INSERT INTO core.knowledge_objects(id, object_type, title, status, attributes)
       VALUES ($1, 'project', $2, 'active', jsonb_build_object('kind', $3::text))`,
      [id, input.title, input.kind],
    );
    if (objectiveId) {
      await client.query(
        `INSERT INTO core.relations(id, source_id, relation_type, target_id, strength, evidence)
         VALUES ($1,$2,'supports',$3,1,$4)
         ON CONFLICT (source_id, relation_type, target_id) DO NOTHING`,
        [randomUUID(), id, objectiveId, '项目创建时绑定当前阶段目标'],
      );
    }
    await appendAuditEvent(client, {
      aggregateType: 'project', aggregateId: id, eventType: 'PROJECT_CREATED', payload: input, rulesetVersion,
    });
  });
  return id;
}

export async function listProjects(database: Database): Promise<Record<string, unknown>[]> {
  const result = await database.query('SELECT * FROM core.projects ORDER BY created_at DESC');
  return result.rows;
}

export async function changeProjectStatus(
  database: Database,
  rulesetVersion: string,
  id: string,
  status: 'active' | 'maintaining' | 'paused' | 'retiring' | 'retired',
): Promise<void> {
  await withTransaction(database, async (client) => {
    await client.query('UPDATE core.projects SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
    await client.query('UPDATE core.knowledge_objects SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
    await appendAuditEvent(client, {
      aggregateType: 'project', aggregateId: id, eventType: 'PROJECT_STATUS_CHANGED', payload: { status }, rulesetVersion,
    });
  });
}

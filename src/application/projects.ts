import { randomUUID } from 'node:crypto';
import { allowedProjectStatuses, canTransitionProject, isCoreWipStatus, type ProjectStatus } from '../domain/portfolio.js';
import { appendAuditEvent } from '../infrastructure/audit.js';
import { withTransaction, type Database } from '../infrastructure/db.js';
import { BusinessRuleError, ResourceNotFoundError } from './errors.js';
import { assertWipCapacity, loadPortfolioContext, type PortfolioContext } from './portfolio.js';

const projectStatusLabels: Record<ProjectStatus, string> = {
  idea: '想法', validating: '验证中', planned: '已计划', active: '进行中', maintaining: '维护中',
  paused: '已暂停', retiring: '退出中', retired: '已退出',
};
const projectStatusLabel = (value: ProjectStatus): string => projectStatusLabels[value] ?? value;

export type ProjectRecord = Record<string, unknown> & {
  id: string;
  status: ProjectStatus;
  allowedStatuses: readonly ProjectStatus[];
};

export type ProjectPortfolio = PortfolioContext & {
  projects: ProjectRecord[];
};

export async function createProject(
  database: Database,
  rulesetVersion: string,
  input: { title: string; kind: string; currentBottleneck: string; exitCondition: string },
): Promise<string> {
  const id = randomUUID();
  await withTransaction(database, async (client) => {
    const portfolio = await loadPortfolioContext(client, rulesetVersion, { lockPolicy: true });
    assertWipCapacity(portfolio, 'active');
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

export async function listProjects(database: Database): Promise<ProjectRecord[]> {
  const result = await database.query('SELECT * FROM core.projects ORDER BY created_at DESC');
  return result.rows.map((row) => {
    const project = row as Record<string, unknown> & { id: string; status: ProjectStatus };
    return { ...project, allowedStatuses: allowedProjectStatuses(project.status) } as ProjectRecord;
  });
}

export async function loadProjectPortfolio(database: Database, rulesetVersion: string): Promise<ProjectPortfolio> {
  const [projects, context] = await Promise.all([
    listProjects(database),
    loadPortfolioContext(database, rulesetVersion),
  ]);
  return { projects, ...context };
}

export async function changeProjectStatus(
  database: Database,
  rulesetVersion: string,
  id: string,
  status: ProjectStatus,
): Promise<void> {
  await withTransaction(database, async (client) => {
    const portfolio = await loadPortfolioContext(client, rulesetVersion, {
      lockPolicy: true,
      excludeProjectId: id,
    });
    const current = await client.query<{ status: ProjectStatus }>(
      'SELECT status FROM core.projects WHERE id = $1 FOR UPDATE',
      [id],
    );
    const previousStatus = current.rows[0]?.status;
    if (!previousStatus) throw new ResourceNotFoundError('PROJECT_NOT_FOUND', '项目不存在或已被删除。');
    if (previousStatus === status) return;
    if (!canTransitionProject(previousStatus, status)) {
      throw new BusinessRuleError(
        'INVALID_PROJECT_TRANSITION',
        `项目状态不能从 ${projectStatusLabel(previousStatus)} 直接变更为 ${projectStatusLabel(status)}。`,
      );
    }
    if (!isCoreWipStatus(previousStatus)) assertWipCapacity(portfolio, status);
    await client.query('UPDATE core.projects SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
    await client.query('UPDATE core.knowledge_objects SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
    await appendAuditEvent(client, {
      aggregateType: 'project', aggregateId: id, eventType: 'PROJECT_STATUS_CHANGED',
      payload: { previousStatus, status }, rulesetVersion,
    });
  });
}

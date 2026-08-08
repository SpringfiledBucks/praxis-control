import type { Database } from '../infrastructure/db.js';
import type { AdvisoryRequest } from './contracts.js';
import type { ModelGateway, ModelGatewayResult } from './gateway.js';
import type { PreparedAdvisoryContext } from './context.js';
import { appendAuditEvent } from '../infrastructure/audit.js';
import { withTransaction } from '../infrastructure/db.js';

export type AdvisoryTaskRow = {
  id: string;
  use_case: string;
  request: AdvisoryRequest;
  context_digest: string;
  status: string;
  provider: string | undefined;
  model: string | undefined;
  output: unknown;
  error_code: string | undefined;
  timing_ms: number | undefined;
  usage: unknown;
  user_decision: string | undefined;
  modified_value: unknown;
  decision_reason: string | undefined;
  created_at: string;
  updated_at: string;
};

export type AdvisoryTaskDecision = {
  decision: 'accepted' | 'accepted_modified' | 'rejected';
  modifiedValue: Record<string, string> | undefined;
  reason: string;
};

const validTransitions: Record<string, string[]> = {
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed'],
  succeeded: ['pending_user', 'expired'],
  pending_user: ['accepted', 'accepted_modified', 'rejected', 'expired'],
};

function canTransition(from: string, to: string): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

function mapRow(row: Record<string, unknown>): AdvisoryTaskRow {
  return {
    id: row.id as string,
    use_case: row.use_case as string,
    request: typeof row.request === 'string' ? JSON.parse(row.request as string) : row.request as AdvisoryRequest,
    context_digest: row.context_digest as string,
    status: row.status as string,
    provider: (row.provider ?? undefined) as string | undefined,
    model: (row.model ?? undefined) as string | undefined,
    output: typeof row.output === 'string' ? JSON.parse(row.output as string) : (row.output ?? undefined),
    error_code: (row.error_code ?? undefined) as string | undefined,
    timing_ms: (row.timing_ms ?? undefined) as number | undefined,
    usage: typeof row.usage === 'string' ? JSON.parse(row.usage as string) : (row.usage ?? undefined),
    user_decision: (row.user_decision ?? undefined) as string | undefined,
    modified_value: typeof row.modified_value === 'string' ? JSON.parse(row.modified_value as string) : (row.modified_value ?? undefined),
    decision_reason: (row.decision_reason ?? undefined) as string | undefined,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

async function updateTaskStatus(client: { query: Database['query'] }, taskId: string, status: string, extra?: Record<string, unknown>): Promise<void> {
  const sets = ['status = $1', 'updated_at = now()'];
  const values: unknown[] = [status];
  let idx = 2;
  if (extra) {
    for (const [key, val] of Object.entries(extra)) {
      sets.push(`${key} = $${idx}`);
      values.push(val);
      idx++;
    }
  }
  values.push(taskId);
  await client.query(`UPDATE advisory.ai_tasks SET ${sets.join(', ')} WHERE id = $${idx}`, values);
}

export class AdvisoryTaskService {
  private database: Database;
  private gateway: ModelGateway;
  private rulesetVersion: string;

  constructor(database: Database, gateway: ModelGateway, rulesetVersion: string) {
    this.database = database;
    this.gateway = gateway;
    this.rulesetVersion = rulesetVersion;
  }

  async enqueue(request: AdvisoryRequest, contextDigest: string): Promise<string> {
    return await withTransaction(this.database, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO advisory.ai_tasks (use_case, request, context_digest, status)
         VALUES ($1, $2, $3, 'queued') RETURNING id`,
        [request.useCase, JSON.stringify(request), contextDigest],
      );
      const id = result.rows[0]!.id;
      await appendAuditEvent(client, {
        aggregateType: 'advisory_task',
        aggregateId: id,
        eventType: 'TASK_ENQUEUED',
        payload: { useCase: request.useCase, contextDigest },
        rulesetVersion: this.rulesetVersion,
      });
      return id;
    });
  }

  async process(taskId: string): Promise<AdvisoryTaskRow> {
    const task = await this.get(taskId);
    if (!canTransition(task.status, 'running')) {
      throw new Error(`cannot transition from ${task.status} to running`);
    }
    await updateTaskStatus(this.database, taskId, 'running');

    const start = Date.now();
    const context: PreparedAdvisoryContext = {
      schemaVersion: 1,
      request: task.request,
      records: [],
      audit: { recordIds: task.request.recordIds, recordTypes: [], fieldNames: [], characterCount: 0 },
      digest: task.context_digest,
    };

    const result = await this.gateway.advise(context);
    const timingMs = Date.now() - start;

    return await withTransaction(this.database, async (client) => {
      if (result.status === 'disabled') {
        await updateTaskStatus(client, taskId, 'failed', { error_code: 'ai_disabled', timing_ms: timingMs });
        return await this.get(taskId);
      }

      if (result.status === 'failed') {
        await updateTaskStatus(client, taskId, 'failed', { error_code: result.error.code, timing_ms: timingMs });
        await appendAuditEvent(client, {
          aggregateType: 'advisory_task',
          aggregateId: taskId,
          eventType: 'TASK_FAILED',
          payload: { errorCode: result.error.code, timingMs },
          rulesetVersion: this.rulesetVersion,
        });
        return await this.get(taskId);
      }

      await updateTaskStatus(client, taskId, 'pending_user', {
        output: JSON.stringify(result.response),
        timing_ms: timingMs,
      });
      await appendAuditEvent(client, {
        aggregateType: 'advisory_task',
        aggregateId: taskId,
        eventType: 'TASK_SUCCEEDED',
        payload: { timingMs, suggestionCount: result.response.suggestions.length },
        rulesetVersion: this.rulesetVersion,
      });

      return await this.get(taskId);
    });
  }

  async applyDecision(taskId: string, decision: AdvisoryTaskDecision): Promise<AdvisoryTaskRow> {
    const task = await this.get(taskId);
    if (!canTransition(task.status, decision.decision)) {
      throw new Error(`cannot transition from ${task.status} to ${decision.decision}`);
    }

    return await withTransaction(this.database, async (client) => {
      await updateTaskStatus(client, taskId, decision.decision, {
        user_decision: decision.decision,
        modified_value: decision.modifiedValue ? JSON.stringify(decision.modifiedValue) : null,
        decision_reason: decision.reason,
      });
      await appendAuditEvent(client, {
        aggregateType: 'advisory_task',
        aggregateId: taskId,
        eventType: `ADVISORY_${decision.decision.toUpperCase()}`,
        payload: { decision: decision.decision, reason: decision.reason },
        rulesetVersion: this.rulesetVersion,
      });
      return await this.get(taskId);
    });
  }

  async get(taskId: string): Promise<AdvisoryTaskRow> {
    const result = await this.database.query<Record<string, unknown>>(
      'SELECT * FROM advisory.ai_tasks WHERE id = $1',
      [taskId],
    );
    if (result.rows.length === 0) throw new Error(`task not found: ${taskId}`);
    return mapRow(result.rows[0]!);
  }

  async listPending(): Promise<AdvisoryTaskRow[]> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT * FROM advisory.ai_tasks WHERE status = 'pending_user' ORDER BY created_at DESC LIMIT 20`,
    );
    return result.rows.map(mapRow);
  }

  async listRecent(limit = 20): Promise<AdvisoryTaskRow[]> {
    const result = await this.database.query<Record<string, unknown>>(
      'SELECT * FROM advisory.ai_tasks ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map(mapRow);
  }
}

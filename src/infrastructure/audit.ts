import { createHash, randomUUID } from 'node:crypto';
import type { Queryable } from './db.js';

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

export type AuditEventRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: unknown;
  previous_hash: string | null;
  event_hash: string;
};

export type AuditVerification = {
  valid: boolean;
  totalEvents: number;
  aggregateCount: number;
  failures: Array<{
    id: string;
    reason: 'event_hash_mismatch' | 'missing_predecessor' | 'multiple_roots' | 'fork' | 'disconnected';
  }>;
};

export function computeAuditEventHash(event: {
  previousHash: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
}): string {
  return createHash('sha256')
    .update(`${event.previousHash ?? ''}|${event.aggregateType}|${event.aggregateId}|${event.eventType}|${stableJson(event.payload)}`)
    .digest('hex');
}

export function verifyAuditRows(rows: AuditEventRow[]): AuditVerification {
  const groups = new Map<string, AuditEventRow[]>();
  const failures: AuditVerification['failures'] = [];

  for (const row of rows) {
    const aggregateKey = `${row.aggregate_type}:${row.aggregate_id}`;
    const group = groups.get(aggregateKey) ?? [];
    group.push(row);
    groups.set(aggregateKey, group);
    const expectedHash = computeAuditEventHash({
      previousHash: row.previous_hash,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload,
    });
    if (row.event_hash !== expectedHash) failures.push({ id: row.id, reason: 'event_hash_mismatch' });
  }

  for (const group of groups.values()) {
    const roots = group.filter((row) => row.previous_hash === null);
    if (roots.length !== 1) {
      for (const row of roots.length ? roots : group.slice(0, 1)) failures.push({ id: row.id, reason: 'multiple_roots' });
    }

    const byHash = new Map(group.map((row) => [row.event_hash, row]));
    const successors = new Map<string, AuditEventRow[]>();
    for (const row of group) {
      if (row.previous_hash === null) continue;
      if (!byHash.has(row.previous_hash)) failures.push({ id: row.id, reason: 'missing_predecessor' });
      const linked = successors.get(row.previous_hash) ?? [];
      linked.push(row);
      successors.set(row.previous_hash, linked);
    }
    for (const linked of successors.values()) {
      if (linked.length > 1) linked.forEach((row) => failures.push({ id: row.id, reason: 'fork' }));
    }

    if (roots.length === 1) {
      const visited = new Set<string>();
      let current: AuditEventRow | undefined = roots[0];
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        current = successors.get(current.event_hash)?.[0];
      }
      if (visited.size !== group.length) {
        group.filter((row) => !visited.has(row.id)).forEach((row) => failures.push({ id: row.id, reason: 'disconnected' }));
      }
    }
  }

  return {
    valid: failures.length === 0,
    totalEvents: rows.length,
    aggregateCount: groups.size,
    failures,
  };
}

export async function verifyAuditChain(client: Queryable): Promise<AuditVerification> {
  const result = await client.query<AuditEventRow>(`SELECT
    id, aggregate_type, aggregate_id, event_type, payload, previous_hash, event_hash
    FROM governance.audit_events
    ORDER BY aggregate_type, aggregate_id, created_at, id`);
  return verifyAuditRows(result.rows);
}

export async function appendAuditEvent(
  client: Queryable,
  event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: unknown;
    rulesetVersion?: string;
  },
): Promise<void> {
  const previous = await client.query<{ event_hash: string }>(
    `SELECT event_hash FROM governance.audit_events
     WHERE aggregate_type = $1 AND aggregate_id = $2
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [event.aggregateType, event.aggregateId],
  );
  const previousHash = previous.rows[0]?.event_hash ?? null;
  const payloadJson = stableJson(event.payload);
  const eventHash = computeAuditEventHash({
    previousHash,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    payload: event.payload,
  });

  await client.query(
    `INSERT INTO governance.audit_events
      (id, aggregate_type, aggregate_id, event_type, payload, ruleset_version, previous_hash, event_hash)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
    [
      randomUUID(),
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      payloadJson,
      event.rulesetVersion ?? null,
      previousHash,
      eventHash,
    ],
  );
}

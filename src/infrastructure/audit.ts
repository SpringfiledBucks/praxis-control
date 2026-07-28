import { createHash, randomUUID } from 'node:crypto';
import type { Queryable } from './db.js';

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
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
  const eventHash = createHash('sha256')
    .update(`${previousHash ?? ''}|${event.aggregateType}|${event.aggregateId}|${event.eventType}|${payloadJson}`)
    .digest('hex');

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

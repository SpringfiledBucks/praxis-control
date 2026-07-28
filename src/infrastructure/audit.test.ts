import { describe, expect, it } from 'vitest';
import { computeAuditEventHash, verifyAuditRows, type AuditEventRow } from './audit.js';

function event(id: string, payload: unknown, previousHash: string | null): AuditEventRow {
  return {
    id,
    aggregate_type: 'daily_checkin',
    aggregate_id: '11111111-1111-4111-8111-111111111111',
    event_type: id === 'event-1' ? 'CREATED' : 'REVIEWED',
    payload,
    previous_hash: previousHash,
    event_hash: computeAuditEventHash({
      previousHash,
      aggregateType: 'daily_checkin',
      aggregateId: '11111111-1111-4111-8111-111111111111',
      eventType: id === 'event-1' ? 'CREATED' : 'REVIEWED',
      payload,
    }),
  };
}

describe('audit chain verification', () => {
  it('accepts an intact aggregate chain', () => {
    const first = event('event-1', { status: 'READY' }, null);
    const second = event('event-2', { result: 'done' }, first.event_hash);
    expect(verifyAuditRows([first, second])).toMatchObject({ valid: true, totalEvents: 2, aggregateCount: 1 });
  });

  it('detects payload and link tampering', () => {
    const first = event('event-1', { status: 'READY' }, null);
    const second = event('event-2', { result: 'done' }, 'incorrect-previous-hash');
    first.payload = { status: 'BLOCKED' };
    const verification = verifyAuditRows([first, second]);
    expect(verification.valid).toBe(false);
    expect(verification.failures.map((failure) => failure.reason)).toContain('event_hash_mismatch');
    expect(verification.failures.map((failure) => failure.reason)).toContain('missing_predecessor');
  });

  it('does not depend on timestamp or query order', () => {
    const first = event('event-1', { status: 'READY' }, null);
    const second = event('event-2', { result: 'done' }, first.event_hash);
    expect(verifyAuditRows([second, first]).valid).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { prepareAdvisoryContext } from './context.js';
import { createModelGateway } from './gateway.js';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

const checkins = [
  { type: 'checkin', id: firstId, checkinDate: '2026-07-31', mainAction: 'finish contract tests', deliverable: 'verified contract' },
  { type: 'weekly_review', id: secondId, weekStart: '2026-07-27', summary: 'one open validation item' },
] as const;

describe('advisory context preparation', () => {
  it('creates a deterministic digest independent of selected record order', () => {
    const first = prepareAdvisoryContext(
      { useCase: 'weekly_review_draft', recordIds: [secondId, firstId] },
      checkins,
    );
    const second = prepareAdvisoryContext(
      { useCase: 'weekly_review_draft', recordIds: [firstId, secondId] },
      [...checkins].reverse(),
    );
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.audit).toMatchObject({
      recordIds: [firstId, secondId],
      recordTypes: ['checkin', 'weekly_review'],
    });
    expect(first.audit.characterCount).toBeGreaterThan(0);
    expect(first.audit.fieldNames).toContain('records.mainAction');
  });

  it('requires exactly the explicitly selected records', () => {
    expect(() => prepareAdvisoryContext(
      { useCase: 'weekly_review_draft', recordIds: [firstId] },
      checkins,
    )).toThrow('exactly the selected record IDs');
  });

  it('rejects record types outside the use-case allowlist', () => {
    expect(() => prepareAdvisoryContext(
      { useCase: 'evidence_relations', recordIds: [firstId] },
      [checkins[0]],
    )).toThrow('not allowed');
  });

  it.each([
    'inspect C:\\Users\\owner\\private.txt',
    'connect to ssh://internal-host',
    'query 192.168.10.20 for details',
    'read /home/owner/private.txt',
    'open https://nas.local/private',
  ])('rejects private locator text: %s', (userInstruction) => {
    expect(() => prepareAdvisoryContext(
      { useCase: 'weekly_review_draft', recordIds: [], userInstruction },
      [],
    )).toThrow('forbidden');
  });

  it('allows a public evidence source URL', () => {
    expect(prepareAdvisoryContext(
      { useCase: 'evidence_relations', recordIds: [firstId] },
      [{ type: 'evidence', id: firstId, title: 'public source', summary: 'published evidence', sourceUrl: 'https://example.com/evidence' }],
    ).records).toHaveLength(1);
  });

  it('keeps the model gateway disabled without a configured provider', async () => {
    const context = prepareAdvisoryContext(
      { useCase: 'weekly_review_draft', recordIds: [firstId] },
      [checkins[0]],
    );
    await expect(createModelGateway('disabled').advise(context)).resolves.toEqual({
      status: 'disabled',
      reason: 'not_configured',
      contextDigest: context.digest,
    });
  });
});

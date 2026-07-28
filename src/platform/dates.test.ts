import { describe, expect, it } from 'vitest';
import { formatDateOnly } from './dates.js';

describe('formatDateOnly', () => {
  it('normalizes the Date objects returned by PGlite', () => {
    expect(formatDateOnly(new Date('2026-07-28T00:00:00.000Z'))).toBe('2026-07-28');
  });

  it('preserves PostgreSQL date strings', () => {
    expect(formatDateOnly('2026-07-28')).toBe('2026-07-28');
  });
});

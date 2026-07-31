import { describe, expect, it } from 'vitest';
import { addDateOnlyDays, currentWeekStart, formatDateOnly } from './dates.js';

describe('formatDateOnly', () => {
  it('normalizes the Date objects returned by PGlite', () => {
    expect(formatDateOnly(new Date('2026-07-28T00:00:00.000Z'))).toBe('2026-07-28');
  });

  it('preserves PostgreSQL date strings', () => {
    expect(formatDateOnly('2026-07-28')).toBe('2026-07-28');
  });
});

describe('date-only week helpers', () => {
  it('adds days without depending on the host time zone', () => {
    expect(addDateOnlyDays('2026-07-31', 3)).toBe('2026-08-03');
    expect(addDateOnlyDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('uses the Asia/Shanghai calendar date when selecting Monday', () => {
    expect(currentWeekStart(new Date('2026-08-02T16:30:00.000Z'))).toBe('2026-08-03');
    expect(currentWeekStart(new Date('2026-08-02T15:30:00.000Z'))).toBe('2026-07-27');
  });
});

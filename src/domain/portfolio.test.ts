import { describe, expect, it } from 'vitest';
import { allowedProjectStatuses, canTransitionProject, isCoreWipStatus } from './portfolio.js';

describe('project portfolio rules', () => {
  it('identifies statuses that consume core WIP capacity', () => {
    expect(isCoreWipStatus('active')).toBe(true);
    expect(isCoreWipStatus('maintaining')).toBe(true);
    expect(isCoreWipStatus('paused')).toBe(false);
    expect(isCoreWipStatus('retired')).toBe(false);
  });

  it('allows reversible lifecycle steps but keeps retired projects terminal', () => {
    expect(canTransitionProject('active', 'paused')).toBe(true);
    expect(canTransitionProject('paused', 'active')).toBe(true);
    expect(canTransitionProject('active', 'retired')).toBe(false);
    expect(canTransitionProject('retired', 'active')).toBe(false);
    expect(allowedProjectStatuses('active')).toEqual(['active', 'maintaining', 'paused', 'retiring']);
  });
});

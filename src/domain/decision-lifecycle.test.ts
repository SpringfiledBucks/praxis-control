import { describe, expect, it } from 'vitest';
import { allowedDecisionStatuses, canTransitionDecision } from './decision-lifecycle.js';

describe('decision lifecycle', () => {
  it('supports execution and review preparation without skipping terminal states', () => {
    expect(canTransitionDecision('planned', 'executing')).toBe(true);
    expect(canTransitionDecision('executing', 'awaiting_review')).toBe(true);
    expect(canTransitionDecision('planned', 'reviewed')).toBe(false);
    expect(canTransitionDecision('cancelled', 'executing')).toBe(false);
    expect(allowedDecisionStatuses('awaiting_review')).toEqual(['executing', 'cancelled']);
    expect(allowedDecisionStatuses('reviewed')).toEqual([]);
  });
});

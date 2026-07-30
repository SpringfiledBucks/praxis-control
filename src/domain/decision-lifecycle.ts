export const decisionLifecycleStatuses = [
  'planned',
  'executing',
  'awaiting_review',
  'reviewed',
  'cancelled',
] as const;

export type DecisionLifecycleStatus = (typeof decisionLifecycleStatuses)[number];

export const decisionLifecycleActionStatuses = ['executing', 'awaiting_review', 'cancelled'] as const;

const transitions: Record<DecisionLifecycleStatus, readonly DecisionLifecycleStatus[]> = {
  planned: ['executing', 'cancelled'],
  executing: ['awaiting_review', 'cancelled'],
  awaiting_review: ['executing', 'cancelled'],
  reviewed: [],
  cancelled: [],
};

export function canTransitionDecision(from: DecisionLifecycleStatus, to: DecisionLifecycleStatus): boolean {
  return from === to || transitions[from].includes(to);
}

export function allowedDecisionStatuses(from: DecisionLifecycleStatus): readonly DecisionLifecycleStatus[] {
  return transitions[from];
}

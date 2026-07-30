export const projectStatuses = [
  'idea',
  'validating',
  'planned',
  'active',
  'maintaining',
  'paused',
  'retiring',
  'retired',
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

const transitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
  idea: ['validating', 'planned', 'retired'],
  validating: ['idea', 'planned', 'paused', 'retired'],
  planned: ['validating', 'active', 'paused', 'retired'],
  active: ['maintaining', 'paused', 'retiring'],
  maintaining: ['active', 'paused', 'retiring'],
  paused: ['planned', 'active', 'maintaining', 'retiring', 'retired'],
  retiring: ['active', 'retired'],
  retired: [],
};

export function isCoreWipStatus(status: ProjectStatus): boolean {
  return status === 'active' || status === 'maintaining';
}

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return from === to || transitions[from].includes(to);
}

export function allowedProjectStatuses(from: ProjectStatus): readonly ProjectStatus[] {
  return [from, ...transitions[from]];
}

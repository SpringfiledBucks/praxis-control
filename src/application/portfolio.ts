import type { ProjectStatus } from '../domain/portfolio.js';
import type { Queryable } from '../infrastructure/db.js';
import { BusinessRuleError } from './errors.js';

export type PortfolioContext = {
  activeWip: number;
  wipLimit: number;
};

export async function loadPortfolioContext(
  queryable: Queryable,
  rulesetVersion: string,
  options: { lockPolicy?: boolean; excludeProjectId?: string } = {},
): Promise<PortfolioContext> {
  const policy = await queryable.query<{ wip_limit: number | string | null }>(
    `SELECT parameters->>'wip_limit' AS wip_limit
     FROM governance.rule_versions
     WHERE version = $1${options.lockPolicy ? ' FOR UPDATE' : ''}`,
    [rulesetVersion],
  );
  if (!policy.rowCount) {
    throw new BusinessRuleError('RULESET_NOT_READY', `规则版本 ${rulesetVersion} 尚未初始化。`);
  }
  const wipLimit = Number(policy.rows[0]?.wip_limit ?? 3);
  if (!Number.isInteger(wipLimit) || wipLimit < 1) {
    throw new BusinessRuleError('INVALID_WIP_POLICY', `规则版本 ${rulesetVersion} 的 WIP 上限无效。`);
  }
  const count = await queryable.query<{ count: number | string }>(
    `SELECT count(*)::int AS count
     FROM core.projects
     WHERE status IN ('active', 'maintaining')
       AND ($1::text IS NULL OR id::text <> $1::text)`,
    [options.excludeProjectId ?? null],
  );
  return { activeWip: Number(count.rows[0]?.count ?? 0), wipLimit };
}

export function assertWipCapacity(context: PortfolioContext, targetStatus: ProjectStatus): void {
  if ((targetStatus === 'active' || targetStatus === 'maintaining') && context.activeWip >= context.wipLimit) {
    throw new BusinessRuleError(
      'WIP_LIMIT_REACHED',
      `核心在制品已达到 ${context.activeWip} / ${context.wipLimit}；请先暂停、退出或完成一个现有项目。`,
    );
  }
}

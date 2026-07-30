import type { Request } from 'express';
import { dailyInputSchema, type DailyInput } from '../domain/daily.js';

function checked(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

export function parseDailyBody(body: Request['body']): DailyInput {
  return dailyInputSchema.parse({
    checkinDate: body.checkinDate,
    availableMinutes: body.availableMinutes,
    reservePercent: body.reservePercent,
    energy: body.energy,
    attention: body.attention,
    stageGoal: body.stageGoal,
    mainContradiction: body.mainContradiction,
    bottleneck: body.bottleneck,
    mainAction: body.mainAction,
    deliverable: body.deliverable,
    estimatedMinutes: body.estimatedMinutes,
    stopCondition: body.stopCondition,
    explicitNotDo: body.explicitNotDo ?? '',
    contradictionContribution: body.contradictionContribution,
    bottleneckContribution: body.bottleneckContribution,
    evidenceStrength: body.evidenceStrength,
    riskLevel: body.riskLevel,
    hasAuthorization: checked(body.hasAuthorization),
    lossTolerable: checked(body.lossTolerable),
    hasRecoveryPlan: checked(body.hasRecoveryPlan),
    opensNewCoreProject: checked(body.opensNewCoreProject),
    activeWip: body.activeWip ?? 0,
    wipLimit: body.wipLimit ?? 3,
  });
}

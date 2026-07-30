import { describe, expect, it } from 'vitest';
import { analyzeDaily, type DailyInput } from './daily.js';

function baseInput(overrides: Partial<DailyInput> = {}): DailyInput {
  return {
    checkinDate: '2026-07-28',
    availableMinutes: 120,
    reservePercent: 20,
    energy: 7,
    attention: 7,
    stageGoal: '建立实践反馈闭环',
    mainContradiction: '方法完整与日常使用摩擦之间的矛盾',
    bottleneck: '缺少低摩擦交互入口',
    mainAction: '完成日常决策服务的第一条闭环',
    deliverable: '可保存并复盘一条日常决策',
    estimatedMinutes: 90,
    stopCondition: '关键测试失败两次后停止扩展并定位原因',
    explicitNotDo: '不实现完整十四模块',
    contradictionContribution: 9,
    bottleneckContribution: 9,
    evidenceStrength: 7,
    riskLevel: 'low',
    hasAuthorization: false,
    lossTolerable: true,
    hasRecoveryPlan: false,
    opensNewCoreProject: false,
    activeWip: 1,
    wipLimit: 3,
    ...overrides,
  };
}

describe('analyzeDaily', () => {
  it('returns READY for an aligned, feasible, low-risk action', () => {
    const result = analyzeDaily(baseInput());
    expect(result.status).toBe('READY');
    expect(result.usableMinutes).toBe(96);
    expect(result.benefitBand).toBe('高');
  });

  it('blocks high-risk work without authorization', () => {
    const result = analyzeDaily(baseInput({ riskLevel: 'high', hasRecoveryPlan: true }));
    expect(result.status).toBe('BLOCKED');
    expect(result.triggeredRules).toContain('HARD-AUTH-001');
  });

  it('blocks an action with intolerable worst-case loss', () => {
    const result = analyzeDaily(baseInput({ lossTolerable: false }));
    expect(result.status).toBe('BLOCKED');
    expect(result.triggeredRules).toContain('HARD-LOSS-001');
  });

  it('reduces scope when cognitive capacity is low', () => {
    const result = analyzeDaily(baseInput({ energy: 2 }));
    expect(result.status).toBe('CAUTION');
    expect(result.triggeredRules).toContain('HUMAN-CAPACITY-001');
  });

  it('warns instead of accepting a fourth core project', () => {
    const result = analyzeDaily(baseInput({ activeWip: 3, opensNewCoreProject: true }));
    expect(result.status).toBe('CAUTION');
    expect(result.triggeredRules).toContain('WIP-LIMIT-001');
  });

  it('uses the ruleset WIP limit instead of a hard-coded threshold', () => {
    const result = analyzeDaily(baseInput({ activeWip: 4, wipLimit: 5, opensNewCoreProject: true }));
    expect(result.status).toBe('READY');
    expect(result.wipLimit).toBe(5);
    expect(result.triggeredRules).not.toContain('WIP-LIMIT-001');
  });

  it('does not let strong benefit compensate for insufficient resources', () => {
    const result = analyzeDaily(baseInput({ availableMinutes: 30, estimatedMinutes: 120 }));
    expect(result.status).toBe('CAUTION');
    expect(result.feasibilityBand).toBe('低');
    expect(result.triggeredRules).toContain('RESOURCE-FIT-001');
  });
});

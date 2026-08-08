import { z } from 'zod';

export const dailyInputSchema = z.object({
  checkinDate: z.iso.date(),
  availableMinutes: z.coerce.number().int().min(0).max(1440),
  reservePercent: z.coerce.number().int().min(0).max(80).default(20),
  energy: z.coerce.number().int().min(0).max(10),
  attention: z.coerce.number().int().min(0).max(10),
  stageGoal: z.string().trim().min(1).max(500),
  mainContradiction: z.string().trim().min(1).max(1000),
  bottleneck: z.string().trim().min(1).max(1000),
  mainAction: z.string().trim().min(1).max(1000),
  deliverable: z.string().trim().min(1).max(1000),
  estimatedMinutes: z.coerce.number().int().min(1).max(1440),
  stopCondition: z.string().trim().min(1).max(1000),
  explicitNotDo: z.string().trim().max(1000).default(''),
  contradictionContribution: z.coerce.number().int().min(0).max(10),
  bottleneckContribution: z.coerce.number().int().min(0).max(10),
  evidenceStrength: z.coerce.number().int().min(0).max(10),
  riskLevel: z.enum(['low', 'medium', 'high']),
  hasAuthorization: z.boolean().default(false),
  lossTolerable: z.boolean().default(true),
  hasRecoveryPlan: z.boolean().default(false),
  opensNewCoreProject: z.boolean().default(false),
  projectId: z.preprocess((value) => value === '' || value === undefined ? null : value, z.uuid().nullable()).default(null),
  activeWip: z.coerce.number().int().min(0).max(99).default(0),
  wipLimit: z.coerce.number().int().min(1).max(99).default(3),
});

export type DailyInput = z.infer<typeof dailyInputSchema>;
export type AnalysisStatus = 'READY' | 'CAUTION' | 'BLOCKED';

export type DailyAnalysis = {
  status: AnalysisStatus;
  usableMinutes: number;
  wipLimit: number;
  capacityBand: '低' | '中' | '高';
  benefitBand: '低' | '中' | '高';
  feasibilityBand: '低' | '中' | '高';
  riskBand: '低' | '中' | '高';
  recommendation: string;
  reasons: string[];
  warnings: string[];
  triggeredRules: string[];
  assumptions: string[];
  nextReviewTrigger: string;
};

function band(value: number): '低' | '中' | '高' {
  if (value < 4) return '低';
  if (value < 7.5) return '中';
  return '高';
}

export function analyzeDaily(input: DailyInput): DailyAnalysis {
  const usableMinutes = Math.max(0, Math.floor(input.availableMinutes * (1 - input.reservePercent / 100)));
  const resourceFit = Math.min(10, (usableMinutes / input.estimatedMinutes) * 10);
  const benefit = input.contradictionContribution * 0.55 + input.bottleneckContribution * 0.45;
  const feasibility = Math.min(resourceFit, input.energy, input.attention, input.evidenceStrength);
  const riskBase = input.riskLevel === 'high' ? 9 : input.riskLevel === 'medium' ? 5.5 : 2;

  const reasons: string[] = [];
  const warnings: string[] = [];
  const triggeredRules: string[] = [];
  const assumptions = [
    '输入的可用时间已扣除固定工作和基本生活责任',
    '主要任务确实服务于当前阶段目标',
  ];

  let status: AnalysisStatus = 'READY';
  let recommendation = `按计划推进“${input.mainAction}”，先交付“${input.deliverable}”。`;

  if (input.riskLevel === 'high' && !input.hasAuthorization) {
    status = 'BLOCKED';
    recommendation = '停止执行：高风险事项尚未确认授权。';
    warnings.push('高风险行动缺少授权，收益不能抵消该硬门槛。');
    triggeredRules.push('HARD-AUTH-001');
  }

  if (!input.lossTolerable) {
    status = 'BLOCKED';
    recommendation = '停止或缩小行动规模：最坏损失当前不可承受。';
    warnings.push('不可承受损失属于不可补偿边界。');
    triggeredRules.push('HARD-LOSS-001');
  }

  if (input.riskLevel === 'high' && !input.hasRecoveryPlan) {
    status = 'BLOCKED';
    recommendation = '停止执行：先补充回滚、恢复或人工接管方案。';
    warnings.push('高风险行动没有恢复路径。');
    triggeredRules.push('HARD-RECOVERY-001');
  }

  if (status !== 'BLOCKED' && (input.energy <= 3 || input.attention <= 3)) {
    status = 'CAUTION';
    recommendation = `调整为低风险最小实践：只完成“${input.deliverable}”的最小可验证部分。`;
    warnings.push('当前认知状态不足以支持高复杂度或高风险执行。');
    triggeredRules.push('HUMAN-CAPACITY-001');
  }

  if (status !== 'BLOCKED' && usableMinutes < input.estimatedMinutes) {
    status = 'CAUTION';
    recommendation = `当前仅有 ${usableMinutes} 分钟可分配，请缩小范围并保留停止条件。`;
    warnings.push(`预计投入 ${input.estimatedMinutes} 分钟，超过扣除储备后的可用资源。`);
    triggeredRules.push('RESOURCE-FIT-001');
  }

  if (status !== 'BLOCKED' && input.opensNewCoreProject && input.activeWip >= input.wipLimit) {
    status = 'CAUTION';
    recommendation = `不要直接新增核心项目：当前核心在制品为 ${input.activeWip} / ${input.wipLimit}，请先暂停、完成或退出一个现有项目。`;
    warnings.push(`核心在制品已经达到规则上限 ${input.wipLimit}。`);
    triggeredRules.push('WIP-LIMIT-001');
  }

  if (input.contradictionContribution < 5 || input.bottleneckContribution < 5) {
    warnings.push('该任务对主要矛盾或当前瓶颈的贡献偏低，应与替代任务比较机会成本。');
    triggeredRules.push('ALIGNMENT-001');
    if (status === 'READY') status = 'CAUTION';
  } else {
    reasons.push('任务与当前主要矛盾和瓶颈具有明确关联。');
  }

  if (input.evidenceStrength < 4) {
    warnings.push('证据较弱，初始行动规模应保持可逆并优先获取信息。');
    triggeredRules.push('EVIDENCE-SCALE-001');
    if (status === 'READY') status = 'CAUTION';
  } else {
    reasons.push('当前证据足以支持该规模的可逆行动。');
  }

  if (usableMinutes >= input.estimatedMinutes) {
    reasons.push(`扣除 ${input.reservePercent}% 储备后仍可覆盖预计投入。`);
  }

  return {
    status,
    usableMinutes,
    wipLimit: input.wipLimit,
    capacityBand: band(Math.min(input.energy, input.attention)),
    benefitBand: band(benefit),
    feasibilityBand: band(feasibility),
    riskBand: band(riskBase),
    recommendation,
    reasons,
    warnings,
    triggeredRules,
    assumptions,
    nextReviewTrigger: input.stopCondition,
  };
}

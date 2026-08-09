import { z } from 'zod';

export const advisoryUseCases = [
  'checkin_structure',
  'weekly_review_draft',
  'evidence_relations',
  'rule_explanation',
] as const;

export const advisoryTargetFields = [
  'stageGoal',
  'mainContradiction',
  'bottleneck',
  'mainAction',
  'deliverable',
  'stopCondition',
  'evidenceRelation',
  'weeklyReviewDraft',
  'ruleExplanation',
] as const;

export const advisoryRequestSchema = z.object({
  useCase: z.enum(advisoryUseCases),
  recordIds: z.array(z.uuid()).max(20),
  userInstruction: z.string().trim().max(2000).optional(),
  locale: z.literal('zh-CN').default('zh-CN'),
}).strict().superRefine((request, context) => {
  if (new Set(request.recordIds).size !== request.recordIds.length) {
    context.addIssue({ code: 'custom', path: ['recordIds'], message: 'recordIds must be unique' });
  }
});

export const advisorySuggestionSchema = z.object({
  targetField: z.enum(advisoryTargetFields),
  proposedValue: z.string().trim().min(1).max(4000),
  rationale: z.string().trim().min(1).max(1000),
  sourceRecordIds: z.array(z.uuid()).max(20),
  usesUserInstruction: z.boolean(),
  confidence: z.enum(['low', 'medium', 'high']),
  uncertainties: z.array(z.string().trim().min(1).max(500)).max(10),
}).strict().superRefine((suggestion, context) => {
  if (!suggestion.usesUserInstruction && suggestion.sourceRecordIds.length === 0) {
    context.addIssue({ code: 'custom', path: ['sourceRecordIds'], message: '建议必须引用记录或本次用户输入' });
  }
});

export const advisoryResponseSchema = z.object({
  schemaVersion: z.number().int().min(1),
  summary: z.string().trim().max(1000).default(''),
  suggestions: z.array(advisorySuggestionSchema).max(20).default([]),
  warnings: z.array(z.string().trim().max(500)).max(10).default([]),
});

export type AdvisoryRequest = z.infer<typeof advisoryRequestSchema>;
export type AdvisoryResponse = z.infer<typeof advisoryResponseSchema>;

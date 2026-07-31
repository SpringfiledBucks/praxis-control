import { describe, expect, it } from 'vitest';
import { advisoryRequestSchema, advisoryResponseSchema } from './contracts.js';

const recordId = '11111111-1111-4111-8111-111111111111';

describe('LLM advisory contracts', () => {
  it('accepts a sourced categorical suggestion', () => {
    expect(advisoryResponseSchema.parse({
      schemaVersion: 1,
      summary: '建议缩小今日行动范围。',
      suggestions: [{
        targetField: 'mainAction',
        proposedValue: '先完成接口合同测试',
        rationale: '当前可用时间只能覆盖最小闭环。',
        sourceRecordIds: [recordId],
        usesUserInstruction: true,
        confidence: 'medium',
        uncertainties: ['实际中断时间未知'],
      }],
      warnings: [],
    }).suggestions).toHaveLength(1);
  });

  it('rejects hidden numeric scoring and unknown output fields', () => {
    expect(() => advisoryResponseSchema.parse({
      schemaVersion: 1,
      summary: '建议',
      suggestions: [],
      warnings: [],
      score: 92,
    })).toThrow();
  });

  it('rejects suggestions that cite neither a record nor the current user input', () => {
    expect(() => advisoryResponseSchema.parse({
      schemaVersion: 1,
      summary: '建议',
      suggestions: [{
        targetField: 'bottleneck', proposedValue: '未知瓶颈', rationale: '无来源',
        sourceRecordIds: [], usesUserInstruction: false, confidence: 'low', uncertainties: [],
      }],
      warnings: [],
    })).toThrow();
  });

  it('limits callers to explicit record identifiers instead of arbitrary context', () => {
    expect(advisoryRequestSchema.parse({ useCase: 'weekly_review_draft', recordIds: [recordId] })).toMatchObject({ locale: 'zh-CN' });
    expect(() => advisoryRequestSchema.parse({ useCase: 'weekly_review_draft', recordIds: [], databaseDump: 'all rows' })).toThrow();
  });
});

import { advisoryResponseSchema, type AdvisoryResponse } from './contracts.js';
import type { PreparedAdvisoryContext } from './context.js';
import type { ModelGateway, ModelGatewayResult } from './gateway.js';

type HttpGatewayConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
};

function buildSystemPrompt(useCase: string): string {
  const base = '你是 Praxis Control（个人实践与决策系统）的顾问。你的输出是结构化建议草案，供用户确认、修改或拒绝后才生效。';

  const safety = [
    '禁止编造记录 ID、数值评分、事实或来源。',
    '禁止输出密钥、密码、令牌或敏感信息。',
    '禁止将建议标记为“已完成”或替代硬门槛检查。',
    '不确定的地方标注低置信度并列出具体不确定项。',
    '每条建议必须引用实际的 sourceRecordIds 或标记 usesUserInstruction=true。',
  ].join(' ');

  const framework = {
    checkin_structure: [
      'Praxis Control 的日常决策框架：',
      '1. 硬门槛：是否有授权？损失是否可承受？是否有恢复路径？任一项失败则该行动不可进入下一阶段。',
      '2. 主要矛盾候选排序：哪个现实与目标之间的差距最大？改变它能否带动其他问题？是否有现实干预路径？',
      '3. WIP 容量：当前在制品是否<3？资源负载是否<85%？',
      '4. 候选方案：当前方案/完全切换/小规模试验/等待信息/不行动 — 至少提示已检查哪些。',
      '5. 一条主要行动 + 可观察交付物 + 停止条件 + 今天明确不做的事。',
      '输出 targetField 使用：stageGoal, mainContradiction, bottleneck, mainAction, deliverable, stopCondition。',
      '每条建议的 confidence 基于：high=多个来源一致支持、medium=有依据但不完整、low=基于用户指令推断。',
    ].join(' '),

    weekly_review_draft: [
      '生成周复盘草稿。区分两类数据：',
      'computed snapshot = 系统自动计算的完成数/平均质量/决策数（不可修改）。',
      'reported snapshot = 用户可调整的总结，调整需注明 reason。',
      '输出结构：本周完成 vs 计划 → 偏差归因（决策质量/执行质量/环境变化/随机性）→ 瓶颈是否转移 → 下周调整方向 → 遗留风险。',
      'targetField: weeklyReviewDraft。注意：不要覆盖用户手动修改的 reported 值，只在 draft 中提供建议。',
    ].join(' '),

    evidence_relations: [
      '分析证据记录之间的逻辑关系。每条关系标注类型：',
      'supports（A 支持 B）、contradicts（A 与 B 矛盾）、complements（A 补充 B）、prerequisite（A 是 B 前置条件）。',
      '关系必须有 strength 说明（strong/weak/conditional），不确定时标注条件。',
      'targetField: evidenceRelation。同时建议 evidenceRelation 的 relationType 和 strength。',
    ].join(' '),

    rule_explanation: [
      '解释已触发的确定性规则——不重新评估规则结果。格式：',
      '输入摘要 → 规则版本与逻辑 → 输出 → 为什么得到这个结果。',
      '如果用户对规则结果有疑问，解释为什么规则这样判定，但不要修改规则输出。',
      'targetField: ruleExplanation。',
    ].join(' '),
  };

  const example = {
    checkin_structure: [
      '输出示例：',
      '{ "schemaVersion": 1, "summary": "项目"数据盘故障修复"当前瓶颈为现场人力不足，建议今日行动为完成B02POD9剩余3台故障盘更换。",',
      '"suggestions": [{ "targetField": "mainAction", "proposedValue": "完成B02POD9剩余3台RH2288H V3服务器数据盘故障更换",',
      '"rationale": "瓶颈字段和阶段目标均指向故障盘更换为当前最阻塞事项", "sourceRecordIds": ["uuid-of-project"],',
      '"usesUserInstruction": false, "confidence": "high", "uncertainties": ["剩余3台是否实际可操作需现场确认"] }] }',
    ].join(' '),
  };

  const prompts: Record<string, string> = {
    checkin_structure: [base, framework.checkin_structure, example.checkin_structure, safety].join('\n\n'),
    weekly_review_draft: [base, framework.weekly_review_draft, safety].join('\n\n'),
    evidence_relations: [base, framework.evidence_relations, safety].join('\n\n'),
    rule_explanation: [base, framework.rule_explanation, safety].join('\n\n'),
  };
  return (prompts[useCase] ?? prompts.checkin_structure)!;
}

class HttpModelGateway implements ModelGateway {
  private config: HttpGatewayConfig;

  constructor(config: HttpGatewayConfig) {
    this.config = config;
  }

  async advise(context: PreparedAdvisoryContext): Promise<ModelGatewayResult> {
    const { baseUrl, model, apiKey, timeoutMs, maxRetries } = this.config;
    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

    const messages = [
      { role: 'system', content: buildSystemPrompt(context.request.useCase) },
      {
        role: 'user',
        content: JSON.stringify({
          useCase: context.request.useCase,
          userInstruction: context.request.userInstruction ?? null,
          records: context.records,
          locale: context.request.locale,
        }),
      },
    ];

    let lastError = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            response_format: { type: 'json_object' },
            max_tokens: 4096,
          }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          lastError = 'rate_limited';
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 2000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (!response.ok) {
          lastError = `http_${response.status}`;
          if (response.status >= 500 && attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
            continue;
          }
          return {
            status: 'failed' as const,
            contextDigest: context.digest,
            error: { code: lastError, message: await response.text().catch(() => '') },
          };
        }

        const body = await response.json() as Record<string, unknown>;
        const content = (body as any)?.choices?.[0]?.message?.content as string | undefined;
        if (typeof content !== 'string') {
          lastError = 'invalid_response_format';
          if (attempt < maxRetries) continue;
          return { status: 'failed' as const, contextDigest: context.digest, error: { code: lastError, message: 'no content in response' } };
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          lastError = 'json_parse_failed';
          if (attempt < maxRetries) continue;
          return { status: 'failed' as const, contextDigest: context.digest, error: { code: lastError, message: 'response is not valid JSON' } };
        }

        const validation = advisoryResponseSchema.safeParse(parsed);
        if (!validation.success) {
          lastError = 'schema_validation_failed';
          if (attempt < maxRetries) continue;
          return {
            status: 'failed' as const,
            contextDigest: context.digest,
            error: { code: lastError, message: validation.error.message },
          };
        }

        return { status: 'completed' as const, contextDigest: context.digest, response: validation.data as AdvisoryResponse };
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          lastError = 'timeout';
        } else {
          lastError = err instanceof Error ? err.message.slice(0, 200) : 'unknown_error';
        }
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      status: 'failed' as const,
      contextDigest: context.digest,
      error: { code: lastError, message: `all ${maxRetries + 1} attempts failed` },
    };
  }
}

export function createHttpGateway(config: HttpGatewayConfig): ModelGateway {
  return new HttpModelGateway(config);
}

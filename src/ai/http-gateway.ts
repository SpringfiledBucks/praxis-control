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
  const prompts: Record<string, string> = {
    checkin_structure:
      '你是个人决策系统的结构化顾问。根据用户的项目上下文，输出结构化的日常行动建议。' +
      '每条建议必须引用实际的记录ID作为来源。不确定的地方标注为低置信度。' +
      '禁止编造记录ID、评分或事实。禁止输出密钥、敏感信息或执行指令。',
    weekly_review_draft:
      '根据本周的日常检查记录和复盘数据，生成周复盘草稿。' +
      '包含进展摘要、主要矛盾变化、瓶颈转移、下周建议。',
    evidence_relations:
      '分析证据记录之间的关系，建议关联类型（支持/矛盾/补充）。' +
      '每条关系建议必须引用实际的证据记录ID。',
    rule_explanation:
      '解释已触发的确定性规则：输入是什么、经过什么逻辑、为什么得到这个输出。' +
      '不要重新评估规则结果，只做解释。',
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
            temperature: 0.3,
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

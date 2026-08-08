import type { AdvisoryResponse } from './contracts.js';
import type { PreparedAdvisoryContext } from './context.js';

export type ModelGatewayResult =
  | { status: 'disabled'; reason: 'not_configured'; contextDigest: string }
  | { status: 'failed'; contextDigest: string; error: { code: string; message: string } }
  | { status: 'completed'; contextDigest: string; response: AdvisoryResponse };

export interface ModelGateway {
  advise(context: PreparedAdvisoryContext): Promise<ModelGatewayResult>;
}

class DisabledModelGateway implements ModelGateway {
  async advise(context: PreparedAdvisoryContext): Promise<ModelGatewayResult> {
    return {
      status: 'disabled',
      reason: 'not_configured',
      contextDigest: context.digest,
    };
  }
}

export async function createModelGateway(
  mode: 'disabled' | 'http',
  httpConfig?: { baseUrl: string; model: string; apiKey: string; timeoutMs: number; maxRetries: number },
): Promise<ModelGateway> {
  if (mode === 'disabled') return new DisabledModelGateway();
  if (mode === 'http') {
    if (!httpConfig) throw new Error('http mode requires httpConfig');
    const { createHttpGateway } = await import('./http-gateway.js');
    return createHttpGateway(httpConfig);
  }
  const exhaustive: never = mode;
  throw new Error(`unsupported model gateway mode: ${String(exhaustive)}`);
}

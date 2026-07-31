import type { AdvisoryResponse } from './contracts.js';
import type { PreparedAdvisoryContext } from './context.js';

export type ModelGatewayResult =
  | { status: 'disabled'; reason: 'not_configured'; contextDigest: string }
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

export function createModelGateway(mode: 'disabled'): ModelGateway {
  if (mode === 'disabled') return new DisabledModelGateway();
  const exhaustive: never = mode;
  throw new Error(`unsupported model gateway mode: ${String(exhaustive)}`);
}

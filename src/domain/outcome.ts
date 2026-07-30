import { z } from 'zod';

export const outcomeInputSchema = z.object({
  actualResult: z.string().trim().min(2).max(2000),
  decisionQuality: z.coerce.number().int().min(0).max(10),
  executionQuality: z.coerce.number().int().min(0).max(10),
  environmentImpact: z.enum(['helped', 'neutral', 'hindered', 'unknown']),
  varianceSource: z.enum(['planning', 'execution', 'environment', 'model', 'mixed']),
  learning: z.string().trim().min(2).max(2000),
  nextAdjustment: z.string().trim().min(2).max(2000),
});

export type OutcomeInput = z.infer<typeof outcomeInputSchema>;

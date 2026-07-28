import { z } from 'zod';

export const API_VERSION = 1 as const;

export const apiCapabilitiesSchema = z.object({
  dashboard: z.boolean(),
  checkins: z.boolean(),
  projects: z.boolean(),
  graph: z.boolean(),
  auditVerification: z.boolean(),
  portableExport: z.boolean(),
  backup: z.boolean(),
  safeShutdown: z.boolean(),
});

export const metaResponseSchema = z.object({
  apiVersion: z.literal(API_VERSION),
  rulesetVersion: z.string().min(1),
  backend: z.enum(['pglite', 'postgres']),
  capabilities: apiCapabilitiesSchema,
});

export const dashboardResponseSchema = z.object({
  activeProjects: z.array(z.object({
    id: z.string(),
    title: z.string(),
    kind: z.string(),
    current_bottleneck: z.string(),
  })),
  latestCheckin: z.record(z.string(), z.unknown()).nullable(),
  awaitingReview: z.number().int().nonnegative(),
  reviewedLast7Days: z.number().int().nonnegative(),
  activeWip: z.number().int().nonnegative(),
});

const analysisBandSchema = z.enum(['低', '中', '高']);

export const dailyAnalysisResponseSchema = z.object({
  status: z.enum(['READY', 'CAUTION', 'BLOCKED']),
  usableMinutes: z.number().int().nonnegative(),
  capacityBand: analysisBandSchema,
  benefitBand: analysisBandSchema,
  feasibilityBand: analysisBandSchema,
  riskBand: analysisBandSchema,
  recommendation: z.string(),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
  triggeredRules: z.array(z.string()),
  assumptions: z.array(z.string()),
  nextReviewTrigger: z.string(),
});

export const graphResponseSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    object_type: z.string(),
    title: z.string(),
    status: z.string(),
  })),
  edges: z.array(z.object({
    id: z.string(),
    source_id: z.string(),
    target_id: z.string(),
    relation_type: z.string(),
    strength: z.number().nullable(),
  })),
});

export const auditVerificationResponseSchema = z.object({
  valid: z.boolean(),
  totalEvents: z.number().int().nonnegative(),
  aggregateCount: z.number().int().nonnegative(),
  failures: z.array(z.object({
    id: z.string(),
    reason: z.enum([
      'event_hash_mismatch',
      'missing_predecessor',
      'multiple_roots',
      'fork',
      'disconnected',
    ]),
  })),
});

export const portableExportResponseSchema = z.object({
  format: z.literal('praxis-control-portable-json'),
  formatVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  rulesetVersion: z.string().min(1),
  backend: z.enum(['pglite', 'postgres']),
  data: z.record(z.string(), z.array(z.unknown())),
  counts: z.record(z.string(), z.number().int().nonnegative()),
});

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['connected', 'unavailable']),
  backend: z.enum(['pglite', 'postgres']).optional(),
  rulesetVersion: z.string().min(1),
});

export const errorResponseSchema = z.object({
  status: z.literal('error'),
  message: z.string().min(1),
});

export type MetaResponse = z.infer<typeof metaResponseSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type DailyAnalysisResponse = z.infer<typeof dailyAnalysisResponseSchema>;
export type GraphResponse = z.infer<typeof graphResponseSchema>;
export type AuditVerificationResponse = z.infer<typeof auditVerificationResponseSchema>;
export type PortableExportResponse = z.infer<typeof portableExportResponseSchema>;

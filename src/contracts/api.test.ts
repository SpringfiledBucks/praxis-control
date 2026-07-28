import { describe, expect, it } from 'vitest';
import { analyzeDaily } from '../domain/daily.js';
import {
  API_VERSION,
  auditVerificationResponseSchema,
  dailyAnalysisResponseSchema,
  dashboardResponseSchema,
  graphResponseSchema,
  metaResponseSchema,
  portableExportResponseSchema,
} from './api.js';
import { openApiDocument } from './openapi.js';

describe('shared API contract', () => {
  it('publishes every current JSON route with a stable API major version', () => {
    expect(openApiDocument.openapi).toBe('3.1.0');
    expect(openApiDocument.info.version).toBe(`${API_VERSION}.0.0`);
    expect(Object.keys(openApiDocument.paths).sort()).toEqual([
      '/api/audit/verify',
      '/api/checkins',
      '/api/checkins/analyze',
      '/api/dashboard',
      '/api/export',
      '/api/graph',
      '/api/meta',
      '/api/openapi.json',
      '/api/system/backup',
      '/api/system/shutdown',
      '/health',
    ]);
  });

  it('rejects contract drift in representative response shapes', () => {
    expect(metaResponseSchema.parse({
      apiVersion: API_VERSION,
      rulesetVersion: 'test',
      backend: 'pglite',
      capabilities: {
        dashboard: true,
        checkins: true,
        projects: true,
        graph: true,
        auditVerification: true,
        portableExport: true,
        backup: true,
        safeShutdown: true,
      },
    }).apiVersion).toBe(API_VERSION);

    expect(dashboardResponseSchema.parse({ activeProjects: [], latestCheckin: null, awaitingReview: 0, reviewedLast7Days: 0, activeWip: 0 })).toBeTruthy();
    expect(graphResponseSchema.parse({ nodes: [], edges: [] })).toBeTruthy();
    expect(auditVerificationResponseSchema.parse({ valid: true, totalEvents: 0, aggregateCount: 0, failures: [] })).toBeTruthy();
    expect(portableExportResponseSchema.parse({ format: 'praxis-control-portable-json', formatVersion: 1, exportedAt: new Date().toISOString(), rulesetVersion: 'test', backend: 'pglite', data: {}, counts: {} })).toBeTruthy();

    expect(dailyAnalysisResponseSchema.parse(analyzeDaily({
      checkinDate: '2026-07-28', availableMinutes: 60, reservePercent: 20, energy: 8, attention: 8,
      stageGoal: '稳定核心', mainContradiction: '接口漂移', bottleneck: '缺少合同', mainAction: '固化合同',
      deliverable: '机器可读合同', estimatedMinutes: 45, stopCondition: '合同测试通过', explicitNotDo: '',
      contradictionContribution: 8, bottleneckContribution: 8, evidenceStrength: 8, riskLevel: 'low',
      hasAuthorization: false, lossTolerable: true, hasRecoveryPlan: false, opensNewCoreProject: false, activeWip: 0,
    }))).toMatchObject({ status: 'READY' });
  });
});

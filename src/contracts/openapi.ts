import { API_VERSION } from './api.js';

const errorResponse = {
  description: '请求失败',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
} as const;

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Praxis Control API',
    version: `${API_VERSION}.0.0`,
    description: 'Web、CLI、TUI 与原生 GUI 共用的本地优先服务合同。客户端不得直接访问数据库。',
  },
  servers: [{ url: '/', description: '当前 Praxis Control 服务实例' }],
  paths: {
    '/api/openapi.json': {
      get: {
        summary: '读取本 API 的 OpenAPI 合同',
        operationId: 'getOpenApiDocument',
        responses: {
          '200': { description: 'OpenAPI 3.1 文档', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/api/meta': {
      get: {
        summary: '读取 API 版本和服务能力',
        operationId: 'getMeta',
        responses: {
          '200': { description: '服务元数据', content: { 'application/json': { schema: { $ref: '#/components/schemas/Meta' } } } },
        },
      },
    },
    '/api/dashboard': {
      get: {
        summary: '读取工作台摘要',
        operationId: 'getDashboard',
        responses: {
          '200': { description: '工作台摘要', content: { 'application/json': { schema: { $ref: '#/components/schemas/Dashboard' } } } },
          '500': errorResponse,
        },
      },
    },
    '/api/checkins/analyze': {
      post: {
        summary: '分析日常决策但不保存',
        operationId: 'analyzeCheckin',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DailyInput' } } } },
        responses: {
          '200': { description: '可解释分析', content: { 'application/json': { schema: { $ref: '#/components/schemas/DailyAnalysis' } } } },
          '403': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/checkins': {
      post: {
        summary: '保存日常决策',
        operationId: 'createCheckin',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DailyInput' } } } },
        responses: {
          '201': {
            description: '创建成功',
            content: { 'application/json': { schema: { type: 'object', required: ['status', 'id'], properties: { status: { const: 'created' }, id: { type: 'string', format: 'uuid' } } } } },
          },
          '403': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/graph': {
      get: {
        summary: '读取关系图谱',
        operationId: 'getGraph',
        responses: {
          '200': { description: '图谱节点和边', content: { 'application/json': { schema: { $ref: '#/components/schemas/Graph' } } } },
          '500': errorResponse,
        },
      },
    },
    '/api/audit/verify': {
      get: {
        summary: '校验追加式审计链',
        operationId: 'verifyAudit',
        responses: {
          '200': { description: '审计校验结果', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuditVerification' } } } },
          '500': errorResponse,
        },
      },
    },
    '/api/export': {
      get: {
        summary: '导出可移植 JSON 快照',
        operationId: 'createPortableExport',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: '可移植快照', content: { 'application/json': { schema: { $ref: '#/components/schemas/PortableExport' } } } },
          '403': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/system/backup': {
      post: {
        summary: '创建数据库备份',
        operationId: 'createBackup',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: '备份创建成功',
            content: { 'application/json': { schema: { type: 'object', required: ['status', 'target'], properties: { status: { const: 'created' }, target: { type: 'string' } } } } },
          },
          '403': errorResponse,
          '501': errorResponse,
          '500': errorResponse,
        },
      },
    },
    '/api/system/shutdown': {
      post: {
        summary: '请求服务安全关闭',
        operationId: 'shutdown',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } } },
        },
        responses: {
          '200': { description: '已进入关闭流程', content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { const: 'stopping' } } } } } },
          '403': errorResponse,
        },
      },
    },
    '/api/system/runtime': {
      get: {
        summary: '使用本机运行时令牌确认当前服务实例',
        operationId: 'runtimeIdentity',
        responses: {
          '200': { description: '令牌属于当前服务实例' },
          '403': errorResponse,
        },
      },
    },
    '/health': {
      get: {
        summary: '读取服务和数据库健康状态',
        operationId: 'getHealth',
        responses: {
          '200': { description: '服务健康', content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } } },
          '503': { description: '数据库不可用', content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } } },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: '本机运行时生成的短期 API 令牌；不得持久化到仓库。' },
    },
    schemas: {
      Error: {
        type: 'object', required: ['status', 'message'], additionalProperties: false,
        properties: { status: { const: 'error' }, message: { type: 'string', minLength: 1 } },
      },
      Meta: {
        type: 'object', required: ['apiVersion', 'rulesetVersion', 'backend', 'capabilities'], additionalProperties: false,
        properties: {
          apiVersion: { const: API_VERSION },
          rulesetVersion: { type: 'string', minLength: 1 },
          backend: { enum: ['pglite', 'postgres'] },
          capabilities: {
            type: 'object', additionalProperties: false,
            required: ['dashboard', 'checkins', 'projects', 'graph', 'auditVerification', 'portableExport', 'backup', 'safeShutdown'],
            properties: Object.fromEntries(['dashboard', 'checkins', 'projects', 'graph', 'auditVerification', 'portableExport', 'backup', 'safeShutdown'].map((name) => [name, { type: 'boolean' }])),
          },
        },
      },
      Dashboard: {
        type: 'object', required: ['activeProjects', 'latestCheckin', 'awaitingReview', 'reviewedLast7Days', 'activeWip', 'wipLimit'], additionalProperties: false,
        properties: {
          activeProjects: {
            type: 'array', items: {
              type: 'object', required: ['id', 'title', 'kind', 'current_bottleneck'], additionalProperties: false,
              properties: { id: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string' }, current_bottleneck: { type: 'string' } },
            },
          },
          latestCheckin: { type: ['object', 'null'] },
          awaitingReview: { type: 'integer', minimum: 0 },
          reviewedLast7Days: { type: 'integer', minimum: 0 },
          activeWip: { type: 'integer', minimum: 0 },
          wipLimit: { type: 'integer', minimum: 1 },
        },
      },
      DailyInput: {
        type: 'object', additionalProperties: false,
        required: ['checkinDate', 'availableMinutes', 'energy', 'attention', 'stageGoal', 'mainContradiction', 'bottleneck', 'mainAction', 'deliverable', 'estimatedMinutes', 'stopCondition', 'contradictionContribution', 'bottleneckContribution', 'evidenceStrength', 'riskLevel'],
        properties: {
          checkinDate: { type: 'string', format: 'date' },
          availableMinutes: { type: 'integer', minimum: 0, maximum: 1440 },
          reservePercent: { type: 'integer', minimum: 0, maximum: 80, default: 20 },
          energy: { type: 'integer', minimum: 0, maximum: 10 },
          attention: { type: 'integer', minimum: 0, maximum: 10 },
          stageGoal: { type: 'string', minLength: 2, maxLength: 500 },
          mainContradiction: { type: 'string', minLength: 2, maxLength: 1000 },
          bottleneck: { type: 'string', minLength: 2, maxLength: 1000 },
          mainAction: { type: 'string', minLength: 2, maxLength: 1000 },
          deliverable: { type: 'string', minLength: 2, maxLength: 1000 },
          estimatedMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
          stopCondition: { type: 'string', minLength: 2, maxLength: 1000 },
          explicitNotDo: { type: 'string', maxLength: 1000, default: '' },
          contradictionContribution: { type: 'integer', minimum: 0, maximum: 10 },
          bottleneckContribution: { type: 'integer', minimum: 0, maximum: 10 },
          evidenceStrength: { type: 'integer', minimum: 0, maximum: 10 },
          riskLevel: { enum: ['low', 'medium', 'high'] },
          hasAuthorization: { type: 'boolean', default: false },
          lossTolerable: { type: 'boolean', default: true },
          hasRecoveryPlan: { type: 'boolean', default: false },
          opensNewCoreProject: { type: 'boolean', default: false },
          activeWip: { type: 'integer', minimum: 0, maximum: 99, default: 0, description: '客户端显示上下文；服务端分析时以事实库重新计算。' },
          wipLimit: { type: 'integer', minimum: 1, maximum: 99, default: 3, description: '客户端显示上下文；服务端分析时以当前规则版本覆盖。' },
        },
      },
      DailyAnalysis: {
        type: 'object', additionalProperties: false,
        required: ['status', 'usableMinutes', 'wipLimit', 'capacityBand', 'benefitBand', 'feasibilityBand', 'riskBand', 'recommendation', 'reasons', 'warnings', 'triggeredRules', 'assumptions', 'nextReviewTrigger'],
        properties: {
          status: { enum: ['READY', 'CAUTION', 'BLOCKED'] },
          usableMinutes: { type: 'integer', minimum: 0 },
          wipLimit: { type: 'integer', minimum: 1 },
          capacityBand: { enum: ['低', '中', '高'] },
          benefitBand: { enum: ['低', '中', '高'] },
          feasibilityBand: { enum: ['低', '中', '高'] },
          riskBand: { enum: ['低', '中', '高'] },
          recommendation: { type: 'string' },
          reasons: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          triggeredRules: { type: 'array', items: { type: 'string' } },
          assumptions: { type: 'array', items: { type: 'string' } },
          nextReviewTrigger: { type: 'string' },
        },
      },
      Graph: {
        type: 'object', required: ['nodes', 'edges'], additionalProperties: false,
        properties: {
          nodes: { type: 'array', items: { type: 'object', required: ['id', 'object_type', 'title', 'status'], properties: { id: { type: 'string' }, object_type: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' } } } },
          edges: { type: 'array', items: { type: 'object', required: ['id', 'source_id', 'target_id', 'relation_type', 'strength'], properties: { id: { type: 'string' }, source_id: { type: 'string' }, target_id: { type: 'string' }, relation_type: { type: 'string' }, strength: { type: ['number', 'null'] } } } },
        },
      },
      AuditVerification: {
        type: 'object', required: ['valid', 'totalEvents', 'aggregateCount', 'failures'], additionalProperties: false,
        properties: {
          valid: { type: 'boolean' }, totalEvents: { type: 'integer', minimum: 0 }, aggregateCount: { type: 'integer', minimum: 0 },
          failures: { type: 'array', items: { type: 'object', required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { enum: ['event_hash_mismatch', 'missing_predecessor', 'multiple_roots', 'fork', 'disconnected'] } } } },
        },
      },
      PortableExport: {
        type: 'object', required: ['format', 'formatVersion', 'exportedAt', 'rulesetVersion', 'backend', 'data', 'counts'], additionalProperties: false,
        properties: {
          format: { const: 'praxis-control-portable-json' }, formatVersion: { const: 1 }, exportedAt: { type: 'string', format: 'date-time' }, rulesetVersion: { type: 'string' }, backend: { enum: ['pglite', 'postgres'] }, data: { type: 'object', additionalProperties: { type: 'array' } }, counts: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
        },
      },
      Health: {
        type: 'object', required: ['status', 'database', 'rulesetVersion'], additionalProperties: false,
        properties: { status: { enum: ['ok', 'degraded'] }, database: { enum: ['connected', 'unavailable'] }, backend: { enum: ['pglite', 'postgres'] }, rulesetVersion: { type: 'string' } },
      },
    },
  },
} as const;

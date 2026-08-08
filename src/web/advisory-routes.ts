import { createHash } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { advisoryRequestSchema } from '../ai/contracts.js';
import { prepareAdvisoryContext } from '../ai/context.js';
import { AdvisoryTaskService } from '../ai/tasks.js';
import type { Database } from '../infrastructure/db.js';

const submitBodySchema = z.object({
  useCase: z.enum(['checkin_structure', 'weekly_review_draft', 'evidence_relations', 'rule_explanation']),
  recordIds: z.array(z.string()).min(1).max(20),
  userInstruction: z.string().max(2000).optional(),
  records: z.array(z.record(z.string(), z.unknown())).default([]),
});

const decisionBodySchema = z.object({
  decision: z.enum(['accepted', 'accepted_modified', 'rejected']),
  modifiedValue: z.record(z.string(), z.string()).optional(),
  reason: z.string().min(1).max(500),
});

export function createAdvisoryRoutes(
  database: Database,
  taskService: AdvisoryTaskService,
  rulesetVersion: string,
  llmAvailable: boolean,
): Router {
  const router = Router();

  const submitTask: RequestHandler = async (req, res, next) => {
    try {
      if (!llmAvailable) {
        res.status(503).json({ status: 'error', message: 'LLM 顾问当前未启用' });
        return;
      }

      const body = submitBodySchema.parse(req.body);
      const request = advisoryRequestSchema.parse({
        useCase: body.useCase,
        recordIds: body.recordIds,
        userInstruction: body.userInstruction,
        locale: 'zh-CN',
      });

      const context = body.records.length > 0
        ? prepareAdvisoryContext(request, body.records)
        : {
            schemaVersion: 1 as const,
            request,
            records: [],
            audit: { recordIds: request.recordIds, recordTypes: [], fieldNames: [], characterCount: 0 },
            digest: createHash('sha256').update(JSON.stringify({ schemaVersion: 1, request, records: [] }), 'utf8').digest('hex'),
          };
      const taskId = await taskService.enqueue(request, context.digest);

      // Process asynchronously — don't block the response
      taskService.process(taskId).catch((err: unknown) => {
        console.error(`[advisory] task ${taskId} processing failed:`, err instanceof Error ? err.message : String(err));
      });

      res.status(202).json({ status: 'accepted', taskId });
    } catch (error) { next(error); }
  };

  const getTask: RequestHandler = async (req, res, next) => {
    try {
      const taskId = req.params.id as string;
      const task = await taskService.get(taskId);
      res.json({ status: 'ok', task });
    } catch (error) { next(error); }
  };

  const submitDecision: RequestHandler = async (req, res, next) => {
    try {
      const body = decisionBodySchema.parse(req.body);
      const task = await taskService.applyDecision(req.params.id as string, {
        decision: body.decision,
        modifiedValue: body.modifiedValue,
        reason: body.reason,
      });
      res.json({ status: 'ok', task });
    } catch (error) { next(error); }
  };

  const listPending: RequestHandler = async (_req, res, next) => {
    try {
      const tasks = await taskService.listPending();
      res.json({ status: 'ok', tasks });
    } catch (error) { next(error); }
  };

  const getMeta: RequestHandler = async (_req, res, next) => {
    try {
      res.json({ llmAdvisory: llmAvailable });
    } catch (error) { next(error); }
  };

  router.post('/advisory', submitTask);
  router.get('/advisory/pending', listPending);
  router.get('/advisory/meta', getMeta);
  router.get('/advisory/:id', getTask);
  router.post('/advisory/:id/decision', submitDecision);

  return router;
}

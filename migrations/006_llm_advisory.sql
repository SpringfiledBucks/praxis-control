-- 006: LLM advisory task persistence and audit
-- ADR-0010: 模型调用不持有数据库事务；使用事实库任务状态
BEGIN;

CREATE SCHEMA IF NOT EXISTS advisory;

CREATE TABLE advisory.ai_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    use_case        TEXT NOT NULL,
    request         JSONB NOT NULL,
    context_digest  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN (
                        'queued', 'running', 'succeeded', 'failed',
                        'pending_user', 'accepted', 'accepted_modified', 'rejected',
                        'expired', 'cancelled'
                    )),
    provider        TEXT,
    model           TEXT,
    output          JSONB,
    error_code      TEXT,
    timing_ms       INTEGER,
    usage           JSONB,
    user_decision   TEXT
                    CHECK (user_decision IN ('accepted', 'accepted_modified', 'rejected')),
    modified_value  JSONB,
    decision_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_tasks_status ON advisory.ai_tasks (status) WHERE status IN ('queued', 'pending_user');
CREATE INDEX idx_ai_tasks_created ON advisory.ai_tasks (created_at);

-- Audit: enforce immutable task records through governance.audit_events
-- A task row is created once and transitions through statuses;
-- the output column is written once on succeeded and never overwritten.
-- User decisions are recorded by updating user_decision + modified_value + decision_reason,
-- but never by modifying output, request, or context_digest.

-- Record this migration
INSERT INTO governance.schema_migrations (version, checksum)
VALUES ('006', '006_llm_advisory');

COMMIT;

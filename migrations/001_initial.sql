CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS decision;
CREATE SCHEMA IF NOT EXISTS governance;

CREATE TABLE IF NOT EXISTS governance.schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS governance.rule_versions (
    version text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL,
    parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.objectives (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    horizon text NOT NULL CHECK (horizon IN ('long_term', 'strategic', 'stage', 'cycle')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    acceptance text NOT NULL DEFAULT '',
    non_goals text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.projects (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('breakthrough', 'build', 'maintain', 'explore')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('idea', 'validating', 'planned', 'active', 'maintaining', 'paused', 'retiring', 'retired')),
    objective_id uuid REFERENCES core.objectives(id),
    current_bottleneck text NOT NULL DEFAULT '',
    exit_condition text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision.daily_checkins (
    id uuid PRIMARY KEY,
    checkin_date date NOT NULL,
    available_minutes integer NOT NULL CHECK (available_minutes BETWEEN 0 AND 1440),
    reserve_percent integer NOT NULL CHECK (reserve_percent BETWEEN 0 AND 80),
    energy integer NOT NULL CHECK (energy BETWEEN 0 AND 10),
    attention integer NOT NULL CHECK (attention BETWEEN 0 AND 10),
    stage_goal text NOT NULL,
    main_contradiction text NOT NULL,
    bottleneck text NOT NULL,
    main_action text NOT NULL,
    deliverable text NOT NULL,
    estimated_minutes integer NOT NULL CHECK (estimated_minutes BETWEEN 1 AND 1440),
    stop_condition text NOT NULL,
    explicit_not_do text NOT NULL DEFAULT '',
    contradiction_contribution integer NOT NULL CHECK (contradiction_contribution BETWEEN 0 AND 10),
    bottleneck_contribution integer NOT NULL CHECK (bottleneck_contribution BETWEEN 0 AND 10),
    evidence_strength integer NOT NULL CHECK (evidence_strength BETWEEN 0 AND 10),
    risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    has_authorization boolean NOT NULL DEFAULT false,
    loss_tolerable boolean NOT NULL DEFAULT true,
    has_recovery_plan boolean NOT NULL DEFAULT false,
    opens_new_core_project boolean NOT NULL DEFAULT false,
    active_wip integer NOT NULL DEFAULT 0,
    analysis_status text NOT NULL CHECK (analysis_status IN ('READY', 'CAUTION', 'BLOCKED')),
    analysis_snapshot jsonb NOT NULL,
    ruleset_version text NOT NULL REFERENCES governance.rule_versions(version),
    lifecycle_status text NOT NULL DEFAULT 'planned' CHECK (lifecycle_status IN ('planned', 'executing', 'awaiting_review', 'reviewed', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_checkins_one_open_per_day
ON decision.daily_checkins(checkin_date)
WHERE lifecycle_status <> 'cancelled';

CREATE TABLE IF NOT EXISTS decision.outcomes (
    id uuid PRIMARY KEY,
    checkin_id uuid NOT NULL UNIQUE REFERENCES decision.daily_checkins(id),
    actual_result text NOT NULL,
    decision_quality integer NOT NULL CHECK (decision_quality BETWEEN 0 AND 10),
    execution_quality integer NOT NULL CHECK (execution_quality BETWEEN 0 AND 10),
    environment_impact text NOT NULL CHECK (environment_impact IN ('helped', 'neutral', 'hindered', 'unknown')),
    variance_source text NOT NULL CHECK (variance_source IN ('planning', 'execution', 'environment', 'model', 'mixed')),
    learning text NOT NULL,
    next_adjustment text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision.weekly_reviews (
    id uuid PRIMARY KEY,
    week_start date NOT NULL UNIQUE,
    checkin_count integer NOT NULL,
    reviewed_count integer NOT NULL,
    average_decision_quality numeric(4,2),
    average_execution_quality numeric(4,2),
    main_contradiction_status text NOT NULL,
    current_bottleneck text NOT NULL,
    evidence_update text NOT NULL,
    portfolio_change text NOT NULL,
    next_breakthrough text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS governance.audit_events (
    id uuid PRIMARY KEY,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    ruleset_version text,
    previous_hash text,
    event_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_aggregate_idx
ON governance.audit_events(aggregate_type, aggregate_id, created_at);

CREATE INDEX IF NOT EXISTS daily_checkins_created_idx
ON decision.daily_checkins(created_at DESC);

CREATE INDEX IF NOT EXISTS projects_status_idx
ON core.projects(status);

CREATE TABLE IF NOT EXISTS core.knowledge_objects (
    id uuid PRIMARY KEY,
    object_type text NOT NULL CHECK (object_type IN ('objective', 'project', 'action', 'decision', 'assumption', 'evidence', 'risk', 'rule')),
    title text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.relations (
    id uuid PRIMARY KEY,
    source_id uuid NOT NULL REFERENCES core.knowledge_objects(id),
    relation_type text NOT NULL,
    target_id uuid NOT NULL REFERENCES core.knowledge_objects(id),
    strength numeric(4,3) CHECK (strength IS NULL OR strength BETWEEN 0 AND 1),
    evidence text NOT NULL DEFAULT '',
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (source_id <> target_id),
    UNIQUE (source_id, relation_type, target_id)
);

CREATE INDEX IF NOT EXISTS knowledge_objects_type_status_idx
ON core.knowledge_objects(object_type, status);

CREATE INDEX IF NOT EXISTS relations_source_idx ON core.relations(source_id);
CREATE INDEX IF NOT EXISTS relations_target_idx ON core.relations(target_id);

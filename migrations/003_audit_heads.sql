CREATE TABLE IF NOT EXISTS governance.audit_heads (
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    last_event_hash text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (aggregate_type, aggregate_id)
);

INSERT INTO governance.audit_heads (aggregate_type, aggregate_id, last_event_hash)
SELECT DISTINCT ON (event.aggregate_type, event.aggregate_id)
    event.aggregate_type,
    event.aggregate_id,
    event.event_hash
FROM governance.audit_events AS event
WHERE NOT EXISTS (
    SELECT 1
    FROM governance.audit_events AS successor
    WHERE successor.aggregate_type = event.aggregate_type
      AND successor.aggregate_id = event.aggregate_id
      AND successor.previous_hash = event.event_hash
)
ORDER BY event.aggregate_type, event.aggregate_id, event.created_at DESC, event.id DESC
ON CONFLICT (aggregate_type, aggregate_id) DO NOTHING;

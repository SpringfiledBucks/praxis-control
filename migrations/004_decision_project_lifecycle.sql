ALTER TABLE decision.daily_checkins
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES core.projects(id);

CREATE INDEX IF NOT EXISTS daily_checkins_project_idx
ON decision.daily_checkins(project_id, checkin_date DESC)
WHERE project_id IS NOT NULL;

ALTER TABLE decision.weekly_reviews
ADD COLUMN IF NOT EXISTS computed_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS manual_adjustments jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS reported_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS adjustment_reason text NOT NULL DEFAULT '';

UPDATE decision.weekly_reviews
SET computed_snapshot = jsonb_build_object(
      'source', 'legacy_unverified',
      'checkinCount', checkin_count,
      'reviewedCount', reviewed_count,
      'averageDecisionQuality', average_decision_quality,
      'averageExecutionQuality', average_execution_quality
    ),
    reported_snapshot = jsonb_build_object(
      'source', 'legacy_row',
      'checkinCount', checkin_count,
      'reviewedCount', reviewed_count,
      'averageDecisionQuality', average_decision_quality,
      'averageExecutionQuality', average_execution_quality
    ),
    adjustment_reason = '迁移前记录：系统原值无法可靠重算，保留原行作为报告值。'
WHERE computed_snapshot = '{}'::jsonb
  AND reported_snapshot = '{}'::jsonb;

ALTER TABLE decision.weekly_reviews
ADD CONSTRAINT weekly_reviews_computed_snapshot_object
  CHECK (jsonb_typeof(computed_snapshot) = 'object'),
ADD CONSTRAINT weekly_reviews_manual_adjustments_object
  CHECK (jsonb_typeof(manual_adjustments) = 'object'),
ADD CONSTRAINT weekly_reviews_reported_snapshot_object
  CHECK (jsonb_typeof(reported_snapshot) = 'object');

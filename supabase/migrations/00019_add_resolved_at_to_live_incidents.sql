
ALTER TABLE live_incidents
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Backfill: set resolved_at for existing RESOLVED rows that don't have it yet
-- Use a rough estimate of opened_at + random 15-90 min so MTTR is plausible in demo
UPDATE live_incidents
SET resolved_at = opened_at + (floor(random() * 75 + 15) * interval '1 minute')
WHERE status = 'RESOLVED'
  AND resolved_at IS NULL;

-- Index for fast MTTR queries
CREATE INDEX IF NOT EXISTS idx_live_incidents_resolved_at
  ON live_incidents (resolved_at)
  WHERE resolved_at IS NOT NULL;

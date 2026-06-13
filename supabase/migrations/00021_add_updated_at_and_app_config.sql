-- Add updated_at to live_incidents for auto-resolve stale detection
ALTER TABLE live_incidents ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE live_incidents SET updated_at = COALESCE(resolved_at, opened_at, created_at, now());

-- Trigger to auto-update updated_at on any row modification
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_live_incidents_updated_at
  BEFORE UPDATE ON live_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- App configuration table for MTTR threshold and auto-resolve settings
CREATE TABLE app_config (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults
INSERT INTO app_config (key, value) VALUES
  ('mttr_threshold_enabled', 'false'),
  ('mttr_threshold_minutes', '60'),
  ('auto_resolve_enabled',   'false'),
  ('auto_resolve_hours',     '4');

-- RLS: public read, authenticated write
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_app_config"  ON app_config FOR SELECT USING (true);
CREATE POLICY "auth_write_app_config"   ON app_config FOR ALL   TO authenticated USING (true) WITH CHECK (true);
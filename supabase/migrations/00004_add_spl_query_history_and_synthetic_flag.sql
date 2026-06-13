-- Add is_synthetic flag to live_incidents
ALTER TABLE live_incidents ADD COLUMN is_synthetic boolean NOT NULL DEFAULT false;

-- Create spl_query_history table
CREATE TABLE spl_query_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  generated_spl text NOT NULL,
  service_context text,
  incident_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user queries ordered by time
CREATE INDEX spl_query_history_user_time ON spl_query_history (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE spl_query_history ENABLE ROW LEVEL SECURITY;

-- Helper: owner check
CREATE OR REPLACE FUNCTION can_access_spl_history(row_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT auth.uid() = row_user_id;
$$;

-- Policies
CREATE POLICY "users can insert own history"
  ON spl_query_history FOR INSERT TO authenticated
  WITH CHECK (can_access_spl_history(user_id));

CREATE POLICY "users can select own history"
  ON spl_query_history FOR SELECT TO authenticated
  USING (can_access_spl_history(user_id));

CREATE POLICY "users can delete own history"
  ON spl_query_history FOR DELETE TO authenticated
  USING (can_access_spl_history(user_id));

-- Enable realtime for live_incidents (already enabled, skip silently via DO block)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE spl_query_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
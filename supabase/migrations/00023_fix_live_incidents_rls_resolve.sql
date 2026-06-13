-- Drop any conflicting policies first, then re-create clean ones
-- Allow authenticated users to insert (needed for static incident upsert before resolve)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_incidents' AND policyname = 'authenticated_insert_live_incidents') THEN
    DROP POLICY authenticated_insert_live_incidents ON live_incidents;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_incidents' AND policyname = 'authenticated_update_live_incidents') THEN
    DROP POLICY authenticated_update_live_incidents ON live_incidents;
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE live_incidents ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to SELECT live_incidents
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_incidents' AND policyname = 'allow_select_live_incidents') THEN
    CREATE POLICY allow_select_live_incidents ON live_incidents
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Allow any authenticated user to INSERT live_incidents (for static→DB upsert on resolve)
CREATE POLICY authenticated_insert_live_incidents ON live_incidents
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow any authenticated user to UPDATE live_incidents (for Mark as Resolved)
CREATE POLICY authenticated_update_live_incidents ON live_incidents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
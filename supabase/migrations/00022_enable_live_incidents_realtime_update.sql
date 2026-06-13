-- Ensure live_incidents is part of the realtime publication (covers INSERT + UPDATE + DELETE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_incidents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_incidents;
  END IF;
END $$;
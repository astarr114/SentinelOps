
CREATE OR REPLACE FUNCTION set_resolved_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set resolved_at when status transitions to RESOLVED
  IF NEW.status = 'RESOLVED' AND (OLD.status IS DISTINCT FROM 'RESOLVED') THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
  END IF;
  -- Clear resolved_at if incident is re-opened
  IF NEW.status IN ('OPEN', 'INVESTIGATING') AND OLD.status = 'RESOLVED' THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_resolved_at ON live_incidents;

CREATE TRIGGER trg_set_resolved_at
BEFORE UPDATE ON live_incidents
FOR EACH ROW
EXECUTE FUNCTION set_resolved_at();

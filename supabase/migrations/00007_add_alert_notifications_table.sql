CREATE TABLE alert_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  incident_id text NOT NULL,
  severity    text NOT NULL,
  service     text NOT NULL,
  title       text NOT NULL,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX alert_notifications_user_time
  ON alert_notifications (user_id, created_at DESC);

ALTER TABLE alert_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION can_access_alert_notification(row_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT auth.uid() = row_user_id;
$$;

CREATE POLICY "users can insert own notifications"
  ON alert_notifications FOR INSERT TO authenticated
  WITH CHECK (can_access_alert_notification(user_id));

CREATE POLICY "users can select own notifications"
  ON alert_notifications FOR SELECT TO authenticated
  USING (can_access_alert_notification(user_id));

CREATE POLICY "users can update own notifications"
  ON alert_notifications FOR UPDATE TO authenticated
  USING (can_access_alert_notification(user_id));

CREATE POLICY "users can delete own notifications"
  ON alert_notifications FOR DELETE TO authenticated
  USING (can_access_alert_notification(user_id));
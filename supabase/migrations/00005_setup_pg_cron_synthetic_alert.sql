-- Enable pg_cron extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net for HTTP calls from cron
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing synthetic alert cron job before recreating
SELECT cron.unschedule('synthetic-alert-hourly')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'synthetic-alert-hourly'
  );

-- Schedule synthetic-alert-job Edge Function every hour at :00
SELECT cron.schedule(
  'synthetic-alert-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/synthetic-alert-job',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
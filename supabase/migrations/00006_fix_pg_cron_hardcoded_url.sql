-- Drop the previous cron job that used current_setting()
SELECT cron.unschedule('synthetic-alert-hourly');

-- Re-schedule with hardcoded project URL and service role key (standard Supabase pattern)
SELECT cron.schedule(
  'synthetic-alert-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://nzikncgaoxrhqgrckwzk.supabase.co/functions/v1/synthetic-alert-job',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56aWtuY2dhb3hyaHFncmNrd3prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTMzMTk1MSwiZXhwIjoyMDk0OTA3OTUxfQ.3X9PW0zmuZFSvE4ZfAK_hTSjIGqin02A0hJQZIG_rmQ'
      ),
      body    := '{}'::jsonb
    );
  $$
);
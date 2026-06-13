
ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS reasoning_provider text NOT NULL DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS splunk_hosted_model_endpoint text,
  ADD COLUMN IF NOT EXISTS splunk_hosted_model_token text,
  ADD COLUMN IF NOT EXISTS last_live_verified_at timestamptz;

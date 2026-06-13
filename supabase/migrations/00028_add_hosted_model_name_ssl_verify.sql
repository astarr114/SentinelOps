
ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS splunk_hosted_model_name text,
  ADD COLUMN IF NOT EXISTS ssl_verify boolean NOT NULL DEFAULT false;

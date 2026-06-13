ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS splunk_mcp_url   text,
  ADD COLUMN IF NOT EXISTS splunk_mcp_token text;
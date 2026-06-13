
ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS mcp_skip_ngrok   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_server_name  text,
  ADD COLUMN IF NOT EXISTS mcp_server_version text,
  ADD COLUMN IF NOT EXISTS mcp_tool_list    jsonb;

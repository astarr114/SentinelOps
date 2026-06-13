alter table splunk_configs
  add column mcp_auth_method text not null default 'bearer',
  add column splunk_mcp_username text,
  add column splunk_mcp_password text;

comment on column splunk_configs.mcp_auth_method is
  'Auth method for MCP server: bearer | basic';
comment on column splunk_configs.splunk_mcp_username is
  'Username for MCP Basic auth (only used when mcp_auth_method = basic)';
comment on column splunk_configs.splunk_mcp_password is
  'Password for MCP Basic auth (only used when mcp_auth_method = basic)';
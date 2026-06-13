
-- Add user-manageable API keys and webhook URLs to splunk_configs
-- These are stored per-user and passed from client to edge functions
ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS resend_api_key      text,
  ADD COLUMN IF NOT EXISTS pd_rest_api_key     text,
  ADD COLUMN IF NOT EXISTS slack_webhook_url   text;

COMMENT ON COLUMN splunk_configs.resend_api_key    IS 'Resend API key (re_...) for sending alert emails';
COMMENT ON COLUMN splunk_configs.pd_rest_api_key   IS 'PagerDuty REST API key for reading incident status';
COMMENT ON COLUMN splunk_configs.slack_webhook_url IS 'Slack Incoming Webhook URL for alert notifications';

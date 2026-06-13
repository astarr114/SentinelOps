ALTER TABLE splunk_configs
  ADD COLUMN pd_auto_sync boolean NOT NULL DEFAULT false,
  ADD COLUMN pd_sync_interval integer NOT NULL DEFAULT 60;
-- ============================================================
-- SentinelOps — Database Setup Script
-- Run this in Supabase Dashboard → SQL Editor
-- Project: dfdefoceuttgtazlzlsh
-- ============================================================

-- ============================================================
-- Migration: 00001_initial_schema.sql
-- ============================================================

-- User roles enum
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  username text UNIQUE,
  role public.user_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- Profiles policies
CREATE POLICY "Admins have full access to profiles" ON profiles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- Handle new user trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'::public.user_role
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Saved incidents table (for user-saved incident analyses)
CREATE TABLE public.incident_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  incident_id text NOT NULL,
  incident_title text NOT NULL,
  service text NOT NULL,
  severity text NOT NULL,
  analysis_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incident_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own analyses" ON incident_analyses
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all analyses" ON incident_analyses
  FOR SELECT TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);


-- ============================================================
-- Migration: 00002_create_live_incidents_and_splunk_config.sql
-- ============================================================
-- Live incidents table for real-time alerting
CREATE TABLE public.live_incidents (
  id text PRIMARY KEY,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  service text NOT NULL,
  summary text,
  tags text[],
  opened_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.live_incidents ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read live incidents
CREATE POLICY "Authenticated users can view live incidents" ON public.live_incidents
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert (for demo simulation)
CREATE POLICY "Authenticated users can insert live incidents" ON public.live_incidents
  FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_incidents;

-- Splunk configuration per user
CREATE TABLE public.splunk_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  splunk_host text,
  splunk_token text,
  mode text NOT NULL DEFAULT 'demo' CHECK (mode IN ('live', 'demo')),
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.splunk_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own splunk config" ON public.splunk_configs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed demo live incidents for testing realtime
INSERT INTO public.live_incidents (id, title, severity, status, service, summary, tags, opened_at)
VALUES
  ('INC-1001', 'checkout-service: P99 latency spike to 3241ms â€” DB pool exhaustion', 'CRITICAL', 'INVESTIGATING', 'checkout-service',
   'P99 latency degraded from 280ms baseline to 3241ms following v1.8.3 deployment at 10:37. 847 HikariCP connection timeout errors detected.',
   ARRAY['latency', 'database', 'deployment', 'checkout'], '2026-05-21 10:42:00+00'),
  ('INC-1002', 'payment-api: 5xx error rate at 23% â€” circuit breaker tripping', 'HIGH', 'OPEN', 'payment-api',
   'payment-api showing elevated HTTP 5xx error rate (23%). Circuit breaker triggered on checkout dependency.',
   ARRAY['5xx', 'circuit-breaker', 'payment'], '2026-05-21 10:47:00+00'),
  ('INC-1003', 'auth-service: P95 login latency elevated to 890ms', 'MEDIUM', 'INVESTIGATING', 'auth-service',
   'auth-service login endpoint latency spiked. Likely downstream from DB replica lag.',
   ARRAY['latency', 'auth', 'database'], '2026-05-21 10:55:00+00');

-- ============================================================
-- Migration: 00003_add_mcp_fields_to_splunk_configs.sql
-- ============================================================
ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS splunk_mcp_url   text,
  ADD COLUMN IF NOT EXISTS splunk_mcp_token text;

-- ============================================================
-- Migration: 00004_add_spl_query_history_and_synthetic_flag.sql
-- ============================================================
-- Add is_synthetic flag to live_incidents
ALTER TABLE live_incidents ADD COLUMN is_synthetic boolean NOT NULL DEFAULT false;

-- Create spl_query_history table
CREATE TABLE spl_query_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  generated_spl text NOT NULL,
  service_context text,
  incident_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user queries ordered by time
CREATE INDEX spl_query_history_user_time ON spl_query_history (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE spl_query_history ENABLE ROW LEVEL SECURITY;

-- Helper: owner check
CREATE OR REPLACE FUNCTION can_access_spl_history(row_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT auth.uid() = row_user_id;
$$;

-- Policies
CREATE POLICY "users can insert own history"
  ON spl_query_history FOR INSERT TO authenticated
  WITH CHECK (can_access_spl_history(user_id));

CREATE POLICY "users can select own history"
  ON spl_query_history FOR SELECT TO authenticated
  USING (can_access_spl_history(user_id));

CREATE POLICY "users can delete own history"
  ON spl_query_history FOR DELETE TO authenticated
  USING (can_access_spl_history(user_id));

-- Enable realtime for live_incidents (already enabled, skip silently via DO block)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE spl_query_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Migration: 00005_setup_pg_cron_synthetic_alert.sql
-- ============================================================
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

-- ============================================================
-- Migration: 00006_fix_pg_cron_hardcoded_url.sql
-- ============================================================
-- Drop the previous cron job that used current_setting()
SELECT cron.unschedule('synthetic-alert-hourly');

-- Re-schedule with hardcoded project URL and service role key (standard Supabase pattern)
SELECT cron.schedule(
  'synthetic-alert-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://dfdefoceuttgtazlzlsh.supabase.co/functions/v1/synthetic-alert-job',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ============================================================
-- Migration: 00007_add_alert_notifications_table.sql
-- ============================================================
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

-- ============================================================
-- Migration: 00008_add_llm_configs_and_alert_rules.sql
-- ============================================================

-- LLM provider configuration per user
CREATE TABLE public.llm_configs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider    text        NOT NULL DEFAULT 'gemini'
                          CHECK (provider IN ('gemini','openai','anthropic','grok','deepseek')),
  api_key     text        NOT NULL DEFAULT '',
  model_id    text        NOT NULL DEFAULT '',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.llm_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own llm config"
  ON public.llm_configs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Alert routing rules per user
CREATE TABLE public.alert_rules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT 'New rule',
  severities  text[]      NOT NULL DEFAULT '{}',
  services    text[]      NOT NULL DEFAULT '{}',
  action      text        NOT NULL DEFAULT 'toast'
                          CHECK (action IN ('toast','highlight','sound','toast_and_highlight','toast_and_sound','all')),
  enabled     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own alert rules"
  ON public.alert_rules FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================
-- Migration: 00009_pagerduty_events_and_alert_email.sql
-- ============================================================

-- PagerDuty event audit trail
CREATE TABLE pagerduty_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  incident_id text NOT NULL,
  action      text NOT NULL CHECK (action IN ('trigger','acknowledge','resolve')),
  dedup_key   text NOT NULL,
  pd_status   text,
  pd_message  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pagerduty_events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION can_select_pagerduty_events(row_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT row_user_id = auth.uid();
$$;

CREATE POLICY "users can view own pd events"
  ON pagerduty_events FOR SELECT TO authenticated
  USING (can_select_pagerduty_events(user_id));

CREATE POLICY "service role full access pd events"
  ON pagerduty_events FOR ALL TO service_role
  USING (true);

-- Add PagerDuty routing key + email fields to splunk_configs (stored per user)
ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS pagerduty_routing_key text,
  ADD COLUMN IF NOT EXISTS alert_email            text;

-- Add email action type to alert_rules (existing enum-like text column)
-- No schema change needed â€” action is already a text column.
-- We just document the new values: 'email', 'toast_and_email', 'pagerduty', 'all_channels'
COMMENT ON COLUMN splunk_configs.pagerduty_routing_key IS
  'PagerDuty Events API v2 routing key for this user''s integration';
COMMENT ON COLUMN splunk_configs.alert_email IS
  'Email address to receive CRITICAL/HIGH alert notifications';


-- ============================================================
-- Migration: 00010_integrations_fields_v2.sql
-- ============================================================

-- Add user-manageable API keys and webhook URLs to splunk_configs
-- These are stored per-user and passed from client to edge functions
ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS resend_api_key      text,
  ADD COLUMN IF NOT EXISTS pd_rest_api_key     text,
  ADD COLUMN IF NOT EXISTS slack_webhook_url   text;

COMMENT ON COLUMN splunk_configs.resend_api_key    IS 'Resend API key (re_...) for sending alert emails';
COMMENT ON COLUMN splunk_configs.pd_rest_api_key   IS 'PagerDuty REST API key for reading incident status';
COMMENT ON COLUMN splunk_configs.slack_webhook_url IS 'Slack Incoming Webhook URL for alert notifications';


-- ============================================================
-- Migration: 00011_add_time_window_to_live_incidents.sql
-- ============================================================
-- Add time_window column to live_incidents (used by incident-analyze and UI)
ALTER TABLE live_incidents ADD COLUMN time_window text NOT NULL DEFAULT 'last_30m';

-- ============================================================
-- Migration: 00012_create_spl_saved_queries.sql
-- ============================================================

create table spl_saved_queries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  category    text not null default 'General',
  spl         text not null,
  description text,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index spl_saved_queries_user_idx on spl_saved_queries(user_id, created_at desc);

alter table spl_saved_queries enable row level security;

create policy "users_select_own_saved_queries" on spl_saved_queries
  for select using (auth.uid() = user_id);

create policy "users_insert_own_saved_queries" on spl_saved_queries
  for insert with check (auth.uid() = user_id);

create policy "users_update_own_saved_queries" on spl_saved_queries
  for update using (auth.uid() = user_id);

create policy "users_delete_own_saved_queries" on spl_saved_queries
  for delete using (auth.uid() = user_id);

-- auto-update updated_at
create or replace function update_spl_saved_queries_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_spl_saved_queries_updated_at
  before update on spl_saved_queries
  for each row execute function update_spl_saved_queries_updated_at();


-- ============================================================
-- Migration: 00013_add_pd_incident_id_to_live_incidents.sql
-- ============================================================
ALTER TABLE live_incidents ADD COLUMN IF NOT EXISTS pd_incident_id text UNIQUE;

-- ============================================================
-- Migration: 00014_add_pd_auto_sync_to_splunk_configs.sql
-- ============================================================
ALTER TABLE splunk_configs
  ADD COLUMN pd_auto_sync boolean NOT NULL DEFAULT false,
  ADD COLUMN pd_sync_interval integer NOT NULL DEFAULT 60;

-- ============================================================
-- Migration: 00015_create_splunk_saved_alerts.sql
-- ============================================================
create table splunk_saved_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  alert_name  text not null,
  search      text not null,
  cron_schedule text,
  next_fire_time timestamptz,
  severity    text default 'medium',
  is_enabled  boolean default true,
  alert_type  text default 'number_of_events',
  splunk_name text not null,           -- original name in Splunk (for dedup)
  actions     jsonb default '[]'::jsonb,
  raw         jsonb,
  imported_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, splunk_name)
);

alter table splunk_saved_alerts enable row level security;

create policy "users manage own splunk alerts"
  on splunk_saved_alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter publication supabase_realtime add table splunk_saved_alerts;

-- ============================================================
-- Migration: 00016_add_source_splunk_link_to_live_incidents.sql
-- ============================================================
alter table live_incidents
  add column source text,
  add column splunk_results_link text;

comment on column live_incidents.source is
  'Origin of the incident: splunk-webhook | synthetic | pagerduty | manual';
comment on column live_incidents.splunk_results_link is
  'Deep-link back to the Splunk search results that triggered this incident';

-- ============================================================
-- Migration: 00017_add_mcp_basic_auth_to_splunk_configs.sql
-- ============================================================
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

-- ============================================================
-- Migration: 00018_add_severity_rules_to_splunk_configs.sql
-- ============================================================

-- Add a JSONB column to store per-user severity keyword rules.
-- Structure: { critical: string[], high: string[], medium: string[], low: string[] }
-- NULL means "use built-in defaults in the edge function".
ALTER TABLE splunk_configs
  ADD COLUMN severity_rules jsonb DEFAULT NULL;

-- Ensure user_id on splunk_saved_alerts has a DB-level default to auth.uid()
-- so client-side upserts without an explicit user_id still work.
ALTER TABLE splunk_saved_alerts
  ALTER COLUMN user_id SET DEFAULT auth.uid();


-- ============================================================
-- Migration: 00019_add_resolved_at_to_live_incidents.sql
-- ============================================================

ALTER TABLE live_incidents
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Backfill: set resolved_at for existing RESOLVED rows that don't have it yet
-- Use a rough estimate of opened_at + random 15-90 min so MTTR is plausible in demo
UPDATE live_incidents
SET resolved_at = opened_at + (floor(random() * 75 + 15) * interval '1 minute')
WHERE status = 'RESOLVED'
  AND resolved_at IS NULL;

-- Index for fast MTTR queries
CREATE INDEX IF NOT EXISTS idx_live_incidents_resolved_at
  ON live_incidents (resolved_at)
  WHERE resolved_at IS NOT NULL;


-- ============================================================
-- Migration: 00020_auto_set_resolved_at_trigger.sql
-- ============================================================

CREATE OR REPLACE FUNCTION set_resolved_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set resolved_at when status transitions to RESOLVED
  IF NEW.status = 'RESOLVED' AND (OLD.status IS DISTINCT FROM 'RESOLVED') THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
  END IF;
  -- Clear resolved_at if incident is re-opened
  IF NEW.status IN ('OPEN', 'INVESTIGATING') AND OLD.status = 'RESOLVED' THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_resolved_at ON live_incidents;

CREATE TRIGGER trg_set_resolved_at
BEFORE UPDATE ON live_incidents
FOR EACH ROW
EXECUTE FUNCTION set_resolved_at();


-- ============================================================
-- Migration: 00021_add_updated_at_and_app_config.sql
-- ============================================================
-- Add updated_at to live_incidents for auto-resolve stale detection
ALTER TABLE live_incidents ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE live_incidents SET updated_at = COALESCE(resolved_at, opened_at, created_at, now());

-- Trigger to auto-update updated_at on any row modification
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_live_incidents_updated_at
  BEFORE UPDATE ON live_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- App configuration table for MTTR threshold and auto-resolve settings
CREATE TABLE app_config (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults
INSERT INTO app_config (key, value) VALUES
  ('mttr_threshold_enabled', 'false'),
  ('mttr_threshold_minutes', '60'),
  ('auto_resolve_enabled',   'false'),
  ('auto_resolve_hours',     '4');

-- RLS: public read, authenticated write
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_app_config"  ON app_config FOR SELECT USING (true);
CREATE POLICY "auth_write_app_config"   ON app_config FOR ALL   TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Migration: 00022_enable_live_incidents_realtime_update.sql
-- ============================================================
-- Ensure live_incidents is part of the realtime publication (covers INSERT + UPDATE + DELETE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_incidents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_incidents;
  END IF;
END $$;

-- ============================================================
-- Migration: 00023_fix_live_incidents_rls_resolve.sql
-- ============================================================
-- Drop any conflicting policies first, then re-create clean ones
-- Allow authenticated users to insert (needed for static incident upsert before resolve)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_incidents' AND policyname = 'authenticated_insert_live_incidents') THEN
    DROP POLICY authenticated_insert_live_incidents ON live_incidents;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_incidents' AND policyname = 'authenticated_update_live_incidents') THEN
    DROP POLICY authenticated_update_live_incidents ON live_incidents;
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE live_incidents ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to SELECT live_incidents
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_incidents' AND policyname = 'allow_select_live_incidents') THEN
    CREATE POLICY allow_select_live_incidents ON live_incidents
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Allow any authenticated user to INSERT live_incidents (for staticâ†’DB upsert on resolve)
CREATE POLICY authenticated_insert_live_incidents ON live_incidents
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow any authenticated user to UPDATE live_incidents (for Mark as Resolved)
CREATE POLICY authenticated_update_live_incidents ON live_incidents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Migration: 00024_phase2_phase3_phase4_tables.sql
-- ============================================================
-- â”€â”€ Phase 2: Autonomous Remediation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE remediation_actions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id    text NOT NULL,
  title          text NOT NULL,
  description    text NOT NULL,
  playbook       text NOT NULL DEFAULT 'default',
  action_type    text NOT NULL DEFAULT 'restart',   -- restart|scale|rollback|notify|custom
  target_service text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',   -- pending|awaiting_approval|approved|running|success|failed|rejected|skipped
  risk_level     text NOT NULL DEFAULT 'medium',    -- low|medium|high|critical
  requires_approval boolean NOT NULL DEFAULT true,
  auto_approved  boolean NOT NULL DEFAULT false,
  approved_by    text,
  approved_at    timestamptz,
  rejected_by    text,
  rejected_at    timestamptz,
  rejection_reason text,
  started_at     timestamptz,
  completed_at   timestamptz,
  output_log     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE remediation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rem_select ON remediation_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY rem_insert ON remediation_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rem_update ON remediation_actions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- â”€â”€ Phase 2: Policy Guardrails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE policy_guardrails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL,
  category    text NOT NULL DEFAULT 'safety',   -- safety|compliance|cost|performance
  scope       text NOT NULL DEFAULT 'all',      -- all|service:<name>|env:<prod|staging>
  rule_type   text NOT NULL DEFAULT 'deny',     -- deny|require_approval|rate_limit|notify
  condition   text NOT NULL,
  action_types text[] NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  priority    int NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE policy_guardrails ENABLE ROW LEVEL SECURITY;
CREATE POLICY pg_select ON policy_guardrails FOR SELECT TO authenticated USING (true);
CREATE POLICY pg_insert ON policy_guardrails FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY pg_update ON policy_guardrails FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pg_delete ON policy_guardrails FOR DELETE TO authenticated USING (true);

-- â”€â”€ Phase 2: Incident Learning Loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE incident_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id     text NOT NULL,
  action_id       uuid REFERENCES remediation_actions(id) ON DELETE SET NULL,
  feedback_type   text NOT NULL,   -- helpful|not_helpful|false_positive|missed|correct_diagnosis
  comment         text,
  submitted_by    text,
  confidence_delta int,            -- -100..+100 effect on model confidence
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE incident_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY fb_select ON incident_feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY fb_insert ON incident_feedback FOR INSERT TO authenticated WITH CHECK (true);

-- â”€â”€ Phase 3: Immutable Audit Trail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE audit_trail (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type   text NOT NULL,
  actor        text NOT NULL DEFAULT 'system',
  target_type  text,
  target_id    text,
  description  text NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}',
  ip_address   text,
  session_id   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY at_select ON audit_trail FOR SELECT TO authenticated USING (true);
CREATE POLICY at_insert ON audit_trail FOR INSERT TO authenticated WITH CHECK (true);
-- Audit trail is immutable â€” no UPDATE or DELETE policies

-- â”€â”€ Phase 3: Compliance Evidence Packs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE compliance_packs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  framework    text NOT NULL DEFAULT 'SOC2',  -- SOC2|ISO27001|HIPAA|PCI-DSS|GDPR|NIST
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       text NOT NULL DEFAULT 'draft', -- draft|generating|ready|exported
  generated_by text,
  evidence_count int NOT NULL DEFAULT 0,
  download_url text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE compliance_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_select ON compliance_packs FOR SELECT TO authenticated USING (true);
CREATE POLICY cp_insert ON compliance_packs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cp_update ON compliance_packs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- â”€â”€ Seed default policy guardrails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO policy_guardrails (name, description, category, scope, rule_type, condition, action_types, priority) VALUES
  ('No prod DB deletion', 'Prevent any DROP or DELETE SQL on production databases without DBA approval', 'safety', 'env:prod', 'deny', 'action_type = "db_delete" AND environment = "prod"', ARRAY['db_delete'], 1),
  ('Scale limit: max 10 pods', 'Horizontal scaling cannot exceed 10 replicas without approval', 'cost', 'all', 'require_approval', 'action_type = "scale" AND replicas > 10', ARRAY['scale'], 10),
  ('Rollback requires owner sign-off', 'Production rollbacks need service owner approval unless P1', 'compliance', 'env:prod', 'require_approval', 'action_type = "rollback" AND severity != "P1"', ARRAY['rollback'], 20),
  ('Notify on any IP block', 'All IP blocking actions must notify the security team', 'safety', 'all', 'notify', 'action_type = "ip_block"', ARRAY['ip_block'], 30),
  ('Rate limit restarts: max 3/hour', 'Pod restarts are limited to 3 per service per hour', 'performance', 'all', 'rate_limit', 'action_type = "restart" AND count > 3', ARRAY['restart'], 40),
  ('No change-freeze deploys', 'Block deployments during declared change-freeze windows', 'compliance', 'env:prod', 'deny', 'action_type = "deploy" AND change_freeze = true', ARRAY['deploy', 'rollback'], 5),
  ('Require MFA for config changes', 'Configuration changes require MFA-verified session', 'safety', 'all', 'require_approval', 'action_type = "config_change"', ARRAY['config_change'], 15),
  ('Cost guardrail: $500/action', 'Actions estimated to cost more than $500 require finance approval', 'cost', 'all', 'require_approval', 'estimated_cost > 500', ARRAY['scale', 'provision'], 25);

-- Seed audit trail entries
INSERT INTO audit_trail (event_type, actor, target_type, target_id, description, metadata) VALUES
  ('incident.resolved', 'AI System', 'incident', 'INC-0041', 'Incident auto-resolved after timeout', '{"method":"auto_resolve","timeout_hours":4}'),
  ('remediation.executed', 'AI System', 'service', 'checkout-service', 'Pod restart executed autonomously', '{"action":"restart","pod":"checkout-svc-3","result":"success"}'),
  ('policy.evaluated', 'Policy Engine', 'action', 'scale-payment-gateway', 'Scale action approved by policy engine', '{"policy":"scale_limit","result":"approved","replicas":8}'),
  ('user.login', 'admin', 'session', NULL, 'User signed in', '{"method":"email"}'),
  ('config.changed', 'admin', 'settings', 'splunk_connection', 'Splunk host updated', '{"field":"splunk_host"}'),
  ('alert.fired', 'splunk-webhook', 'incident', 'INC-0042', 'Splunk alert received via webhook', '{"search_name":"High error rate","severity":"HIGH"}');

-- Seed compliance pack (demo)
INSERT INTO compliance_packs (title, framework, period_start, period_end, status, generated_by, evidence_count) VALUES
  ('SOC 2 Type II â€” Q1 2026', 'SOC2', '2026-01-01', '2026-03-31', 'ready', 'admin', 147),
  ('ISO 27001 Annual Review', 'ISO27001', '2025-07-01', '2026-06-30', 'draft', NULL, 0);

-- ============================================================
-- Migration: 00025_add_mcp_server_info_to_splunk_configs.sql
-- ============================================================

ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS mcp_skip_ngrok   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_server_name  text,
  ADD COLUMN IF NOT EXISTS mcp_server_version text,
  ADD COLUMN IF NOT EXISTS mcp_tool_list    jsonb;


-- ============================================================
-- Migration: 00026_add_splunk_mode_to_incident_analyses.sql
-- ============================================================
ALTER TABLE incident_analyses ADD COLUMN splunk_mode text NOT NULL DEFAULT 'demo';

-- ============================================================
-- Migration: 00027_add_reasoning_provider_to_splunk_configs.sql
-- ============================================================

ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS reasoning_provider text NOT NULL DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS splunk_hosted_model_endpoint text,
  ADD COLUMN IF NOT EXISTS splunk_hosted_model_token text,
  ADD COLUMN IF NOT EXISTS last_live_verified_at timestamptz;


-- ============================================================
-- Migration: 00028_add_hosted_model_name_ssl_verify.sql
-- ============================================================

ALTER TABLE splunk_configs
  ADD COLUMN IF NOT EXISTS splunk_hosted_model_name text,
  ADD COLUMN IF NOT EXISTS ssl_verify boolean NOT NULL DEFAULT false;


-- ============================================================
-- Migration: 00029_create_e2e_test_runs.sql
-- ============================================================

create table if not exists public.e2e_test_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  ran_at      timestamptz not null default now(),
  mcp_url     text not null,
  pass_count  int not null default 0,
  total_count int not null default 0,
  duration_ms int not null default 0,
  ok          boolean not null default false,
  assertions  jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

alter table public.e2e_test_runs enable row level security;

create policy "Users see own e2e runs"
  on public.e2e_test_runs for select
  using (auth.uid() = user_id);

create policy "Users insert own e2e runs"
  on public.e2e_test_runs for insert
  with check (auth.uid() = user_id);

create policy "Users delete own e2e runs"
  on public.e2e_test_runs for delete
  using (auth.uid() = user_id);

create index if not exists e2e_test_runs_user_ran_at
  on public.e2e_test_runs (user_id, ran_at desc);



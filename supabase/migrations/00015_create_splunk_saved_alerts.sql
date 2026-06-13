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
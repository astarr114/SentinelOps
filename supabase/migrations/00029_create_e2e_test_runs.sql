
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

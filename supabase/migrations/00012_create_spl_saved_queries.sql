
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

create table if not exists public.conversations (
  id text primary key,
  user_id text not null,
  title text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  summary text,
  is_demo boolean not null default false
);

create table if not exists public.conversation_messages (
  id text primary key,
  user_id text not null,
  conversation_id text not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  proposed_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null
);

create table if not exists public.conversation_summaries (
  id text primary key,
  user_id text not null,
  conversation_id text not null references public.conversations(id) on delete cascade,
  summary text not null,
  created_at timestamptz not null
);

create table if not exists public.conversation_memory_refs (
  id text primary key,
  user_id text not null,
  conversation_id text not null references public.conversations(id) on delete cascade,
  memory_id text not null,
  created_at timestamptz not null
);

create index if not exists idx_conversations_user on public.conversations (user_id, updated_at desc);
create index if not exists idx_conversation_messages_conv on public.conversation_messages (conversation_id, created_at);
create index if not exists idx_conversation_summaries_conv on public.conversation_summaries (conversation_id, created_at desc);
create index if not exists idx_conversation_memory_refs_conv on public.conversation_memory_refs (conversation_id);
create index if not exists idx_conversation_memory_refs_mem on public.conversation_memory_refs (memory_id);

alter table public.action_items add column if not exists source_message_id text;

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.conversation_memory_refs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['conversations', 'conversation_messages', 'conversation_summaries', 'conversation_memory_refs']
  loop
    execute format('drop policy if exists "own_rows_select" on public.%I', t);
    execute format('create policy "own_rows_select" on public.%I for select using (user_id = auth.uid()::text)', t);
    execute format('drop policy if exists "own_rows_insert" on public.%I', t);
    execute format('create policy "own_rows_insert" on public.%I for insert with check (user_id = auth.uid()::text)', t);
    execute format('drop policy if exists "own_rows_update" on public.%I', t);
    execute format('create policy "own_rows_update" on public.%I for update using (user_id = auth.uid()::text)', t);
    execute format('drop policy if exists "own_rows_delete" on public.%I', t);
    execute format('create policy "own_rows_delete" on public.%I for delete using (user_id = auth.uid()::text)', t);
  end loop;
end $$;

-- ECHO V3 Companion Conversations tables with strict UUID user ownership & RLS
create table if not exists public.conversations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  summary text,
  is_demo boolean not null default false
);

create table if not exists public.conversation_messages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  proposed_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null
);

create table if not exists public.conversation_summaries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null references public.conversations(id) on delete cascade,
  summary text not null,
  created_at timestamptz not null
);

create table if not exists public.conversation_memory_refs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null references public.conversations(id) on delete cascade,
  memory_id text not null,
  created_at timestamptz not null
);

create index if not exists idx_conversations_user on public.conversations (user_id, updated_at desc);
create index if not exists idx_conversation_messages_conv on public.conversation_messages (conversation_id, created_at);
create index if not exists idx_conversation_messages_user on public.conversation_messages (user_id, created_at desc);
create index if not exists idx_conversation_summaries_conv on public.conversation_summaries (conversation_id, created_at desc);
create index if not exists idx_conversation_summaries_user on public.conversation_summaries (user_id, created_at desc);
create index if not exists idx_conversation_memory_refs_conv on public.conversation_memory_refs (conversation_id);
create index if not exists idx_conversation_memory_refs_mem on public.conversation_memory_refs (memory_id);
create index if not exists idx_conversation_memory_refs_user on public.conversation_memory_refs (user_id);

alter table public.action_items add column if not exists source_message_id text;

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.conversation_memory_refs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'conversations',
    'conversation_messages',
    'conversation_summaries',
    'conversation_memory_refs'
  ]
  loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "own_rows_select" on public.%I', t);
    execute format('create policy "own_rows_select" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
    execute format('drop policy if exists "own_rows_insert" on public.%I', t);
    execute format('create policy "own_rows_insert" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t);
    execute format('drop policy if exists "own_rows_update" on public.%I', t);
    execute format('create policy "own_rows_update" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('drop policy if exists "own_rows_delete" on public.%I', t);
    execute format('create policy "own_rows_delete" on public.%I for delete to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;

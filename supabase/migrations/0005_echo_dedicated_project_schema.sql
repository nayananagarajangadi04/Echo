-- ECHO V3 Dedicated Supabase Project Schema (Consolidated Idempotent Migration)
-- Creates all 14 ECHO tables (10 core + 4 AI Companion), UUID user_id FKs to auth.users(id),
-- indexes, profile sync & auth user triggers/functions, and 56 strict RLS policies.

create extension if not exists pgcrypto;

-- 1. Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null default '',
  full_name text default '',
  display_name text default '',
  email text,
  avatar_url text,
  language text not null default 'English',
  timezone text not null default 'UTC',
  goals text[] not null default '{}',
  improve_areas text[] not null default '{}',
  onboarded boolean not null default false,
  settings jsonb not null default '{"keepTranscripts": true, "keepAudio": false, "demoMode": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists name text not null default '',
  add column if not exists full_name text default '',
  add column if not exists display_name text default '',
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists language text not null default 'English',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists goals text[] not null default '{}',
  add column if not exists improve_areas text[] not null default '{}',
  add column if not exists onboarded boolean not null default false,
  add column if not exists settings jsonb not null default '{"keepTranscripts": true, "keepAudio": false, "demoMode": false}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.profiles set user_id = id where user_id is null;

alter table public.profiles
  alter column settings set default '{"keepTranscripts": true, "keepAudio": false, "demoMode": false}'::jsonb;

create or replace function public.sync_profile_user_id()
returns trigger
language plpgsql
as $$
begin
  new.user_id := new.id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_user_id on public.profiles;
create trigger trg_sync_profile_user_id
  before insert or update on public.profiles
  for each row execute function public.sync_profile_user_id();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g_full text;
  g_display text;
  g_avatar text;
begin
  g_full := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    ''
  );
  g_display := coalesce(
    nullif(new.raw_user_meta_data->>'given_name', ''),
    nullif(split_part(g_full, ' ', 1), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    ''
  );
  g_avatar := coalesce(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture'
  );

  insert into public.profiles (
    id,
    user_id,
    name,
    full_name,
    display_name,
    email,
    avatar_url,
    settings
  )
  values (
    new.id,
    new.id,
    g_display,
    g_full,
    g_display,
    new.email,
    g_avatar,
    '{"keepTranscripts": true, "keepAudio": false, "demoMode": false}'::jsonb
  )
  on conflict (id) do update set
    user_id = excluded.id,
    email = coalesce(public.profiles.email, excluded.email),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    full_name = case
      when coalesce(public.profiles.full_name, '') = '' then excluded.full_name
      else public.profiles.full_name
    end,
    display_name = case
      when coalesce(public.profiles.display_name, '') = '' then excluded.display_name
      else public.profiles.display_name
    end,
    name = case
      when coalesce(public.profiles.name, '') = '' then excluded.name
      else public.profiles.name
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Recordings
create table if not exists public.recordings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  duration_sec integer not null default 0,
  mime_type text,
  size_bytes bigint,
  status text not null default 'saved' check (status in ('saved', 'processing', 'failed')),
  transcript_id text,
  created_at timestamptz not null default now()
);

-- 3. Transcripts
create table if not exists public.transcripts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recording_id text references public.recordings(id) on delete set null,
  text text not null,
  provider text not null default 'gemini',
  created_at timestamptz not null default now()
);

-- 4. Memories
create table if not exists public.memories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text references public.recordings(id) on delete set null,
  created_at timestamptz not null default now(),
  date date not null,
  time text not null,
  category text not null check (category in ('memory', 'person', 'goal', 'decision', 'problem', 'idea', 'learning', 'habit')),
  title text not null,
  summary text not null default '',
  transcript text not null default '',
  topics text[] not null default '{}',
  people text[] not null default '{}',
  entities text[] not null default '{}',
  tone text check (tone in ('positive', 'negative', 'mixed')),
  goals text[] not null default '{}',
  commitments text[] not null default '{}',
  problems text[] not null default '{}',
  decisions text[] not null default '{}',
  follow_ups text[] not null default '{}',
  confidence real not null default 0.6,
  source text not null default 'voice' check (source in ('voice', 'text', 'seed')),
  transcript_provider text not null default 'unknown',
  is_demo boolean not null default false,
  extraction_status text not null default 'analyzed' check (extraction_status in ('analyzed', 'pending', 'failed')),
  extraction_error text
);

-- 5. Entities
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('person', 'topic', 'entity')),
  name text not null,
  mention_count integer not null default 1,
  first_seen date,
  last_seen date,
  created_at timestamptz not null default now(),
  unique (user_id, kind, name)
);

-- 6. Memory Relationships
create table if not exists public.memory_relationships (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_memory_id text not null references public.memories(id) on delete cascade,
  to_memory_id text not null references public.memories(id) on delete cascade,
  kind text not null check (kind in ('related_to', 'caused_by', 'followed_by', 'contradicts', 'supports', 'shared_topic')),
  shared_topics text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- 7. Daily Summaries
create table if not exists public.daily_summaries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  summary text not null,
  learning_score integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- 8. Insights
create table if not exists public.insights (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly', 'pattern')),
  date date not null,
  title text not null,
  body text not null,
  evidence_ids text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- 9. Goals
create table if not exists public.goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  source_memory_id text references public.memories(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- 10. Action Items
create table if not exists public.action_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id text references public.memories(id) on delete set null,
  title text not null,
  detail text,
  due_date date,
  status text not null default 'open' check (status in ('suggested', 'open', 'done', 'dismissed')),
  source text not null default 'user' check (source in ('ai', 'memory', 'user')),
  is_demo boolean not null default false,
  source_message_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.action_items add column if not exists source_message_id text;

-- 11. Companion Conversations
create table if not exists public.conversations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  summary text,
  is_demo boolean not null default false
);

-- 12. Companion Conversation Messages
create table if not exists public.conversation_messages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  proposed_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null
);

-- 13. Companion Conversation Summaries
create table if not exists public.conversation_summaries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null references public.conversations(id) on delete cascade,
  summary text not null,
  created_at timestamptz not null
);

-- 14. Companion Conversation Memory Refs
create table if not exists public.conversation_memory_refs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null references public.conversations(id) on delete cascade,
  memory_id text not null,
  created_at timestamptz not null
);

-- Indexes across all 14 tables
create index if not exists idx_profiles_user_id on public.profiles (user_id);
create index if not exists idx_recordings_user on public.recordings (user_id, started_at desc);
create index if not exists idx_transcripts_user on public.transcripts (user_id, created_at desc);
create index if not exists idx_transcripts_recording on public.transcripts (recording_id);
create index if not exists idx_memories_user_date on public.memories (user_id, date desc);
create index if not exists idx_memories_category on public.memories (user_id, category);
create index if not exists idx_memories_extraction on public.memories (user_id, extraction_status);
create index if not exists idx_entities_user on public.entities (user_id, kind, mention_count desc);
create index if not exists idx_relationships_user on public.memory_relationships (user_id);
create index if not exists idx_relationships_from on public.memory_relationships (from_memory_id);
create index if not exists idx_relationships_to on public.memory_relationships (to_memory_id);
create index if not exists idx_summaries_user_date on public.daily_summaries (user_id, date desc);
create index if not exists idx_insights_user on public.insights (user_id, created_at desc);
create index if not exists idx_goals_user on public.goals (user_id, status);
create index if not exists idx_actions_user_status on public.action_items (user_id, status);
create index if not exists idx_conversations_user on public.conversations (user_id, updated_at desc);
create index if not exists idx_conversation_messages_conv on public.conversation_messages (conversation_id, created_at);
create index if not exists idx_conversation_messages_user on public.conversation_messages (user_id, created_at desc);
create index if not exists idx_conversation_summaries_conv on public.conversation_summaries (conversation_id, created_at desc);
create index if not exists idx_conversation_summaries_user on public.conversation_summaries (user_id, created_at desc);
create index if not exists idx_conversation_memory_refs_conv on public.conversation_memory_refs (conversation_id);
create index if not exists idx_conversation_memory_refs_mem on public.conversation_memory_refs (memory_id);
create index if not exists idx_conversation_memory_refs_user on public.conversation_memory_refs (user_id);

-- Enable Row Level Security on all 14 tables
alter table public.profiles enable row level security;
alter table public.recordings enable row level security;
alter table public.transcripts enable row level security;
alter table public.memories enable row level security;
alter table public.entities enable row level security;
alter table public.memory_relationships enable row level security;
alter table public.daily_summaries enable row level security;
alter table public.insights enable row level security;
alter table public.goals enable row level security;
alter table public.action_items enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.conversation_memory_refs enable row level security;

-- Strict ownership policies for user_id-scoped tables (13 tables)
do $$
declare
  t text;
begin
  foreach t in array array[
    'recordings',
    'transcripts',
    'memories',
    'entities',
    'memory_relationships',
    'daily_summaries',
    'insights',
    'goals',
    'action_items',
    'conversations',
    'conversation_messages',
    'conversation_summaries',
    'conversation_memory_refs'
  ]
  loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
    execute format('drop policy if exists "own_rows_select" on public.%I', t);
    execute format('create policy "own_rows_select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('drop policy if exists "own_rows_insert" on public.%I', t);
    execute format('create policy "own_rows_insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "own_rows_update" on public.%I', t);
    execute format('create policy "own_rows_update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "own_rows_delete" on public.%I', t);
    execute format('create policy "own_rows_delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end
$$;

-- Strict ownership policies for profiles
drop policy if exists "Users can view connected profiles" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can delete own profile" on public.profiles;
drop policy if exists "own_rows_select" on public.profiles;
drop policy if exists "own_rows_insert" on public.profiles;
drop policy if exists "own_rows_update" on public.profiles;
drop policy if exists "own_rows_delete" on public.profiles;

create policy "own_rows_select" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "own_rows_insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and (user_id is null or user_id = auth.uid()));

create policy "own_rows_update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and (user_id is null or user_id = auth.uid()));

create policy "own_rows_delete" on public.profiles
  for delete to authenticated
  using (id = auth.uid());

revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated, service_role;

notify pgrst, 'reload schema';

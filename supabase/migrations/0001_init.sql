create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id text primary key,
  name text not null default 'You',
  settings jsonb not null default '{"keepTranscripts": true, "keepAudio": false}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.recordings (
  id text primary key,
  user_id text not null,
  started_at timestamptz not null,
  duration_sec integer not null default 0,
  mime_type text,
  size_bytes bigint,
  status text not null default 'saved' check (status in ('saved', 'processing', 'failed')),
  transcript_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.transcripts (
  id text primary key,
  user_id text not null,
  recording_id text references public.recordings (id) on delete set null,
  text text not null,
  provider text not null default 'gemini',
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id text primary key,
  user_id text not null,
  session_id text references public.recordings (id) on delete set null,
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
  is_demo boolean not null default false
);

create table if not exists public.memory_relationships (
  id text primary key,
  user_id text not null,
  from_memory_id text not null references public.memories (id) on delete cascade,
  to_memory_id text not null references public.memories (id) on delete cascade,
  kind text not null check (kind in ('related_to', 'caused_by', 'followed_by', 'contradicts', 'supports', 'shared_topic')),
  shared_topics text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('person', 'topic', 'entity')),
  name text not null,
  mention_count integer not null default 1,
  first_seen date,
  last_seen date,
  unique (user_id, kind, name)
);

create table if not exists public.daily_summaries (
  id text primary key,
  user_id text not null,
  date date not null,
  summary text not null,
  learning_score integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.insights (
  id text primary key,
  user_id text not null,
  kind text not null check (kind in ('daily', 'weekly', 'pattern')),
  date date not null,
  title text not null,
  body text not null,
  evidence_ids text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id text primary key,
  user_id text not null,
  title text not null,
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  source_memory_id text references public.memories (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.action_items (
  id text primary key,
  user_id text not null,
  memory_id text references public.memories (id) on delete set null,
  title text not null,
  detail text,
  due_date date,
  status text not null default 'open' check (status in ('suggested', 'open', 'done', 'dismissed')),
  source text not null default 'user' check (source in ('ai', 'memory', 'user')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_memories_user_date on public.memories (user_id, date desc);
create index if not exists idx_memories_category on public.memories (user_id, category);
create index if not exists idx_relationships_from on public.memory_relationships (from_memory_id);
create index if not exists idx_relationships_to on public.memory_relationships (to_memory_id);
create index if not exists idx_actions_user_status on public.action_items (user_id, status);
create index if not exists idx_transcripts_recording on public.transcripts (recording_id);
create index if not exists idx_recordings_user on public.recordings (user_id, started_at desc);
create index if not exists idx_insights_user on public.insights (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.recordings enable row level security;
alter table public.transcripts enable row level security;
alter table public.memories enable row level security;
alter table public.memory_relationships enable row level security;
alter table public.entities enable row level security;
alter table public.daily_summaries enable row level security;
alter table public.insights enable row level security;
alter table public.goals enable row level security;
alter table public.action_items enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['recordings', 'transcripts', 'memories', 'memory_relationships', 'entities', 'daily_summaries', 'insights', 'goals', 'action_items']
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

  -- profiles is keyed by id (== user id), not user_id
  execute 'drop policy if exists "own_rows_select" on public.profiles';
  execute 'create policy "own_rows_select" on public.profiles for select using (id = auth.uid()::text)';
  execute 'drop policy if exists "own_rows_insert" on public.profiles';
  execute 'create policy "own_rows_insert" on public.profiles for insert with check (id = auth.uid()::text)';
  execute 'drop policy if exists "own_rows_update" on public.profiles';
  execute 'create policy "own_rows_update" on public.profiles for update using (id = auth.uid()::text)';
  execute 'drop policy if exists "own_rows_delete" on public.profiles';
  execute 'create policy "own_rows_delete" on public.profiles for delete using (id = auth.uid()::text)';
end
$$;

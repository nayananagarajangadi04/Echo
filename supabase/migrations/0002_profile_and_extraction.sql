alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists display_name text not null default '',
  add column if not exists email text,
  add column if not exists language text not null default 'en',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists goals text[] not null default '{}',
  add column if not exists improve_areas text[] not null default '{}',
  add column if not exists onboarded boolean not null default false;

update public.profiles set display_name = name where display_name = '' and name <> '';

alter table public.memories
  add column if not exists extraction_status text not null default 'analyzed',
  add column if not exists extraction_error text;

alter table public.action_items add column if not exists is_demo boolean not null default false;
alter table public.goals add column if not exists is_demo boolean not null default false;
alter table public.daily_summaries add column if not exists is_demo boolean not null default false;
alter table public.insights add column if not exists is_demo boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_settings_demo_mode,
  alter column settings set default '{"keepTranscripts": true, "keepAudio": false, "demoMode": true}'::jsonb;

create index if not exists idx_memories_extraction on public.memories (user_id, extraction_status);

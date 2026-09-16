-- SUG Packs database. Paste all of this into Supabase → SQL Editor → Run.
-- Safe to run again: it only adds what is missing.
--
-- Who gets in: sign-ups are switched off in Supabase, so the only logins are the
-- ones added by hand (Razz and 12). Every table below is readable and writable
-- by those logins only. Nothing is visible without signing in.

create extension if not exists pgcrypto;

-- People ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Logins created before this script ran get their profile too.
insert into public.profiles (id, name, email)
select id, coalesce(nullif(raw_user_meta_data ->> 'name', ''), split_part(email, '@', 1)), email
from auth.users
on conflict (id) do nothing;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

-- Tags -----------------------------------------------------------------------
-- id is "<group>:<slug>", e.g. "genre:rnb". One tag, one group, no duplicates.

create table if not exists public.tags (
  id text primary key check (id ~ '^(genre|vibe|instrument|artist):[a-z0-9]+$'),
  grp text not null check (grp in ('genre', 'vibe', 'instrument', 'artist')),
  label text not null check (length(trim(label)) between 1 and 40),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- Loops ----------------------------------------------------------------------

create table if not exists public.loops (
  id uuid primary key default gen_random_uuid(),
  file text not null,
  dropbox_path text not null unique,
  title text not null,
  bpm int check (bpm between 20 and 400),
  key text,
  collabs text[] not null default '{}',
  tags text[] not null default '{}',
  duration real,
  added_by uuid references public.profiles (id) on delete set null default auth.uid(),
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists loops_tags_idx on public.loops using gin (tags);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists loops_touch on public.loops;
create trigger loops_touch before update on public.loops
  for each row execute function public.touch_updated_at();

-- Packs ----------------------------------------------------------------------
-- Written by the server function once Dropbox has copied the files.

create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  loop_ids uuid[] not null default '{}',
  remove_sug boolean not null default false,
  remove_collabs boolean not null default false,
  dropbox_path text,
  link text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- Access ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tags enable row level security;
alter table public.loops enable row level security;
alter table public.packs enable row level security;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles for select to authenticated using (public.is_member());
drop policy if exists "own name" on public.profiles;
create policy "own name" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members read tags" on public.tags;
create policy "members read tags" on public.tags for select to authenticated using (public.is_member());
drop policy if exists "members add tags" on public.tags;
create policy "members add tags" on public.tags for insert to authenticated with check (public.is_member());

drop policy if exists "members read loops" on public.loops;
create policy "members read loops" on public.loops for select to authenticated using (public.is_member());
drop policy if exists "members add loops" on public.loops;
create policy "members add loops" on public.loops for insert to authenticated with check (public.is_member());
drop policy if exists "members edit loops" on public.loops;
create policy "members edit loops" on public.loops for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists "members read packs" on public.packs;
create policy "members read packs" on public.packs for select to authenticated using (public.is_member());

revoke all on public.profiles, public.tags, public.loops, public.packs from anon;
revoke all on public.profiles, public.tags, public.loops, public.packs from authenticated;
grant select, update (name) on public.profiles to authenticated;
grant select, insert on public.tags to authenticated;
grant select, insert, update on public.loops to authenticated;
grant select on public.packs to authenticated;

-- Keep-awake: a free project pauses after a quiet week. A daily GitHub Action
-- calls this, which reads nothing.
create or replace function public.ping() returns text language sql security definer set search_path = public as $$ select 'pong' $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- Starter vocabulary -----------------------------------------------------------
-- A clean base to tag with; add more from the app (it catches look-alikes).

insert into public.tags (id, grp, label, created_by) values
  ('genre:trap', 'genre', 'Trap', null),
  ('genre:melodictrap', 'genre', 'Melodic Trap', null),
  ('genre:drill', 'genre', 'Drill', null),
  ('genre:uk', 'genre', 'UK', null),
  ('genre:rnb', 'genre', 'RnB', null),
  ('genre:pluggnb', 'genre', 'Pluggnb', null),
  ('genre:rage', 'genre', 'Rage', null),
  ('genre:newwave', 'genre', 'New Wave', null),
  ('genre:boombap', 'genre', 'Boom Bap', null),
  ('genre:soul', 'genre', 'Soul', null),
  ('genre:afrobeat', 'genre', 'Afrobeat', null),
  ('genre:dancehall', 'genre', 'Dancehall', null),
  ('genre:latin', 'genre', 'Latin', null),
  ('genre:french', 'genre', 'French', null),
  ('genre:detroit', 'genre', 'Detroit', null),
  ('genre:pop', 'genre', 'Pop', null),
  ('vibe:dark', 'vibe', 'Dark', null),
  ('vibe:pain', 'vibe', 'Pain', null),
  ('vibe:emotional', 'vibe', 'Emotional', null),
  ('vibe:hard', 'vibe', 'Hard', null),
  ('vibe:smooth', 'vibe', 'Smooth', null),
  ('vibe:chill', 'vibe', 'Chill', null),
  ('vibe:uplifting', 'vibe', 'Uplifting', null),
  ('vibe:sexy', 'vibe', 'Sexy', null),
  ('vibe:vintage', 'vibe', 'Vintage', null),
  ('vibe:epic', 'vibe', 'Epic', null),
  ('vibe:weird', 'vibe', 'Weird', null),
  ('instrument:guitar', 'instrument', 'Guitar', null),
  ('instrument:acousticguitar', 'instrument', 'Acoustic Guitar', null),
  ('instrument:piano', 'instrument', 'Piano', null),
  ('instrument:keys', 'instrument', 'Keys', null),
  ('instrument:synth', 'instrument', 'Synth', null),
  ('instrument:pad', 'instrument', 'Pad', null),
  ('instrument:arp', 'instrument', 'Arp', null),
  ('instrument:strings', 'instrument', 'Strings', null),
  ('instrument:vocals', 'instrument', 'Vocals', null),
  ('instrument:flute', 'instrument', 'Flute', null),
  ('instrument:bells', 'instrument', 'Bells', null),
  ('instrument:brass', 'instrument', 'Brass', null),
  ('artist:gunna', 'artist', 'Gunna', null),
  ('artist:lilbaby', 'artist', 'Lil Baby', null),
  ('artist:lildurk', 'artist', 'Lil Durk', null),
  ('artist:rodwave', 'artist', 'Rod Wave', null),
  ('artist:nocap', 'artist', 'NoCap', null),
  ('artist:polog', 'artist', 'Polo G', null),
  ('artist:drake', 'artist', 'Drake', null),
  ('artist:sza', 'artist', 'SZA', null),
  ('artist:travisscott', 'artist', 'Travis Scott', null),
  ('artist:dontoliver', 'artist', 'Don Toliver', null),
  ('artist:kanyewest', 'artist', 'Kanye West', null),
  ('artist:nemzzz', 'artist', 'Nemzzz', null),
  ('artist:nlechoppa', 'artist', 'NLE Choppa', null),
  ('artist:burnaboy', 'artist', 'Burna Boy', null),
  ('artist:liltecca', 'artist', 'Lil Tecca', null),
  ('artist:rafcamora', 'artist', 'RAF Camora', null)
on conflict (id) do nothing;

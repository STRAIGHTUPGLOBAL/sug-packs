-- SUG Packs update 7: the quarantine, and when a loop was made.
-- Paste into Supabase → SQL Editor → Run. Safe to run again.
--
-- Old loops are uploaded into quarantine first. Nothing there is in the library
-- until someone swipes it right (kept). Rejected loops stay put, marked, until
-- they are purged on purpose.

-- Month and year a loop was made (stored as the first of that month).
alter table public.loops add column if not exists made_on date;
create index if not exists loops_made_on_idx on public.loops (made_on);

create table if not exists public.quarantine (
  id uuid primary key default gen_random_uuid(),
  -- Samples today. Starters and beats get their own quarantine later.
  kind text not null default 'sample' check (kind in ('sample', 'starter', 'beat')),
  file text not null,
  dropbox_path text not null unique,
  title text not null,
  bpm int check (bpm between 20 and 400),
  key text,
  collabs text[] not null default '{}',
  duration real,
  made_on date not null,
  -- open: not heard yet · later: parked · kept: now in the library · rejected: stays here
  state text not null default 'open' check (state in ('open', 'later', 'kept', 'rejected')),
  -- The library loop a kept file became. No foreign key: the history outlives it.
  loop_id uuid,
  added_by uuid references public.profiles (id) on delete set null default auth.uid(),
  added_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz
);

-- The same file name is the same loop, in any month.
create unique index if not exists quarantine_file_unique on public.quarantine (kind, lower(file));
create index if not exists quarantine_queue_idx on public.quarantine (kind, state, made_on desc);

alter table public.quarantine enable row level security;
drop policy if exists "members read quarantine" on public.quarantine;
create policy "members read quarantine" on public.quarantine
  for select to authenticated using (public.is_member());
drop policy if exists "members add quarantine" on public.quarantine;
create policy "members add quarantine" on public.quarantine
  for insert to authenticated with check (public.is_member());
-- Members can park, reject and reopen. Keeping moves a file in Dropbox, so only
-- the server function may mark a row kept (or change one that is).
drop policy if exists "members decide quarantine" on public.quarantine;
create policy "members decide quarantine" on public.quarantine
  for update to authenticated
  using (public.is_member() and state <> 'kept')
  with check (public.is_member() and state in ('open', 'later', 'rejected'));

revoke all on public.quarantine from anon, authenticated;
grant select on public.quarantine to authenticated;
grant insert (kind, file, dropbox_path, title, bpm, key, collabs, duration, made_on)
  on public.quarantine to authenticated;
grant update (state, decided_by, decided_at) on public.quarantine to authenticated;

select state, count(*) from public.quarantine group by state;

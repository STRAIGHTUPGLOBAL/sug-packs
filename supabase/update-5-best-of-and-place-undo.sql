-- SUG Packs update 5: Best of flags and reversible placement.
-- Paste into Supabase → SQL Editor → Run. Safe to run again.

-- A deliberate shortlist. A later feature can mirror these rows into one
-- continuously updated Dropbox folder without confusing them with favourites.
alter table public.loops add column if not exists best_of boolean not null default false;
create index if not exists loops_best_of_idx on public.loops (best_of) where best_of;

-- Exact pack-copy names removed when a loop is placed, keyed by pack id.
-- This lets Open restore the same files to every surviving pack.
alter table public.loops add column if not exists placed_pack_copies jsonb not null default '{}'::jsonb;

select count(*) filter (where best_of) as best_of_count from public.loops;

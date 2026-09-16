-- SUG Packs update 4: reserved and placed loops.
-- Paste into Supabase → SQL Editor → Run. Safe to run again.
--
-- open     · free to send in packs (the normal state)
-- reserved · someone has called dibs before a release; still sendable, but
--            flagged, so an exclusive offer starts a conversation first
-- placed   · sold exclusively, gone for good: pulled out of every pack and
--            never offered again

alter table public.loops add column if not exists status text not null default 'open';
alter table public.loops drop constraint if exists loops_status_check;
alter table public.loops add constraint loops_status_check check (status in ('open', 'reserved', 'placed'));

-- Who reserved it, or where it landed, and when that was set.
alter table public.loops add column if not exists status_note text;
alter table public.loops add column if not exists status_at timestamptz;

create index if not exists loops_status_idx on public.loops (status);

select status, count(*) from public.loops group by status;

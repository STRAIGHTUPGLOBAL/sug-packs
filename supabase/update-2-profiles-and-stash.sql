-- SUG Packs update 2: profile pictures, favourites, and pack usage.
-- Paste into Supabase → SQL Editor → Run. Safe to run again.

-- Profile pictures: a small square image kept as text (no file storage needed).
alter table public.profiles add column if not exists avatar text;
alter table public.profiles drop constraint if exists profiles_avatar_size;
alter table public.profiles add constraint profiles_avatar_size check (avatar is null or length(avatar) < 400000);

-- How often a pack goes out, and when it last did.
alter table public.packs add column if not exists uses int not null default 0;
alter table public.packs add column if not exists last_used_at timestamptz;

-- Favourites: each person pins their own.
create table if not exists public.pack_favorites (
  pack_id uuid not null references public.packs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pack_id, user_id)
);
alter table public.pack_favorites enable row level security;

drop policy if exists "members read favorites" on public.pack_favorites;
create policy "members read favorites" on public.pack_favorites for select to authenticated using (public.is_member());
drop policy if exists "own favorites" on public.pack_favorites;
create policy "own favorites" on public.pack_favorites for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "drop own favorites" on public.pack_favorites;
create policy "drop own favorites" on public.pack_favorites for delete to authenticated using (user_id = auth.uid());

revoke all on public.pack_favorites from anon, authenticated;
grant select, insert, delete on public.pack_favorites to authenticated;
grant update (name, avatar) on public.profiles to authenticated;

-- Copying a pack's link counts as using it. Counted here so nobody can
-- invent numbers by writing to the table directly.
create or replace function public.note_pack_use(pack uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  update public.packs set uses = uses + 1, last_used_at = now() where id = pack;
end $$;
revoke all on function public.note_pack_use(uuid) from public, anon;
grant execute on function public.note_pack_use(uuid) to authenticated;

-- SUG Packs update 6: producer recipients and durable pack history.
-- Paste into Supabase → SQL Editor → Run. Safe to run again.

-- Pack recipients are clients/producers, not SUG Packs login profiles.
create table if not exists public.recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  instagram_handle text check (
    instagram_handle is null
    or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'
  ),
  avatar text,
  archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipients drop constraint if exists recipients_avatar_size;
alter table public.recipients add constraint recipients_avatar_size
  check (avatar is null or length(avatar) < 400000);

create unique index if not exists recipients_instagram_handle_unique
  on public.recipients (lower(instagram_handle))
  where instagram_handle is not null and not archived;

drop trigger if exists recipients_touch on public.recipients;
create trigger recipients_touch before update on public.recipients
  for each row execute function public.touch_updated_at();

alter table public.recipients enable row level security;
drop policy if exists "members read recipients" on public.recipients;
create policy "members read recipients" on public.recipients
  for select to authenticated using (public.is_member());
drop policy if exists "members add recipients" on public.recipients;
create policy "members add recipients" on public.recipients
  for insert to authenticated with check (public.is_member());
drop policy if exists "members edit recipients" on public.recipients;
create policy "members edit recipients" on public.recipients
  for update to authenticated using (public.is_member()) with check (public.is_member());

revoke all on public.recipients from anon, authenticated;
grant select, insert, update (name, instagram_handle, avatar, archived)
  on public.recipients to authenticated;

-- Add pack metadata one column at a time so this migration is safe to rerun.
alter table public.packs add column if not exists recipient_id uuid
  references public.recipients (id);
alter table public.packs add column if not exists source_pack_id uuid
  references public.packs (id) on delete set null;
alter table public.packs add column if not exists build_recipe jsonb;
alter table public.packs drop constraint if exists packs_build_recipe_object;
alter table public.packs add constraint packs_build_recipe_object
  check (build_recipe is null or jsonb_typeof(build_recipe) = 'object');

-- Unlike loop_ids, this array never changes when a loop is placed or a pack is
-- edited. UUID values deliberately survive deletion of the library row.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'packs' and column_name = 'sent_loop_ids'
  ) then
    alter table public.packs add column sent_loop_ids uuid[] not null default '{}';
    update public.packs set sent_loop_ids = loop_ids;
  end if;
end $$;

create index if not exists packs_recipient_idx on public.packs (recipient_id);
create index if not exists packs_source_pack_idx on public.packs (source_pack_id);
create index if not exists packs_sent_loop_ids_idx on public.packs using gin (sent_loop_ids);

select count(*) as recipients from public.recipients;

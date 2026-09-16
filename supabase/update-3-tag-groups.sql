-- SUG Packs update 3: tag groups.
-- Adds "type" (melodic / hard) as the first group, and clears the starter
-- vocabulary that shipped with the app so the tags are yours alone.
-- Paste into Supabase → SQL Editor → Run. Safe to run again.

-- "type" joins the allowed groups.
alter table public.tags drop constraint if exists tags_id_check;
alter table public.tags add constraint tags_id_check
  check (id ~ '^(type|genre|vibe|instrument|artist):[a-z0-9]+$');

alter table public.tags drop constraint if exists tags_grp_check;
alter table public.tags add constraint tags_grp_check
  check (grp in ('type', 'genre', 'vibe', 'instrument', 'artist'));

-- The two types that never fail.
insert into public.tags (id, grp, label, created_by) values
  ('type:melodic', 'type', 'Melodic', null),
  ('type:hard', 'type', 'Hard', null)
on conflict (id) do nothing;

-- Away with the starter vocabulary, except anything already used on a loop
-- (nothing is silently taken off a loop).
delete from public.tags t
where t.created_by is null
  and t.grp <> 'type'
  and not exists (select 1 from public.loops l where l.tags @> array[t.id]);

select grp, count(*) as tags_left from public.tags group by grp order by grp;

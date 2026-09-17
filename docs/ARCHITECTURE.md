# Architecture

SUG Packs is a small static web app with two servers behind it: Supabase
(database + logins) and one Supabase Edge Function that is the only thing
holding Dropbox credentials. There is no build step and no framework.

```
browser (GitHub Pages, packs.straightup-global.com)
   │
   ├── Supabase Postgres  ── tags, loops, packs, profiles, favourites   (row level security)
   ├── Supabase Auth      ── two logins, sessions kept in the browser
   └── Edge Function "dropbox"
            │  (holds DROPBOX_APP_KEY + DROPBOX_REFRESH_TOKEN)
            └── Dropbox app folder
                   /Library/…    every loop, uploaded once
                   /Packs/<name>/…  copies, shared by link
```

Audio never passes through a server we run: the browser uploads straight to
Dropbox with a one-hour link, and plays from four-hour temporary links.

## Files

```
index.html            shell: wash, splash, view container, sheet layer, toast
css/tokens.css        colours, glass, type, easing, layout variables
css/app.css           base, splash, page transitions, header + nav, buttons,
                      search, chips, grouped lists, thumbs, avatars, profile,
                      filters, floating bar, toast
css/screens.css       swipe deck, pack page, cta, result screens, sheet
js/app.js             start-up, sign-in, routing, Build, Library, tag sheet,
                      Packs stash, pack sheet, profile pages
js/swipe.js           swipe session, deck, pack page, creating → done
js/data.js            picks live.js or store.js and re-exports the same names
js/live.js            Supabase + Dropbox implementation
js/store.js           demo implementation (localStorage + IndexedDB)
js/player.js          one shared audio element
js/audio-cache.js     bounded persistent cache for likely-to-play loops
js/uploads.js         background upload queue, progress sheet, retries
js/names.js           parse title/BPM/key/handles; cleaned pack file names
js/tags.js            tag groups, starter vocabulary, look-alike check, match rule
js/cover.js           name → gradient cover art
js/ui.js              escaping, icons, toast, sheet, formatting, clipboard
js/config.js          Supabase URL + publishable key; DEMO switch
supabase/schema.sql   first database setup
supabase/update-2-*.sql  profiles pictures, favourites, usage
supabase/functions/dropbox/index.ts   the server function
setup/dropbox-token.mjs               one-off Dropbox connection
dev-server.mjs        local static server with byte ranges (port 8092)
```

## The data layer contract

`js/data.js` is the only thing the screens import. Both implementations export
the same names, so the screens never know whether they are live or in the demo:

`live`, `session`, `signIn`, `signOut`, `init`, `refresh`, `reset`,
`setErrorHandler`, `users`, `currentUser`, `setUser`, `setName`, `listTags`,
`tagsById`, `addTag`, `tagUseCount`, `listLoops`, `getLoop`, `untagged`,
`checkLibraryFiles`, `removeMissingLoops`, `updateLoop`, `setBestOf`, `audioUrl`,
`warm`, `cacheAudio`, `addFiles`, `setLoopStatus`, `listPacks`, `createPack`,
`deletePack`, `renamePack`, `myId`, `profileOf`, `people`, `setAvatar`,
`isFavorite`, `favoriteCount`, `favoritesOf`, `toggleFavorite`, `notePackUse`.

Everything is loaded into memory once (`init`) and read synchronously; writes
update memory immediately and save in the background. `deletePack` and
`renamePack` are the exceptions: they re-read everything, because a background
refresh that started mid-delete used to bring the pack back.

Uploads are the other long-running exception. `uploads.js` owns an in-memory
queue outside any screen, so changing tabs cannot cancel it or leave a stale DOM
callback behind. `addFiles` runs three files at a time and reports each file's
state and byte progress; the queue retains failed `File` objects for retry until
the next finished batch replaces it or the page is reloaded.

`?demo` in the address, or an empty `SUPABASE_URL`, runs the demo instead.

## Database

| Table | What |
|---|---|
| `profiles` | one row per login: name, avatar (a small JPEG data URL), created_at |
| `tags` | `id` is `"<group>:<slug>"`, e.g. `genre:rnb`; groups: type, genre, vibe, instrument, artist |
| `loops` | file name, `dropbox_path`, title, bpm, key, collabs[], tags[], duration, added_by, `status`, `best_of`, `placed_pack_copies` |
| `packs` | name, loop_ids[], remove_sug, remove_collabs, dropbox_path, link, uses, last_used_at |
| `pack_favorites` | (pack_id, user_id) |

Access rules: sign-ups are off, so everyone with a login is a member.
`is_member()` gates every table. Members read and write loops and tags, read
packs, and manage only their own favourites and their own profile row. Packs
are written by the server function alone, and `uses` only moves through
`note_pack_use()`. Nothing is readable signed out.

## The server function

`supabase/functions/dropbox/index.ts`, deployed as `dropbox`, JWT verification
off (it checks the caller itself against `profiles`).

| Action | What it does |
|---|---|
| `me` | the caller's profile |
| `upload_link` | rejects an exact-name duplicate, then returns a one-hour direct upload link and its `/Library` path |
| `library_files` | what is in `/Library` |
| `delete_file` | removes one file, inside `/Library` only |
| `set_loop_status` | reserves or places a loop; placing removes its pack copies and remembers their exact names |
| `set_loop_status_v2` | compatibility gate: the web app uses this name before any reversible placement |
| `undo_loop_status` | returns a placed loop to Open and restores its saved copies to surviving packs |
| `play_links` | four-hour playback links, up to 25 at a time |
| `create_pack` | copies loops into `/Packs/<name>` under cleaned names, shares the folder, writes the pack row |
| `rename_pack` | moves the Dropbox folder (the share link survives) and updates the row |
| `delete_pack` | deletes the folder and the row; loops in `/Library` stay |

## A loop's life: open, reserved, placed

- **open** — normal, free to send in packs.
- **reserved** — a producer called dibs before a release. Still sendable, but
  flagged, so an exclusive offer starts a conversation first. `status_note`
  holds who has it.
- **placed** — sold exclusively. Setting this pulls the loop out of every pack
  (its copy is deleted from each pack's Dropbox folder and the id removed from
  `loop_ids`), and Build never offers it again. `status_note` holds where it landed.
  The exact removed names are kept in `placed_pack_copies`; returning to Open
  restores those copies and memberships to every surviving pack.

Status changes go through the server function (`set_loop_status`), because
placing touches Dropbox and other packs. The confirmation is a second tap that
says how many packs it will leave. A placed loop can only move back to Open.

`best_of` is deliberately separate from tags and pack favourites: it is a
shortlist on loops, ready for a future always-current Dropbox folder.

## Names and handles are never lost

`loops.file` keeps the name exactly as uploaded, and the handles are parsed into
`loops.collabs` as well. A pack is a list of loop ids plus two toggles; the
cleaned names exist only on the copies inside that pack's Dropbox folder. So a
later pack built from the same loops starts from the original names again and
makes its own choice about stripping `@straightupglobal` or collab handles.
Nothing about who worked on a loop is ever thrown away.

## Things that will bite you

- **Dropbox's temporary upload link replies with a checksum, not metadata.**
  The path has to be decided before the upload; that is what `upload_link` returns.
- **Supabase returns at most 1000 rows per request.** `fetchAll()` pages.
- **Covers are generated from names** (`cover.js`), so renaming a pack changes
  its cover. That is intended: identity follows the name.
- **Type is closed.** Melodic and Hard are the only two, in the app (a group
  marked `fixed` in `GROUPS` shows no add button) and in the database
  (`tags_type_is_closed`).
- **Tag ids encode the group**, so the same word can exist in two groups but
  never twice in one.
- **The vocabulary is the owners', not ours.** Only `type` ships with tags
  (Melodic, Hard) — the first call they make on every loop, and the one that
  never fails. Genre, Vibe, Instruments and Artist (optional) start empty and
  fill up while tagging; empty groups show "+ New tag". Don't seed tags again
  (update 3 removed the starter vocabulary, keeping anything already in use).
- **The swipe session lives in localStorage** (`sugpacks-session`), so closing
  the phone mid-swipe keeps your place.
- **Phones need one tap before audio plays**; after that each card plays itself.
- **Play toggles stop, not pause.** Stopping resets to 0:00; opening a loop adds
  the deliberate seek control needed to reach stems later in the same file.
- **Build filters are strict AND.** Every selected tag must exist on a loop,
  including multiple tags from one group (Dark + Aggressive means both).
- **Tag colour follows the tag id, not its group.** `tagStyle()` hashes the id to
  one stable hue, so the growing vocabulary remains visually recognizable.
- **Playback is cached ahead, but deliberately bounded.** New uploads go straight
  into the browser cache from their local `File`; Library and Swipe cache up to
  eight likely next loops. Twelve files / 192 MB is the device-wide ceiling.
- **The iOS Home Screen app deliberately uses a contained viewport and opaque
  status bar.** WebKit can mispaint `bottom: 0` above a phantom strip in
  standalone mode when `viewport-fit=cover` and `black-translucent` are paired.
  Safari tabs do not reproduce it, so do not restore that pair for aesthetics.
  The version query in `index.html` and the manifest `start_url` is bumped when
  installed-app chrome changes, so iOS cannot recombine an old shell and new CSS.
- **Dropbox can be edited behind the app's back.** Opening Library compares its
  paths with `/Library`; missing rows are excluded from Build and can be removed
  together. The deployed `delete_loop` action already tolerates a missing file.
- **Avatars are data URLs in the database**, capped by a check constraint. No
  file storage is used anywhere.

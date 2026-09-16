# Backlog

The working list for SUG Packs. Read `ARCHITECTURE.md` and `DESIGN.md` first.

## How to work this list

1. Take the top unchecked item in **Now** that is not marked **Needs Razz**.
2. Build it, verify it in the browser at phone size (375×812) and check the
   console is clean. Database or function changes need a paste from Razz: put
   the file on his clipboard and say so plainly.
3. Tick the box, move the item to **Done** with one line on what shipped, commit
   and push.
4. Stop and ask when an item is marked **Needs Razz**, or when doing it would
   delete anything of his.

Keep entries short: goal, why, and how you will know it works.

---

## Now

- [ ] **Bring the old packs into the stash** — **Needs Razz**
  Goal: the ~100 finished packs in his Dropbox (`straightupglobal (PACKS)`) are
  searchable here instead of only in Dropbox.
  Why: "we get asked so many times for samples and have packs already done
  somewhere, we just need to be able to find them."
  Open questions for him: copy them into the app folder (safe, uses space) or
  reference them where they are (needs full-Dropbox access instead of an app
  folder, which is a bigger permission)? Do the loops inside need to become
  library loops too, or is a searchable pack with its file list enough?
  Done when: those packs appear in Packs, searchable by name and by the loops
  inside, with a working link.

- [ ] **Bulk upload**
  Goal: drop 50 files onto the Library and walk away.
  Now: files upload one after another and the whole screen waits.
  Done when: a queue with per-file progress, failures listed at the end and
  retryable, and the app stays usable while it runs.

- [ ] **Tag several loops at once**
  Goal: select many loops in the Library and add or remove a tag on all of them.
  Why: tagging is the real work; the queue helps one at a time only.
  Done when: long-press or a select mode, a tag sheet that applies to the
  selection, and the count of what changed.

- [ ] **Remove a loop**
  Goal: delete a loop from the library and from Dropbox.
  Note: the server already has `delete_file`; this is UI plus a guard when the
  loop sits in an existing pack (warn, don't silently break the pack).

## Soon

- [ ] **Edit a pack's contents** — add or remove loops after it was created
  (copies into or deletes from the Dropbox folder, updates the row).
- [ ] **Notes on a pack** — who asked for it, what for. Shown in the stash and
  searchable, so "the one for Kaverr" finds it.
- [ ] **Build a pack from an existing one** — duplicate, then swipe the copy.
- [ ] **Filter loops by tempo and key** in Build and Library (ranges, not text).
- [ ] **"Never sent" and "not in any pack" filters** — find the loops that are
  sitting unused.
- [ ] **Install to the home screen properly** — a service worker so the app opens
  instantly and survives a bad connection (the manifest and icons are already there).

## Later / ideas

- [ ] Choose a pack's cover instead of taking it from the name.
- [ ] Spot duplicate loops by audio, not just by file name.
- [ ] Share links that expire, for one-off sends.
- [ ] A third login with limited rights (look but not delete).
- [ ] Tag suggestions from the file name ("Pain Guitar" in a name proposes tags).
- [ ] Per-person tag vocabulary stats: which tags are actually used.

## Done

- [x] Tag loops by hand, pick tags, swipe, create a Dropbox pack, copy the link.
- [x] Clean file names per pack: remove `@straightupglobal` (typos included) and
      collab handles separately. Originals never change.
- [x] Live: Supabase logins for Razz and 12, loops and tags in the database,
      uploads and packs in Dropbox through the server function.
- [x] Pack stash: search by pack name or by a loop inside it, filters
      All / Mine / Favourites, sort by recent, most sent or name.
- [x] Favourites, and "sent" counted when a link is copied.
- [x] Rename and delete packs (Dropbox folder follows; link survives a rename).
- [x] Profile pages: picture, name, counts, favourites, their packs, sign out.
- [x] Cover art per loop and pack, the app icon, the logotype, the splash.
- [x] HTTPS on packs.straightup-global.com with "always use https".

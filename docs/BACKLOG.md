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



- [ ] **Listen through a pack**
  Goal: open a pack and play it end to end, or shuffled, without leaving the app.
  Why: before sending a pack on, or when hunting for one loop inside it.
  Done when: play/shuffle from the pack sheet, next/previous, the current loop
  visible, and it keeps playing while you scroll the list.

- [ ] **Build a new pack out of other packs** (cross-creating)
  Goal: while listening through a pack, pick the loops that fit, name a new pack
  and create it, taking loops from several existing packs.
  Why, in Razz's words: someone needs a few loops from a pack that also holds
  loops that don't fit, so today they copy loops out by hand.
  Done when: a "keep" action while listening, a basket that survives moving
  between packs, then the normal name / clean-names / create screen.
  Note: packs point at library loops, so the original file names and handles are
  always available again; the new pack decides its own cleaning.

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

## Decided against

- **Importing the old Dropbox packs** (16 Sep 2026). Razz: "I don't want any
  packs from the stash to get into this app... I want to start this fresh and
  clean." The stash fills up with packs made here. Don't propose it again.
- **Importing the old type folders** (15 Sep 2026). Their tags are unreliable,
  and clean data is the whole point of the app.

## Done

- [x] Remove a loop: type its file name to confirm, then it goes from Dropbox
      and the library. Packs that hold it keep their own copies.
- [x] Profile picture editor: choose, zoom, drag inside the circle, or remove.
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

# Backlog

The working list for SUG Packs. Read `PRODUCT.md`, `ARCHITECTURE.md` and
`DESIGN.md` first.

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

- [ ] **Tag several loops at once** — select many Library loops, then add or
  remove tags across the selection. Deferred for now by Razz (16 Sep).
- [ ] **Edit a pack's contents** — add or remove loops after it was created
  (copies into or deletes from the Dropbox folder, updates the row).
- [ ] **Notes on a pack** — freeform context beyond the structured recipient:
  what the request was for or any delivery detail. Searchable in the stash.
- [ ] **Filter loops by tempo and key** in Build and Library (ranges, not text).
- [ ] **"Never sent" and "not in any pack" filters** — find the loops that are
  sitting unused.
- [ ] **Install to the home screen properly** — a service worker so the app opens
  instantly and survives a bad connection (the manifest and icons are already there).
- [ ] **Keep a Best of Dropbox folder synced** — mirror every Best of loop into
  one shareable folder that adds and removes files automatically.

## Later / ideas

- [ ] **Weeklies** — a future fifth area for curated recurring email-list packs,
  usually 3–5 of the newest samples/starters. Specify its rules before adding a
  tab or schema; see `PRODUCT.md`.
- [ ] **Separate Samples, Starters and Beats libraries** — content kinds must
  not cross-contaminate. Existing rows become Samples. This is direction, not
  part of the current samples-only MVP; see `PRODUCT.md`.
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

- [x] Producer recipients and follow-up packs: reusable name/Instagram/picture
      badges, recipient search, saved Build recipes, immutable send history and
      “More like this” with source-pack exclusions. Live verified with Figurez.
- [x] Mobile shell and finding: a small app mark sits beside real page titles,
      larger tabs stay fixed while horizontal swipes move the page content,
      search stays at the top, Build/Library filter Best of, and selected tags
      use stable unique hues.
- [x] iOS Home Screen viewport: use an opaque, contained system viewport so the
      bottom dock is not lifted by WebKit's standalone safe-area bug.
- [x] Strict Build filtering: every selected tag is required, including several
      Vibe or Genre choices from the same group.
- [x] Home-screen icon v3: white straight globe, full-bleed purple, subtle dark base.
- [x] Mobile logging pass: stop resets playback, loop sheets have a seek bar,
      Best of is a real loop flag, Placed can safely return to Open, exact-name
      duplicates are refused, the sheet pulls down to dismiss, and its footer
      keeps Previous, Next, Save and Close within thumb reach.
- [x] Missing Dropbox files: Library notices stale rows, keeps them out of Build,
      and can remove one entry or the whole missing batch.
- [x] Fast, correct playback: switching loops cancels the old request, and a
      bounded background cache keeps recent / next audio on the device.
- [x] Bulk upload: three files move at once in a background queue, with per-file
      progress, failures collected at the end, and one-tap retry.
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

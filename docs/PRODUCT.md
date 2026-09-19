# Product

This is the durable product brief for SUG Packs. It records the owner's intent,
including ideas that are not built yet. Read it before treating a convenient
technical shortcut as a product decision. `BACKLOG.md` is the ordered working
list; this file explains why those items exist and what must remain true.

## What the app does now

STRAIGHTUPGLOBAL receives sample loops, tags them once, selects a strict set of
tags for a request, swipes through the matches, and creates a Dropbox pack from
the keepers. Packs remain searchable and shareable. The live MVP has proved this
samples-only workflow useful.

The current product has two internal users, Razz and 12. They are app members,
not the people who receive packs. A producer/client such as Figurez is a
**recipient**. Keep those concepts separate in copy, data and permissions.

## Current scope and boundaries

- **Samples are the only active library.** In today's code and database they
  are usually called "loops". Do not rename or migrate them speculatively.
- Every sample has one canonical file in the app's Dropbox `/Library`; packs
  contain copies. Existing Dropbox folders outside the app remain look-only.
- A pack is created for a real request, not as a generic playlist. In practice
  most packs are intended for one specific producer/client.
- Type, Genre, Vibe, Instruments and Artist describe the sound. The recipient
  does not belong in the tag vocabulary.
- Status, Best of and pack favourites are separate concepts. Do not encode a
  recipient, content kind or weekly state as a tag just because tags exist.
- The MVP stays samples-only while the producer follow-up workflow is built.

## Next workflow: recipients and follow-up packs

Implementation status (19 Sep 2026): live. The web, repeat-safe update 6 and
`create_pack_v2` are deployed. A live Figurez pack retained its Hard recipe and
the follow-up view excluded all three sent loops while offering four unused
matches. The open product decisions below remain future refinements.

### The problem

A producer asks for a particular kind of sample pack. Razz builds and sends it.
Sometimes the producer listens and asks for more of the same. Razz then needs
the same Types, Vibes and other filters, but must not resend samples from the
previous pack. Reconstructing the request and remembering every sent file by
hand is slow and error-prone.

### Recipient directory

Add a small reusable directory of pack recipients. A recipient needs:

- a display name, for example **Figurez**;
- an Instagram handle, for example **@figurezmadeit**;
- a profile picture, normally their Instagram profile picture;
- a stable id so renaming the display name or handle does not break history.

The owner must be able to assign a recipient while making a pack, and see that
recipient on the finished pack. Use a compact avatar + name/handle treatment—a
producer badge—not another large card. The recipient should also make packs
findable in search.

Do not scrape Instagram or introduce an Instagram API as an unstated
requirement. The first version can use a manually chosen/uploaded picture unless
the owner explicitly asks for automatic syncing.

### "Make another like this"

From a previously sent pack, expose one clear action to start a follow-up pack.
Final button copy is not decided; "More like this" and "Make another" are
working labels only.

The new flow must:

1. carry forward the original recipient;
2. carry forward the original Build recipe (the selected tags/filters), while
   still letting Razz review or adjust it before swiping;
3. exclude every sample that belonged to the source pack;
4. show only otherwise eligible samples—placed samples stay excluded and all
   normal strict-AND matching rules still apply;
5. open the familiar swipe flow, then the familiar pack-name and clean-name
   options;
6. create a normal independent pack and retain a link to the source pack so the
   follow-up chain can be understood later.

Stopping at an empty result is valid and should explain that no unused matches
remain. It must never silently relax the filters or re-offer already-sent files.

### Data that must be preserved

The current `packs.loop_ids` is the pack's **current** membership. It can change:
placing a sample removes its Dropbox copy and id, and future pack editing will
also change it. Therefore it is not sufficient history for follow-up exclusions.

Before building the follow-up feature, persist both of these separately:

- the exact Build recipe used to start the source pack; and
- an immutable record of every sample originally sent in that pack.

Do not try to infer the recipe later from the surviving samples: their shared
tags are not necessarily the filters Razz selected. Do not use mutable
`loop_ids` as the only exclusion list. A placed, removed or later-deleted sample
must not accidentally be proposed again merely because the pack changed.

Existing packs predate this metadata. The UI must degrade honestly: it can
reuse their current membership as an exclusion when available, but it cannot
claim to know their original filter recipe. Let Razz choose the filters for such
a pack rather than guessing.

### Decisions still needed before polishing

These are intentionally open; ask instead of silently choosing:

- Does a follow-up exclude only the selected source pack, every earlier pack in
  that follow-up chain, or every pack ever sent to the recipient? The stated
  minimum is the selected source pack.
- Can one pack ever have multiple recipients? Current expectation: one.
- Is the recipient photo uploaded manually, selected from the device, or stored
  from a pasted image URL? Automatic Instagram syncing is not assumed.
- Where can recipients be created and edited: inline during pack creation, a
  small management sheet, or both?
- Which exact filters form the reusable recipe beyond tags when BPM/key filters
  are added later?

### Recommended implementation slices

Keep the app usable between slices. Do not make Weeklies or the three-library
expansion a prerequisite for this work.

1. **Recipient foundation.** Add the idempotent database migration and matching
   demo-store model for recipients. Define member-only RLS. Support display
   name, normalized Instagram handle and a small picture using the same bounded
   storage approach as profile avatars unless a better source is chosen.
2. **Historical pack metadata.** Add optional recipient, source-pack and Build
   recipe fields plus immutable original sent membership. Old packs and an old
   deployed database/function must still render. Decide how history survives a
   library loop deletion; a foreign key that erases the exclusion record is not
   sufficient.
3. **Creation path.** Extend the existing `createPack` data-layer contract and
   `create_pack` Edge Function action so the pack row and its historical
   metadata are written together. Mirror the behavior in `store.js`; do not
   create a live-only workflow.
4. **Recipient UI.** Add/select/edit the recipient within the normal pack flow,
   then show the compact badge in the pack sheet/list where it helps. Extend
   pack search to display name and Instagram handle. Check long handles and a
   missing picture at 375×812.
5. **Follow-up entry.** Add one action on an existing pack. For metadata-aware
   packs, restore its recipe and recipient, apply exclusions, let the owner
   review filters, then use the existing swipe session and create screen. Make
   session persistence distinguish a normal Build from a follow-up Build.
6. **Legacy and edge cases.** Verify old packs, renamed/deleted recipients,
   deleted or placed samples, zero remaining matches, refreshing mid-swipe and
   reopening a saved session. Never infer an exact recipe where none was saved.
7. **Deploy in order.** Ship backward-compatible web code, then have the owner
   run the SQL and deploy any changed Edge Function as described in
   `OPERATIONS.md`. Verify live creation, search and exclusion with disposable
   test data, then clean that data up.

Likely code touch points are `js/data.js`, both `js/live.js` and `js/store.js`,
the Build and Packs paths in `js/app.js`, swipe-session setup in `js/swipe.js`,
the schema update and the Dropbox Edge Function's `create_pack` action. This is
a map, not permission to couple all behavior into one large change.

## Future direction: three isolated content libraries

The owner plans to expand from samples to **samples, starters and beats**.

- **Samples** are the completed loop/sample material handled by the current MVP.
- **Starters** are main melody ideas, not fully produced samples.
- **Beats** are a third content kind; its detailed workflow is not specified yet.

These are separate libraries. Their browsing, filters, packs, histories and
default views must not cross-contaminate. A future schema should give content
kind its own explicit field or parent entity; it is not a Type tag. Existing
rows must migrate/default to `sample` so today's live library remains intact.

Do not implement this expansion as part of the recipient/follow-up MVP. Do avoid
new assumptions that make it impossible—for example, globally unique display
names across all future libraries or recipient history that cannot be scoped to
a content kind.

One question remains deliberately unresolved: Weeklies may draw from samples
and starters, but "separate libraries" implies their source browsing must remain
explicit. Do not decide whether one Weekly can intentionally mix both kinds
until the owner defines that workflow.

## Future direction: Weeklies

"Weeklies" is a planned fifth navigation area for recurring packs sent to a
large email list. It is not the next MVP feature and its detailed rules are not
settled.

Confirmed so far:

- Weeklies are curated, not automatically sent.
- The starting pool is generally the newest material.
- A normal Weekly contains about 3–5 samples/starters.
- It has its own workflow and rules rather than pretending to be an ordinary
  one-recipient pack.

Do not add the tab or database model yet merely because the name is known. When
this work starts, specify cadence/date identity, eligibility, samples versus
starters, duplicate history, editing, Dropbox layout, email-list integration
and what "sent" means before implementation.

## Product guardrails

- Preserve the fast one-handed flow. New metadata should appear at the moment
  it is useful, not as permanent clutter on every screen.
- A recipient avatar is useful recognition; a second paragraph of recipient
  metadata on every row is not.
- Follow-up packs use the existing Build/swipe/create mechanics. Do not create
  a parallel pack builder.
- Historical truth matters: current Dropbox contents and current pack
  membership are not necessarily what was originally sent.
- Future plans are context, not permission to build them all at once.

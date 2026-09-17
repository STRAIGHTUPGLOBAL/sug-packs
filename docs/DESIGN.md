# Design

The first version of this app was rejected for being cluttered. The rule since:
**pristine, clean, minimal, clear hierarchy.** If a screen works without an
element, the element goes.

## The frame

- One column, 640px maximum, 20px side gutters, phone first.
- One page title with a small app mark beside it, and one main action per screen.
  The mark is branding, never the main element.
- Geist, one typeface. No uppercase mono labels, no counts on chips, no
  decorative rules or dividers beyond the hairlines inside lists.
- Near-black ground (`--bg`), one soft blue light at the top of the page, and
  nothing else decorating.
- Glass = translucent white surfaces with hairline borders. Grouped lists are
  built like iOS Settings: a rounded container, rows inside, inset separators.

## Reach: the dock

The app is used one-handed, walking around. Everything you reach for often sits
at the **bottom**: one fixed-height glass navigation, centred and big enough for
a thumb. Its tiny labels reinforce the current page. Search, upload, filters and
sort stay in normal page flow directly beneath the heading. They never move when
the keyboard opens and never share a containing layer with the dock.

Four tabs: Build, Library, Packs, You. "You" is your own profile — picture,
name, counts, favourites, your packs, the other people, and the account rows.

The dock is one fixed element outside the page (`[data-dock]`), updated via
`setDock(active)`. Its height is measured into `--dock-h` so the page and
floating bar keep clear of it. Horizontal swipes move between adjacent tabs.
The swipe deck and the pack page hide the dock: they are full-screen tasks with
their own single action.

## Colour means something

| Colour | Meaning |
|---|---|
| Logo blue `#4954E6` | chosen, selected, the main action, favourited |
| Amber | needs tags |
| Green | copied, done |
| Rose | destructive (sign out, delete, reset) |
| Gold | a Best of loop |
| Stable hue from the tag id | that exact selected tag, regardless of category |
| White at three strengths | `--text`, `--text-2`, `--text-3` |

Cover art is the only other colour. `cover.js` turns a name into three OKLCH
lights over a deep base, so every loop and pack has its own identity, the same
on every screen and device. Olive and mustard hues are skipped; they look muddy.
Selected pills use a translucent fill and a stronger border rather than a flat
solid block.

## Copy

Plain and short: "Swipe", "Take all", "New pack", "6 need tags", "Most sent".
No greetings, no slogans, no explanatory sentences under headings. Error
messages say what happened in the owner's words, not the system's.

## Spacing rhythm (Packs is the reference)

12px between two parts of the same control cluster (search → filters), 20px to
the next block, 28px before a section label, 10px from a label to its list.
Measure before changing: a 0px gap under the filter row was spotted immediately.

## Motion

Intentional and responsive, never decorative:

- **Splash:** logotype eases in, a small blue wheel turns, both ease out once
  the data, fonts and logo are ready (minimum ~1.4s).
- **Screens:** the old content lifts away (~180ms), the new page rises in block
  by block (`.enter`). Between tabs the nav stays put while its highlight slides.
  A horizontal swipe moves one adjacent tab in that direction.
- **Lists** stagger on first paint only (`.stagger`). Repaints never replay an
  entrance; Build chips update in place with a small spring pop.
- **Swipe:** the next card rises as the top one flies off, and its loop starts
  playing immediately, not after the animation.
- **Creating a pack** turns into Done in place: the cover stays, a check badge
  pops onto it, the buttons rise.
- Easing: `--ease-out` for entrances, `--ease-in-out` for exits, `--spring` for taps.

## Components worth knowing

- `.thumb` — cover art square, three sizes, doubles as the play button.
- `.avatar` — round, image or initials ("12" stays whole, longer names use one letter).
- `.chip` — tag or filter; `is-on` is translucent with an opaque border,
  per-tag hues are deterministic, and `is-off` fades to 28%.
- `.row` inside `.list` — the grouped list row; `.row--media` for a thumb on the left.
- `.bar` — the floating glass bar (a count plus two actions, Build only).
- `.cta` — a single main action over a fade, never inside a container.
- `.sheet` — bottom sheet on phones, centred panel from 720px up. At the top of
  its scroll, pulling down dismisses it; loop-sheet actions stay thumb-reachable.

## The logotype and the icon

- The logotype (`assets/sug-packs-logotype.png`) appears on the splash. A 30px
  app mark sits beside the title on each of the four main pages.
- iOS uses `assets/icon-180-v2.png`; installed-app manifests also carry the
  512px version. Both use the straight globe on full-bleed purple with a subtle
  dark gradient toward the bottom.
- Owner's source files stay in `assets/` untouched; the web copies are generated
  from them (crop to the visible area, resize, and for the home screen centre it
  on the app's near-black).

# Design

The first version of this app was rejected for being cluttered. The rule since:
**pristine, clean, minimal, clear hierarchy.** If a screen works without an
element, the element goes.

## The frame

- One column, 640px maximum, 20px side gutters, phone first.
- One persistent SUG Packs logo bar and one main action per screen. The bottom
  tabs identify the main pages, so those page names are not repeated as titles.
- Geist, one typeface. No uppercase mono labels, no counts on chips, no
  decorative rules or dividers beyond the hairlines inside lists.
- Near-black ground (`--bg`), one soft blue light at the top of the page, and
  nothing else decorating.
- Glass = translucent white surfaces with hairline borders. Grouped lists are
  built like iOS Settings: a rounded container, rows inside, inset separators.

## Reach: the dock

The app is used one-handed, walking around. Everything you reach for often sits
at the **bottom**: one fixed-height glass navigation, centred and big enough for
a thumb. Its tiny labels identify the current page without a repeated heading.
Search, upload, filters and sort sit in their own fixed tray just above the nav,
never inside it. Focusing search lifts that tray under the logo and reveals its
filters, then it returns to thumb reach when search is done.

Four tabs: Build, Library, Packs, You. "You" is your own profile — picture,
name, counts, favourites, your packs, the other people, and the account rows.

The dock is one fixed element outside the page (`[data-dock]`), updated via
`setDock(active)`. Its height is measured into `--dock-h` so the page, control
tray and floating bar keep clear of it. Page tools never change its footprint.
The swipe deck and the pack page hide it: they are full-screen tasks with their
own single action.

## Colour means something

| Colour | Meaning |
|---|---|
| Logo blue `#4954E6` | chosen, selected, the main action, favourited |
| Amber | needs tags |
| Green | copied, done |
| Rose | destructive (sign out, delete, reset) |
| Gold | a Best of loop |
| Blue / cyan / magenta / green / orange | selected Type / Genre / Vibe / Instrument / Artist tags |
| White at three strengths | `--text`, `--text-2`, `--text-3` |

Cover art is the only other colour. `cover.js` turns a name into three OKLCH
lights over a deep base, so every loop and pack has its own identity, the same
on every screen and device. Olive and mustard hues are skipped; they look muddy.

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
  by block (`.enter`). Between tabs the logo and nav stay put while the nav
  highlight slides.
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
- `.chip` — tag or filter; `is-on` is blue, `is-off` fades to 28%.
- `.row` inside `.list` — the grouped list row; `.row--media` for a thumb on the left.
- `.bar` — the floating glass bar (a count plus two actions, Build only).
- `.cta` — a single main action over a fade, never inside a container.
- `.sheet` — bottom sheet on phones, centred panel from 720px up.

## The logotype and the icon

- The logotype (`assets/sug-packs-logotype.png`) appears on the splash and in a
  compact sticky bar shared by all four main pages.
- The app mark (`assets/app-mark.png`) remains for app icons and places where a
  square mark is actually needed.
- Owner's source files stay in `assets/` untouched; the web copies are generated
  from them (crop to the visible area, resize, and for the home screen centre it
  on the app's near-black).

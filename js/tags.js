// The tag vocabulary. Clean data lives or dies here: every tag belongs to one
// group, and a new tag that looks like an existing one ("R&B" vs "RnB") is
// caught before it is created.

// Type comes first: melodic or hard is the one call that never fails, and it
// is always the first thing chosen. Everything else is built up while tagging.
export const GROUPS = [
  { id: "type", label: "Type", fixed: true }, // melodic or hard, nothing else, ever
  { id: "genre", label: "Genre" },
  { id: "vibe", label: "Vibe" },
  { id: "instrument", label: "Instruments" },
  { id: "artist", label: "Artist (optional)" },
];

// The only tags that ship with the app. The rest of the vocabulary is the
// owners' own, added while they tag.
export const STARTER_TAGS = {
  type: ["Melodic", "Hard"],
  genre: [],
  vibe: [],
  instrument: [],
  artist: [],
};

export const slug = (label) => label.toLowerCase().replace(/&/g, "n").replace(/[^a-z0-9]+/g, "");

// Every tag gets one stable hue from its id. This keeps the vocabulary
// recognizable as it grows without assigning one blanket colour to a group.
export function tagStyle(id) {
  let hash = 2166136261;
  for (const char of String(id)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `--tag-h:${(hash >>> 0) % 360}`;
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j];
      row[j] = next;
    }
  }
  return row[b.length];
}

// An existing tag the new label is probably meant to be, in any group.
export function lookalike(label, tags) {
  const s = slug(label);
  if (!s) return null;
  return tags.find((t) => slug(t.label) === s)
    || tags.find((t) => s.length > 3 && distance(slug(t.label), s) <= 1)
    || null;
}

// Every selected tag narrows the result: Aggressive + Dark + Anthem means a
// loop must carry all three, even when they belong to the same group.
export function matches(loop, selectedIds, tagsById) {
  return [...selectedIds]
    .filter((id) => tagsById.has(id))
    .every((id) => loop.tags.includes(id));
}

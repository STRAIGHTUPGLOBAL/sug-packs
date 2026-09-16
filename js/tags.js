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

// Tags in the same group widen the search (RnB or UK); different groups
// narrow it (and Guitar).
export function matches(loop, selectedIds, tagsById) {
  const byGroup = new Map();
  for (const id of selectedIds) {
    const tag = tagsById.get(id);
    if (!tag) continue;
    if (!byGroup.has(tag.group)) byGroup.set(tag.group, []);
    byGroup.get(tag.group).push(id);
  }
  for (const ids of byGroup.values()) {
    if (!ids.some((id) => loop.tags.includes(id))) return false;
  }
  return true;
}

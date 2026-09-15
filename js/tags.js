// The tag vocabulary. Clean data lives or dies here: every tag belongs to one
// group, and a new tag that looks like an existing one ("R&B" vs "RnB") is
// caught before it is created.

export const GROUPS = [
  { id: "genre", label: "Genre" },
  { id: "vibe", label: "Vibe" },
  { id: "instrument", label: "Instruments" },
  { id: "artist", label: "Sounds like" },
];

export const STARTER_TAGS = {
  genre: ["Trap", "Melodic Trap", "Drill", "UK", "RnB", "Pluggnb", "Rage", "New Wave", "Boom Bap", "Soul", "Afrobeat", "Dancehall", "Latin", "French", "Detroit", "Pop"],
  vibe: ["Dark", "Pain", "Emotional", "Hard", "Smooth", "Chill", "Uplifting", "Sexy", "Vintage", "Epic", "Weird"],
  instrument: ["Guitar", "Acoustic Guitar", "Piano", "Keys", "Synth", "Pad", "Arp", "Strings", "Vocals", "Flute", "Bells", "Brass"],
  artist: ["Gunna", "Lil Baby", "Lil Durk", "Rod Wave", "NoCap", "Polo G", "Drake", "SZA", "Travis Scott", "Don Toliver", "Kanye West", "Nemzzz", "NLE Choppa", "Burna Boy", "Lil Tecca", "RAF Camora"],
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

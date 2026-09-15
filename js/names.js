// File names: read title, BPM, key and handles out of names like
// "Podrader 95 @fadebeatz @straightupglobal.mp3", and build the cleaned name
// a pack gets. The originals are never renamed; only pack copies are.

const SUG = "straightupglobal";

// Small edit distance, so typos like @straightugplobal still count as ours.
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

export const isSugHandle = (handle) => distance(handle.toLowerCase().replace(/^@/, ""), SUG) <= 2;

const KEY = /^[A-G](#|b)?(m|min|maj|minor|major)?$/;

export function baseName(file) {
  // "Blast 143 @straightupglobal.wav.mp3" has two extensions; drop both.
  return file.replace(/(\.(mp3|wav|aiff?|flac))+$/i, "");
}

export function extension(file) {
  return (/\.(mp3|wav|aiff?|flac)$/i.exec(file)?.[0] || ".mp3").toLowerCase();
}

// Split a name into words, each marked as a SUG handle, a collab handle,
// or plain text. "x fade" after a handle is a collab too.
export function tokens(file) {
  const words = baseName(file).split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.startsWith("@")) {
      out.push({ text: word, kind: isSugHandle(word) ? "sug" : "collab" });
    } else if (word.toLowerCase() === "x" && i > 0 && out[out.length - 1]?.kind !== "text" && words[i + 1]) {
      out.push({ text: `x ${words[i + 1]}`, kind: "collab" });
      i++;
    } else {
      out.push({ text: word, kind: "text" });
    }
  }
  return out;
}

export function parseName(file) {
  const parts = tokens(file);
  const text = parts.filter((p) => p.kind === "text").map((p) => p.text);
  let bpm = null;
  let key = null;
  const title = [];
  for (const word of text) {
    if (bpm === null && /^\d{2,3}$/.test(word) && +word >= 50 && +word <= 220 && title.length) bpm = +word;
    else if (bpm !== null && key === null && KEY.test(word)) key = word;
    else if (bpm === null) title.push(word);
  }
  // "140 Wikings": number first, so it is the tempo and the rest is the title.
  if (bpm === null && /^\d{2,3}$/.test(text[0] || "")) {
    bpm = +text[0];
    title.splice(0, title.length, ...text.slice(1));
  }
  const collabs = parts.filter((p) => p.kind === "collab").map((p) => p.text.replace(/^x /, "@"));
  return { title: title.join(" ") || baseName(file), bpm, key, collabs };
}

// The name a loop gets inside a pack.
export function packName(file, { removeSug = false, removeCollabs = false } = {}) {
  const kept = tokens(file).filter((p) => !(removeSug && p.kind === "sug") && !(removeCollabs && p.kind === "collab"));
  return kept.map((p) => p.text).join(" ").trim() + extension(file);
}

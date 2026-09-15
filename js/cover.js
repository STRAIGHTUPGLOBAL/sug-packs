// Cover art: every loop (and pack) gets its own gradient, worked out from its
// name, so the same loop always looks the same on every screen and device.

// FNV-1a: a small, stable string hash.
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mulberry32: repeatable random numbers from that hash.
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const between = (r, min, max) => min + r() * (max - min);

// Hues that look good as light: violets, magentas, pinks, corals, oranges,
// teals, cyans, blues. Olive and mustard (roughly 70–135) come out muddy, so
// anything landing there is pushed on into teal.
const ANCHORS = [262, 284, 305, 328, 350, 12, 34, 150, 172, 192, 214, 236];
function hue(h) {
  const n = ((h % 360) + 360) % 360;
  return n > 70 && n < 135 ? n + 70 : n;
}

// OKLCH keeps every colour equally bright, so no cover is dull next to another.
const colour = (l, c, h) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${Math.round(hue(h))})`;

export function cover(seed) {
  const r = random(hash(String(seed).toLowerCase()));
  const base = pick(r, ANCHORS) + between(r, -10, 10);
  const second = base + pick(r, [36, 60, -44, 150, 180]);
  const third = second + pick(r, [40, -40, 100]);

  const a = colour(between(r, 0.74, 0.82), between(r, 0.16, 0.22), base);
  const b = colour(between(r, 0.64, 0.74), between(r, 0.17, 0.23), second);
  const c = colour(between(r, 0.56, 0.66), between(r, 0.15, 0.21), third);
  const deep = colour(between(r, 0.3, 0.36), between(r, 0.09, 0.13), second + 10);
  const deeper = colour(0.2, 0.07, base);

  const ax = Math.round(between(r, 0, 45)), ay = Math.round(between(r, 0, 40));
  const bx = Math.round(between(r, 55, 100)), by = Math.round(between(r, 30, 90));
  const cx = Math.round(between(r, 15, 85)), cy = Math.round(between(r, 65, 110));
  const angle = Math.round(between(r, 0, 360));

  return [
    `radial-gradient(110% 90% at ${ax}% ${ay}%, ${a} 0%, transparent 65%)`,
    `radial-gradient(100% 100% at ${bx}% ${by}%, ${b} 0%, transparent 62%)`,
    `radial-gradient(80% 70% at ${cx}% ${cy}%, ${c} 0%, transparent 60%)`,
    `linear-gradient(${angle}deg, ${deep}, ${deeper})`,
  ].join(", ");
}

// For markup: style="--cover: …" (no quotes inside, safe in an attribute).
export const coverStyle = (seed) => `--cover: ${cover(seed)}`;

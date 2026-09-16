// A small persistent cache for loops that are likely to play next. It is
// deliberately bounded: samples can be large, and the app is often used on a
// phone. Cache Storage keeps the bytes across tabs; object URLs make playback
// use those local bytes instead of a four-hour Dropbox link.

const CACHE_NAME = "sugpacks-audio-v1";
const META_KEY = "sugpacks-audio-cache-v1";
const MAX_FILES = 12;
const MAX_TOTAL = 192 * 1024 * 1024;
const MAX_FILE = 32 * 1024 * 1024;
const objectUrls = new Map();

const supported = () => "caches" in globalThis;
const requestFor = (id) => new Request(`${location.origin}/.sugpacks-audio/${encodeURIComponent(id)}`);

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) ?? {}; } catch { return {}; }
}

function writeMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* private mode */ }
}

function touch(id, size) {
  const meta = readMeta();
  meta[id] = { at: Date.now(), size: Number(size ?? meta[id]?.size) || 0 };
  writeMeta(meta);
  return meta;
}

async function trim(cache, meta, keepId) {
  const entries = Object.entries(meta).sort(([, a], [, b]) => a.at - b.at);
  let bytes = entries.reduce((sum, [, item]) => sum + (item.size || 0), 0);
  let count = entries.length;
  for (const [id, item] of entries) {
    if (count <= MAX_FILES && bytes <= MAX_TOTAL) break;
    if (id === keepId && count > 1) continue;
    await cache.delete(requestFor(id));
    const url = objectUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(id);
    delete meta[id];
    count--;
    bytes -= item.size || 0;
  }
  writeMeta(meta);
}

export async function hasAudio(id) {
  if (objectUrls.has(id)) return true;
  if (!supported()) return false;
  return Boolean(await (await caches.open(CACHE_NAME)).match(requestFor(id)));
}

export async function audioObjectUrl(id) {
  if (objectUrls.has(id)) return objectUrls.get(id);
  if (!supported()) return "";
  const response = await (await caches.open(CACHE_NAME)).match(requestFor(id));
  if (!response) return "";
  const blob = await response.blob();
  if (!blob.size) return "";
  const url = URL.createObjectURL(blob);
  objectUrls.set(id, url);
  touch(id, blob.size);
  return url;
}

export async function storeAudio(id, source) {
  if (!supported()) return false;
  const blob = source instanceof Blob ? source : await source.blob();
  if (!blob.size || blob.size > MAX_FILE) return false;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(requestFor(id), new Response(blob, {
    headers: { "Content-Type": blob.type || "application/octet-stream" },
  }));
  const meta = touch(id, blob.size);
  await trim(cache, meta, id);
  return true;
}

export async function removeAudio(id) {
  const url = objectUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(id);
  if (supported()) await (await caches.open(CACHE_NAME)).delete(requestFor(id));
  const meta = readMeta();
  delete meta[id];
  writeMeta(meta);
}

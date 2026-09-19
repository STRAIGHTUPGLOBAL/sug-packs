// Data layer. Demo mode keeps everything in this browser (localStorage, plus
// IndexedDB for uploaded audio). The live version will swap this file for one
// that talks to Supabase and Dropbox, with the same functions.

import { parseName } from "./names.js";
import { GROUPS, STARTER_TAGS, slug } from "./tags.js";

const KEY = "sugpacks-demo-v1";
const USERS = ["Razz", "Twelve"];
const DAY = 86400000;

let state = null;
const uploadUrls = new Map();

const uid = () => Math.random().toString(36).slice(2, 10);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };

// The demo loops live in local/, which is never published. Without them
// (the live site) the library simply starts empty.
async function demoData() {
  try {
    return await import("../local/demo-data.js");
  } catch {
    return { DEMO_AUDIO: "", DEMO_LOOPS: [], DEMO_PACKS: [] };
  }
}

async function seed() {
  const { DEMO_AUDIO, DEMO_LOOPS, DEMO_PACKS } = await demoData();
  let peaks = {};
  if (DEMO_LOOPS.length) {
    try { peaks = await (await fetch(`${DEMO_AUDIO}peaks.json`)).json(); } catch { /* no durations */ }
  }
  const tags = [];
  for (const group of GROUPS) {
    for (const label of STARTER_TAGS[group.id]) tags.push({ id: `${group.id}:${slug(label)}`, group: group.id, label });
  }
  const now = Date.now();
  const loops = DEMO_LOOPS.map((demo, i) => ({
    id: uid(),
    file: demo.file,
    ...parseName(demo.file),
    tags: demo.tags,
    bestOf: false,
    status: "open",
    duration: peaks[demo.file]?.duration || 0,
    peaks: peaks[demo.file]?.peaks || [],
    src: DEMO_AUDIO + encodeURIComponent(demo.file),
    by: i % 3 ? "Razz" : "Twelve",
    addedBy: i % 3 ? "Razz" : "Twelve",
    addedAt: now - (i + 1) * DAY / 3,
  }));
  const byFile = new Map(loops.map((l) => [l.file, l.id]));
  const packs = DEMO_PACKS.map((p) => ({
    id: uid(),
    by: p.createdBy,
    name: p.name,
    loopIds: p.files.map((f) => byFile.get(f)),
    removeSug: p.removeSug,
    removeCollabs: p.removeCollabs,
    link: `https://www.dropbox.com/scl/fo/demo${uid()}/${encodeURIComponent(p.name)}`,
    createdBy: p.createdBy,
    createdAt: now - p.daysAgo * DAY,
  }));
  return { user: "Razz", tags, loops, packs, recipients: [], favorites: [], avatars: {} };
}

export async function init() {
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; }
  if (!state?.loops) {
    state = await seed();
    save();
  }
  state.recipients ??= [];
  state.quarantine ??= [];
  for (const pack of state.packs) {
    pack.sentLoopIds ??= [...pack.loopIds];
    pack.recipientId ??= null;
    pack.sourcePackId ??= null;
    pack.buildRecipe ??= null;
  }
  save();
}

export async function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  const db = await idb().catch(() => null);
  db?.transaction("audio", "readwrite").objectStore("audio").clear();
  state = await seed();
  save();
}

/* People ------------------------------------------------------------------ */

export const users = () => USERS;
export const currentUser = () => state.user;
export function setUser(name) { state.user = name; save(); }

/* Tags -------------------------------------------------------------------- */

export const listTags = () => state.tags;
export const tagsById = () => new Map(state.tags.map((t) => [t.id, t]));

export function addTag(group, label) {
  const clean = label.trim().replace(/\s+/g, " ");
  const tag = { id: `${group}:${slug(clean)}`, group, label: clean };
  state.tags.push(tag);
  save();
  return tag;
}

export const tagUseCount = (id) => state.loops.filter((l) => l.tags.includes(id)).length;

/* Loops ------------------------------------------------------------------- */

export const listLoops = () => [...state.loops].sort((a, b) => b.addedAt - a.addedAt);
export const getLoop = (id) => state.loops.find((l) => l.id === id);
export const untagged = () => listLoops().filter((l) => !l.tags.length);
export async function checkLibraryFiles() { return false; }
export async function removeMissingLoops(ids) {
  const remove = new Set(ids.filter((id) => getLoop(id)?.missing));
  state.loops = state.loops.filter((loop) => !remove.has(loop.id));
  save();
  return remove.size;
}

export function updateLoop(id, changes) {
  Object.assign(getLoop(id), changes);
  save();
}

export async function setBestOf(id, bestOf) {
  const loop = getLoop(id);
  if (!loop) return false;
  loop.bestOf = Boolean(bestOf);
  save();
  return loop.bestOf;
}

export async function audioUrl(loop) {
  if (!loop.uploaded) return loop.src;
  if (uploadUrls.has(loop.id)) return uploadUrls.get(loop.id);
  const blob = await idbGet(loop.id).catch(() => null);
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  uploadUrls.set(loop.id, url);
  return url;
}

// Demo uploads already live in IndexedDB and bundled samples are local files.
export async function cacheAudio() { /* already local */ }

// Uploads: read tempo from the name, draw a waveform in the browser. Demo mode
// mirrors the live queue contract even though all of its work stays local.
export async function addFiles(files, onProgress = () => {}) {
  const added = [];
  added.skipped = [];
  added.failed = [];
  const emit = (update) => { try { onProgress(update); } catch { /* UI moved on */ } };
  const known = new Set(state.loops.map((loop) => loop.file.toLowerCase()));
  const pending = [];

  files.forEach((file, index) => {
    const key = file.name.toLowerCase();
    if (known.has(key)) {
      added.skipped.push(file.name);
      emit({ file, index, status: "skipped", progress: 1 });
      return;
    }
    known.add(key);
    pending.push({ file, index });
    emit({ file, index, status: "waiting", progress: 0 });
  });

  let next = 0;
  async function worker() {
    while (next < pending.length) {
      const { file, index } = pending[next++];
      try {
        emit({ file, index, status: "uploading", progress: 0.08 });
        const id = uid();
        const { duration, peaks } = await analyse(file).catch(() => ({ duration: 0, peaks: [] }));
        emit({ file, index, status: "saving", progress: 0.9 });
        await idbPut(id, file);
        uploadUrls.set(id, URL.createObjectURL(file));
        const loop = { id, by: state.user, file: file.name, ...parseName(file.name), tags: [], bestOf: false, duration, peaks, uploaded: true, addedBy: state.user, addedAt: Date.now() };
        state.loops.push(loop);
        added.push(loop);
        save();
        emit({ file, index, status: "done", progress: 1, loop });
      } catch (error) {
        const failure = { file, error: error instanceof Error ? error : new Error(String(error)) };
        added.failed.push(failure);
        emit({ file, index, status: "failed", progress: 0, error: failure.error });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  return added;
}

async function analyse(file, count = 160) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  context.close();
  const data = buffer.getChannelData(0);
  const step = Math.floor(data.length / count);
  const peaks = [];
  for (let i = 0; i < count; i++) {
    let max = 0;
    for (let j = i * step; j < (i + 1) * step; j += 16) max = Math.max(max, Math.abs(data[j]));
    peaks.push(max);
  }
  const top = Math.max(...peaks) || 1;
  return { duration: buffer.duration, peaks: peaks.map((p) => +(p / top).toFixed(2)) };
}

export async function setLoopStatus(loopId, status, note = null) {
  const loop = getLoop(loopId);
  if (!loop) return 0;
  const previous = loop.status;
  loop.status = status;
  loop.statusNote = note ?? "";
  loop.statusAt = status === "open" ? 0 : Date.now();
  let pulledFrom = 0;
  if (status === "placed" && previous !== "placed") {
    loop.placedPackIds = [];
    for (const pack of state.packs) {
      if (!pack.loopIds.includes(loopId)) continue;
      loop.placedPackIds.push(pack.id);
      pack.loopIds = pack.loopIds.filter((id) => id !== loopId);
      pulledFrom++;
    }
  } else if (status === "open" && previous === "placed") {
    for (const packId of loop.placedPackIds ?? []) {
      const pack = state.packs.find((item) => item.id === packId);
      if (!pack || pack.loopIds.includes(loopId)) continue;
      pack.loopIds.push(loopId);
      pulledFrom++;
    }
    loop.placedPackIds = [];
  }
  save();
  return status === "open" && previous === "placed"
    ? { pulledFrom: 0, restoredTo: pulledFrom }
    : { pulledFrom, restoredTo: 0 };
}

export async function deleteLoop(loopId) {
  state.loops = state.loops.filter((l) => l.id !== loopId);
  save();
}

/* Quarantine (demo) ---------------------------------------------------------- */

export async function loadQuarantine() { return true; }
export const quarantineAvailable = () => true;
export const quarantineList = () => state.quarantine;
export const getQuarantineItem = (id) => state.quarantine.find((item) => item.id === id);

export function quarantineKnown(name) {
  const key = name.toLowerCase();
  if (state.loops.some((loop) => loop.file.toLowerCase() === key)) return "library";
  const item = state.quarantine.find((entry) => entry.file.toLowerCase() === key);
  if (!item) return "";
  return item.state === "kept" ? "library" : item.state === "rejected" ? "rejected" : "quarantine";
}

export async function addQuarantineFiles(files, month, onProgress = () => {}) {
  const added = [];
  added.skipped = [];
  added.failed = [];
  const emit = (update) => { try { onProgress(update); } catch { /* UI moved on */ } };
  const seen = new Set();
  const pending = [];
  files.forEach((file, index) => {
    const key = file.name.toLowerCase();
    const reason = quarantineKnown(file.name) || (seen.has(key) ? "quarantine" : "");
    if (reason) {
      added.skipped.push(file.name);
      emit({ file, index, status: "skipped", reason, progress: 1 });
      return;
    }
    seen.add(key);
    pending.push({ file, index });
    emit({ file, index, status: "waiting", progress: 0 });
  });
  for (const { file, index } of pending) {
    try {
      emit({ file, index, status: "uploading", progress: 0.4 });
      const id = uid();
      const { duration } = await analyse(file).catch(() => ({ duration: 0 }));
      await idbPut(id, file);
      uploadUrls.set(id, URL.createObjectURL(file));
      const item = {
        id, quarantine: true, uploaded: true, file: file.name, ...parseName(file.name), tags: [], duration,
        madeOn: month, state: "open", loopId: "", addedBy: state.user, addedAt: Date.now(), decidedBy: "", decidedAt: 0,
      };
      state.quarantine.push(item);
      save();
      added.push(item);
      emit({ file, index, status: "done", progress: 1, loop: item });
    } catch (error) {
      const failure = { file, error: error instanceof Error ? error : new Error(String(error)) };
      added.failed.push(failure);
      emit({ file, index, status: "failed", progress: 0, error: failure.error });
    }
  }
  return added;
}

export function quarantineDecide(id, decision, { bestOf = false } = {}) {
  const item = getQuarantineItem(id);
  if (!item) return;
  item.state = decision;
  item.decidedBy = state.user;
  item.decidedAt = Date.now();
  if (decision === "kept") {
    // Same id, so the audio already on this device keeps playing.
    const loop = { id: item.id, by: state.user, file: item.file, title: item.title, bpm: item.bpm, key: item.key, collabs: item.collabs, tags: [], bestOf, status: "open", duration: item.duration, uploaded: true, madeOn: item.madeOn, addedBy: item.addedBy, addedAt: Date.now() };
    if (!state.loops.some((entry) => entry.id === id)) state.loops.push(loop);
    item.loopId = id;
  }
  save();
}

export async function quarantineReopen(id) {
  const item = getQuarantineItem(id);
  if (!item) return;
  if (item.state === "kept") {
    const loop = getLoop(item.loopId);
    if (loop?.tags.length) throw new Error("That loop already has tags, so it stays in the library.");
    state.loops = state.loops.filter((entry) => entry.id !== item.loopId);
    item.loopId = "";
  }
  item.state = "open";
  item.decidedBy = "";
  item.decidedAt = 0;
  save();
}

export async function quarantinePurgeRejected(onProgress = () => {}) {
  const gone = state.quarantine.filter((item) => item.state === "rejected");
  state.quarantine = state.quarantine.filter((item) => item.state !== "rejected");
  save();
  onProgress(gone.length, 0);
  return gone.length;
}

export async function dropboxSpace() { return { used: 21_000_000_000, total: 2_000_000_000_000 }; }

/* Packs ------------------------------------------------------------------- */

export const listPacks = () => [...state.packs].sort((a, b) => b.createdAt - a.createdAt);

export async function createPack({ name, loopIds, removeSug, removeCollabs, recipientId = null, sourcePackId = null, buildRecipe = null }, onProgress = () => {}) {
  // Live: Dropbox copies each loop server-side under its cleaned name, then
  // makes a shared link to the folder. Here we only pretend, at a believable pace.
  for (let i = 1; i <= loopIds.length; i++) {
    await new Promise((r) => setTimeout(r, Math.max(60, 900 / loopIds.length)));
    onProgress(i, loopIds.length);
  }
  const pack = {
    id: uid(),
    by: state.user,
    name,
    loopIds,
    sentLoopIds: [...loopIds],
    removeSug,
    removeCollabs,
    recipientId,
    sourcePackId,
    buildRecipe,
    link: `https://www.dropbox.com/scl/fo/demo${uid()}/${encodeURIComponent(name)}`,
    createdBy: state.user,
    createdAt: Date.now(),
  };
  state.packs.push(pack);
  save();
  return pack;
}

export const listRecipients = () => [...(state.recipients ?? [])]
  .filter((recipient) => !recipient.archived)
  .sort((a, b) => a.name.localeCompare(b.name));

export async function saveRecipient({ id = null, name, instagram = "", avatar = "" }) {
  const cleanName = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const cleanInstagram = String(instagram ?? "").trim().replace(/^@+/, "").slice(0, 30);
  if (!cleanName) throw new Error("Add the producer's name.");
  let recipient = id ? state.recipients.find((item) => item.id === id) : null;
  if (recipient) Object.assign(recipient, { name: cleanName, instagram: cleanInstagram, avatar: avatar ?? "" });
  else {
    recipient = { id: uid(), name: cleanName, instagram: cleanInstagram, avatar: avatar ?? "", archived: false };
    state.recipients.push(recipient);
  }
  save();
  return recipient;
}

export async function deletePack(id) {
  state.packs = state.packs.filter((p) => p.id !== id);
  state.favorites = (state.favorites ?? []).filter((f) => f !== id);
  save();
}

export async function renamePack(id, name) {
  const pack = state.packs.find((p) => p.id === id);
  if (pack) pack.name = name;
  save();
  return pack;
}

/* People, favourites and usage (demo) ------------------------------------------ */

export const myId = () => state.user;
export const profileOf = (id) => ({ id, name: id, avatar: state.avatars?.[id] ?? "" });
export const people = () => USERS.map((name) => ({
  id: name,
  name,
  avatar: state.avatars?.[name] ?? "",
  since: state.loops.at(-1)?.addedAt ?? Date.now(),
  packs: state.packs.filter((p) => p.createdBy === name).length,
  loops: state.loops.filter((l) => l.addedBy === name).length,
  uses: state.packs.filter((p) => p.createdBy === name).reduce((sum, p) => sum + (p.uses ?? 0), 0),
}));

export async function setAvatar(avatar) {
  state.avatars = { ...(state.avatars ?? {}), [state.user]: avatar ?? "" };
  save();
}

export async function setPersonName(userId, name) { if (userId === state.user) state.user = name; save(); }

export const isFavorite = (packId, user = state.user) => (state.favorites ?? []).includes(packId) && user === state.user;
export const favoriteCount = (packId) => ((state.favorites ?? []).includes(packId) ? 1 : 0);
export const favoritesOf = (user) => (user === state.user ? state.packs.filter((p) => (state.favorites ?? []).includes(p.id)) : []);

export async function toggleFavorite(packId) {
  const list = state.favorites ?? [];
  state.favorites = list.includes(packId) ? list.filter((f) => f !== packId) : [...list, packId];
  save();
  return state.favorites.includes(packId);
}

export async function notePackUse(packId) {
  const pack = state.packs.find((p) => p.id === packId);
  if (pack) { pack.uses = (pack.uses ?? 0) + 1; pack.lastUsedAt = Date.now(); }
  save();
}

/* IndexedDB, for uploaded audio in demo mode ------------------------------ */

function idb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("sugpacks-demo", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("audio");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function idbPut(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("audio", "readwrite");
    tx.objectStore("audio").put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("audio").objectStore("audio").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* Same shape as live.js ------------------------------------------------------ */

export const live = false;
export const session = async () => ({ name: state?.user ?? "Razz" });
export const signIn = async () => session();
export async function signOut() { /* demo has no login */ }
export async function refresh() { return false; }
export async function warm() { /* demo audio is local */ }
export function setErrorHandler() { /* demo never fails a save */ }
export async function setName(name) { state.user = String(name).trim() || state.user; save(); }

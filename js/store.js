// Data layer. Demo mode keeps everything in this browser (localStorage, plus
// IndexedDB for uploaded audio). The live version will swap this file for one
// that talks to Supabase and Dropbox, with the same functions.

import { parseName } from "./names.js";
import { GROUPS, STARTER_TAGS, slug } from "./tags.js";

const KEY = "sugpacks-demo-v1";
const USERS = ["Razz", "12"];
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
    duration: peaks[demo.file]?.duration || 0,
    peaks: peaks[demo.file]?.peaks || [],
    src: DEMO_AUDIO + encodeURIComponent(demo.file),
    addedBy: i % 3 ? "Razz" : "12",
    addedAt: now - (i + 1) * DAY / 3,
  }));
  const byFile = new Map(loops.map((l) => [l.file, l.id]));
  const packs = DEMO_PACKS.map((p) => ({
    id: uid(),
    name: p.name,
    loopIds: p.files.map((f) => byFile.get(f)),
    removeSug: p.removeSug,
    removeCollabs: p.removeCollabs,
    link: `https://www.dropbox.com/scl/fo/demo${uid()}/${encodeURIComponent(p.name)}`,
    createdBy: p.createdBy,
    createdAt: now - p.daysAgo * DAY,
  }));
  return { user: "Razz", tags, loops, packs };
}

export async function init() {
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; }
  if (!state?.loops) {
    state = await seed();
    save();
  }
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

export function updateLoop(id, changes) {
  Object.assign(getLoop(id), changes);
  save();
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

// Uploads: read tempo from the name, draw a waveform in the browser.
export async function addFiles(files, onProgress = () => {}) {
  const added = [];
  let done = 0;
  for (const file of files) {
    const id = uid();
    const { duration, peaks } = await analyse(file).catch(() => ({ duration: 0, peaks: [] }));
    await idbPut(id, file).catch(() => {});
    uploadUrls.set(id, URL.createObjectURL(file));
    const loop = { id, file: file.name, ...parseName(file.name), tags: [], duration, peaks, uploaded: true, addedBy: state.user, addedAt: Date.now() };
    state.loops.push(loop);
    added.push(loop);
    onProgress(++done, files.length);
  }
  save();
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

/* Packs ------------------------------------------------------------------- */

export const listPacks = () => [...state.packs].sort((a, b) => b.createdAt - a.createdAt);

export async function createPack({ name, loopIds, removeSug, removeCollabs }, onProgress = () => {}) {
  // Live: Dropbox copies each loop server-side under its cleaned name, then
  // makes a shared link to the folder. Here we only pretend, at a believable pace.
  for (let i = 1; i <= loopIds.length; i++) {
    await new Promise((r) => setTimeout(r, Math.max(60, 900 / loopIds.length)));
    onProgress(i, loopIds.length);
  }
  const pack = {
    id: uid(),
    name,
    loopIds,
    removeSug,
    removeCollabs,
    link: `https://www.dropbox.com/scl/fo/demo${uid()}/${encodeURIComponent(name)}`,
    createdBy: state.user,
    createdAt: Date.now(),
  };
  state.packs.push(pack);
  save();
  return pack;
}

export function deletePack(id) {
  state.packs = state.packs.filter((p) => p.id !== id);
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

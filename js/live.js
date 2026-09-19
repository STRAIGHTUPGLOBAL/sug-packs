// Live data: tags, loops and packs in Supabase; audio and packs in Dropbox,
// reached through the "dropbox" server function. Same functions as store.js
// (the demo), so the screens don't know the difference.
//
// Everything is loaded once into memory (a few thousand loops is small) and
// read synchronously; changes update memory at once and save in the background.

import { SUPABASE_KEY, SUPABASE_URL } from "./config.js";
import { audioObjectUrl, hasAudio, removeAudio, storeAudio } from "./audio-cache.js";
import { packName, parseName } from "./names.js";
import { slug } from "./tags.js";

const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm");

// Sessions are kept and refreshed in this browser, so a login lasts until you sign out.
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const live = true;

let me = null;
let profiles = new Map();
let tags = [];
let loops = [];
let packs = [];
let recipients = [];
let loadedAt = 0;
let favorites = new Map(); // pack id → set of user ids
const links = new Map(); // loop id → { url, expires }
const warmingLinks = new Map(); // loop id → shared batch request
const cacheJobs = new Map(); // loop id → background download
const mediaPreloads = new Map(); // fallback when Dropbox blocks a cache fetch

let report = (error) => console.error(error);
export const setErrorHandler = (fn) => { report = fn; };

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

async function server(action, args = {}) {
  const { data, error } = await sb.functions.invoke("dropbox", { body: { action, ...args } });
  if (error) {
    let message = error.message;
    try { message = (await error.context.json()).error || message; } catch { /* keep the generic one */ }
    throw new Error(message);
  }
  return data;
}

// Supabase hands out at most 1000 rows per request.
async function fetchAll(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await query().range(from, from + 999));
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/* Login ------------------------------------------------------------------------ */

export async function session() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  if (!me) {
    const row = check(await sb.from("profiles").select("id, name, email").eq("id", data.session.user.id).maybeSingle());
    if (!row) {
      await sb.auth.signOut();
      throw new Error("This login isn't set up for SUG Packs.");
    }
    me = row;
  }
  return me;
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
  me = null;
  return session();
}

export async function signOut() {
  me = null;
  await sb.auth.signOut();
}

/* Loading ---------------------------------------------------------------------- */

const nameOf = (id) => profiles.get(id)?.name ?? "";
const fromTag = (row) => ({ id: row.id, group: row.grp, label: row.label });
const fromLoop = (row) => ({
  id: row.id,
  by: row.added_by,
  file: row.file,
  path: row.dropbox_path,
  title: row.title,
  bpm: row.bpm,
  key: row.key,
  collabs: row.collabs ?? [],
  tags: row.tags ?? [],
  bestOf: Boolean(row.best_of),
  duration: row.duration ?? 0,
  status: row.status ?? "open",
  statusNote: row.status_note ?? "",
  statusAt: row.status_at ? Date.parse(row.status_at) : 0,
  addedBy: nameOf(row.added_by),
  addedAt: Date.parse(row.added_at),
  madeOn: row.made_on ? String(row.made_on).slice(0, 7) : "",
});
const fromPack = (row) => ({
  id: row.id,
  by: row.created_by,
  name: row.name,
  loopIds: row.loop_ids ?? [],
  sentLoopIds: row.sent_loop_ids ?? row.loop_ids ?? [],
  removeSug: row.remove_sug,
  removeCollabs: row.remove_collabs,
  recipientId: row.recipient_id ?? null,
  sourcePackId: row.source_pack_id ?? null,
  buildRecipe: row.build_recipe ?? null,
  link: row.link ?? "",
  uses: row.uses ?? 0,
  lastUsedAt: row.last_used_at ? Date.parse(row.last_used_at) : 0,
  createdBy: nameOf(row.created_by),
  createdAt: Date.parse(row.created_at),
});
const fromRecipient = (row) => ({
  id: row.id,
  name: row.name,
  instagram: row.instagram_handle ?? "",
  avatar: row.avatar ?? "",
  archived: Boolean(row.archived),
});

export async function init() {
  const [everyone, tagRows, loopRows, packRows, favRows, recipientRows] = await Promise.all([
    fetchAll(() => sb.from("profiles").select("*").order("created_at")),
    fetchAll(() => sb.from("tags").select("id, grp, label").order("id")),
    fetchAll(() => sb.from("loops").select("*").order("added_at", { ascending: false })),
    fetchAll(() => sb.from("packs").select("*").order("created_at", { ascending: false })),
    // Favourites arrive with database update 2; without it the app simply has none.
    fetchAll(() => sb.from("pack_favorites").select("pack_id, user_id")).catch(() => []),
    // Recipients arrive with database update 6. Until then the rest of the app
    // remains fully usable and pack creation falls back to the older action.
    fetchAll(() => sb.from("recipients").select("*").order("name")).catch(() => []),
  ]);
  profiles = new Map(everyone.map((p) => [p.id, { id: p.id, name: p.name, avatar: p.avatar ?? "", since: Date.parse(p.created_at) }]));
  tags = tagRows.map(fromTag);
  loops = loopRows.map(fromLoop);
  packs = packRows.map(fromPack);
  recipients = recipientRows.map(fromRecipient);
  favorites = new Map();
  for (const row of favRows) {
    if (!favorites.has(row.pack_id)) favorites.set(row.pack_id, new Set());
    favorites.get(row.pack_id).add(row.user_id);
  }
  if (me) me.name = profiles.get(me.id)?.name ?? me.name;
  loadedAt = Date.now();
}

// Pick up what the other person changed, when the app comes back into view.
export async function refresh({ ifOlderThan = 0 } = {}) {
  if (Date.now() - loadedAt < ifOlderThan) return false;
  await init();
  return true;
}

export async function reset() { /* demo only */ }

/* People ------------------------------------------------------------------------ */

export const users = () => [...profiles.values()].map((p) => p.name);
export const currentUser = () => me?.name ?? "";
export function setUser() { /* demo only: live logins are real */ }

// The name that shows on loops and packs. Everyone sets their own.
export async function setName(name) {
  const clean = String(name).trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean || !me) return;
  check(await sb.from("profiles").update({ name: clean }).eq("id", me.id).select().single());
  me.name = clean;
  profiles.set(me.id, { ...(profiles.get(me.id) ?? { id: me.id }), name: clean });
  await init();
}

/* Tags ---------------------------------------------------------------------------- */

export const listTags = () => tags;
export const tagsById = () => new Map(tags.map((t) => [t.id, t]));
export const tagUseCount = (id) => loops.filter((l) => l.tags.includes(id)).length;

export function addTag(group, label) {
  const clean = label.trim().replace(/\s+/g, " ");
  const tag = { id: `${group}:${slug(clean)}`, group, label: clean };
  tags.push(tag);
  sb.from("tags").insert({ id: tag.id, grp: group, label: clean }).then(({ error }) => {
    if (error && !/duplicate/i.test(error.message)) report(new Error(`Couldn't save the tag: ${error.message}`));
  });
  return tag;
}

/* Loops ------------------------------------------------------------------------- */

export const listLoops = () => loops;
export const getLoop = (id) => loops.find((l) => l.id === id);
export const untagged = () => loops.filter((l) => !l.tags.length);

// Dropbox can be edited outside the app. Reconcile its real files with the
// database rows without blocking start-up; the Library decides when to ask.
export async function checkLibraryFiles() {
  const { files = [] } = await server("library_files");
  const present = new Set(files.map((file) => String(file.path).toLowerCase()));
  let changed = false;
  for (const loop of loops) {
    const missing = !loop.path || !present.has(loop.path.toLowerCase());
    if (Boolean(loop.missing) !== missing) changed = true;
    loop.missing = missing;
  }
  return changed;
}

// Files already confirmed missing need only lose their Supabase rows. Reuse the
// deployed delete action (which tolerates Dropbox 404s) and refresh once at end.
export async function removeMissingLoops(ids) {
  const knownMissing = new Set(loops.filter((loop) => loop.missing).map((loop) => loop.id));
  const pending = [...new Set(ids)].filter((id) => getLoop(id)?.missing);
  const failures = [];
  let next = 0;
  async function worker() {
    while (next < pending.length) {
      const id = pending[next++];
      try {
        await server("delete_loop", { loopId: id });
        links.delete(id);
        await removeAudio(id).catch(() => {});
      } catch (error) {
        failures.push(error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  await init();
  // init() rebuilds the in-memory rows. Keep any other missing markers (and
  // failed removals) until the next Dropbox reconciliation.
  for (const loop of loops) loop.missing = knownMissing.has(loop.id);
  if (failures.length) throw failures[0];
  return pending.length;
}

export function updateLoop(id, changes) {
  const loop = getLoop(id);
  if (!loop) return;
  Object.assign(loop, changes);
  const row = {};
  for (const field of ["title", "bpm", "key", "tags"]) if (field in changes) row[field] = changes[field];
  if ("madeOn" in changes) row.made_on = changes.madeOn ? `${changes.madeOn}-01` : null;
  sb.from("loops").update(row).eq("id", id).then(({ error }) => {
    if (error) report(new Error(`Couldn't save ${loop.title}: ${error.message}`));
  });
}

export async function setBestOf(id, bestOf) {
  const loop = getLoop(id);
  if (!loop) return false;
  const { data, error } = await sb.from("loops").update({ best_of: Boolean(bestOf) }).eq("id", id).select("best_of").single();
  if (error) {
    if (/best_of/i.test(error.message)) throw new Error("Best of needs database update 5.");
    throw new Error(error.message);
  }
  loop.bestOf = Boolean(data.best_of);
  return loop.bestOf;
}

// Gone for good: the file in Dropbox and the row. Packs keep their own copies.
export async function deleteLoop(loopId) {
  await server("delete_loop", { loopId });
  links.delete(loopId);
  await removeAudio(loopId).catch(() => {});
  await init();
}

// open · reserved · placed. Placing a loop pulls it out of every pack.
export async function setLoopStatus(loopId, status, note = null) {
  const previous = getLoop(loopId)?.status;
  if (previous === "placed" && status === "open") {
    const { restoredTo = 0 } = await server("undo_loop_status", { loopId });
    await init();
    return { pulledFrom: 0, restoredTo };
  }
  // Placing must use the reversible server version. An older deployed function
  // returns Unknown action instead of removing pack copies without an undo log.
  const action = status === "placed" ? "set_loop_status_v2" : "set_loop_status";
  const { pulledFrom } = await server(action, { loopId, status, note });
  await init();
  return { pulledFrom, restoredTo: 0 };
}

// Playback links last four hours; share in-flight batches between the Library,
// the background cache and the player so one loop never asks twice.
export async function warm(ids) {
  const soon = Date.now() + 10 * 60_000;
  const needed = [...new Set(ids)].filter((id) => !(links.get(id)?.expires > soon));
  const freshIds = needed.filter((id) => !warmingLinks.has(id));
  if (freshIds.length) {
    const task = (async () => {
      for (let i = 0; i < freshIds.length; i += 25) {
        const { links: fresh } = await server("play_links", { ids: freshIds.slice(i, i + 25) });
        for (const [id, url] of Object.entries(fresh)) links.set(id, { url, expires: Date.now() + 3.8 * 3600_000 });
      }
    })();
    for (const id of freshIds) warmingLinks.set(id, task);
    const clear = () => {
      for (const id of freshIds) if (warmingLinks.get(id) === task) warmingLinks.delete(id);
    };
    task.then(clear, clear);
  }
  await Promise.all([...new Set(needed.map((id) => warmingLinks.get(id)).filter(Boolean))]);
}

export async function audioUrl(loop) {
  const local = await audioObjectUrl(loop.id).catch(() => "");
  if (local) return local;
  try {
    await warm([loop.id]);
  } catch (error) {
    report(error);
  }
  return links.get(loop.id)?.url ?? "";
}

function fallbackPreload(id, url) {
  if (!url || mediaPreloads.has(id)) return;
  while (mediaPreloads.size >= 12) {
    const [oldId, old] = mediaPreloads.entries().next().value;
    old.removeAttribute("src");
    old.load();
    mediaPreloads.delete(oldId);
  }
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  audio.load();
  mediaPreloads.set(id, audio);
}

function cacheOne(id) {
  if (cacheJobs.has(id)) return cacheJobs.get(id);
  const job = (async () => {
    try { if (await hasAudio(id)) return; } catch { /* fall back to a fresh preload */ }
    const url = links.get(id)?.url;
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Audio preload failed");
      if (!(await storeAudio(id, response))) fallbackPreload(id, url);
    } catch {
      // Direct playback still works. Holding a preloading media element also
      // primes the browser cache on platforms that block cross-origin fetches.
      fallbackPreload(id, url);
    }
  })().finally(() => cacheJobs.delete(id));
  cacheJobs.set(id, job);
  return job;
}

// Cache only what is likely to play next. New uploads are cached from their
// local File below, so they need no round trip back through Dropbox at all.
export async function cacheAudio(ids) {
  const wanted = [...new Set(ids)].filter((id) => getLoop(id) || queueById.has(id)).slice(0, 8);
  if (!wanted.length) return;
  await warm(wanted);
  if (navigator.connection?.saveData || document.hidden) return;
  let next = 0;
  async function worker() {
    while (next < wanted.length) await cacheOne(wanted[next++]);
  }
  await Promise.all(Array.from({ length: Math.min(2, wanted.length) }, worker));
}

function durationOf(file) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const done = (value) => { URL.revokeObjectURL(url); resolve(value); };
    const timer = setTimeout(() => done(0), 8000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => { clearTimeout(timer); done(Number.isFinite(audio.duration) ? audio.duration : 0); };
    audio.onerror = () => { clearTimeout(timer); done(0); };
    audio.src = url;
  });
}

// Dropbox upload links accept the file directly. XHR is intentional here: fetch
// cannot expose upload progress, while a large queue needs honest per-file bars.
function uploadFile(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(`Dropbox refused ${file.name}`));
    request.onerror = () => reject(new Error(`Couldn't upload ${file.name}`));
    request.send(file);
  });
}

// Uploads go from the browser straight into Dropbox (/Library), then get a row.
// Three workers keep a large drop moving without swamping a phone or Dropbox.
// Progress events are self-contained so the UI can outlive the Library screen.
export async function addFiles(files, onProgress = () => {}) {
  const added = [];
  added.skipped = [];
  added.failed = [];
  const emit = (update) => { try { onProgress(update); } catch { /* UI moved on */ } };
  const known = new Set(loops.map((loop) => loop.file.toLowerCase()));
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
        emit({ file, index, status: "uploading", progress: 0 });
        // The link comes with the path it will land on; the upload only confirms.
        const { url, path, name } = await server("upload_link", { name: file.name });
        await uploadFile(url, file, (progress) => emit({ file, index, status: "uploading", progress }));
        emit({ file, index, status: "saving", progress: 1 });
        const parsed = parseName(name);
        const row = check(await sb.from("loops").insert({
          file: name,
          dropbox_path: path,
          title: parsed.title,
          bpm: parsed.bpm,
          key: parsed.key,
          collabs: parsed.collabs,
          duration: await durationOf(file),
        }).select().single());
        const loop = fromLoop(row);
        loop.addedBy = me?.name ?? loop.addedBy;
        loops.unshift(loop);
        const cacheJob = storeAudio(loop.id, file).catch(() => false).finally(() => cacheJobs.delete(loop.id));
        cacheJobs.set(loop.id, cacheJob);
        added.push(loop);
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

/* Quarantine --------------------------------------------------------------------- */

// Old loops wait here until they are swiped into the library. Kept apart from
// `loops` so Build and the Library never see them; loaded when the page opens.

let queue = [];
let queueById = new Map();
let queueReady = null; // null = not asked yet · false = database update 7 missing

const fromQueue = (row) => ({
  id: row.id,
  quarantine: true,
  file: row.file,
  path: row.dropbox_path,
  title: row.title,
  bpm: row.bpm,
  key: row.key,
  collabs: row.collabs ?? [],
  tags: [],
  duration: row.duration ?? 0,
  madeOn: row.made_on ? String(row.made_on).slice(0, 7) : "",
  state: row.state,
  loopId: row.loop_id ?? "",
  addedBy: nameOf(row.added_by),
  addedAt: Date.parse(row.added_at),
  decidedBy: nameOf(row.decided_by),
  decidedAt: row.decided_at ? Date.parse(row.decided_at) : 0,
});

function setQueue(items) {
  queue = items;
  queueById = new Map(items.map((item) => [item.id, item]));
}

export async function loadQuarantine() {
  try {
    const rows = await fetchAll(() => sb.from("quarantine").select("*").eq("kind", "sample").order("id"));
    setQueue(rows.map(fromQueue));
    queueReady = true;
  } catch (error) {
    if (!/does not exist|schema cache|relation/i.test(error.message)) throw error;
    setQueue([]);
    queueReady = false;
  }
  return queueReady;
}

export const quarantineAvailable = () => queueReady;
export const quarantineList = () => queue;
export const getQuarantineItem = (id) => queueById.get(id);

// Same rule for every upload: the exact file name identifies a loop. The reply
// says where it already is, so the summary can say so.
export function quarantineKnown(name) {
  const key = name.toLowerCase();
  if (loops.some((loop) => loop.file.toLowerCase() === key)) return "library";
  const item = queue.find((entry) => entry.file.toLowerCase() === key);
  if (!item) return "";
  return item.state === "kept" ? "library" : item.state === "rejected" ? "rejected" : "quarantine";
}

const skipReason = (message) => /library/i.test(message) ? "library" : /rejected/i.test(message) ? "rejected" : "quarantine";

export async function addQuarantineFiles(files, month, onProgress = () => {}) {
  const added = [];
  added.skipped = [];
  added.failed = [];
  const emit = (update) => { try { onProgress(update); } catch { /* UI moved on */ } };
  if (queueReady === null) await loadQuarantine();
  if (queueReady === false) throw new Error("Run database update 7 before using quarantine.");
  const pending = [];
  const seen = new Set();

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

  let next = 0;
  async function worker() {
    while (next < pending.length) {
      const { file, index } = pending[next++];
      try {
        emit({ file, index, status: "uploading", progress: 0 });
        let link;
        try {
          link = await server("quarantine_upload_link", { name: file.name, month });
        } catch (error) {
          if (/already in/i.test(error.message)) {
            added.skipped.push(file.name);
            emit({ file, index, status: "skipped", reason: skipReason(error.message), progress: 1 });
            continue;
          }
          throw error;
        }
        await uploadFile(link.url, file, (progress) => emit({ file, index, status: "uploading", progress }));
        emit({ file, index, status: "saving", progress: 1 });
        const parsed = parseName(link.name);
        const row = check(await sb.from("quarantine").insert({
          file: link.name,
          dropbox_path: link.path,
          title: parsed.title,
          bpm: parsed.bpm,
          key: parsed.key,
          collabs: parsed.collabs,
          duration: await durationOf(file),
          made_on: `${month}-01`,
        }).select().single());
        const item = fromQueue(row);
        item.addedBy = me?.name ?? item.addedBy;
        setQueue([...queue, item]);
        // The file is right here: keep it on the device, so swiping it later is instant.
        const cacheJob = storeAudio(item.id, file).catch(() => false).finally(() => cacheJobs.delete(item.id));
        cacheJobs.set(item.id, cacheJob);
        added.push(item);
        emit({ file, index, status: "done", progress: 1, loop: item });
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

// Decisions show at once and save in the background, so swiping never waits on
// Dropbox. Keeping moves the file, so it goes through the server function.
const decisions = [];
let deciding = false;

async function drain() {
  if (deciding) return;
  deciding = true;
  while (decisions.length) {
    const job = decisions.shift();
    try {
      await job();
    } catch (error) {
      report(error);
    }
  }
  deciding = false;
}

export function quarantineDecide(id, state) {
  const item = queueById.get(id);
  if (!item) return;
  const before = { state: item.state, decidedBy: item.decidedBy, decidedAt: item.decidedAt, loopId: item.loopId };
  item.state = state;
  item.decidedBy = me?.name ?? "";
  item.decidedAt = Date.now();
  const revert = (error, what) => {
    Object.assign(item, before);
    throw new Error(`Couldn't ${what} ${item.title}: ${error.message}`);
  };
  decisions.push(async () => {
    if (state === "kept") {
      try {
        const { loop: row } = await server("quarantine_keep", { id });
        const loop = fromLoop(row);
        loop.addedBy = nameOf(row.added_by);
        if (!loops.some((entry) => entry.id === loop.id)) loops.unshift(loop);
        item.loopId = loop.id;
      } catch (error) { revert(error, "keep"); }
      return;
    }
    const { error } = await sb.from("quarantine")
      .update(state === "open"
        ? { state, decided_by: null, decided_at: null }
        : { state, decided_by: me?.id ?? null, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) revert(error, state === "rejected" ? "reject" : "park");
  });
  drain();
}

// Back to open: from later or rejected it is a plain update; from kept the
// server moves the file back (only while nobody has tagged or packed it).
export async function quarantineReopen(id) {
  const item = queueById.get(id);
  if (!item) return;
  // Let the decision it follows finish first, so the two never cross.
  while (deciding || decisions.length) await new Promise((resolve) => setTimeout(resolve, 60));
  if (item.state === "kept") {
    await server("quarantine_unkeep", { id });
    loops = loops.filter((loop) => loop.id !== item.loopId);
    item.loopId = "";
  } else {
    const { error } = await sb.from("quarantine")
      .update({ state: "open", decided_by: null, decided_at: null })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
  item.state = "open";
  item.decidedBy = "";
  item.decidedAt = 0;
}

// Everything rejected, gone for good: files and rows.
export async function quarantinePurgeRejected(onProgress = () => {}) {
  let removed = 0;
  for (;;) {
    const result = await server("quarantine_purge_rejected", { limit: 60 });
    removed += result.removed;
    onProgress(removed, result.remaining);
    if (!result.remaining || !result.removed) break;
  }
  await loadQuarantine();
  return removed;
}

// Free room in the Dropbox account, if the connection is allowed to say.
export async function dropboxSpace() {
  try {
    const result = await server("space");
    return result.unavailable || !result.allocated ? null : { used: result.used, total: result.allocated };
  } catch {
    return null;
  }
}

/* Packs ----------------------------------------------------------------------------- */

export const listPacks = () => packs;

export async function createPack({ name, loopIds, removeSug, removeCollabs, recipientId = null, sourcePackId = null, buildRecipe = null }, onProgress = () => {}) {
  const items = loopIds.map((id) => ({ loopId: id, as: packName(getLoop(id)?.file ?? "", { removeSug, removeCollabs }) }));
  const total = items.length;
  // Dropbox copies them in one go; count along so the screen shows movement.
  let shown = 0;
  const timer = setInterval(() => { if (shown < total - 1) onProgress(++shown, total); }, Math.max(60, 1600 / total));
  try {
    let result;
    try {
      result = await server("create_pack_v2", { name, items, removeSug, removeCollabs, recipientId, sourcePackId, buildRecipe });
    } catch (error) {
      if (!/Unknown action/i.test(error.message)) throw error;
      if (recipientId || sourcePackId) throw new Error("Deploy the latest Dropbox function before creating a producer pack.");
      result = await server("create_pack", { name, items, removeSug, removeCollabs });
    }
    const { pack } = result;
    onProgress(total, total);
    const created = fromPack(pack);
    created.createdBy = me?.name ?? created.createdBy;
    packs.unshift(created);
    return created;
  } finally {
    clearInterval(timer);
  }
}

export const listRecipients = () => recipients
  .filter((recipient) => !recipient.archived)
  .sort((a, b) => a.name.localeCompare(b.name));

export async function saveRecipient({ id = null, name, instagram = "", avatar = "" }) {
  const cleanName = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const cleanInstagram = String(instagram ?? "").trim().replace(/^@+/, "").slice(0, 30);
  if (!cleanName) throw new Error("Add the producer's name.");
  if (cleanInstagram && !/^[a-z0-9._]+$/i.test(cleanInstagram)) throw new Error("That Instagram handle doesn't look right.");
  const values = { name: cleanName, instagram_handle: cleanInstagram || null, avatar: avatar || null };
  const query = id
    ? sb.from("recipients").update(values).eq("id", id)
    : sb.from("recipients").insert(values);
  const row = check(await query.select().single());
  const recipient = fromRecipient(row);
  const at = recipients.findIndex((item) => item.id === recipient.id);
  if (at < 0) recipients.push(recipient); else recipients[at] = recipient;
  return recipient;
}

// Rare, and worth being exact about: read everything back afterwards, so a
// refresh that started mid-delete can't bring the pack back.
export async function deletePack(packId) {
  await server("delete_pack", { packId });
  await init();
}

export async function renamePack(packId, name) {
  const { pack } = await server("rename_pack", { packId, name });
  await init();
  return packs.find((p) => p.id === packId) ?? fromPack(pack);
}

/* People, favourites and usage ------------------------------------------------- */

export const myId = () => me?.id ?? "";
export const profileOf = (id) => profiles.get(id) ?? null;

// Everyone, with what they have made: for the people list and profile pages.
export const people = () => [...profiles.values()].map((person) => {
  const theirs = packs.filter((p) => p.by === person.id);
  return {
    ...person,
    packs: theirs.length,
    loops: loops.filter((l) => l.by === person.id).length,
    uses: theirs.reduce((sum, p) => sum + p.uses, 0),
  };
});

export async function setAvatar(avatar) {
  if (!me) return;
  check(await sb.from("profiles").update({ avatar }).eq("id", me.id).select().single());
  const mine = profiles.get(me.id);
  if (mine) mine.avatar = avatar ?? "";
}

export async function setPersonName(userId, name) {
  if (userId === me?.id) return setName(name);
  await server("set_person_name", { userId, name });
  await init();
}

export const isFavorite = (packId, userId = me?.id) => favorites.get(packId)?.has(userId) ?? false;
export const favoriteCount = (packId) => favorites.get(packId)?.size ?? 0;
export const favoritesOf = (userId) => packs.filter((p) => favorites.get(p.id)?.has(userId));

export async function toggleFavorite(packId) {
  if (!me) return false;
  const set = favorites.get(packId) ?? new Set();
  favorites.set(packId, set);
  const on = !set.has(me.id);
  if (on) set.add(me.id); else set.delete(me.id);
  const query = on
    ? sb.from("pack_favorites").insert({ pack_id: packId, user_id: me.id })
    : sb.from("pack_favorites").delete().eq("pack_id", packId).eq("user_id", me.id);
  const { error } = await query;
  if (error) {
    if (on) set.delete(me.id); else set.add(me.id);
    report(new Error(`Couldn't save that: ${error.message}`));
  }
  return set.has(me.id);
}

// Copying a pack's link counts as sending it out.
export async function notePackUse(packId) {
  const pack = packs.find((p) => p.id === packId);
  if (pack) { pack.uses += 1; pack.lastUsedAt = Date.now(); }
  const { error } = await sb.rpc("note_pack_use", { pack: packId });
  if (error) report(new Error(`Couldn't count that: ${error.message}`));
}

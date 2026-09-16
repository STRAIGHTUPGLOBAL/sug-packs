// Live data: tags, loops and packs in Supabase; audio and packs in Dropbox,
// reached through the "dropbox" server function. Same functions as store.js
// (the demo), so the screens don't know the difference.
//
// Everything is loaded once into memory (a few thousand loops is small) and
// read synchronously; changes update memory at once and save in the background.

import { SUPABASE_KEY, SUPABASE_URL } from "./config.js";
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
let loadedAt = 0;
const links = new Map(); // loop id → { url, expires }

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
  file: row.file,
  path: row.dropbox_path,
  title: row.title,
  bpm: row.bpm,
  key: row.key,
  collabs: row.collabs ?? [],
  tags: row.tags ?? [],
  duration: row.duration ?? 0,
  addedBy: nameOf(row.added_by),
  addedAt: Date.parse(row.added_at),
});
const fromPack = (row) => ({
  id: row.id,
  name: row.name,
  loopIds: row.loop_ids ?? [],
  removeSug: row.remove_sug,
  removeCollabs: row.remove_collabs,
  link: row.link ?? "",
  createdBy: nameOf(row.created_by),
  createdAt: Date.parse(row.created_at),
});

export async function init() {
  const [people, tagRows, loopRows, packRows] = await Promise.all([
    fetchAll(() => sb.from("profiles").select("id, name").order("created_at")),
    fetchAll(() => sb.from("tags").select("id, grp, label").order("id")),
    fetchAll(() => sb.from("loops").select("*").order("added_at", { ascending: false })),
    fetchAll(() => sb.from("packs").select("*").order("created_at", { ascending: false })),
  ]);
  profiles = new Map(people.map((p) => [p.id, p]));
  tags = tagRows.map(fromTag);
  loops = loopRows.map(fromLoop);
  packs = packRows.map(fromPack);
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

export function updateLoop(id, changes) {
  const loop = getLoop(id);
  if (!loop) return;
  Object.assign(loop, changes);
  const row = {};
  for (const field of ["title", "bpm", "key", "tags"]) if (field in changes) row[field] = changes[field];
  sb.from("loops").update(row).eq("id", id).then(({ error }) => {
    if (error) report(new Error(`Couldn't save ${loop.title}: ${error.message}`));
  });
}

// Playback links last four hours; ask for a batch ahead of the swipe deck.
export async function warm(ids) {
  const soon = Date.now() + 10 * 60_000;
  const needed = ids.filter((id) => !(links.get(id)?.expires > soon));
  for (let i = 0; i < needed.length; i += 25) {
    const { links: fresh } = await server("play_links", { ids: needed.slice(i, i + 25) });
    for (const [id, url] of Object.entries(fresh)) links.set(id, { url, expires: Date.now() + 3.8 * 3600_000 });
  }
}

export async function audioUrl(loop) {
  try {
    await warm([loop.id]);
  } catch (error) {
    report(error);
  }
  return links.get(loop.id)?.url ?? "";
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

// Uploads go from the browser straight into Dropbox (/Library), then get a row.
// A file whose name is already in the library is skipped: one loop, one entry.
export async function addFiles(files, onProgress = () => {}) {
  const added = [];
  added.skipped = [];
  let done = 0;
  for (const file of files) {
    if (loops.some((l) => l.file.toLowerCase() === file.name.toLowerCase())) {
      added.skipped.push(file.name);
      onProgress(++done, files.length);
      continue;
    }
    try {
      const { url } = await server("upload_link", { name: file.name });
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
      if (!res.ok) throw new Error(`Dropbox refused ${file.name}`);
      const meta = await res.json();
      const parsed = parseName(file.name);
      const row = check(await sb.from("loops").insert({
        file: file.name,
        dropbox_path: meta.path_display,
        title: parsed.title,
        bpm: parsed.bpm,
        key: parsed.key,
        collabs: parsed.collabs,
        duration: await durationOf(file),
      }).select().single());
      const loop = fromLoop(row);
      loop.addedBy = me?.name ?? loop.addedBy;
      loops.unshift(loop);
      added.push(loop);
    } catch (error) {
      report(error);
    }
    onProgress(++done, files.length);
  }
  return added;
}

/* Packs ----------------------------------------------------------------------------- */

export const listPacks = () => packs;

export async function createPack({ name, loopIds, removeSug, removeCollabs }, onProgress = () => {}) {
  const items = loopIds.map((id) => ({ loopId: id, as: packName(getLoop(id)?.file ?? "", { removeSug, removeCollabs }) }));
  const total = items.length;
  // Dropbox copies them in one go; count along so the screen shows movement.
  let shown = 0;
  const timer = setInterval(() => { if (shown < total - 1) onProgress(++shown, total); }, Math.max(60, 1600 / total));
  try {
    const { pack } = await server("create_pack", { name, items, removeSug, removeCollabs });
    onProgress(total, total);
    const created = fromPack(pack);
    created.createdBy = me?.name ?? created.createdBy;
    packs.unshift(created);
    return created;
  } finally {
    clearInterval(timer);
  }
}

export function deletePack() { /* not offered yet */ }

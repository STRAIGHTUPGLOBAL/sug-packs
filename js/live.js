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
let favorites = new Map(); // pack id → set of user ids
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
  by: row.added_by,
  file: row.file,
  path: row.dropbox_path,
  title: row.title,
  bpm: row.bpm,
  key: row.key,
  collabs: row.collabs ?? [],
  tags: row.tags ?? [],
  duration: row.duration ?? 0,
  status: row.status ?? "open",
  statusNote: row.status_note ?? "",
  statusAt: row.status_at ? Date.parse(row.status_at) : 0,
  addedBy: nameOf(row.added_by),
  addedAt: Date.parse(row.added_at),
});
const fromPack = (row) => ({
  id: row.id,
  by: row.created_by,
  name: row.name,
  loopIds: row.loop_ids ?? [],
  removeSug: row.remove_sug,
  removeCollabs: row.remove_collabs,
  link: row.link ?? "",
  uses: row.uses ?? 0,
  lastUsedAt: row.last_used_at ? Date.parse(row.last_used_at) : 0,
  createdBy: nameOf(row.created_by),
  createdAt: Date.parse(row.created_at),
});

export async function init() {
  const [everyone, tagRows, loopRows, packRows, favRows] = await Promise.all([
    fetchAll(() => sb.from("profiles").select("*").order("created_at")),
    fetchAll(() => sb.from("tags").select("id, grp, label").order("id")),
    fetchAll(() => sb.from("loops").select("*").order("added_at", { ascending: false })),
    fetchAll(() => sb.from("packs").select("*").order("created_at", { ascending: false })),
    // Favourites arrive with database update 2; without it the app simply has none.
    fetchAll(() => sb.from("pack_favorites").select("pack_id, user_id")).catch(() => []),
  ]);
  profiles = new Map(everyone.map((p) => [p.id, { id: p.id, name: p.name, avatar: p.avatar ?? "", since: Date.parse(p.created_at) }]));
  tags = tagRows.map(fromTag);
  loops = loopRows.map(fromLoop);
  packs = packRows.map(fromPack);
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

// Gone for good: the file in Dropbox and the row. Packs keep their own copies.
export async function deleteLoop(loopId) {
  await server("delete_loop", { loopId });
  links.delete(loopId);
  await init();
}

// open · reserved · placed. Placing a loop pulls it out of every pack.
export async function setLoopStatus(loopId, status, note = null) {
  const { pulledFrom } = await server("set_loop_status", { loopId, status, note });
  await init();
  return pulledFrom;
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

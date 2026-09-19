// Quarantine: old loops wait here until they are swiped into the library.
// This file holds the Quarantine page, the upload sheet and the Purge deck.

import { coverStyle } from "./cover.js";
import * as player from "./player.js";
import * as store from "./data.js";
import * as uploads from "./uploads.js";
import { closeSheet, esc, icon, openSheet, toast } from "./ui.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AUDIO = /\.(mp3|wav|aiff?|flac|m4a)$/i;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const monthLabel = (month) => (month ? `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` : "");

let filterYear = "";
let filterMonth = "";
let purgePile = "open";
let unlocked = false; // phones need one tap before sound; after that each card plays itself

const inFilter = (item) => (filterMonth ? item.madeOn === filterMonth : filterYear ? item.madeOn.startsWith(filterYear) : true);

// Not alphabetical: within a month the order is scrambled, but the same every
// time, so stopping and coming back never reshuffles what is left.
const mix = (id) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

// Newest month first, then backwards.
const pile = (state) => store.quarantineList()
  .filter((item) => item.state === state && inFilter(item))
  .sort((a, b) => b.madeOn.localeCompare(a.madeOn) || mix(a.id) - mix(b.id));

const meta = (item) => [item.bpm ? `${item.bpm} BPM` : "", item.key || "", item.collabs.join(" ")].filter(Boolean).join(" · ");

export function startPurge(go, which = "open") {
  purgePile = which;
  go("#/purge");
}

/* The page --------------------------------------------------------------------- */

export function renderQuarantine(view, { go, setDock, pageClass }) {
  view.innerHTML = `
    <section class="${pageClass()}">
      <header class="header"><div class="header-back"><a class="icon-button" href="#/library" aria-label="Back">${icon("back")}</a><h1 class="header-title">Quarantine</h1></div></header>
      <div data-uploads></div>
      <div data-body></div>
    </section>`;
  setDock("library");

  const body = view.querySelector("[data-body]");
  const uploadSlot = view.querySelector("[data-uploads]");

  function paint() {
    if (!view.contains(body)) return;
    if (store.quarantineAvailable() === false) {
      body.innerHTML = '<p class="empty">Quarantine needs database update 7.</p>';
      return;
    }
    const all = store.quarantineList();
    const years = [...new Set(all.map((item) => item.madeOn.slice(0, 4)))].sort().reverse();
    if (filterYear && !years.includes(filterYear)) filterYear = filterMonth = "";
    const months = filterYear
      ? [...new Set(all.filter((item) => item.madeOn.startsWith(filterYear)).map((item) => item.madeOn))].sort().reverse()
      : [];
    const scoped = all.filter(inFilter);
    const count = (state) => scoped.filter((item) => item.state === state).length;
    const open = count("open");
    const later = count("later");
    const rejected = count("rejected");
    const kept = count("kept");

    body.innerHTML = `
      <div class="list list--spaced">
        <button class="row" type="button" data-upload-open>
          <span class="row-main">Upload loops</span>${icon("upload", "row-chevron")}
        </button>
      </div>
      ${years.length ? `
        <div class="chips quarantine-years">
          <button class="chip ${filterYear ? "" : "is-on"}" type="button" data-year="">All</button>
          ${years.map((year) => `<button class="chip ${filterYear === year && !filterMonth ? "is-on" : ""}" type="button" data-year="${year}">${year}</button>`).join("")}
        </div>
        ${months.length ? `<div class="chips quarantine-months">${months.map((month) => `<button class="chip ${filterMonth === month ? "is-on" : ""}" type="button" data-month="${month}">${MONTHS[Number(month.slice(5, 7)) - 1]}</button>`).join("")}</div>` : ""}` : ""}
      ${all.length ? `
        <div class="list list--spaced">
          <div class="row"><span class="row-main">Open</span><span class="row-label row-count">${open}</span></div>
          <button class="row" type="button" data-pile="later" ${later ? "" : "disabled"}><span class="row-main">Later</span><span class="row-label row-count">${later}</span>${later ? icon("chevron", "row-chevron") : ""}</button>
          <button class="row" type="button" data-rejected ${rejected ? "" : "disabled"}><span class="row-main">Rejected</span><span class="row-label row-count">${rejected}</span>${rejected ? icon("chevron", "row-chevron") : ""}</button>
          <div class="row"><span class="row-main">Kept</span><span class="row-label row-count">${kept}</span></div>
        </div>` : '<p class="empty">Nothing here yet. Upload old loops to start.</p>'}
      ${open || later ? `
        <div class="bar">
          <span class="bar-text"><b>${open || later}</b> ${open ? "to go" : "in Later"}</span>
          <button class="button button--small button--primary" type="button" data-purge="${open ? "open" : "later"}">Purge</button>
        </div>` : ""}`;
    if (open || later) view.querySelector(".page").classList.add("page--with-bar");
  }

  const paintUploads = () => { uploadSlot.innerHTML = uploads.summaryHTML(); };

  const onClick = (event) => {
    if (event.target.closest("[data-upload-queue]")) return uploads.openQueue();
    if (event.target.closest("[data-upload-open]")) return openUpload();
    const year = event.target.closest("[data-year]");
    if (year) { filterYear = year.dataset.year; filterMonth = ""; return paint(); }
    const month = event.target.closest("[data-month]");
    if (month) { filterMonth = filterMonth === month.dataset.month ? "" : month.dataset.month; return paint(); }
    const purge = event.target.closest("[data-purge]");
    if (purge) return startPurge(go, purge.dataset.purge);
    const later = event.target.closest("[data-pile]");
    if (later) return startPurge(go, later.dataset.pile);
    if (event.target.closest("[data-rejected]")) return openRejected(paint);
  };
  view.addEventListener("click", onClick);
  const unsubscribe = uploads.subscribe((update) => {
    paintUploads();
    if (["done", "finished"].includes(update?.status)) paint();
  });
  paintUploads();
  paint();
  store.loadQuarantine().then(paint).catch((error) => toast(error.message || "Couldn't load quarantine"));
  return () => {
    view.removeEventListener("click", onClick);
    unsubscribe();
  };
}

/* Upload ----------------------------------------------------------------------- */

const REMEMBER = "sugpacks-quarantine-month";

// Dropped folders arrive as entries, not files: walk them, several at a time.
async function filesFromDrop(dataTransfer) {
  const entries = [...(dataTransfer.items ?? [])].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dataTransfer.files ?? [])];
  const found = [];
  async function walk(entry) {
    if (entry.isFile) {
      found.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
      return;
    }
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child);
    }
  }
  for (const entry of entries) await walk(entry);
  return found;
}

function openUpload() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER));
    if (saved?.year && saved?.month) ({ year, month } = saved);
  } catch { /* first time */ }
  const picked = new Map();

  const years = Array.from({ length: now.getFullYear() - 2015 }, (_, i) => now.getFullYear() - i);
  const sheet = openSheet(`
    <div class="sheet-head">
      <div class="row-main"><h2 class="sheet-title">Upload to quarantine</h2><p class="sheet-sub">Every loop in this upload gets the same month</p></div>
      <button class="icon-button" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
    </div>
    <div class="sheet-body">
      <div class="list">
        <div class="row"><label class="row-main" for="qm">Month</label>
          <select class="row-select" id="qm" data-month>${MONTHS.map((name, i) => `<option value="${i + 1}" ${i + 1 === month ? "selected" : ""}>${name}</option>`).join("")}</select></div>
        <div class="row"><label class="row-main" for="qy">Year</label>
          <select class="row-select" id="qy" data-year>${years.map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select></div>
      </div>
      <div class="list list--spaced">
        <label class="row row--media row--tap drop" data-drop>
          <span class="upload-mark is-working">${icon("upload")}</span>
          <span class="row-main"><div class="row-title" data-drop-title>Drop folders here</div><div class="row-sub" data-drop-sub>or tap to choose a folder</div></span>
          <input type="file" webkitdirectory multiple hidden data-folder>
        </label>
      </div>
      <label class="text-button drop-files">Choose files instead<input type="file" accept="audio/*,.mp3,.wav" multiple hidden data-files></label>
    </div>
    <div class="sheet-foot">
      <button class="button" type="button" data-sheet-close>Cancel</button>
      <button class="button button--primary" type="button" data-start disabled>Upload</button>
    </div>`);

  const start = sheet.querySelector("[data-start]");
  const drop = sheet.querySelector("[data-drop]");

  function paint() {
    const n = picked.size;
    sheet.querySelector("[data-drop-title]").textContent = n ? plural(n, "loop") + " ready" : "Drop folders here";
    sheet.querySelector("[data-drop-sub]").textContent = n ? "Drop or choose more folders to add them" : "or tap to choose a folder";
    start.disabled = !n;
    start.textContent = n ? `Upload ${plural(n, "loop")} to ${MONTHS[month - 1]} ${year}` : "Upload";
  }

  function add(files) {
    for (const file of files) {
      if (!AUDIO.test(file.name) || file.name.startsWith(".")) continue;
      picked.set(`${file.webkitRelativePath || file.name}:${file.size}`, file);
    }
    paint();
  }

  sheet.querySelector("[data-month]").addEventListener("change", (event) => { month = Number(event.target.value); paint(); });
  sheet.querySelector("[data-year]").addEventListener("change", (event) => { year = Number(event.target.value); paint(); });
  for (const selector of ["[data-folder]", "[data-files]"]) {
    sheet.querySelector(selector).addEventListener("change", (event) => {
      add([...event.target.files]);
      event.target.value = "";
    });
  }
  sheet.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("is-over"); });
  sheet.addEventListener("dragleave", (event) => { if (!sheet.contains(event.relatedTarget)) drop.classList.remove("is-over"); });
  sheet.addEventListener("drop", async (event) => {
    event.preventDefault();
    drop.classList.remove("is-over");
    add(await filesFromDrop(event.dataTransfer));
  });

  start.addEventListener("click", () => {
    const target = { month: `${year}-${String(month).padStart(2, "0")}` };
    uploads.enqueue([...picked.values()], target);
    // Loops come in month by month, newest first: the next upload is the month before.
    const before = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    try { localStorage.setItem(REMEMBER, JSON.stringify(before)); } catch { /* ignore */ }
    closeSheet();
    toast(`Uploading ${plural(picked.size, "loop")} to ${MONTHS[month - 1]} ${year}`);
  });
  paint();
}

/* Rejected ----------------------------------------------------------------------- */

function openRejected(onChange) {
  let confirming = false;
  const sheet = openSheet(`
    <div class="sheet-head">
      <div class="row-main"><h2 class="sheet-title">Rejected</h2><p class="sheet-sub">Still in Dropbox until you delete them</p></div>
      <button class="icon-button" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
    </div>
    <div class="sheet-body" data-body></div>
    <div class="sheet-foot" data-foot></div>`, { onClose: () => player.stop() });

  const paint = () => {
    const items = pile("rejected");
    const shown = items.slice(0, 150);
    sheet.querySelector("[data-body]").innerHTML = items.length ? `
      <div class="list">${shown.map((item) => `
        <div class="row row--media">
          <button class="thumb" type="button" data-play="${item.id}" aria-label="Play" style="${coverStyle(item.file)}">${icon("play")}</button>
          <div class="row-main"><div class="row-title">${esc(item.title)}</div><div class="row-sub">${esc([monthLabel(item.madeOn), item.decidedBy].filter(Boolean).join(" · "))}</div></div>
          <button class="icon-button" type="button" data-restore="${item.id}" aria-label="Move back to open">${icon("undo")}</button>
        </div>`).join("")}</div>
      ${items.length > shown.length ? `<p class="empty">And ${items.length - shown.length} more.</p>` : ""}` : '<p class="empty">Nothing rejected.</p>';
    const foot = sheet.querySelector("[data-foot]");
    foot.hidden = !items.length;
    foot.innerHTML = items.length
      ? `<button class="button ${confirming ? "button--danger" : ""}" type="button" data-purge-all>${confirming ? `Delete ${plural(items.length, "loop")} for good` : "Delete all rejected"}</button>`
      : "";
  };

  sheet.addEventListener("click", async (event) => {
    const play = event.target.closest("[data-play]");
    if (play) return player.toggle(store.getQuarantineItem(play.dataset.play));
    const restore = event.target.closest("[data-restore]");
    if (restore) {
      try {
        await store.quarantineReopen(restore.dataset.restore);
        paint();
        onChange();
      } catch (error) { toast(error.message || "Couldn't move that back"); }
      return;
    }
    const purge = event.target.closest("[data-purge-all]");
    if (!purge) return;
    if (!confirming) {
      confirming = true;
      paint();
      return;
    }
    purge.disabled = true;
    purge.textContent = "Deleting…";
    try {
      const removed = await store.quarantinePurgeRejected((done, remaining) => {
        purge.textContent = `Deleting… ${remaining} left`;
      });
      toast(`${plural(removed, "loop")} deleted`);
      closeSheet();
      onChange();
    } catch (error) {
      confirming = false;
      toast(error.message || "Couldn't delete them");
      paint();
      onChange();
    }
  });
  paint();
}

/* Purge -------------------------------------------------------------------------- */

const VERDICT = { kept: "keep", rejected: "skip", later: "later", best: "best" };

export function renderPurge(view, go) {
  const later = purgePile === "later";
  const deferred = new Set(); // Later cards passed over again in this visit
  const history = [];

  view.innerHTML = `
    <section class="swipe enter">
      <header class="swipe-top">
        <a class="icon-button" href="#/quarantine" aria-label="Close">${icon("x")}</a>
        <span class="swipe-count" data-count></span>
        <span class="swipe-pile">${later ? "Later" : ""}</span>
      </header>
      <div class="deck" data-deck></div>
      <div class="swipe-actions swipe-actions--purge">
        <button class="action" type="button" data-decide="rejected" aria-label="Reject">${icon("x")}</button>
        <button class="action action--undo" type="button" data-decide="later" aria-label="Later" title="Later">${icon("reserved")}</button>
        <button class="action action--undo" type="button" data-undo aria-label="Undo">${icon("undo")}</button>
        <button class="action action--undo action--best" type="button" data-decide="best" aria-label="Keep as Best of" title="Keep as Best of">${icon("trophy")}</button>
        <button class="action action--keep" type="button" data-decide="kept" aria-label="Keep">${icon("check")}</button>
      </div>
    </section>`;

  const deck = view.querySelector("[data-deck]");
  let card = null;
  let busy = false;
  let alive = true;

  const queue = () => pile(purgePile).filter((item) => !deferred.has(item.id));

  const cardHtml = (item, next) => `
    <article class="card ${next ? "is-next" : ""} ${unlocked ? "" : "is-locked"}" data-id="${item.id}">
      <div class="card-cover" style="${coverStyle(item.file)}"></div>
      <div class="card-shade"></div>
      <div class="card-center"><span class="card-play">${icon("play")}</span><span class="card-hint">Tap to play</span></div>
      <div class="card-info">
        <h2 class="card-title">${esc(item.title)}</h2>
        <p class="card-meta">${esc(meta(item))}</p>
        <div class="card-tags"><span class="card-tag">${esc(monthLabel(item.madeOn))}</span></div>
        <div class="card-progress" data-seek><div><i data-progress></i></div></div>
      </div>
      <div class="card-verdict card-verdict--keep"><span>${icon("check")}</span></div>
      <div class="card-verdict card-verdict--skip"><span>${icon("x")}</span></div>
      <div class="card-verdict card-verdict--later"><span>${icon("reserved")}</span></div>
      <div class="card-verdict card-verdict--best"><span>${icon("trophy")}</span></div>
    </article>`;

  function finished() {
    player.stop();
    const open = pile("open").length;
    const parked = pile("later").length;
    view.innerHTML = `
      <section class="swipe enter">
        <header class="swipe-top"><a class="icon-button" href="#/quarantine" aria-label="Close">${icon("x")}</a></header>
        <div class="empty purge-done">
          <h2>${later ? "Later is empty" : "All caught up"}</h2>
          <p>${later ? "" : parked ? `${plural(parked, "loop")} waiting in Later.` : ""}</p>
          ${!later && parked ? '<button class="button button--primary" type="button" data-go-later>Go through Later</button>' : ""}
          ${later && open ? `<button class="button button--primary" type="button" data-go-open>${plural(open, "loop")} still open</button>` : ""}
          <a class="button" href="#/quarantine">Back</a>
        </div>
      </section>`;
    view.querySelector("[data-go-later]")?.addEventListener("click", () => startPurge(go, "later"));
    view.querySelector("[data-go-open]")?.addEventListener("click", () => startPurge(go, "open"));
  }

  // mode: "first" on arrival, "promoted" after a decision, "returning" after undo.
  function paint(mode, from) {
    if (!alive) return;
    const items = queue();
    if (!items.length) return finished();
    const [item, next] = items;
    deck.innerHTML = (next ? cardHtml(next, true) : "") + cardHtml(item, false);
    card = deck.querySelector(".card:not(.is-next)");
    const nextCard = deck.querySelector(".card.is-next");
    if (mode === "first") {
      card.classList.add("is-first");
      nextCard?.classList.add("is-entering");
    } else if (mode === "promoted") {
      card.classList.add("is-promoting");
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove("is-promoting")));
      nextCard?.classList.add("is-entering");
    } else if (mode === "returning") {
      const side = from === "kept" ? "120%" : from === "rejected" ? "-120%" : "0";
      card.style.setProperty("--from", side);
      card.style.setProperty("--rot", from === "kept" ? "12deg" : from === "rejected" ? "-12deg" : "0deg");
      card.classList.add("is-returning");
    }
    view.querySelector("[data-count]").textContent = `${items.length} left`;
    view.querySelector("[data-undo]").disabled = !history.length;
    wire(card, item);
    sync();
    if (unlocked) player.play(item);
    store.cacheAudio(items.slice(0, 8).map((entry) => entry.id)).catch(() => {});
    store.warm(items.slice(0, 40).map((entry) => entry.id)).catch(() => {});
  }

  function sync() {
    if (!card?.isConnected) return;
    const s = player.state();
    const mine = s.id === card.dataset.id;
    card.classList.toggle("is-playing", mine && s.playing);
    card.classList.toggle("is-loading", mine && s.loading);
    card.querySelector("[data-progress]").style.width = `${mine && s.duration ? (s.time / s.duration) * 100 : 0}%`;
  }

  async function toggle(item) {
    const playing = await player.toggle(item);
    if (playing && !unlocked) {
      unlocked = true;
      deck.querySelectorAll(".card").forEach((c) => c.classList.remove("is-locked"));
    }
  }

  function wire(el, item) {
    const seek = el.querySelector("[data-seek]");
    seek.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const to = (e) => {
        const rect = seek.getBoundingClientRect();
        const fraction = (e.clientX - rect.left) / rect.width;
        if (player.state().id !== item.id) player.play(item).then(() => player.seek(fraction));
        else player.seek(fraction);
      };
      to(event);
      seek.setPointerCapture(event.pointerId);
      seek.onpointermove = to;
      seek.onpointerup = () => { seek.onpointermove = null; };
    });

    let startX = 0, startY = 0, dx = 0, dy = 0, startTime = 0, dragging = false;
    el.addEventListener("pointerdown", (event) => {
      if (busy) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startTime = performance.now();
      dx = dy = 0;
      el.classList.remove("is-settling", "is-first", "is-returning");
      el.setPointerCapture(event.pointerId);
    });
    el.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      dx = event.clientX - startX;
      dy = event.clientY - startY;
      const vertical = Math.abs(dy) > Math.abs(dx);
      const up = vertical && dy < 0;
      const down = vertical && dy > 0;
      el.style.transform = vertical ? `translate(${dx * 0.3}px, ${dy}px)` : `translate(${dx}px, ${dy * 0.2}px) rotate(${dx / 22}deg)`;
      el.dataset.lean = up && dy < -8 ? "later" : down && dy > 8 ? "best" : !vertical && dx > 8 ? "keep" : !vertical && dx < -8 ? "skip" : "";
      el.style.setProperty("--pull", Math.min(1, (vertical ? Math.abs(dy) / 110 : Math.abs(dx) / 140)));
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      const elapsed = Math.max(1, performance.now() - startTime);
      const vertical = Math.abs(dy) > Math.abs(dx);
      if (vertical && (Math.abs(dy) > el.clientHeight * 0.2 || (Math.abs(dy) > 40 && Math.abs(dy) / elapsed > 0.6))) return decide(dy < 0 ? "later" : "best");
      if (!vertical && (Math.abs(dx) > el.clientWidth * 0.3 || (Math.abs(dx) > 40 && Math.abs(dx) / elapsed > 0.6))) return decide(dx > 0 ? "kept" : "rejected");
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) toggle(item);
      el.classList.add("is-settling");
      el.style.transform = "";
      el.dataset.lean = "";
      el.style.setProperty("--pull", 0);
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
  }

  const hit = (button) => {
    button.classList.remove("is-hit");
    void button.offsetWidth;
    button.classList.add("is-hit");
  };

  function decide(outcome) {
    if (busy || !card) return;
    busy = true;
    const id = card.dataset.id;
    const item = store.getQuarantineItem(id);
    hit(view.querySelector(`[data-decide="${outcome}"]`));

    card.classList.remove("is-settling", "is-first", "is-returning");
    card.dataset.lean = VERDICT[outcome];
    card.style.setProperty("--pull", 1);
    card.classList.add("is-flying");
    requestAnimationFrame(() => {
      card.style.transform = outcome === "later" || outcome === "best"
        ? `translate(0, ${outcome === "later" ? -125 : 125}%)`
        : `translate(${outcome === "kept" ? 130 : -130}%, 2%) rotate(${outcome === "kept" ? 16 : -16}deg)`;
      card.style.opacity = "0";
    });

    // The next card moves up now, and its loop starts now.
    const nextCard = deck.querySelector(".card.is-next");
    if (nextCard) {
      nextCard.style.transition = "transform 360ms var(--ease-out), opacity 300ms ease";
      nextCard.style.transform = "none";
      nextCard.style.opacity = "1";
      if (unlocked) player.play(store.getQuarantineItem(nextCard.dataset.id));
    }

    history.push({ id, outcome, before: item.state });
    // A card sent to Later while already in Later just goes to the back.
    if (outcome === "later" && later) deferred.add(id);
    else if (outcome === "best") store.quarantineDecide(id, "kept", { bestOf: true });
    else store.quarantineDecide(id, outcome);
    navigator.vibrate?.(10);

    setTimeout(() => {
      busy = false;
      paint("promoted");
    }, 370);
  }

  async function undo() {
    if (busy) return;
    const last = history.pop();
    if (!last) return;
    busy = true;
    hit(view.querySelector("[data-undo]"));
    try {
      if (last.outcome === "later" && later) deferred.delete(last.id);
      else if (last.outcome === "kept" || last.outcome === "best") {
        await store.quarantineReopen(last.id);
        if (last.before === "later") store.quarantineDecide(last.id, "later");
      } else store.quarantineDecide(last.id, last.before);
    } catch (error) {
      history.push(last);
      toast(error.message || "Couldn't undo that");
    }
    busy = false;
    paint("returning", last.outcome);
  }

  for (const button of view.querySelectorAll("[data-decide]")) button.addEventListener("click", () => decide(button.dataset.decide));
  view.querySelector("[data-undo]").addEventListener("click", undo);

  const onKey = (event) => {
    if (event.target.closest("input, select")) return;
    if (event.key === "ArrowRight") decide("kept");
    else if (event.key === "ArrowLeft") decide("rejected");
    else if (event.key === "ArrowUp") { event.preventDefault(); decide("later"); }
    else if (event.key === "ArrowDown") { event.preventDefault(); decide("best"); }
    else if (event.key === " ") { event.preventDefault(); if (card) toggle(store.getQuarantineItem(card.dataset.id)); }
    else if (event.key.toLowerCase() === "z" || event.key === "Backspace") undo();
  };
  document.addEventListener("keydown", onKey);
  const unsubscribe = player.subscribe(sync);

  // Open on the loading state only if the list isn't in memory yet.
  if (store.quarantineAvailable() === null) store.loadQuarantine().then(() => paint("first")).catch(() => go("#/quarantine"));
  else paint("first");
  return () => {
    alive = false;
    document.removeEventListener("keydown", onKey);
    unsubscribe();
  };
}

// SUG Packs: start-up, sign-in, routing and the calm screens (Build, Library,
// tag sheet, Packs). The swipe deck and pack builder live in swipe.js.

import { coverStyle } from "./cover.js";
import * as player from "./player.js";
import * as store from "./data.js";
import * as swipe from "./swipe.js";
import { packName } from "./names.js";
import { GROUPS, lookalike, matches, slug } from "./tags.js";
import { ago, closeSheet, copyText, esc, icon, openSheet, replaceSheet, toast } from "./ui.js";

const view = document.querySelector("[data-view]");
const TABS = [
  { id: "build", label: "Build", icon: "build" },
  { id: "library", label: "Library", icon: "library" },
  { id: "packs", label: "Packs", icon: "packs" },
  { id: "me", label: "You", icon: "person" },
];
const TAB_IDS = TABS.map((t) => t.id);

let cleanup = null;
let lastPage = null;
let navFrom = 0;
let keepHeader = false;
let routeToken = 0;
let signedIn = false;
const selected = new Set();
let tagQuery = "";
let libraryQuery = "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const go = (hash) => (location.hash === hash ? route() : (location.hash = hash));
const currentPage = () => location.hash.replace(/^#\/?/, "").split("/")[0] || "build";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* Routing: the old screen lifts away, then the new one rises in. -------------- */

async function route() {
  const token = ++routeToken;
  const page = currentPage();
  if (!signedIn) return renderSignIn();
  cleanup?.();
  cleanup = null;
  if (!document.querySelector("[data-sheet]").hidden) closeSheet();
  if (page !== "pack") player.stop();

  const asTab = (name) => (name === "u" ? "me" : name);
  const fromTab = TAB_IDS.includes(asTab(lastPage));
  const toTab = TAB_IDS.includes(asTab(page));
  if (lastPage !== null && view.firstElementChild) {
    view.classList.add("is-leaving");
    view.classList.toggle("is-leaving-all", !(fromTab && toTab));
    await sleep(180);
    if (token !== routeToken) return;
  }
  view.classList.remove("is-leaving", "is-leaving-all");
  window.scrollTo(0, 0);

  keepHeader = fromTab && toTab;
  navFrom = fromTab ? TAB_IDS.indexOf(asTab(lastPage)) : Math.max(0, TAB_IDS.indexOf(asTab(page)));
  lastPage = page;

  if (["swipe", "pack"].includes(page)) hideDock();
  if (page === "swipe") cleanup = swipe.renderSwipe(view, go);
  else if (page === "pack") cleanup = swipe.renderPack(view, go);
  else if (page === "library") cleanup = renderLibrary();
  else if (page === "packs") cleanup = renderPacks();
  else if (page === "u") cleanup = renderProfile(decodeURIComponent(location.hash.split("/")[2] ?? ""));
  else if (page === "me") cleanup = renderProfile(store.myId());
  else cleanup = renderBuild();
}

const pageClass = () => `page enter ${keepHeader ? "keep-header" : ""}`;

const dock = document.querySelector("[data-dock]");

function header(active, left) {
  return `<header class="header">${left}</header>`;
}

// Everything you reach for while holding the phone sits at the bottom: the
// page's own controls, and the navigation under them.
function setDock(active, controls = "") {
  dock.hidden = false;
  dock.innerHTML = `
    ${controls ? `<div class="dock-controls">${controls}</div>` : ""}
    <nav class="nav" aria-label="Main" style="--at:${navFrom}" data-nav-to="${TAB_IDS.indexOf(active)}">
      <span class="nav-indicator"></span>
      ${TABS.map((t) => `<a class="nav-item ${t.id === active ? "is-active" : ""}" href="#/${t.id}" aria-label="${t.label}" title="${t.label}" ${t.id === active ? 'aria-current="page"' : ""}>${icon(t.icon)}<span class="nav-label">${t.label}</span></a>`).join("")}
    </nav>`;
  settleNav();
  requestAnimationFrame(() => document.documentElement.style.setProperty("--dock-h", `${dock.offsetHeight}px`));
}

const hideDock = () => { dock.hidden = true; dock.innerHTML = ""; };

// Slide the nav highlight from the last tab to this one.
function settleNav() {
  const nav = dock.querySelector("[data-nav-to]");
  if (!nav) return;
  requestAnimationFrame(() => requestAnimationFrame(() => nav.style.setProperty("--at", nav.dataset.navTo)));
}

const loopSub = (loop, byId) => {
  const tags = loop.tags.map((id) => byId.get(id)?.label).filter(Boolean);
  return [loop.bpm ? `${loop.bpm} BPM` : "", tags.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
};

function syncThumbs(root, s) {
  root.querySelectorAll("[data-play]").forEach((button) => {
    const id = button.dataset.play || button.closest("[data-id]")?.dataset.id;
    const on = s.id === id && s.playing;
    if (button.classList.contains("is-playing") === on) return;
    button.classList.toggle("is-playing", on);
    button.innerHTML = icon(on ? "pause" : "play");
  });
}

/* Sign in ------------------------------------------------------------------------ */

function renderSignIn() {
  cleanup?.();
  cleanup = null;
  hideDock();
  lastPage = null;
  view.classList.remove("is-leaving", "is-leaving-all");
  view.innerHTML = `
    <section class="page enter signin">
      <img class="signin-logo" src="assets/sug-packs-logotype.png" alt="SUG Packs" width="1200" height="199">
      <form class="signin-form" data-signin novalidate>
        <div class="list">
          <div class="row"><div class="row-main row-field"><label for="signin-email">Email</label><input id="signin-email" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false"></div></div>
          <div class="row"><div class="row-main row-field"><label for="signin-password">Password</label><input id="signin-password" name="password" type="password" autocomplete="current-password"></div></div>
        </div>
        <button class="button button--primary button--block" type="submit">Sign in</button>
        <p class="signin-error" data-error hidden></p>
      </form>
    </section>`;

  const form = view.querySelector("[data-signin]");
  const button = form.querySelector("button");
  const message = form.querySelector("[data-error]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.email.value.trim() || !form.password.value) {
      message.textContent = "Enter your email and password.";
      message.hidden = false;
      return;
    }
    button.disabled = true;
    button.textContent = "Signing in…";
    message.hidden = true;
    try {
      await store.signIn(form.email.value, form.password.value);
      await store.init();
      signedIn = true;
      view.classList.add("is-leaving", "is-leaving-all");
      await sleep(180);
      route();
    } catch (error) {
      message.textContent = error.message || "Couldn't sign in.";
      message.hidden = false;
      button.disabled = false;
      button.textContent = "Sign in";
    }
  });
}

/* Build --------------------------------------------------------------------- */

function renderBuild() {
  const loops = store.listLoops();
  const tags = store.listTags();
  const byId = store.tagsById();
  // Placed loops are sold: they never appear in a pack again.
  const tagged = loops.filter((l) => l.tags.length && l.status !== "placed");
  const session = swipe.getSession();
  const resumable = session && !session.takeAll && session.index > 0 && session.index < session.deck.length;

  view.innerHTML = `
    <section class="${pageClass()}">
      ${header("build", '<img class="header-logo" src="assets/sug-packs-logotype.png" alt="SUG Packs" width="1200" height="199">')}
      ${resumable ? `
        <div class="list list--spaced">
          <a class="row row--media" href="#/swipe">
            <span class="thumb" style="${coverStyle(store.getLoop(session.deck[session.index])?.file || session.name)}"></span>
            <div class="row-main"><div class="row-title">Continue swiping</div><div class="row-sub">${esc(session.name)} · ${session.index} of ${session.deck.length}</div></div>
            ${icon("chevron", "row-chevron")}
          </a>
        </div>` : ""}
      ${tagged.length ? `
        <div class="tag-groups" data-groups></div>` : `
        <div class="empty">
          <p>No tagged loops yet.</p>
          <a class="button" href="#/library">Open library</a>
        </div>`}
    </section>`;

  if (!tagged.length) {
    setDock("build");
    return null;
  }

  setDock("build", `
    <div class="search-row">
      <label class="search">${icon("search")}<input type="search" data-query placeholder="Search tags" value="${esc(tagQuery)}" autocomplete="off"></label>
      <button class="text-button" type="button" data-clear style="opacity:0; pointer-events:none">Clear</button>
    </div>`);

  const page = view.querySelector(".page");
  const groupsEl = view.querySelector("[data-groups]");
  const clearButton = dock.querySelector("[data-clear]");
  const current = () => tagged.filter((l) => matches(l, selected, byId));
  let bar = null;
  let lastCount = null;

  // Structure only changes when the search does; taps just update the chips.
  function renderGroups() {
    const q = slug(tagQuery);
    groupsEl.innerHTML = GROUPS.map((group) => {
      const groupTags = tags
        .filter((t) => t.group === group.id && (store.tagUseCount(t.id) || selected.has(t.id)) && (!q || slug(t.label).includes(q)))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (!groupTags.length) return "";
      return `
        <section>
          <h2 class="group-label">${group.label}</h2>
          <div class="chips">${groupTags.map((t) => `<button class="chip" type="button" data-tag="${t.id}">${esc(t.label)}</button>`).join("")}</div>
        </section>`;
    }).join("") || `<p class="empty">${tagQuery ? `No tag called “${esc(tagQuery)}”.` : "No tags yet. Tag a loop in the Library."}</p>`;
    paintState();
  }

  function paintState() {
    groupsEl.querySelectorAll("[data-tag]").forEach((chip) => {
      const id = chip.dataset.tag;
      const group = byId.get(id)?.group;
      const others = [...selected].filter((s) => byId.get(s)?.group !== group);
      const on = selected.has(id);
      const off = !on && !tagged.some((l) => l.tags.includes(id) && matches(l, others, byId));
      chip.classList.toggle("is-on", on);
      chip.classList.toggle("is-off", off);
      chip.setAttribute("aria-pressed", on);
    });
    clearButton.style.opacity = selected.size ? "1" : "0";
    clearButton.style.pointerEvents = selected.size ? "auto" : "none";
    paintBar();
  }

  function paintBar() {
    const count = current().length;
    if (selected.size && !bar) {
      page.insertAdjacentHTML("beforeend", `
        <div class="bar">
          <span class="bar-text"><b data-count></b> <span data-count-word></span></span>
          <button class="button button--small" type="button" data-take-all>Take all</button>
          <button class="button button--small button--primary" type="button" data-start>Swipe</button>
        </div>`);
      bar = page.querySelector(".bar");
      page.classList.add("page--with-bar");
      lastCount = null;
    } else if (!selected.size && bar) {
      const leaving = bar;
      bar = null;
      leaving.classList.add("is-leaving");
      setTimeout(() => leaving.remove(), 260);
      page.classList.remove("page--with-bar");
    }
    if (!bar) return;
    const countEl = bar.querySelector("[data-count]");
    countEl.textContent = count;
    bar.querySelector("[data-count-word]").textContent = count === 1 ? "loop" : "loops";
    if (lastCount !== null && lastCount !== count) {
      countEl.classList.remove("bump");
      void countEl.offsetWidth;
      countEl.classList.add("bump");
    }
    lastCount = count;
    bar.querySelector("[data-start]").disabled = !count;
    bar.querySelector("[data-take-all]").disabled = !count;
  }

  const onClick = (event) => {
    const chip = event.target.closest("[data-tag]");
    if (chip) {
      const id = chip.dataset.tag;
      selected.has(id) ? selected.delete(id) : selected.add(id);
      paintState();
      chip.classList.remove("pop");
      void chip.offsetWidth;
      chip.classList.add("pop");
      return;
    }
    if (event.target.closest("[data-clear]")) { selected.clear(); return paintState(); }
    if (event.target.closest("[data-start]")) {
      swipe.startSession(current().map((l) => l.id), [...selected]);
      return go("#/swipe");
    }
    if (event.target.closest("[data-take-all]")) {
      swipe.startSession(current().map((l) => l.id), [...selected], { takeAll: true });
      return go("#/pack");
    }
  };
  const onInput = (event) => {
    if (!event.target.matches("[data-query]")) return;
    tagQuery = event.target.value;
    renderGroups();
  };
  view.addEventListener("click", onClick);
  view.addEventListener("input", onInput);
  dock.addEventListener("click", onClick);
  dock.addEventListener("input", onInput);
  renderGroups();
  return () => {
    view.removeEventListener("click", onClick);
    view.removeEventListener("input", onInput);
    dock.removeEventListener("click", onClick);
    dock.removeEventListener("input", onInput);
  };
}

/* Library -------------------------------------------------------------------- */

function renderLibrary() {
  view.innerHTML = `
    <section class="${pageClass()}">
      ${header("library", '<div class="header-brand"><img class="header-mark" src="assets/app-mark.png" alt="" width="256" height="227"><h1 class="header-title">Library</h1></div>')}
      <div data-progress></div>
      <div data-results></div>
    </section>`;

  setDock("library", `
    <div class="search-row">
      <label class="search">${icon("search")}<input type="search" data-lib-query placeholder="Search" value="${esc(libraryQuery)}" autocomplete="off"></label>
      <label class="icon-button icon-button--glass" aria-label="Upload" title="Upload">${icon("plus")}<input type="file" accept="audio/*,.mp3,.wav" multiple hidden data-upload></label>
    </div>`);

  const results = view.querySelector("[data-results]");
  let first = true;

  function paint() {
    if (currentPage() !== "library") return; // a sheet closing after you've moved on
    const byId = store.tagsById();
    const all = store.listLoops();
    const untagged = all.filter((l) => !l.tags.length);
    const q = libraryQuery.trim().toLowerCase();
    const shown = all.filter((l) => !q || l.file.toLowerCase().includes(q) || l.tags.some((id) => byId.get(id)?.label.toLowerCase().includes(q)));

    results.innerHTML = `
      ${untagged.length && !q ? `
        <div class="list list--spaced">
          <button class="row" type="button" data-queue>
            <span class="dot"></span>
            <span class="row-main">${untagged.length} need tags</span>
            ${icon("chevron", "row-chevron")}
          </button>
        </div>` : ""}
      ${shown.length ? `<ul class="list ${first ? "stagger" : ""}">${shown.map((loop, i) => `
        <li class="row row--media row--tap ${loop.status === "placed" ? "is-placed" : ""}" data-open="${loop.id}" style="--i:${i}">
          <button class="thumb" type="button" data-play="${loop.id}" aria-label="Play" style="${coverStyle(loop.file)}">${icon("play")}</button>
          <div class="row-main">
            <div class="row-title">${esc(loop.title)}</div>
            <div class="row-sub ${loop.tags.length || loop.status !== "open" ? "" : "row-sub--amber"}">
              ${loop.status === "placed" ? `<span class="state state--placed">${icon("disc")} Placed</span>` : loop.status === "reserved" ? `<span class="state state--reserved">${icon("reserved")} Reserved</span>` : ""}
              ${loop.tags.length ? esc(loopSub(loop, byId)) : `${loop.bpm ? `${loop.bpm} BPM · ` : ""}No tags`}
            </div>
          </div>
        </li>`).join("")}</ul>` : `<p class="empty">${q ? "Nothing found." : "No loops yet. Tap + to upload."}</p>`}`;
    first = false;
    syncThumbs(results, player.state());
  }

  const onClick = (event) => {
    const play = event.target.closest("[data-play]");
    if (play) { player.toggle(store.getLoop(play.dataset.play)); return; }
    if (event.target.closest("[data-queue]")) { openTagger(store.untagged().map((l) => l.id), 0, paint); return; }
    const row = event.target.closest("[data-open]");
    if (row) openTagger([row.dataset.open], 0, paint);
  };
  const onInput = (event) => {
    if (!event.target.matches("[data-lib-query]")) return;
    libraryQuery = event.target.value;
    paint();
  };
  const onChange = async (event) => {
    if (!event.target.matches("[data-upload]")) return;
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length) return;
    const slot = view.querySelector("[data-progress]");
    slot.innerHTML = '<div class="progress progress--full"><i></i></div>';
    const added = await store.addFiles(files, (done, total) => {
      slot.querySelector("i").style.width = `${(done / total) * 100}%`;
    });
    await sleep(250);
    slot.innerHTML = "";
    paint();
    const skipped = added.skipped?.length ?? 0;
    if (added.length) toast(`${plural(added.length, "loop")} added${skipped ? ` · ${skipped} already in the library` : ""}`);
    else if (skipped) toast(`${plural(skipped, "loop")} already in the library`);
    if (added.length) openTagger(added.map((l) => l.id), 0, paint);
  };

  view.addEventListener("click", onClick);
  view.addEventListener("input", onInput);
  view.addEventListener("change", onChange);
  dock.addEventListener("click", onClick);
  dock.addEventListener("input", onInput);
  dock.addEventListener("change", onChange);
  const unsubscribe = player.subscribe((s) => syncThumbs(results, s));
  paint();
  return () => {
    view.removeEventListener("click", onClick);
    view.removeEventListener("input", onInput);
    view.removeEventListener("change", onChange);
    dock.removeEventListener("click", onClick);
    dock.removeEventListener("input", onInput);
    dock.removeEventListener("change", onChange);
    unsubscribe();
  };
}

/* Tag sheet ---------------------------------------------------------------------- */

function openTagger(ids, index = 0, onDone = () => {}) {
  const loop = store.getLoop(ids[index]);
  if (!loop) return;
  const draft = new Set(loop.tags);
  const queue = ids.length > 1;
  const last = index === ids.length - 1;
  const inPacks = store.listPacks().filter((pack) => pack.loopIds.includes(loop.id)).length;
  let adding = null;
  let notice = null;

  const html = `
    <div class="sheet-head">
      <button class="thumb thumb--lg" type="button" data-t-play aria-label="Play" style="${coverStyle(loop.file)}">${icon("play")}</button>
      <div class="row-main">
        <h2 class="sheet-title">${esc(loop.title)}</h2>
        <p class="sheet-sub">${[loop.bpm ? `${loop.bpm} BPM` : "", queue ? `${index + 1} of ${ids.length}` : ""].filter(Boolean).join(" · ")}</p>
      </div>
      <button class="icon-button" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
    </div>
    <div class="sheet-body">
      <div class="tag-groups" data-t-groups></div>
      <p class="list-label">Status</p>
      <div class="list">
        <div class="row row--actions">
          <button class="chip status-chip" type="button" data-status="open">Open</button>
          <button class="chip status-chip" type="button" data-status="reserved">${icon("reserved")} Reserved</button>
          <button class="chip status-chip" type="button" data-status="placed">${icon("disc")} Placed</button>
        </div>
        <div class="row" data-note-row hidden>
          <div class="row-main row-field">
            <label for="status-note" data-note-label>Who has it</label>
            <input id="status-note" data-note value="${esc(loop.statusNote ?? "")}" autocomplete="off">
          </div>
        </div>
      </div>
      <p class="list-label">Details</p>
      <div class="list">
        <label class="row"><span class="row-label">Title</span><input class="row-input" data-f="title" value="${esc(loop.title)}" autocomplete="off"></label>
        <label class="row"><span class="row-label">BPM</span><input class="row-input" data-f="bpm" value="${esc(loop.bpm ?? "")}" inputmode="numeric" placeholder="None" autocomplete="off"></label>
        <label class="row"><span class="row-label">Key</span><input class="row-input" data-f="key" value="${esc(loop.key ?? "")}" placeholder="None" autocomplete="off"></label>
      </div>
      <div class="list" data-del-idle>
        <button class="row" type="button" data-del-open><span class="row-main row-danger">Delete loop</span></button>
      </div>
      <div class="list" data-del-confirm hidden>
        <div class="row">
          <div class="row-main row-field">
            <label for="del-name">Type the file name to delete it${inPacks ? ` · in ${plural(inPacks, "pack")}, their copies stay` : ""}</label>
            <input id="del-name" data-del-input placeholder="${esc(loop.file)}" autocomplete="off" autocapitalize="off" spellcheck="false">
          </div>
        </div>
        <div class="row row--actions">
          <button class="button button--small" type="button" data-del-cancel>Cancel</button>
          <button class="button button--small button--danger" type="button" data-del-go disabled>Delete for good</button>
        </div>
      </div>
    </div>
    <div class="sheet-foot">
      ${queue ? '<button class="button" type="button" data-t-skip>Skip</button>' : ""}
      <button class="button button--primary" type="button" data-t-save>${queue && !last ? "Next" : "Save"}</button>
    </div>`;
  const options = { onClose: () => { player.stop(); onDone(); } };
  const sheet = index > 0 ? replaceSheet(html, options) : openSheet(html, options);

  function paintStatus() {
    const current = store.getLoop(loop.id)?.status ?? loop.status ?? "open";
    loop.status = current;
    sheet.querySelectorAll("[data-status]").forEach((chip) => {
      delete chip.dataset.sure;
      const kind = chip.dataset.status;
      chip.classList.toggle("is-on", kind === current);
      chip.classList.toggle(`is-${kind}`, kind === current);
      chip.innerHTML = kind === "open" ? "Open" : kind === "reserved" ? `${icon("reserved")} Reserved` : `${icon("disc")} Placed`;
    });
    const noteRow = sheet.querySelector("[data-note-row]");
    noteRow.hidden = current === "open";
    sheet.querySelector("[data-note-label]").textContent = current === "placed" ? "Where it landed" : "Who has it";
  }

  function paintGroups() {
    const tags = store.listTags();
    sheet.querySelector("[data-t-groups]").innerHTML = GROUPS.map((group) => `
      <section>
        <h3 class="group-label">${group.label}</h3>
        <div class="chips">
          ${tags.filter((t) => t.group === group.id).sort((a, b) => a.label.localeCompare(b.label)).map((t) => `<button class="chip ${draft.has(t.id) ? "is-on" : ""}" type="button" data-t-tag="${t.id}">${esc(t.label)}</button>`).join("")}
          ${adding === group.id ? `
            <form class="new-tag" data-t-new="${group.id}">
              <input data-t-input placeholder="New tag" autocomplete="off" enterkeyhint="done">
              <button class="button button--primary" type="submit">Add</button>
            </form>
            ${notice ? `
              <div class="notice">
                Looks like “${esc(notice.match.label)}”.
                <div class="notice-actions">
                  <button class="button button--primary" type="button" data-t-use="${notice.match.id}">Use ${esc(notice.match.label)}</button>
                  <button class="button" type="button" data-t-force>Add “${esc(notice.label)}”</button>
                </div>
              </div>` : ""}` : group.fixed ? "" : `<button class="chip chip--add" type="button" data-t-add="${group.id}" aria-label="New ${group.label} tag">${icon("plus")}${tags.some((t) => t.group === group.id) ? "" : " New tag"}</button>`}
        </div>
      </section>`).join("");
    const input = sheet.querySelector("[data-t-input]");
    if (input) {
      if (notice) input.value = notice.label;
      input.focus({ preventScroll: true });
    }
  }

  function addTag(group, label, force = false) {
    const clean = label.trim().replace(/\s+/g, " ");
    if (!clean) return;
    if (!slug(clean)) { toast("Use letters or numbers in a tag"); return; }
    const tags = store.listTags();
    const exact = tags.find((t) => t.group === group && slug(t.label) === slug(clean));
    if (exact) {
      draft.add(exact.id);
    } else {
      const match = !force && lookalike(clean, tags);
      if (match) { notice = { label: clean, match }; return paintGroups(); }
      draft.add(store.addTag(group, clean).id);
    }
    adding = null;
    notice = null;
    paintGroups();
  }

  sheet.addEventListener("click", async (event) => {
    const chip = event.target.closest("[data-t-tag]");
    if (chip) {
      const id = chip.dataset.tTag;
      draft.has(id) ? draft.delete(id) : draft.add(id);
      chip.classList.toggle("is-on", draft.has(id));
      chip.classList.remove("pop");
      void chip.offsetWidth;
      chip.classList.add("pop");
      return;
    }
    const add = event.target.closest("[data-t-add]");
    if (add) { adding = add.dataset.tAdd; notice = null; return paintGroups(); }
    const use = event.target.closest("[data-t-use]");
    if (use) { draft.add(use.dataset.tUse); adding = null; notice = null; return paintGroups(); }
    if (event.target.closest("[data-t-force]")) return addTag(adding, notice.label, true);
    const status = event.target.closest("[data-status]");
    if (status) {
      const next = status.dataset.status;
      if (next === loop.status) return;
      // Placing is the one that changes other things, so it asks twice.
      if (next === "placed" && !status.dataset.sure) {
        const packs = store.listPacks().filter((pack) => pack.loopIds.includes(loop.id)).length;
        status.dataset.sure = "1";
        status.textContent = packs ? `Tap again · leaves ${plural(packs, "pack")}` : "Tap again to place";
        setTimeout(() => { if (status.dataset.sure) { delete status.dataset.sure; paintStatus(); } }, 4000);
        return;
      }
      try {
        const pulled = await store.setLoopStatus(loop.id, next, sheet.querySelector("[data-note]").value.trim() || null);
        loop.status = next;
        paintStatus();
        toast(next === "placed"
          ? `Placed${pulled ? ` · pulled from ${plural(pulled, "pack")}` : ""}`
          : next === "reserved" ? "Reserved" : "Open again");
        onDone();
      } catch (error) {
        paintStatus();
        toast(error.message || "Couldn't change that");
      }
      return;
    }
    if (event.target.closest("[data-del-open]")) {
      sheet.querySelector("[data-del-idle]").hidden = true;
      sheet.querySelector("[data-del-confirm]").hidden = false;
      sheet.querySelector("[data-del-input]").focus({ preventScroll: true });
      return;
    }
    if (event.target.closest("[data-del-cancel]")) {
      sheet.querySelector("[data-del-confirm]").hidden = true;
      sheet.querySelector("[data-del-idle]").hidden = false;
      sheet.querySelector("[data-del-input]").value = "";
      return;
    }
    const go = event.target.closest("[data-del-go]");
    if (go) {
      go.disabled = true;
      go.textContent = "Deleting…";
      try {
        await store.deleteLoop(loop.id);
        unsubscribe();
        closeSheet();
        toast("Loop deleted");
        onDone();
      } catch (error) {
        go.disabled = false;
        go.textContent = "Delete for good";
        toast(error.message || "Couldn't delete it");
      }
      return;
    }
    if (event.target.closest("[data-t-play]")) return player.toggle(loop);
    if (event.target.closest("[data-t-skip]")) return next();
    if (event.target.closest("[data-t-save]")) return save();
  });
  sheet.addEventListener("change", async (event) => {
    if (!event.target.matches("[data-note]")) return;
    if ((store.getLoop(loop.id)?.status ?? "open") === "open") return;
    try {
      await store.setLoopStatus(loop.id, loop.status, event.target.value.trim() || null);
      onDone();
    } catch (error) {
      toast(error.message || "Couldn't save that");
    }
  });

  sheet.addEventListener("input", (event) => {
    if (!event.target.matches("[data-del-input]")) return;
    const typed = event.target.value.trim().toLowerCase();
    sheet.querySelector("[data-del-go]").disabled = typed !== loop.file.toLowerCase();
  });

  sheet.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target.closest("[data-t-new]");
    notice = null;
    addTag(form.dataset.tNew, form.querySelector("input").value);
  });

  const unsubscribe = player.subscribe((s) => {
    if (!sheet.isConnected) return unsubscribe();
    const button = sheet.querySelector("[data-t-play]");
    const on = s.id === loop.id && s.playing;
    if (button.classList.contains("is-playing") === on) return;
    button.classList.toggle("is-playing", on);
    button.innerHTML = icon(on ? "pause" : "play");
  });

  function save() {
    const value = (name) => sheet.querySelector(`[data-f="${name}"]`).value.trim();
    const bpm = parseInt(value("bpm"), 10);
    store.updateLoop(loop.id, { title: value("title") || loop.title, bpm: Number.isFinite(bpm) ? bpm : null, key: value("key") || null, tags: [...draft] });
    if (!queue || last) toast("Saved");
    next();
  }

  function next() {
    unsubscribe();
    if (queue && !last) {
      onDone();
      openTagger(ids, index + 1, onDone);
    } else {
      closeSheet();
    }
  }

  paintGroups();
  paintStatus();
  player.play(loop);
}

/* Packs: the stash ------------------------------------------------------------- */

let packFilter = "all";
let packSort = "recent";
let packQuery = "";

const SORTS = { recent: "Recent", used: "Most sent", name: "A–Z" };

// A short name like "12" stays whole; longer ones show their first letter.
const initials = (name = "") => {
  const clean = String(name).trim();
  return (clean.length <= 2 ? clean : clean[0]).toUpperCase() || "?";
};

const avatarHtml = (person, cls = "") => `<span class="avatar ${cls}">${person?.avatar
  ? `<img src="${esc(person.avatar)}" alt="">`
  : esc(initials(person?.name))}</span>`;

const packSub = (pack) => [
  plural(pack.loopIds.length, "loop"),
  esc(pack.createdBy),
  ago(pack.createdAt),
  pack.uses ? `sent ${pack.uses}×` : "",
].filter(Boolean).join(" · ");

const packRow = (pack, i) => `
  <li class="row row--media row--tap" data-pack="${pack.id}" style="--i:${i}">
    <span class="thumb" style="${coverStyle(pack.name)}"></span>
    <div class="row-main">
      <div class="row-title">${esc(pack.name)}</div>
      <div class="row-sub">${packSub(pack)}</div>
    </div>
    <button class="icon-button star ${store.isFavorite(pack.id) ? "is-on" : ""}" type="button" data-fav="${pack.id}" aria-label="Favourite">${icon("star")}</button>
  </li>`;

function sortPacks(list) {
  return [...list].sort((a, b) =>
    packSort === "used" ? b.uses - a.uses || b.lastUsedAt - a.lastUsedAt
      : packSort === "name" ? a.name.localeCompare(b.name)
        : b.createdAt - a.createdAt);
}

// Search finds a pack by its own name or by a loop inside it, for
// "which pack had that guitar thing in it?".
function matchesQuery(pack, q) {
  if (!q) return true;
  if (pack.name.toLowerCase().includes(q)) return true;
  return pack.loopIds.some((id) => store.getLoop(id)?.file.toLowerCase().includes(q));
}

function renderPacks() {
  view.innerHTML = `
    <section class="${pageClass()}">
      ${header("packs", '<div class="header-brand"><img class="header-mark" src="assets/app-mark.png" alt="" width="256" height="227"><h1 class="header-title">Packs</h1></div>')}
      <div data-list></div>
    </section>`;

  setDock("packs", `
    <div class="search-row">
      <label class="search">${icon("search")}<input type="search" data-pack-query placeholder="Search packs and loops" value="${esc(packQuery)}" autocomplete="off"></label>
    </div>
    <div class="filters">
      <button class="chip" type="button" data-filter="all">All</button>
      <button class="chip" type="button" data-filter="mine">Mine</button>
      <button class="chip" type="button" data-filter="fav">${icon("star")} Favourites</button>
      <button class="chip chip--sort" type="button" data-sort>${icon("sort")} <span data-sort-label></span></button>
    </div>`);

  const listEl = view.querySelector("[data-list]");
  let first = true;

  function paint() {
    if (currentPage() !== "packs") return;
    const q = packQuery.trim().toLowerCase();
    const all = store.listPacks();
    const mine = store.myId();
    const shown = sortPacks(all.filter((pack) => matchesQuery(pack, q)
      && (packFilter === "all" || (packFilter === "mine" ? pack.by === mine : store.isFavorite(pack.id)))));

    dock.querySelectorAll("[data-filter]").forEach((chip) => chip.classList.toggle("is-on", chip.dataset.filter === packFilter));
    dock.querySelector("[data-sort-label]").textContent = SORTS[packSort];

    listEl.innerHTML = shown.length
      ? `<ul class="list ${first ? "stagger" : ""}">${shown.map(packRow).join("")}</ul>`
      : `<p class="empty">${q ? "Nothing found." : packFilter === "fav" ? "No favourites yet. Tap a star." : "No packs yet."}</p>`;

    first = false;
  }

  const onClick = async (event) => {
    const fav = event.target.closest("[data-fav]");
    if (fav) {
      event.stopPropagation();
      const on = await store.toggleFavorite(fav.dataset.fav);
      fav.classList.toggle("is-on", on);
      fav.classList.remove("pop");
      void fav.offsetWidth;
      fav.classList.add("pop");
      if (packFilter === "fav") paint();
      return;
    }
    const filter = event.target.closest("[data-filter]");
    if (filter) { packFilter = filter.dataset.filter; return paint(); }
    if (event.target.closest("[data-sort]")) {
      const order = Object.keys(SORTS);
      packSort = order[(order.indexOf(packSort) + 1) % order.length];
      return paint();
    }
    const row = event.target.closest("[data-pack]");
    if (row) openPackSheet(row.dataset.pack, paint);
  };
  const onInput = (event) => {
    if (!event.target.matches("[data-pack-query]")) return;
    packQuery = event.target.value;
    paint();
  };
  view.addEventListener("click", onClick);
  view.addEventListener("input", onInput);
  dock.addEventListener("click", onClick);
  dock.addEventListener("input", onInput);
  paint();
  return () => {
    view.removeEventListener("click", onClick);
    view.removeEventListener("input", onInput);
    dock.removeEventListener("click", onClick);
    dock.removeEventListener("input", onInput);
  };
}

/* One pack: files, link, rename, delete ------------------------------------------ */

function openPackSheet(packId, onChange = () => {}) {
  const pack = store.listPacks().find((p) => p.id === packId);
  if (!pack) return;
  let confirming = false;

  const sheet = openSheet(`
    <div class="sheet-head">
      <span class="thumb thumb--lg" style="${coverStyle(pack.name)}"></span>
      <div class="row-main">
        <h2 class="sheet-title">${esc(pack.name)}</h2>
        <p class="sheet-sub">${packSub(pack)}${pack.lastUsedAt ? ` · last ${ago(pack.lastUsedAt)}` : ""}</p>
      </div>
      <button class="icon-button" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
    </div>
    <div class="sheet-body">
      <div class="list">
        <div class="row"><div class="row-main row-field"><label for="pack-rename">Name</label><input id="pack-rename" data-rename value="${esc(pack.name)}" autocomplete="off"></div></div>
        <button class="row" type="button" data-fav-row>
          <span class="row-main">${store.isFavorite(pack.id) ? "Remove from favourites" : "Add to favourites"}</span>
          ${icon("star", store.isFavorite(pack.id) ? "row-star is-on" : "row-star")}
        </button>
      </div>
      <p class="list-label">Files</p>
      <ul class="list">${pack.loopIds.map((id) => store.getLoop(id)).filter(Boolean).map((loop) => `
        <li class="row row--media">
          <span class="thumb thumb--sm" style="${coverStyle(loop.file)}"></span>
          <div class="row-main"><div class="row-title">${esc(packName(loop.file, pack))}</div></div>
        </li>`).join("") || '<li class="row"><div class="row-main row-sub">Those loops are gone from the library.</div></li>'}
      </ul>
      <div class="list">
        <button class="row" type="button" data-delete><span class="row-main row-danger" data-delete-label>Delete pack</span></button>
      </div>
    </div>
    <div class="sheet-foot">
      <button class="button" type="button" data-open>${icon("open")} Open</button>
      <button class="button button--primary" type="button" data-copy>${icon("link")} Copy link</button>
    </div>`, { onClose: onChange });

  const rename = sheet.querySelector("[data-rename]");
  rename.addEventListener("change", async () => {
    const name = rename.value.trim();
    if (!name || name === pack.name) return;
    try {
      const fresh = await store.renamePack(pack.id, name);
      sheet.querySelector(".sheet-title").textContent = fresh?.name ?? name;
      toast("Renamed");
      onChange();
    } catch (error) {
      rename.value = pack.name;
      toast(error.message || "Couldn't rename it");
    }
  });

  sheet.querySelector("[data-fav-row]").addEventListener("click", async (event) => {
    const on = await store.toggleFavorite(pack.id);
    event.currentTarget.querySelector(".row-main").textContent = on ? "Remove from favourites" : "Add to favourites";
    event.currentTarget.querySelector(".row-star").classList.toggle("is-on", on);
    onChange();
  });

  sheet.querySelector("[data-copy]").addEventListener("click", async () => {
    if (!pack.link) return toast("This pack has no link");
    await copyText(pack.link);
    await store.notePackUse(pack.id);
    toast("Link copied");
    onChange();
  });

  sheet.querySelector("[data-open]").addEventListener("click", () => {
    if (!pack.link) return toast("This pack has no link");
    window.open(pack.link, "_blank", "noopener");
  });

  sheet.querySelector("[data-delete]").addEventListener("click", async (event) => {
    const label = event.currentTarget.querySelector("[data-delete-label]");
    if (!confirming) {
      confirming = true;
      label.textContent = "Tap again to delete this pack and its Dropbox folder";
      setTimeout(() => { if (confirming) { confirming = false; label.textContent = "Delete pack"; } }, 4000);
      return;
    }
    label.textContent = "Deleting…";
    try {
      await store.deletePack(pack.id);
      closeSheet();
      toast("Pack deleted");
      onChange();
    } catch (error) {
      confirming = false;
      label.textContent = "Delete pack";
      toast(error.message || "Couldn't delete it");
    }
  });
}

/* Profile ------------------------------------------------------------------------ */

// Picking a picture: choose a photo, zoom and drag it inside the circle, save.
// The saved picture is a 320px square JPEG, small enough to live in the database.
const FRAME = 260;

function openPicture(person, onDone = () => {}) {
  let image = null;   // the chosen photo, once loaded
  let zoom = 1;
  let x = 0;
  let y = 0;

  const sheet = openSheet(`
    <div class="sheet-head">
      <div class="row-main"><h2 class="sheet-title">Your picture</h2><p class="sheet-sub">Shown on your loops and packs</p></div>
      <button class="icon-button" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
    </div>
    <div class="sheet-body">
      <div class="picture">
        <div class="picture-frame" data-frame>
          ${person.avatar ? `<img src="${esc(person.avatar)}" alt="" data-current>` : `<span class="picture-empty">${icon("camera")}</span>`}
          <canvas data-canvas hidden></canvas>
        </div>
        <label class="picture-zoom" hidden data-zoom-row>
          <input type="range" min="1" max="3" step="0.01" value="1" data-zoom>
        </label>
        <p class="picture-hint" data-hint>${person.avatar ? "" : "Any photo works: you can zoom and move it after picking."}</p>
      </div>
      <div class="list">
        <label class="row row--tap">
          <span class="row-main">${person.avatar ? "Choose a different photo" : "Choose a photo"}</span>
          ${icon("camera", "row-chevron")}
          <input type="file" accept="image/*" hidden data-file>
        </label>
        ${person.avatar ? '<button class="row" type="button" data-remove><span class="row-main row-danger">Remove picture</span></button>' : ""}
      </div>
    </div>
    <div class="sheet-foot">
      <button class="button" type="button" data-sheet-close>Cancel</button>
      <button class="button button--primary" type="button" data-save disabled>Save</button>
    </div>`);

  const frame = sheet.querySelector("[data-frame]");
  const canvas = sheet.querySelector("[data-canvas]");
  const saveButton = sheet.querySelector("[data-save]");

  // Draw what the circle shows: the photo, covering the frame, moved and zoomed.
  function draw() {
    if (!image) return;
    const base = FRAME / Math.min(image.width, image.height);
    const scale = base * zoom;
    const w = image.width * scale;
    const h = image.height * scale;
    const limitX = Math.max(0, (w - FRAME) / 2);
    const limitY = Math.max(0, (h - FRAME) / 2);
    x = Math.max(-limitX, Math.min(limitX, x));
    y = Math.max(-limitY, Math.min(limitY, y));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = FRAME * ratio;
    canvas.height = FRAME * ratio;
    canvas.style.width = canvas.style.height = `${FRAME}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, FRAME, FRAME);
    ctx.drawImage(image, FRAME / 2 - w / 2 + x, FRAME / 2 - h / 2 + y, w, h);
  }

  sheet.addEventListener("change", async (event) => {
    if (!event.target.matches("[data-file]")) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      image = await createImageBitmap(file);
      zoom = 1;
      x = 0;
      y = 0;
      sheet.querySelector("[data-current]")?.remove();
      sheet.querySelector(".picture-empty")?.remove();
      canvas.hidden = false;
      sheet.querySelector("[data-zoom-row]").hidden = false;
      sheet.querySelector("[data-hint]").textContent = "Drag to move, slide to zoom.";
      saveButton.disabled = false;
      draw();
    } catch {
      toast("That picture didn't open");
    }
  });

  sheet.addEventListener("input", (event) => {
    if (!event.target.matches("[data-zoom]")) return;
    zoom = Number(event.target.value);
    draw();
  });

  // Drag inside the circle.
  let dragging = false;
  let fromX = 0;
  let fromY = 0;
  frame.addEventListener("pointerdown", (event) => {
    if (!image) return;
    dragging = true;
    fromX = event.clientX - x;
    fromY = event.clientY - y;
    frame.setPointerCapture(event.pointerId);
  });
  frame.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    x = event.clientX - fromX;
    y = event.clientY - fromY;
    draw();
  });
  const stop = () => { dragging = false; };
  frame.addEventListener("pointerup", stop);
  frame.addEventListener("pointercancel", stop);

  sheet.addEventListener("click", async (event) => {
    if (event.target.closest("[data-remove]")) {
      await store.setAvatar(null);
      closeSheet();
      toast("Picture removed");
      return onDone();
    }
    if (!event.target.closest("[data-save]") || !image) return;
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      const out = document.createElement("canvas");
      out.width = out.height = 320;
      const k = 320 / FRAME;
      const base = FRAME / Math.min(image.width, image.height);
      const scale = base * zoom;
      const w = image.width * scale;
      const h = image.height * scale;
      out.getContext("2d").drawImage(image, (FRAME / 2 - w / 2 + x) * k, (FRAME / 2 - h / 2 + y) * k, w * k, h * k);
      await store.setAvatar(out.toDataURL("image/jpeg", 0.85));
      closeSheet();
      toast("Picture saved");
      onDone();
    } catch (error) {
      saveButton.disabled = false;
      saveButton.textContent = "Save";
      toast(error.message || "Couldn't save that picture");
    }
  });
}

function renderProfile(id) {
  const person = store.people().find((p) => p.id === id) ?? store.profileOf(id);
  if (!person) { go("#/packs"); return null; }
  const own = id === store.myId();
  const theirs = store.listPacks().filter((pack) => pack.by === id);
  const pinned = store.favoritesOf(id);

  const others = store.people().filter((p) => p.id !== id);

  view.innerHTML = `
    <section class="${pageClass()}">
      ${header("me", own
        ? `<div class="header-brand"><img class="header-mark" src="assets/app-mark.png" alt="" width="256" height="227"><h1 class="header-title">You</h1></div>`
        : `<div class="header-back"><a class="icon-button" href="#/me" aria-label="Back">${icon("back")}</a><h1 class="header-title">${esc(person.name)}</h1></div>`)}
      <div class="profile">
        ${own ? `
          <button class="avatar-button" type="button" data-avatar aria-label="${person.avatar ? "Edit picture" : "Add a picture"}">
            ${avatarHtml(person, "avatar--xl")}
            <span class="avatar-edit">${icon(person.avatar ? "pencil" : "camera")}</span>
          </button>` : avatarHtml(person, "avatar--xl")}
        <h2 class="profile-name">${esc(person.name)}</h2>
        <div class="stats">
          <div class="stat"><b>${person.packs ?? theirs.length}</b><span>packs</span></div>
          <div class="stat"><b>${person.loops ?? 0}</b><span>loops</span></div>
          <div class="stat"><b>${person.uses ?? 0}</b><span>sent</span></div>
        </div>
      </div>
      ${pinned.length ? `<p class="list-label">${own ? "Your favourites" : "Favourites"}</p><ul class="list">${sortPacks(pinned).map(packRow).join("")}</ul>` : ""}
      <p class="list-label">${own ? "Your packs" : "Packs"}</p>
      ${theirs.length ? `<ul class="list">${sortPacks(theirs).map(packRow).join("")}</ul>` : '<p class="empty">No packs yet.</p>'}
      ${own && others.length ? `
        <p class="list-label">People</p>
        <div class="list">
          ${others.map((other) => `
            <a class="row row--media" href="#/u/${encodeURIComponent(other.id)}">
              ${avatarHtml(other)}
              <div class="row-main">
                <div class="row-title">${esc(other.name)}</div>
                <div class="row-sub">${plural(other.packs, "pack")} · ${plural(other.loops, "loop")}</div>
              </div>
              ${icon("chevron", "row-chevron")}
            </a>`).join("")}
        </div>` : ""}
      ${own ? `
        <p class="list-label">Account</p>
        <div class="list">
          <div class="row"><div class="row-main row-field"><label for="profile-name">Name on loops and packs</label><input id="profile-name" data-name value="${esc(person.name)}" autocomplete="off"></div></div>
          <button class="row" type="button" data-signout><span class="row-main row-danger">Sign out</span></button>
        </div>` : ""}
    </section>`;

  setDock("me");
  const refresh = () => renderProfile(id);

  const onClick = async (event) => {
    const fav = event.target.closest("[data-fav]");
    if (fav) {
      event.stopPropagation();
      await store.toggleFavorite(fav.dataset.fav);
      return refresh();
    }
    const row = event.target.closest("[data-pack]");
    if (row) return openPackSheet(row.dataset.pack, refresh);
    if (event.target.closest("[data-avatar]")) return openPicture(person, refresh);
    if (event.target.closest("[data-signout]")) {
      await store.signOut();
      signedIn = false;
      swipe.endSession();
      selected.clear();
      renderSignIn();
    }
  };
  const onChange = async (event) => {
    if (event.target.matches("[data-name]")) {
      const value = event.target.value.trim();
      if (!value || value === person.name) return;
      try {
        await store.setName(value);
        toast("Name saved");
        refresh();
      } catch (error) {
        toast(error.message || "Couldn't save the name");
      }
    }
  };
  view.addEventListener("click", onClick);
  view.addEventListener("change", onChange);
  return () => {
    view.removeEventListener("click", onClick);
    view.removeEventListener("change", onChange);
  };
}

/* Start: the logo holds until the app is ready, then hands over. --------------------- */

history.scrollRestoration = "manual";
window.addEventListener("hashchange", route);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSheet(); });
store.setErrorHandler((error) => toast(error?.message || "Something went wrong"));

// Back in the app after a while: pick up what the other person added meanwhile.
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !store.live || !signedIn) return;
  const changed = await store.refresh({ ifOlderThan: 60_000 }).catch(() => false);
  if (changed && TAB_IDS.includes(currentPage()) && document.querySelector("[data-sheet]").hidden) route();
});

async function boot() {
  try {
    signedIn = Boolean(await store.session());
    if (signedIn) await store.init();
  } catch (error) {
    signedIn = false;
    toast(error?.message || "Couldn't load the library");
  }
}

const splash = document.querySelector("[data-splash]");
const started = performance.now();
await Promise.all([
  boot(),
  document.fonts?.ready.catch(() => {}),
  splash?.querySelector("img")?.decode?.().catch(() => {}),
]);
await sleep(Math.max(0, 1400 - (performance.now() - started)));
splash?.classList.add("is-out");
await sleep(240);
route();
setTimeout(() => splash?.remove(), 1000);

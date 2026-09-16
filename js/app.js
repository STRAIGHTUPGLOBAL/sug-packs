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

  const fromTab = TAB_IDS.includes(lastPage);
  const toTab = TAB_IDS.includes(page);
  if (lastPage !== null && view.firstElementChild) {
    view.classList.add("is-leaving");
    view.classList.toggle("is-leaving-all", !(fromTab && toTab));
    await sleep(180);
    if (token !== routeToken) return;
  }
  view.classList.remove("is-leaving", "is-leaving-all");
  window.scrollTo(0, 0);

  keepHeader = fromTab && toTab;
  navFrom = fromTab ? TAB_IDS.indexOf(lastPage) : Math.max(0, TAB_IDS.indexOf(page));
  lastPage = page;

  if (page === "swipe") cleanup = swipe.renderSwipe(view, go);
  else if (page === "pack") cleanup = swipe.renderPack(view, go);
  else if (page === "library") cleanup = renderLibrary();
  else if (page === "packs") cleanup = renderPacks();
  else cleanup = renderBuild();
  settleNav();
}

const pageClass = () => `page enter ${keepHeader ? "keep-header" : ""}`;

function header(active, left) {
  return `
    <header class="header">
      ${left}
      <nav class="nav" aria-label="Main" style="--at:${navFrom}" data-nav-to="${TAB_IDS.indexOf(active)}">
        <span class="nav-indicator"></span>
        ${TABS.map((t) => `<a class="nav-item ${t.id === active ? "is-active" : ""}" href="#/${t.id}" aria-label="${t.label}" title="${t.label}" ${t.id === active ? 'aria-current="page"' : ""}>${icon(t.icon)}</a>`).join("")}
      </nav>
    </header>`;
}

// Slide the nav highlight from the last tab to this one.
function settleNav() {
  const nav = view.querySelector("[data-nav-to]");
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
  const tagged = loops.filter((l) => l.tags.length);
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
        <div class="search-row">
          <label class="search">${icon("search")}<input type="search" data-query placeholder="Search tags" value="${esc(tagQuery)}" autocomplete="off"></label>
          <button class="text-button" type="button" data-clear style="opacity:0; pointer-events:none">Clear</button>
        </div>
        <div class="tag-groups" data-groups></div>` : `
        <div class="empty">
          <p>No tagged loops yet.</p>
          <a class="button" href="#/library">Open library</a>
        </div>`}
    </section>`;

  if (!tagged.length) return null;

  const page = view.querySelector(".page");
  const groupsEl = view.querySelector("[data-groups]");
  const clearButton = view.querySelector("[data-clear]");
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
    }).join("") || `<p class="empty">No tag called “${esc(tagQuery)}”.</p>`;
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
  renderGroups();
  return () => {
    view.removeEventListener("click", onClick);
    view.removeEventListener("input", onInput);
  };
}

/* Library -------------------------------------------------------------------- */

function renderLibrary() {
  view.innerHTML = `
    <section class="${pageClass()}">
      ${header("library", '<h1 class="header-title">Library</h1>')}
      <div class="search-row">
        <label class="search">${icon("search")}<input type="search" data-lib-query placeholder="Search" value="${esc(libraryQuery)}" autocomplete="off"></label>
        <label class="icon-button icon-button--glass" aria-label="Upload" title="Upload">${icon("plus")}<input type="file" accept="audio/*,.mp3,.wav" multiple hidden data-upload></label>
      </div>
      <div data-progress></div>
      <div data-results></div>
    </section>`;

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
        <li class="row row--media row--tap" data-open="${loop.id}" style="--i:${i}">
          <button class="thumb" type="button" data-play="${loop.id}" aria-label="Play" style="${coverStyle(loop.file)}">${icon("play")}</button>
          <div class="row-main">
            <div class="row-title">${esc(loop.title)}</div>
            <div class="row-sub ${loop.tags.length ? "" : "row-sub--amber"}">${loop.tags.length ? esc(loopSub(loop, byId)) : `${loop.bpm ? `${loop.bpm} BPM · ` : ""}No tags`}</div>
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
  const unsubscribe = player.subscribe((s) => syncThumbs(results, s));
  paint();
  return () => {
    view.removeEventListener("click", onClick);
    view.removeEventListener("input", onInput);
    view.removeEventListener("change", onChange);
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
      <p class="list-label">Details</p>
      <div class="list">
        <label class="row"><span class="row-label">Title</span><input class="row-input" data-f="title" value="${esc(loop.title)}" autocomplete="off"></label>
        <label class="row"><span class="row-label">BPM</span><input class="row-input" data-f="bpm" value="${esc(loop.bpm ?? "")}" inputmode="numeric" placeholder="None" autocomplete="off"></label>
        <label class="row"><span class="row-label">Key</span><input class="row-input" data-f="key" value="${esc(loop.key ?? "")}" placeholder="None" autocomplete="off"></label>
      </div>
    </div>
    <div class="sheet-foot">
      ${queue ? '<button class="button" type="button" data-t-skip>Skip</button>' : ""}
      <button class="button button--primary" type="button" data-t-save>${queue && !last ? "Next" : "Save"}</button>
    </div>`;
  const options = { onClose: () => { player.stop(); onDone(); } };
  const sheet = index > 0 ? replaceSheet(html, options) : openSheet(html, options);

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
              </div>` : ""}` : `<button class="chip chip--add" type="button" data-t-add="${group.id}" aria-label="New ${group.label} tag">${icon("plus")}</button>`}
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

  sheet.addEventListener("click", (event) => {
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
    if (event.target.closest("[data-t-play]")) return player.toggle(loop);
    if (event.target.closest("[data-t-skip]")) return next();
    if (event.target.closest("[data-t-save]")) return save();
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
  player.play(loop);
}

/* Packs ------------------------------------------------------------------------ */

function renderPacks() {
  const packs = store.listPacks();
  view.innerHTML = `
    <section class="${pageClass()}">
      ${header("packs", '<h1 class="header-title">Packs</h1>')}
      ${packs.length ? `<ul class="list stagger">${packs.map((pack, i) => `
        <li class="row row--media row--tap" data-pack="${pack.id}" style="--i:${i}">
          <span class="thumb" style="${coverStyle(pack.name)}"></span>
          <div class="row-main">
            <div class="row-title">${esc(pack.name)}</div>
            <div class="row-sub">${plural(pack.loopIds.length, "loop")} · ${esc(pack.createdBy)} · ${ago(pack.createdAt)}</div>
          </div>
          <button class="icon-button" type="button" data-copy="${pack.id}" aria-label="Copy link" title="Copy link">${icon("link")}</button>
        </li>`).join("")}</ul>` : '<p class="empty">No packs yet.</p>'}
      <div>
        <p class="list-label">Account</p>
        <div class="list">
          <button class="row" type="button" data-account>
            <span class="row-main">${esc(store.currentUser())}</span>
            ${icon("chevron", "row-chevron")}
          </button>
        </div>
      </div>
    </section>`;

  const copy = async (pack) => {
    if (!pack.link) return toast("This pack has no link");
    await copyText(pack.link);
    toast("Link copied");
  };

  const onClick = (event) => {
    const copyButton = event.target.closest("[data-copy]");
    if (copyButton) return copy(packs.find((p) => p.id === copyButton.dataset.copy));
    if (event.target.closest("[data-account]")) return openAccount();
    const row = event.target.closest("[data-pack]");
    if (!row) return;
    const pack = packs.find((p) => p.id === row.dataset.pack);
    const sheet = openSheet(`
      <div class="sheet-head">
        <span class="thumb thumb--lg" style="${coverStyle(pack.name)}"></span>
        <div class="row-main">
          <h2 class="sheet-title">${esc(pack.name)}</h2>
          <p class="sheet-sub">${plural(pack.loopIds.length, "loop")} · ${esc(pack.createdBy)} · ${ago(pack.createdAt)}</p>
        </div>
        <button class="icon-button" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
      </div>
      <div class="sheet-body">
        <ul class="list">${pack.loopIds.map((id) => store.getLoop(id)).filter(Boolean).map((loop) => `
          <li class="row row--media">
            <span class="thumb thumb--sm" style="${coverStyle(loop.file)}"></span>
            <div class="row-main"><div class="row-title">${esc(packName(loop.file, pack))}</div></div>
          </li>`).join("")}
        </ul>
      </div>
      <div class="sheet-foot"><button class="button button--primary" type="button" data-sheet-copy>${icon("link")} Copy link</button></div>`);
    sheet.querySelector("[data-sheet-copy]").addEventListener("click", () => copy(pack));
  };
  view.addEventListener("click", onClick);
  return () => view.removeEventListener("click", onClick);
}

function openAccount() {
  if (store.live) {
    const sheet = openSheet(`
      <div class="sheet-head">
        <div class="row-main"><h2 class="sheet-title">${esc(store.currentUser())}</h2><p class="sheet-sub">Signed in on this device</p></div>
        <button class="icon-button" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
      </div>
      <div class="sheet-body">
        <div class="list">
          <button class="row" type="button" data-signout><span class="row-main row-danger">Sign out</span></button>
        </div>
      </div>`);
    sheet.querySelector("[data-signout]").addEventListener("click", async () => {
      await store.signOut();
      signedIn = false;
      swipe.endSession();
      selected.clear();
      closeSheet();
      renderSignIn();
    });
    return;
  }

  const sheet = openSheet(`
    <div class="sheet-head">
      <div class="row-main"><h2 class="sheet-title">Account</h2><p class="sheet-sub">Demo · data stays in this browser</p></div>
      <button class="icon-button" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
    </div>
    <div class="sheet-body">
      <div class="list">
        ${store.users().map((u) => `
          <button class="row" type="button" data-user="${u}">
            <span class="row-main">${esc(u)}</span>
            ${u === store.currentUser() ? icon("check", "row-check") : ""}
          </button>`).join("")}
      </div>
      <div class="list">
        <button class="row" type="button" data-reset><span class="row-main row-danger">Reset demo</span></button>
      </div>
    </div>`);
  sheet.addEventListener("click", async (event) => {
    const user = event.target.closest("[data-user]");
    if (user) {
      store.setUser(user.dataset.user);
      closeSheet();
      return route();
    }
    if (event.target.closest("[data-reset]")) {
      await store.reset();
      swipe.endSession();
      selected.clear();
      closeSheet();
      toast("Demo reset");
      go("#/build");
    }
  });
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

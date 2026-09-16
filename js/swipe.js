// Swipe through matching loops, then name, clean and create the pack.

import { coverStyle } from "./cover.js";
import * as player from "./player.js";
import * as store from "./data.js";
import { tokens } from "./names.js";
import { GROUPS } from "./tags.js";
import { copyText, esc, icon, toast } from "./ui.js";

const KEY = "sugpacks-session";
let session = null;
let unlocked = false; // phones need one tap before sound; after that each card plays on its own

try { session = JSON.parse(localStorage.getItem(KEY)); } catch { session = null; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* ignore */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const getSession = () => session;

export function startSession(loopIds, tagIds, { takeAll = false } = {}) {
  const tags = store.tagsById();
  const labels = tagIds.map((id) => tags.get(id)?.label).filter(Boolean);
  session = {
    tagIds,
    deck: loopIds,
    index: takeAll ? loopIds.length : 0,
    kept: takeAll ? [...loopIds] : [],
    history: [],
    name: labels.length ? `${labels.slice(0, 3).join(" ")} Loops` : "Loops",
    removeSug: false,
    removeCollabs: false,
    takeAll,
  };
  save();
}

export function endSession() {
  session = null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

const meta = (loop) => [loop.bpm ? `${loop.bpm} BPM` : "", loop.key || "", loop.collabs.join(" ")].filter(Boolean).join(" · ");

function orderedTags(loop) {
  const byId = store.tagsById();
  const order = GROUPS.map((g) => g.id);
  return loop.tags
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/* Swipe ---------------------------------------------------------------------- */

export function renderSwipe(view, go) {
  if (!session?.deck?.length) return go("#/build");
  if (session.index >= session.deck.length) return go("#/pack");

  view.innerHTML = `
    <section class="swipe enter">
      <header class="swipe-top">
        <a class="icon-button" href="#/build" aria-label="Close">${icon("x")}</a>
        <span class="swipe-count" data-count></span>
        <button class="swipe-done" type="button" data-finish>Done <b data-kept></b></button>
      </header>
      <div class="deck" data-deck></div>
      <div class="swipe-actions">
        <button class="action" type="button" data-skip aria-label="Skip">${icon("x")}</button>
        <button class="action action--undo" type="button" data-undo aria-label="Undo">${icon("undo")}</button>
        <button class="action action--keep" type="button" data-keep aria-label="Keep">${icon("check")}</button>
      </div>
    </section>`;

  const deck = view.querySelector("[data-deck]");
  const keptBadge = view.querySelector("[data-kept]");
  let card = null;
  let busy = false;

  const cardHtml = (loop, next) => `
    <article class="card ${next ? "is-next" : ""} ${unlocked ? "" : "is-locked"}" data-id="${loop.id}">
      <div class="card-cover" style="${coverStyle(loop.file)}"></div>
      <div class="card-shade"></div>
      <div class="card-center"><span class="card-play">${icon("play")}</span><span class="card-hint">Tap to play</span></div>
      <div class="card-info">
        <h2 class="card-title">${esc(loop.title)}</h2>
        <p class="card-meta">${esc(meta(loop))}</p>
        <div class="card-tags">${orderedTags(loop).map((t) => `<span class="card-tag">${esc(t.label)}</span>`).join("")}</div>
        <div class="card-progress" data-seek><div><i data-progress></i></div></div>
      </div>
      <div class="card-verdict card-verdict--keep"><span>${icon("check")}</span></div>
      <div class="card-verdict card-verdict--skip"><span>${icon("x")}</span></div>
    </article>`;

  // mode: "first" on arrival, "promoted" after a swipe, "returning" after undo.
  function paint(mode, from) {
    const loop = store.getLoop(session.deck[session.index]);
    const next = store.getLoop(session.deck[session.index + 1]);
    deck.innerHTML = (next ? cardHtml(next, true) : "") + cardHtml(loop, false);
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
      card.style.setProperty("--from", from === "keep" ? "120%" : "-120%");
      card.style.setProperty("--rot", from === "keep" ? "12deg" : "-12deg");
      card.classList.add("is-returning");
    }

    view.querySelector("[data-count]").textContent = `${session.index + 1} of ${session.deck.length}`;
    keptBadge.textContent = session.kept.length;
    view.querySelector("[data-undo]").disabled = !session.history.length;
    wire(card, loop);
    sync();
    if (unlocked) player.play(loop);
  }

  function sync() {
    if (!card) return;
    const s = player.state();
    const mine = s.id === card.dataset.id;
    card.classList.toggle("is-playing", mine && s.playing);
    card.querySelector("[data-progress]").style.width = `${mine && s.duration ? (s.time / s.duration) * 100 : 0}%`;
  }

  async function toggle(loop) {
    const playing = await player.toggle(loop);
    if (playing && !unlocked) {
      unlocked = true;
      deck.querySelectorAll(".card").forEach((c) => c.classList.remove("is-locked"));
    }
  }

  function wire(el, loop) {
    const seek = el.querySelector("[data-seek]");
    seek.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const to = (e) => {
        const rect = seek.getBoundingClientRect();
        const fraction = (e.clientX - rect.left) / rect.width;
        if (player.state().id !== loop.id) player.play(loop).then(() => player.seek(fraction));
        else player.seek(fraction);
      };
      to(event);
      seek.setPointerCapture(event.pointerId);
      seek.onpointermove = to;
      seek.onpointerup = () => { seek.onpointermove = null; };
    });

    let startX = 0, startY = 0, dx = 0, startTime = 0, dragging = false;
    el.addEventListener("pointerdown", (event) => {
      if (busy) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startTime = performance.now();
      dx = 0;
      el.classList.remove("is-settling", "is-first", "is-returning");
      el.setPointerCapture(event.pointerId);
    });
    el.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      dx = event.clientX - startX;
      const dy = (event.clientY - startY) * 0.2;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 22}deg)`;
      el.dataset.lean = dx > 8 ? "keep" : dx < -8 ? "skip" : "";
      el.style.setProperty("--pull", Math.min(1, Math.abs(dx) / 140));
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      const velocity = Math.abs(dx) / Math.max(1, performance.now() - startTime);
      if (Math.abs(dx) > el.clientWidth * 0.3 || (Math.abs(dx) > 40 && velocity > 0.6)) return decide(dx > 0);
      if (Math.abs(dx) < 6) toggle(loop);
      el.classList.add("is-settling");
      el.style.transform = "";
      el.dataset.lean = "";
      el.style.setProperty("--pull", 0);
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
  }

  function hit(button) {
    button.classList.remove("is-hit");
    void button.offsetWidth;
    button.classList.add("is-hit");
  }

  function decide(keep) {
    if (busy || !card) return;
    busy = true;
    const id = card.dataset.id;
    hit(view.querySelector(keep ? "[data-keep]" : "[data-skip]"));

    card.classList.remove("is-settling", "is-first", "is-returning");
    card.dataset.lean = keep ? "keep" : "skip";
    card.style.setProperty("--pull", 1);
    card.classList.add("is-flying");
    requestAnimationFrame(() => {
      card.style.transform = `translate(${keep ? 130 : -130}%, 2%) rotate(${keep ? 16 : -16}deg)`;
      card.style.opacity = "0";
    });

    // The card behind moves up now, and its loop starts now, not after the animation.
    const nextCard = deck.querySelector(".card.is-next");
    if (nextCard) {
      nextCard.style.transition = "transform 360ms var(--ease-out), opacity 300ms ease";
      nextCard.style.transform = "none";
      nextCard.style.opacity = "1";
      if (unlocked) player.play(store.getLoop(nextCard.dataset.id));
    }

    if (keep) {
      session.kept.push(id);
      keptBadge.textContent = session.kept.length;
      keptBadge.classList.remove("bump");
      void keptBadge.offsetWidth;
      keptBadge.classList.add("bump");
      navigator.vibrate?.(10);
    }
    session.history.push({ id, keep });
    session.index++;
    save();

    setTimeout(() => {
      busy = false;
      if (session.index >= session.deck.length) {
        player.stop();
        return go("#/pack");
      }
      paint("promoted");
    }, 370);
  }

  function undo() {
    if (busy) return;
    const last = session.history.pop();
    if (!last) return;
    hit(view.querySelector("[data-undo]"));
    session.index--;
    if (last.keep) session.kept = session.kept.filter((k) => k !== last.id);
    save();
    paint("returning", last.keep ? "keep" : "skip");
  }

  view.querySelector("[data-skip]").addEventListener("click", () => decide(false));
  view.querySelector("[data-keep]").addEventListener("click", () => decide(true));
  view.querySelector("[data-undo]").addEventListener("click", undo);
  view.querySelector("[data-finish]").addEventListener("click", () => { player.stop(); go("#/pack"); });

  const onKey = (event) => {
    if (event.target.closest("input")) return;
    if (event.key === "ArrowRight") decide(true);
    else if (event.key === "ArrowLeft") decide(false);
    else if (event.key === " ") { event.preventDefault(); toggle(store.getLoop(card.dataset.id)); }
    else if (event.key.toLowerCase() === "z" || event.key === "Backspace") undo();
  };
  document.addEventListener("keydown", onKey);
  const unsubscribe = player.subscribe(sync);

  paint("first");
  // Fetch playback links ahead, so the next cards start the moment they arrive.
  store.warm(session.deck.slice(session.index, session.index + 50)).catch(() => {});
  return () => {
    document.removeEventListener("keydown", onKey);
    unsubscribe();
  };
}

/* Pack ------------------------------------------------------------------------ */

function nameHtml(file) {
  const ext = file.match(/\.[a-z0-9]+$/i)?.[0] || "";
  let html = "";
  tokens(file).forEach((part, i) => {
    if (part.kind === "text") {
      html += `${i ? " " : ""}${esc(part.text)}`;
      return;
    }
    const cut = (part.kind === "sug" && session.removeSug) || (part.kind === "collab" && session.removeCollabs);
    html += `<span class="cut ${cut ? "is-cut" : ""}" data-kind="${part.kind}"> ${esc(part.text)}</span>`;
  });
  return html + esc(ext);
}

export function renderPack(view, go) {
  if (!session) return go("#/build");
  let showSkipped = false;

  // The shell renders once; only the lists repaint, so edits don't replay the entrance.
  view.innerHTML = `
    <section class="page page--with-cta enter">
      <header class="header">
        <div class="header-back">
          <button class="icon-button" type="button" data-back aria-label="Back">${icon("back")}</button>
          <h1 class="header-title">New pack</h1>
        </div>
      </header>
      <div class="pack" data-pack></div>
      <div class="cta"><div class="cta-inner"><button class="button button--primary button--block" type="button" data-create>Create pack</button></div></div>
    </section>`;

  const packEl = view.querySelector("[data-pack]");
  const createButton = view.querySelector("[data-create]");

  const row = (loop, skipped, i) => `
    <li class="row row--media ${skipped ? "row--skipped" : ""}" data-id="${loop.id}" style="--i:${i}">
      <button class="thumb thumb--sm" type="button" data-play aria-label="Play" style="${coverStyle(loop.file)}">${icon("play")}</button>
      <div class="row-main"><div class="row-title">${nameHtml(loop.file)}</div></div>
      <button class="icon-button" type="button" ${skipped ? "data-add" : "data-remove"} aria-label="${skipped ? "Add" : "Remove"}">${icon(skipped ? "plus" : "x")}</button>
    </li>`;

  function paint({ revealSkipped = false } = {}) {
    const kept = session.kept.map((id) => store.getLoop(id)).filter(Boolean);
    const skipped = session.deck.slice(0, session.index).filter((id) => !session.kept.includes(id)).map((id) => store.getLoop(id)).filter(Boolean);
    const hasCollabs = kept.some((l) => l.collabs.length);
    const nameInput = packEl.querySelector("[data-name]");
    const focused = document.activeElement === nameInput;

    packEl.innerHTML = `
      <div class="list">
        <div class="row"><div class="row-main row-field"><label for="pack-name">Name</label><input id="pack-name" data-name value="${esc(session.name)}" autocomplete="off" spellcheck="false"></div></div>
      </div>
      <div class="list">
        <label class="row"><span class="row-main">Remove @straightupglobal</span><span class="switch"><input type="checkbox" data-opt="removeSug" ${session.removeSug ? "checked" : ""}><span></span></span></label>
        ${hasCollabs ? `<label class="row"><span class="row-main">Remove collab tags</span><span class="switch"><input type="checkbox" data-opt="removeCollabs" ${session.removeCollabs ? "checked" : ""}><span></span></span></label>` : ""}
      </div>
      <div>
        <p class="list-label">${plural(kept.length, "loop")}</p>
        ${kept.length ? `<ul class="list">${kept.map((l, i) => row(l, false, i)).join("")}</ul>` : ""}
      </div>
      ${skipped.length ? `<button class="text-button skipped-toggle" type="button" data-toggle-skipped>${showSkipped ? "Hide" : "Show"} skipped (${skipped.length})</button>` : ""}
      ${skipped.length && showSkipped ? `<ul class="list ${revealSkipped ? "stagger" : ""}">${skipped.map((l, i) => row(l, true, i)).join("")}</ul>` : ""}`;

    if (focused) packEl.querySelector("[data-name]").focus();
    createButton.disabled = !kept.length;
    sync(player.state());
  }

  function sync(s) {
    packEl.querySelectorAll(".row[data-id]").forEach((rowEl) => {
      const on = s.id === rowEl.dataset.id && s.playing;
      const button = rowEl.querySelector("[data-play]");
      if (button.classList.contains("is-playing") === on) return;
      button.classList.toggle("is-playing", on);
      button.innerHTML = icon(on ? "pause" : "play");
    });
  }

  const onClick = (event) => {
    if (event.target.closest("[data-back]")) {
      if (session.index < session.deck.length) return go("#/swipe");
      if (session.takeAll) { endSession(); return go("#/build"); }
      const last = session.history.pop();
      if (last) {
        session.index--;
        if (last.keep) session.kept = session.kept.filter((k) => k !== last.id);
        save();
      }
      return go("#/swipe");
    }
    if (event.target.closest("[data-toggle-skipped]")) {
      showSkipped = !showSkipped;
      return paint({ revealSkipped: showSkipped });
    }
    const play = event.target.closest("[data-play]");
    if (play) return player.toggle(store.getLoop(play.closest(".row").dataset.id));
    const change = event.target.closest("[data-remove], [data-add]");
    if (change) {
      const rowEl = change.closest(".row");
      rowEl.classList.add("is-leaving");
      setTimeout(() => {
        const id = rowEl.dataset.id;
        if (change.hasAttribute("data-add")) session.kept.push(id);
        else session.kept = session.kept.filter((k) => k !== id);
        save();
        paint();
      }, 200);
      return;
    }
    if (event.target.closest("[data-create]")) create();
  };
  const onInput = (event) => {
    if (event.target.matches("[data-name]")) { session.name = event.target.value; save(); }
  };
  const onChange = (event) => {
    const input = event.target.closest("[data-opt]");
    if (!input) return;
    session[input.dataset.opt] = input.checked;
    save();
    const kind = input.dataset.opt === "removeSug" ? "sug" : "collab";
    packEl.querySelectorAll(`.cut[data-kind="${kind}"]`).forEach((part) => part.classList.toggle("is-cut", input.checked));
  };

  async function create() {
    const name = session.name.trim() || "Loops";
    const total = session.kept.length;
    player.stop();
    view.removeEventListener("click", onClick);

    // Creating turns into Done in place: the cover stays, a check lands on it.
    view.innerHTML = `
      <section class="page">
        <header class="header"><span></span><a class="text-button" href="#/build" data-done-link style="opacity:0; pointer-events:none">Done</a></header>
        <div class="result">
          <div class="result-art"><div class="result-cover is-working" style="${coverStyle(name)}"></div></div>
          <h1 class="result-title">${esc(name)}</h1>
          <p class="result-sub" data-status>Copying 0 of ${total}</p>
          <div class="progress"><i data-bar></i></div>
        </div>
      </section>`;

    const started = performance.now();
    let pack;
    try {
      pack = await store.createPack({ name, loopIds: session.kept, removeSug: session.removeSug, removeCollabs: session.removeCollabs }, (done) => {
        // The screen may already be gone (someone navigated away): just skip it.
        const status = view.querySelector("[data-status]");
        if (status) status.textContent = `Copying ${done} of ${total}`;
        const bar = view.querySelector("[data-bar]");
        if (bar) bar.style.width = `${(done / total) * 100}%`;
      });
    } catch (error) {
      // Nothing is lost: the pack is still open, so they can simply try again.
      toast(error.message || "Couldn't create the pack");
      return go("#/pack");
    }
    await sleep(Math.max(250, 1300 - (performance.now() - started)));
    endSession();
    finish(view, pack);
  }

  view.addEventListener("click", onClick);
  view.addEventListener("input", onInput);
  view.addEventListener("change", onChange);
  const unsubscribe = player.subscribe(sync);
  paint();

  return () => {
    view.removeEventListener("click", onClick);
    view.removeEventListener("input", onInput);
    view.removeEventListener("change", onChange);
    unsubscribe();
  };
}

function finish(view, pack) {
  const page = view.querySelector(".page");
  const cover = view.querySelector(".result-cover");
  cover.classList.remove("is-working");
  cover.style.animation = "none";
  view.querySelector(".result-art").insertAdjacentHTML("beforeend", `<span class="result-badge">${icon("check")}</span>`);
  view.querySelector("[data-status]").textContent = plural(pack.loopIds.length, "loop");
  const bar = view.querySelector(".progress");
  bar.style.transition = "opacity 300ms ease";
  bar.style.opacity = "0";
  const doneLink = view.querySelector("[data-done-link]");
  doneLink.style.opacity = "1";
  doneLink.style.pointerEvents = "auto";

  page.classList.add("page--with-cta");
  page.insertAdjacentHTML("beforeend", `
    <div class="cta">
      <div class="cta-inner">
        <button class="button button--primary button--block" type="button" data-copy>${icon("link")} Copy link</button>
        <button class="button button--block" type="button" data-open>Open in Dropbox</button>
      </div>
    </div>`);

  const copy = view.querySelector("[data-copy]");
  copy.addEventListener("click", async () => {
    await copyText(pack.link);
    copy.classList.add("is-done");
    copy.innerHTML = `${icon("check")} Copied`;
    setTimeout(() => { copy.classList.remove("is-done"); copy.innerHTML = `${icon("link")} Copy link`; }, 2000);
  });
  view.querySelector("[data-open]").addEventListener("click", () => toast("Available once Dropbox is connected"));
}

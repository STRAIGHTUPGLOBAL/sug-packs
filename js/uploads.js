// A route-independent upload queue. Files stay in memory while the user moves
// around the app; the Library only renders a window onto this state.

import * as store from "./data.js";
import { esc, icon, openSheet, toast } from "./ui.js";

let tasks = [];
let running = false;
let nextId = 1;
let announced = false;
const listeners = new Set();
const terminal = new Set(["done", "skipped", "failed"]);

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const notify = (update = null) => {
  for (const listener of listeners) {
    try { listener(update); } catch { /* a screen may be leaving */ }
  }
};

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// target: null uploads into the library; { month: "2025-03" } into quarantine.
export function enqueue(files, target = null) {
  if (!files.length) return;
  if (!running && tasks.length && tasks.every((task) => terminal.has(task.status))) tasks = [];
  for (const file of files) {
    tasks.push({ id: nextId++, file, name: file.name, status: "waiting", progress: 0, error: "", loopId: "", reason: "", target });
  }
  announced = false;
  notify();
  pump();
}

function retry(task) {
  task.status = "waiting";
  task.progress = 0;
  task.error = "";
  announced = false;
  notify();
  pump();
}

async function pump() {
  if (running) return;
  const first = tasks.find((task) => task.status === "waiting");
  if (!first) return finish();
  // One destination at a time: a batch shares its target.
  const batch = tasks.filter((task) => task.status === "waiting" && task.target?.month === first.target?.month);
  running = true;
  const byFile = new Map(batch.map((task) => [task.file, task]));
  const files = batch.map((task) => task.file);
  const report = (update) => {
    const task = byFile.get(update.file);
    if (!task) return;
    task.status = update.status;
    task.progress = update.progress ?? task.progress;
    task.error = update.error?.message ?? "";
    task.reason = update.reason ?? task.reason;
    task.loopId = update.loop?.id ?? task.loopId;
    notify(update);
  };

  try {
    await (first.target ? store.addQuarantineFiles(files, first.target.month, report) : store.addFiles(files, report));
  } catch (error) {
    for (const task of batch.filter((item) => !terminal.has(item.status))) {
      task.status = "failed";
      task.progress = 0;
      task.error = error?.message || "Upload stopped";
    }
    notify({ status: "failed" });
  } finally {
    running = false;
  }

  if (tasks.some((task) => task.status === "waiting")) return pump();
  finish();
}

// Where the loops are going, and the words for what was already there.
const place = () => (tasks.length && tasks.every((task) => task.target) ? "quarantine" : "library");
const REASONS = { library: "already in the library", quarantine: "already in quarantine", rejected: "already in the rejected list" };
const reasonOf = (task) => REASONS[task.reason] ?? REASONS[place()];

function skippedDetail() {
  const groups = {};
  for (const task of tasks.filter((item) => item.status === "skipped")) groups[reasonOf(task)] = (groups[reasonOf(task)] ?? 0) + 1;
  return Object.entries(groups).map(([text, n]) => `${n} ${text}`).join(" · ");
}

function finish() {
  if (running || announced || !tasks.length || tasks.some((task) => !terminal.has(task.status))) return;
  announced = true;
  const added = tasks.filter((task) => task.status === "done").length;
  const skipped = tasks.filter((task) => task.status === "skipped").length;
  const failed = tasks.filter((task) => task.status === "failed").length;
  const where = place() === "quarantine" ? "in quarantine" : "";
  if (failed) toast(`${plural(failed, "file")} couldn't upload`);
  else if (added) toast(`${plural(added, "loop")} added${where ? " to quarantine" : ""}${skipped ? ` · ${skipped} skipped` : ""}`);
  else if (skipped) toast(`${plural(skipped, "loop")} skipped: ${skippedDetail()}`);
  notify({ status: "finished" });
}

function counts() {
  const done = tasks.filter((task) => terminal.has(task.status)).length;
  const added = tasks.filter((task) => task.status === "done").length;
  const skipped = tasks.filter((task) => task.status === "skipped").length;
  const failed = tasks.filter((task) => task.status === "failed").length;
  return { total: tasks.length, done, added, skipped, failed };
}

export function summaryHTML() {
  if (!tasks.length) return "";
  const { total, done, added, skipped, failed } = counts();
  const active = tasks.find((task) => ["uploading", "saving"].includes(task.status));
  const working = done < total;
  const title = working
    ? `Uploading ${done} of ${total}`
    : failed
      ? `${plural(failed, "file")} failed`
      : added
        ? `${plural(added, "loop")} added`
        : `${plural(skipped, "loop")} skipped`;
  const detail = working
    ? active?.name || "Preparing…"
    : [skipped ? skippedDetail() : "", failed ? "Tap to retry" : ""].filter(Boolean).join(" · ") || (added ? (place() === "quarantine" ? "Ready to purge" : "Ready to tag") : "");
  const progress = total ? tasks.reduce((sum, task) => sum + (terminal.has(task.status) ? 1 : task.progress), 0) / total : 0;
  return `
    <div class="list upload-summary">
      <button class="row row--media" type="button" data-upload-queue>
        <span class="upload-mark ${working ? "is-working" : failed ? "is-failed" : "is-done"}">${icon(working ? "upload" : failed ? "undo" : "check")}</span>
        <span class="row-main">
          <span class="row-title">${title}</span>
          ${detail ? `<span class="row-sub">${esc(detail)}</span>` : ""}
          ${working ? `<span class="upload-progress"><i style="width:${Math.round(progress * 100)}%"></i></span>` : ""}
        </span>
        ${icon("chevron", "row-chevron")}
      </button>
    </div>`;
}

const statusText = (task) => {
  if (task.status === "waiting") return "Waiting";
  if (task.status === "uploading") return `${Math.round(task.progress * 100)}%`;
  if (task.status === "saving") return "Saving";
  if (task.status === "done") return "Added";
  if (task.status === "skipped") return reasonOf(task).replace(/^a/, "A");
  return task.error || "Couldn't upload";
};

function taskRows(list, failed = false) {
  return list.map((task) => `
    <div class="row row--media upload-row">
      <span class="upload-mark ${failed ? "is-failed" : task.status === "done" || task.status === "skipped" ? "is-done" : "is-working"}">
        ${icon(failed ? "x" : task.status === "done" || task.status === "skipped" ? "check" : "upload")}
      </span>
      <span class="row-main">
        <span class="row-title">${esc(task.name)}</span>
        <span class="row-sub ${failed ? "row-danger" : ""}">${esc(statusText(task))}</span>
        ${["waiting", "uploading", "saving"].includes(task.status) ? `<span class="upload-progress"><i style="width:${Math.round(task.progress * 100)}%"></i></span>` : ""}
      </span>
      ${failed ? `<button class="icon-button" type="button" data-upload-retry="${task.id}" aria-label="Retry ${esc(task.name)}">${icon("undo")}</button>` : ""}
    </div>`).join("");
}

export function openQueue() {
  if (!tasks.length) return;
  let unsubscribe = () => {};
  const sheet = openSheet(`
    <div class="sheet-head">
      <div class="row-main"><h2 class="sheet-title">Uploads</h2><p class="sheet-sub" data-upload-count></p></div>
      <button class="icon-button" type="button" data-sheet-close aria-label="Close">${icon("x")}</button>
    </div>
    <div class="sheet-body" data-upload-body></div>
    <div class="sheet-foot" data-upload-foot hidden></div>`, { onClose: () => unsubscribe() });

  const paint = () => {
    if (!sheet.isConnected) return unsubscribe();
    const { total, done, failed } = counts();
    sheet.querySelector("[data-upload-count]").textContent = done < total ? `${done} of ${total} complete` : plural(total, "file");
    const failures = tasks.filter((task) => task.status === "failed");
    const rest = tasks.filter((task) => task.status !== "failed");
    sheet.querySelector("[data-upload-body]").innerHTML = `
      ${rest.length ? `<div class="list upload-list">${taskRows(rest)}</div>` : ""}
      ${failures.length ? `<h3 class="list-label">Failed</h3><div class="list upload-list">${taskRows(failures, true)}</div>` : ""}`;
    const foot = sheet.querySelector("[data-upload-foot]");
    foot.hidden = !failed;
    foot.innerHTML = failed ? `<button class="button button--primary" type="button" data-upload-retry-all>Retry ${failed === 1 ? "file" : `${failed} files`}</button>` : "";
  };

  sheet.addEventListener("click", (event) => {
    const button = event.target.closest("[data-upload-retry]");
    if (button) {
      const task = tasks.find((item) => item.id === Number(button.dataset.uploadRetry));
      if (task) retry(task);
      return;
    }
    if (event.target.closest("[data-upload-retry-all]")) {
      for (const task of tasks.filter((item) => item.status === "failed")) {
        task.status = "waiting";
        task.progress = 0;
        task.error = "";
      }
      announced = false;
      notify();
      pump();
    }
  });
  unsubscribe = subscribe(paint);
  paint();
}

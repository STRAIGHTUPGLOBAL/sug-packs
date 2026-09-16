// Small shared pieces: escaping, icons, toast, bottom sheet, formatting.

export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const paths = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="M15 6 9 12l6 6"/>',
  build: '<path d="M4 7h10M4 12h16M4 17h7"/><circle cx="17" cy="7" r="2"/><circle cx="14" cy="17" r="2"/>',
  library: '<path d="M4 9v6M8 6v12M12 10v4M16 4v16M20 8v8"/>',
  packs: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"/>',
  swipe: '<rect x="7" y="3.5" width="10" height="14" rx="2"/><path d="M4 20.5h16M4 20.5l2-2M20 20.5l-2-2"/>',
  tag: '<path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1 1 0 0 1 0 1.4l-6.9 6.9a1 1 0 0 1-1.4 0Z"/><circle cx="8" cy="8" r="1.3"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  star: '<path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9L9.6 9Z"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2L9 5h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.5" r="3.2"/>',
  sort: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  person: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.4-3 4-4.5 7-4.5s5.6 1.5 7 4.5"/>',
};

export const icon = (name, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;

let toastTimer = 0;
export function toast(message, tone = "") {
  const el = document.querySelector("[data-toast]");
  el.className = `toast ${tone ? `toast--${tone}` : ""}`;
  el.textContent = message;
  el.hidden = false;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// Bottom sheet on phones, centred panel on laptops.
let onSheetClose = null;
export function openSheet(html, { onClose, wide = false } = {}) {
  const layer = document.querySelector("[data-sheet]");
  layer.innerHTML = `<div class="sheet-scrim" data-sheet-close></div><div class="sheet ${wide ? "sheet--wide" : ""}" role="dialog" aria-modal="true"><div class="sheet-grab" aria-hidden="true"></div>${html}</div>`;
  layer.hidden = false;
  layer.classList.remove("is-closing");
  document.body.classList.add("has-sheet");
  onSheetClose = onClose || null;
  layer.querySelectorAll("[data-sheet-close]").forEach((el) => el.addEventListener("click", closeSheet));
  return layer.querySelector(".sheet");
}

// Swap what an open sheet shows (the next loop to tag) without closing it.
// A fresh element, so the previous content's listeners go with the old one.
export function replaceSheet(html, { onClose } = {}) {
  const layer = document.querySelector("[data-sheet]");
  const old = layer.querySelector(".sheet");
  if (layer.hidden || !old || layer.classList.contains("is-closing")) return openSheet(html, { onClose });
  const sheet = document.createElement("div");
  sheet.className = "sheet is-swapped";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.innerHTML = `<div class="sheet-grab" aria-hidden="true"></div>${html}`;
  old.replaceWith(sheet);
  onSheetClose = onClose || null;
  sheet.querySelectorAll("[data-sheet-close]").forEach((el) => el.addEventListener("click", closeSheet));
  return sheet;
}

export function closeSheet() {
  const layer = document.querySelector("[data-sheet]");
  if (layer.hidden || layer.classList.contains("is-closing")) return;
  layer.classList.add("is-closing");
  const done = onSheetClose;
  onSheetClose = null;
  setTimeout(() => {
    layer.hidden = true;
    layer.innerHTML = "";
    layer.classList.remove("is-closing");
    document.body.classList.remove("has-sheet");
    done?.();
  }, 260);
}

export const sheetOpen = () => !document.querySelector("[data-sheet]").hidden;

export function ago(timestamp) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = Object.assign(document.createElement("textarea"), { value: text });
    area.style.cssText = "position:fixed;opacity:0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

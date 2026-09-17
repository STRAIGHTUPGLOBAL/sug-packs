// One audio element for the whole app, so only one loop ever plays, and
// phones that need a tap before sound keep their permission across swipes.

import { audioUrl } from "./data.js";

const audio = new Audio();
audio.preload = "auto";
audio.loop = true;

let currentId = null;
let sourceId = null;
let loading = false;
let request = 0;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(state()));

export function state() {
  return {
    id: currentId,
    sourceId,
    playing: !audio.paused,
    loading,
    time: audio.currentTime || 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Progress ticks while playing, smoothly, without a timer per component.
let frame = 0;
function tick() {
  emit();
  frame = audio.paused ? 0 : requestAnimationFrame(tick);
}
for (const event of ["play", "pause", "loadedmetadata", "seeked", "emptied", "error"]) {
  audio.addEventListener(event, () => {
    if (event === "error") sourceId = null;
    if (!frame && !audio.paused) frame = requestAnimationFrame(tick);
    emit();
  });
}

export async function play(loop, { from = 0 } = {}) {
  const token = ++request;
  if (sourceId !== loop.id) {
    audio.pause();
    currentId = loop.id;
    loading = true;
    emit();
    const src = await audioUrl(loop);
    if (token !== request || currentId !== loop.id) return false;
    if (!src) {
      loading = false;
      emit();
      return false;
    }
    audio.src = src;
    sourceId = loop.id;
    if (from) audio.currentTime = from;
  }
  loading = false;
  try {
    await audio.play();
    return true;
  } catch {
    emit();
    return false; // the phone wants a tap first
  }
}

export function toggle(loop) {
  if (currentId === loop.id && loading) {
    stop();
    return Promise.resolve(false);
  }
  if (currentId === loop.id && !audio.paused) {
    stop();
    return Promise.resolve(false);
  }
  return play(loop);
}

export function stop() {
  request++;
  audio.pause();
  // A second tap means stop, not pause. The next play always starts at the
  // arrangement, never halfway through the stems later in the file.
  try { audio.currentTime = 0; } catch { /* no source loaded yet */ }
  currentId = null;
  loading = false;
  emit();
}

export function seek(fraction) {
  if (!Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(0.999, fraction)) * audio.duration;
}

export const time = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

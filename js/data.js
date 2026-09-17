// One data layer for the screens: live (Supabase + Dropbox) or the demo.
// Both files export the same functions.

import { DEMO } from "./config.js";

const impl = DEMO ? await import("./store.js") : await import("./live.js");

export const {
  live,
  session, signIn, signOut,
  init, refresh, reset, setErrorHandler,
  users, currentUser, setUser, setName,
  listTags, tagsById, addTag, tagUseCount,
  listLoops, getLoop, untagged, checkLibraryFiles, removeMissingLoops,
  updateLoop, setBestOf, audioUrl, warm, cacheAudio, addFiles, deleteLoop, setLoopStatus,
  listPacks, createPack, deletePack, renamePack,
  myId, profileOf, people, setAvatar, setPersonName,
  isFavorite, favoriteCount, favoritesOf, toggleFavorite, notePackUse,
} = impl;

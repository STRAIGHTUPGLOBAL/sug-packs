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
  listLoops, getLoop, untagged, updateLoop, audioUrl, warm, addFiles, deleteLoop,
  listPacks, createPack, deletePack, renamePack,
  myId, profileOf, people, setAvatar, setPersonName,
  isFavorite, favoriteCount, favoritesOf, toggleFavorite, notePackUse,
} = impl;

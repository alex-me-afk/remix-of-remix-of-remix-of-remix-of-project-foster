/**
 * Per-map downloads.
 *
 * Only Friend Island ships with the boot download. Every other map is fetched on demand
 * from the mode selector's overlay button, then remembered in localStorage (the bytes stay
 * in the browser's HTTP cache, so a later session only re-validates them).
 */
import { useSyncExternalStore } from "react";
import { ARENA_MAPS, type MapId } from "./maps";
import { fetchWithProgress, WAITING_ISLAND_URL } from "./preload";

export const BUNDLED_MAPS: MapId[] = ["friend-island"];
const KEY = "ironhowl.downloadedMaps";

/** Every file a map needs. Verdant Isle (battle royale) also needs the waiting island. */
export function mapFiles(id: MapId): string[] {
  const m = ARENA_MAPS[id];
  const files = [m.url, ...(m.collisionUrl ? [m.collisionUrl] : [])];
  if (id === "island") files.push(WAITING_ISLAND_URL);
  return files;
}

export type MapDlState = { status: "none" | "downloading" | "ready"; progress: number };

const READY: MapDlState = { status: "ready", progress: 1 };
const NONE: MapDlState = { status: "none", progress: 0 };

let state: Record<string, MapDlState> = {};
const listeners = new Set<() => void>();
let loaded = false;

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  let saved: string[] = [];
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    /* ignore */
  }
  const next: Record<string, MapDlState> = {};
  for (const id of [...BUNDLED_MAPS, ...saved]) next[id] = READY;
  state = next;
}

function set(id: MapId, s: MapDlState) {
  state = { ...state, [id]: s };
  listeners.forEach((l) => l());
}

export function getMapState(id: MapId): MapDlState {
  ensureLoaded();
  return state[id] ?? (BUNDLED_MAPS.includes(id) ? READY : NONE);
}

export function isMapReady(id: MapId) {
  return getMapState(id).status === "ready";
}

export async function downloadMap(id: MapId) {
  if (getMapState(id).status !== "none") return;
  const files = mapFiles(id);
  const done = files.map(() => 0);
  set(id, { status: "downloading", progress: 0 });
  try {
    await Promise.all(
      files.map((url, i) =>
        fetchWithProgress(url, (l, t) => {
          done[i] = t ? l / t : 0.5;
          set(id, { status: "downloading", progress: done.reduce((a, b) => a + b, 0) / files.length });
        }).then(() => {
          done[i] = 1;
        }),
      ),
    );
    set(id, READY);
    const saved = new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    saved.add(id);
    localStorage.setItem(KEY, JSON.stringify([...saved]));
  } catch {
    set(id, NONE);
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMapDownload(id: MapId): MapDlState {
  return useSyncExternalStore(
    subscribe,
    () => getMapState(id),
    () => (BUNDLED_MAPS.includes(id) ? READY : NONE),
  );
}

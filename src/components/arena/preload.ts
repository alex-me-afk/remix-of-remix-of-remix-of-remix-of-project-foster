/**
 * Boot-time asset preloader. Everything the arena needs (map, frost wall model,
 * lobby art) is fetched here with real byte progress so the first splash screen
 * can show an honest bar instead of a fake timer.
 */
import { ARENA_MAPS } from "./maps";
import {
  OPERATIVE_BODY_URL,
  OPERATIVE_IDLE_WOMEN_URL,
  hasCustomIdle,
} from "./characters";

const frostAsset = { url: "/models/frost_wall.glb" };

/**
 * The Battle Royale waiting island.
 *
 * It lives here rather than beside the room that draws it so the shell can warm the bytes without
 * importing that module: `waitingIsland.ts` pulls in three.js and three-mesh-bvh, and importing it
 * from `GameShell` for one string would drag both into the boot bundle and undo the lazy split.
 */
export const WAITING_ISLAND_URL = "/models/waiting-island.glb";

export type PreloadItem = { label: string; url: string; weight?: number };

const cache = new Map<string, ArrayBuffer | true>();

/**
 * Everything the first screen needs. `petUrl` is the equipped companion and `bodyUrl` the
 * chosen operative's body — pass them so the lobby's pet and character are on the bar too.
 *
 * Note what this does and does not buy: it warms the HTTP cache, so GLTFLoader finds the
 * bytes locally later, but it does not parse the GLB, transcode the KTX2 textures or upload
 * anything to the GPU. That second half is why GameShell mounts the lobby behind the splash
 * and waits for a real render before it offers the Enter button.
 */
export function arenaAssets(extra: string[] = [], petUrl?: string, bodyUrl?: string): PreloadItem[] {
  return [
    // Friend Island is the only map in the boot download; every other map is downloaded
    // separately from the mode selector (see mapDownloads.ts).
    { label: "Friend Island", url: ARENA_MAPS["friend-island"].url, weight: 10 },
    { label: "Friend Island", url: ARENA_MAPS["friend-island"].collisionUrl!, weight: 2 },
    { label: "Frost wall", url: (frostAsset as { url: string }).url, weight: 1 },
    // The operative is the single biggest download (8.2 MB body + 4.6 MB of clips) and it is
    // on screen the instant boot finishes, so it belongs on the honest bar. This one is
    // unconditional: it is Howl's body and it is also every BOT's body, so it is fetched in
    // every match no matter who the player picked.
    { label: "Operative", url: OPERATIVE_BODY_URL, weight: 8 },
    { label: "Animations", url: "/models/operative-anims.glb", weight: 5 },
    // The player's own body, when it is not the shared one above (0.55-5.17 MB). Leaving it
    // off the bar does not save the download, it just hides it: the bar reaches 100%, and
    // THEN the lobby fetches the character it actually has to draw, with no feedback at all
    // — `charReady` still holds the Enter button shut for the whole wait.
    ...(bodyUrl && bodyUrl !== OPERATIVE_BODY_URL
      ? [{ label: "Operative", url: bodyUrl, weight: 4 }]
      : []),
    // The women's idle (0.49 MB), only when the player picked Nyx — she is the only body that
    // plays it (see CUSTOM_IDLE_OPERATIVE_IDS). Her rig fetches the file during the lobby hold
    // either way, so on the bar it is honest progress rather than a silent stall behind a bar
    // that already read 100%. The other five operatives never touch it.
    ...(bodyUrl && hasCustomIdle(bodyUrl)
      ? [{ label: "Animations", url: OPERATIVE_IDLE_WOMEN_URL, weight: 1 }]
      : []),
    // Only the equipped pet. The other three are the pet shop's problem, not the front door's.
    ...(petUrl ? [{ label: "Companion", url: petUrl, weight: 2 }] : []),
    ...extra.map((url) => ({ label: "Interface art", url, weight: 2 })),
  ];
}

export async function fetchWithProgress(url: string, onChunk: (bytes: number, total: number) => void) {
  if (cache.has(url)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body) {
    await res.arrayBuffer();
    cache.set(url, true);
    onChunk(total || 1, total || 1);
    return;
  }
  const reader = res.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value?.byteLength ?? 0;
    onChunk(loaded, total);
  }
  cache.set(url, true);
}

/**
 * Fire-and-forget warming for assets that are NOT part of boot.
 *
 * The waiting island is 6 MB and is only ever needed the moment Play is pressed, so it has no
 * business on the boot bar — but discovering it at deploy time means the room shows up late on the
 * one screen whose whole job is to be there instantly. So it is fetched during the lobby, where the
 * player is reading menus and the network is idle. Shares `fetchWithProgress`'s cache, so anything
 * already downloaded is skipped and nothing is ever fetched twice.
 *
 * Deliberately not awaited by anything and deliberately silent on failure: the room has its own
 * loader and its own fallback, and this is only ever a head start.
 */
export function prefetch(urls: string[]) {
  for (const url of urls) {
    void fetchWithProgress(url, () => {}).catch(() => {});
  }
}

/**
 * Runs every download in parallel and reports a smoothed 0–1 progress plus the
 * label of whatever is currently streaming.
 */
export async function preloadAll(
  items: PreloadItem[],
  onProgress: (progress: number, label: string) => void,
) {
  const totalWeight = items.reduce((a, i) => a + (i.weight ?? 1), 0);
  const done = new Array(items.length).fill(0);
  const tick = (label: string) => {
    const p = done.reduce((a, v, i) => a + v * (items[i]!.weight ?? 1), 0) / totalWeight;
    onProgress(Math.min(1, p), label);
  };

  await Promise.all(
    items.map(async (item, i) => {
      try {
        await fetchWithProgress(item.url, (loaded, total) => {
          done[i] = total ? loaded / total : 0.5;
          tick(item.label);
        });
      } catch {
        /* a missing asset must never block boot — the arena has fallbacks */
      }
      done[i] = 1;
      tick(item.label);
    }),
  );
  onProgress(1, "Ready");
}

/**
 * Playable maps / game modes.
 *
 * Each entry describes where the level model lives, how it has to be scaled to
 * match the player scale, where fighters spawn, and the hard barrier box the
 * player can never walk past.
 *
 * Every model is served from /public/models (local). The old build loaded some
 * maps from Lovable-CDN asset URLs (/__l5e/…) that don't exist in an exported
 * repo, which is why the outpost and island maps failed to load — those are now
 * local paths.
 */

import outpostGlb from "@/assets/models/outpost.glb.asset.json";
import verdantIsleGlb from "@/assets/models/verdant-isle.glb.asset.json";
import friendIslandGlb from "@/assets/models/friend-island.glb.asset.json";

export type MapId = "frostline" | "outpost" | "island" | "ice" | "friend-island";
export type MapTeam = "blue" | "red";

export type MapSpawn = { name: string; team: MapTeam; x: number; y: number; z: number };

export type ArenaMap = {
  id: MapId;
  name: string;
  mode: string;
  tagline: string;
  teamSize: number;
  url: string;
  /**
   * Optional low-poly, texture-free clone of the level used purely for
   * raycasts (ground snapping, wall probes, bullets). It is never rendered —
   * the full-detail model above stays on screen.
   */
  collisionUrl?: string;
  /**
   * Editor-baked terrain albedo (KTX2, GPU-compressed). When present, the
   * splat-mask terrain is re-textured with this atlas instead of the
   * repeating-tile splat shader — sampled with the same UVs as the mask.
   */
  terrainAtlasUrl?: string;
  /**
   * Open-air map → gets the painted day skybox, distance fog and the rain/snow
   * weather cycle. Enclosed arenas (frostline) leave it off and keep the dark
   * interior clear colour. Fog here is not just cosmetic: it lets the distant
   * sea/backdrop haze out instead of being drawn crisp, which is the cheap
   * draw-distance win the low-end (2 GB) target needs.
   */
  outdoor?: boolean;
  /** uniform scale applied to the loaded model (1 = authored scale) */
  scale: number;
  /** vertical shift applied after scaling, so the play surface sits near y = 0 */
  yOffset: number;
  /** horizontal shift applied after scaling, so the play area is centred on the origin */
  offsetX: number;
  offsetZ: number;
  /** true → drop each spawn onto whatever surface is underneath it */
  snapToGround: boolean;
  /** hard barrier box; null = derive a square limit from the model bounds */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  spawns: MapSpawn[];
};

export const ARENA_MAPS: Record<MapId, ArenaMap> = {
  frostline: {
    id: "frostline",
    name: "Frostline Depot",
    mode: "2v2 Duel",
    tagline: "Tight industrial compound. Two squads, one courtyard.",
    teamSize: 2,
    url: "/models/arena.glb",
    scale: 1,
    yOffset: 0,
    offsetX: 0,
    offsetZ: 0,
    snapToGround: false,
    bounds: null,
    spawns: [
      { name: "SPAWN_BLUE_1", team: "blue", x: -46.78, y: 0.58, z: -67.08 },
      { name: "SPAWN_BLUE_2", team: "blue", x: -55.04, y: 0.58, z: -67.08 },
      { name: "SPAWN_RED_1", team: "red", x: 45.03, y: 0.58, z: 66.05 },
      { name: "SPAWN_RED_2", team: "red", x: 53.29, y: 0.58, z: 66.05 },
    ],
  },
  outpost: {
    id: "outpost",
    name: "Timber Outpost",
    mode: "4v4 Squad",
    tagline: "Open woodland compound. Eight fighters, one fenced outpost.",
    teamSize: 4,
    url: outpostGlb.url,
    collisionUrl: "/models/outpost-collision.glb",
    outdoor: true,
    // the model is authored at roughly human scale already
    scale: 1,
    // the compound sits far from the origin in the source file — these recentre
    // the playable area and drop the spawn-house floor to y = 0
    yOffset: -1.05,
    offsetX: -22.5,
    offsetZ: -377,
    snapToGround: true,
    // the timber fence ring around the outpost — never passable
    bounds: { minX: -126, maxX: 122, minZ: -84, maxZ: 61 },
    spawns: [
      // TEAM 1 — on the west spawn pad mesh (world centre -125.38, 0.84, 2.65)
      { name: "SPAWN_BLUE_1", team: "blue", x: -125.38, y: 0.84, z: -3.35 },
      { name: "SPAWN_BLUE_2", team: "blue", x: -125.38, y: 0.84, z: 0.65 },
      { name: "SPAWN_BLUE_3", team: "blue", x: -125.38, y: 0.84, z: 4.65 },
      { name: "SPAWN_BLUE_4", team: "blue", x: -125.38, y: 0.84, z: 8.65 },
      // TEAM 2 — on the east spawn pad mesh (world centre 116.92, 0.77, 1.83)
      { name: "SPAWN_RED_1", team: "red", x: 116.92, y: 0.77, z: -4.17 },
      { name: "SPAWN_RED_2", team: "red", x: 116.92, y: 0.77, z: -0.17 },
      { name: "SPAWN_RED_3", team: "red", x: 116.92, y: 0.77, z: 3.83 },
      { name: "SPAWN_RED_4", team: "red", x: 116.92, y: 0.77, z: 7.83 },
    ],

  },
  island: {
    id: "island",
    name: "Verdant Isle",
    mode: "30 Players",
    tagline: "Beaches, jungle plaza and a mountain ridge. Drop, loot, outlast.",
    teamSize: 4,
    // Battle-royale island — Brook's new BR map, textures KTX2, geometry meshopt
    // (his own 16-bit quantisation preserved, NOT re-quantised). ~41 MB.
    url: verdantIsleGlb.url,
    collisionUrl: "/models/verdant-isle-collision.glb",
    outdoor: true,
    // authored at 1 unit = 1 metre — ASSUMED. If the operative looks giant or tiny
    // against the map in-engine, this scale is the knob to turn.
    scale: 1,
    yOffset: 0,
    offsetX: 0,
    offsetZ: 0,
    snapToGround: true,
    // PROVISIONAL, measured straight from the GLB bounds: the land (Terrain mesh) is
    // 1500×1500 centred on origin → ±750, the sea reaches ±2246, the peak is y≈78.
    // This barrier is the full land footprint; tighten it to the real coastline in-engine.
    bounds: { minX: -740, maxX: 740, minZ: -740, maxZ: 740 },
    // PROVISIONAL fallback pads (BR normally drops players from the plane). Spread across
    // the land core at y=90 — above the y≈78 peak — so snapToGround drops each straight
    // down onto terrain. Confirm none land in water or off a cliff, then nudge x/z.
    spawns: [
      { name: "SPAWN_BLUE_1", team: "blue", x: -200, y: 90, z: -200 },
      { name: "SPAWN_BLUE_2", team: "blue", x: 200, y: 90, z: -200 },
      { name: "SPAWN_BLUE_3", team: "blue", x: -200, y: 90, z: 200 },
      { name: "SPAWN_BLUE_4", team: "blue", x: 200, y: 90, z: 200 },
      { name: "SPAWN_RED_1", team: "red", x: 0, y: 90, z: -350 },
      { name: "SPAWN_RED_2", team: "red", x: 350, y: 90, z: 0 },
      { name: "SPAWN_RED_3", team: "red", x: 0, y: 90, z: 350 },
      { name: "SPAWN_RED_4", team: "red", x: -350, y: 90, z: 0 },
    ],
  },
  ice: {
    id: "ice",
    name: "Whiteout",
    mode: "4v4 Squad",
    tagline: "Snowbound forward base. Two garrisons dug into the ice.",
    teamSize: 4,
    url: "/models/ice4v4.glb",
    collisionUrl: "/models/ice4v4-collision.glb",
    outdoor: true,
    scale: 1,
    yOffset: 0,
    offsetX: 0,
    offsetZ: 0,
    snapToGround: true,
    // built-up area sits roughly x∈[-120,70] z∈[-40,100]; terrain plane is huge
    bounds: { minX: -120, maxX: 70, minZ: -40, maxZ: 100 },
    // PROVISIONAL: the source export merged every mesh by material, so the two
    // "spawn point" houses no longer exist as named nodes to read positions
    // from. These are eyeballed near the two garrison clusters and snapped to
    // the floor — confirm in-game and nudge, or re-export with the spawn empties
    // kept as separate named nodes.
    spawns: [
      { name: "SPAWN_BLUE_1", team: "blue", x: -82, y: 14, z: 22 },
      { name: "SPAWN_BLUE_2", team: "blue", x: -86, y: 14, z: 26 },
      { name: "SPAWN_BLUE_3", team: "blue", x: -90, y: 14, z: 22 },
      { name: "SPAWN_BLUE_4", team: "blue", x: -86, y: 14, z: 18 },
      { name: "SPAWN_RED_1", team: "red", x: 24, y: 14, z: 40 },
      { name: "SPAWN_RED_2", team: "red", x: 28, y: 14, z: 44 },
      { name: "SPAWN_RED_3", team: "red", x: 32, y: 14, z: 40 },
      { name: "SPAWN_RED_4", team: "red", x: 28, y: 14, z: 36 },
    ],
  },
  "friend-island": {
    id: "friend-island",
    name: "Friend Island",
    mode: "Hang Out",
    tagline: "A chill place to connect and explore. No weapons, just good vibes.",
    teamSize: 1, // Social mode, not team-based
    url: friendIslandGlb.url,
    collisionUrl: "/models/friend-island-collision.glb",
    outdoor: true,
    scale: 1,
    yOffset: 0,
    offsetX: 0,
    offsetZ: 0,
    snapToGround: true,
    // Provisional: null derives a square limit from the model's own bounds (same
    // fallback frostline uses). Tighten to the real coastline once it is seen in-engine.
    bounds: null,
    // PROVISIONAL pad origins only — the player is dropped from y=200 and snapToGround
    // drops them onto whatever surface is underneath, so the pad height is not the floor.
    spawns: [
      { name: "SPAWN_1", team: "blue", x: 0, y: 200, z: 0 },
      { name: "SPAWN_2", team: "blue", x: 12, y: 200, z: 0 },
      { name: "SPAWN_3", team: "blue", x: -12, y: 200, z: 0 },
    ],
  },
};

export const MAP_LIST: ArenaMap[] = [ARENA_MAPS.frostline, ARENA_MAPS.outpost, ARENA_MAPS.ice, ARENA_MAPS.island, ARENA_MAPS["friend-island"]];

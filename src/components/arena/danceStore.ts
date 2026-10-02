/**
 * Dance shop catalogue — prices, rarity and ownership for the emote dances.
 *
 * Pure data on purpose: `playerProfile` imports `starterDances()` from here, and
 * the profile is loaded at boot, long before the three.js dance bundle exists.
 * The heavy clip loader + the `DANCES` render list live in `operativeAnims.ts`;
 * this module only knows ids, labels and prices. The ids MUST match the clip
 * ids in `operativeAnims.ts` (`DANCES`) and the Blender output — a mismatch just
 * means a shop row that can never play.
 */

export type DanceRarity = "free" | "common" | "rare" | "epic" | "legendary";

export type DanceStoreItem = {
  id: string;
  label: string;
  /** gold price; 0 = owned from the start */
  price: number;
  rarity: DanceRarity;
};

/**
 * The three cheapest emotes are free so a fresh guest always has something to
 * flex; the flashier routines are gold sinks earned by playing.
 */
export const DANCE_STORE: readonly DanceStoreItem[] = [
  { id: "gangnam_style", label: "Gangnam", price: 0, rarity: "free" },
  { id: "hip_hop_dancing", label: "Hip Hop", price: 0, rarity: "free" },
  { id: "robot_hip_hop", label: "Robot", price: 0, rarity: "free" },
  { id: "bboy", label: "B-Boy", price: 500, rarity: "common" },
  { id: "breakdance_1", label: "Breaker I", price: 900, rarity: "rare" },
  { id: "breakdance_3", label: "Breaker II", price: 1400, rarity: "epic" },
  { id: "thriller", label: "Thriller", price: 2500, rarity: "legendary" },
] as const;

export const DANCE_RARITY_LABELS: Record<DanceRarity, string> = {
  free: "Starter",
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

/** CSS colours matching the weapon-skin rarity ladder so the store reads as one system. */
export const DANCE_RARITY_COLORS: Record<DanceRarity, string> = {
  free: "#9ca3af",
  common: "#4ade80",
  rare: "#38bdf8",
  epic: "#c084fc",
  legendary: "#fbbf24",
};

export function danceItem(id: string): DanceStoreItem | undefined {
  return DANCE_STORE.find((d) => d.id === id);
}

/** Free dances every player owns without buying. */
export function starterDances(): string[] {
  return DANCE_STORE.filter((d) => d.price === 0).map((d) => d.id);
}

export function isDanceOwned(owned: readonly string[], id: string): boolean {
  return owned.includes(id);
}

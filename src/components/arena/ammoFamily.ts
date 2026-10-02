/**
 * Ammo families: one shared reserve per calibre group, not one per gun.
 *
 * Before this, `RESERVE_AMMO` in `weapons.ts` gave every weapon id its own private stack of
 * spare rounds — pick up an AK and you got 90 AK rounds, pick up an M4 and you got a separate
 * 90 M4 rounds, and no pickup could ever feed a gun you had not personally acquired. That is not
 * how a battle royale reads: you loot a crate of 7.62 and it feeds every rifle you carry.
 *
 * Brook's rule, in his words: "th heavy weapens should use one shared ammo however its can not
 * be used using the light geans ammo for own well sinper its own ammo same goes for the shotgen
 * we have 2 shotguns so they can use the same one and for the pistol its own one". So five
 * families, each with one pool:
 *
 *   rifle    Assault + Heavy — the AKs, M4, SCAR and the M249 all drink from one 7.62/5.56 pool
 *   light    SMG — 9 mm, deliberately NOT usable by the rifles ("its can not be used")
 *   shotgun  both shotguns share it (m1014 + spas12)
 *   sniper   its own
 *   pistol   its own
 *   (melee has none, which is what `null` means here)
 *
 * `RESERVE_AMMO` is left in `weapons.ts` untouched: it is still the honest per-weapon figure and
 * it is what `FAMILY_BOX` below was sized against, but nothing reads it for the player's reserve
 * any more.
 */

import { getWeapon, type WeaponClass } from "./weapons";

export type AmmoFamily = "rifle" | "light" | "shotgun" | "sniper" | "pistol";

/** Iteration order for every UI that lists all five — heaviest calibre first. */
export const AMMO_FAMILIES: AmmoFamily[] = ["rifle", "light", "shotgun", "sniper", "pistol"];

/** Exhaustive so adding a `WeaponClass` fails typecheck here until it has a family. */
export const FAMILY_OF_CLASS: Record<WeaponClass, AmmoFamily | null> = {
  Assault: "rifle",
  Heavy: "rifle",
  SMG: "light",
  Shotgun: "shotgun",
  Sniper: "sniper",
  Pistol: "pistol",
  Melee: null,
};

/** The family a weapon id draws from, or null for melee and for anything unknown. */
export function familyOf(weaponId: string | null | undefined): AmmoFamily | null {
  if (!weaponId) return null;
  const w = getWeapon(weaponId);
  if (!w) return null;
  return FAMILY_OF_CLASS[w.cls];
}

export const FAMILY_LABEL: Record<AmmoFamily, string> = {
  rifle: "Rifle ammo",
  light: "Light ammo",
  shotgun: "Shells",
  sniper: "Sniper ammo",
  pistol: "Pistol ammo",
};

/** Three letters for the ammo counter and the loot rows, where there is no space for a name. */
export const FAMILY_SHORT: Record<AmmoFamily, string> = {
  rifle: "RIF",
  light: "LGT",
  shotgun: "SHL",
  sniper: "SNP",
  pistol: "PST",
};

/** Beacon tint for the ground crate, matching the class colours already in `worldLoot.ts`. */
export const FAMILY_COLOR: Record<AmmoFamily, number> = {
  rifle: 0xffb020,
  light: 0x36c6ff,
  shotgun: 0xff5a3c,
  sniper: 0xb968ff,
  pistol: 0xffd45e,
};

/**
 * Rounds in one looted crate, and — because a partial crate still takes up a crate's worth of
 * room — also the divisor for how much of the backpack a pool costs. Sized off the old
 * per-weapon `RESERVE_AMMO`: a rifle carried 90 spare, so 60 to a crate means a rifle tops out
 * from empty in two pickups instead of one.
 */
export const FAMILY_BOX: Record<AmmoFamily, number> = {
  rifle: 60,
  light: 90,
  shotgun: 16,
  sniper: 12,
  pistol: 28,
};

/**
 * What a fighter has spare at the start of a LOOT mode (`lastHowl`, `ironclash`).
 *
 * Small on purpose — one crate of each at most. A battle royale where you spawn with full
 * pockets has no reason to open a building, and the backpack cap (see `backpack.ts`) means a
 * generous start would also leave no room to loot.
 */
export const FAMILY_START_LOOT: Record<AmmoFamily, number> = {
  rifle: 30,
  light: 45,
  shotgun: 8,
  sniper: 5,
  pistol: 14,
};

/**
 * The arena modes' start, where ammo comes from the buy menu rather than the ground. Two crates
 * of each, i.e. roughly what the old per-weapon reserves handed out for the two guns you carried.
 */
export const FAMILY_START_ARENA: Record<AmmoFamily, number> = {
  rifle: 120,
  light: 180,
  shotgun: 32,
  sniper: 24,
  pistol: 56,
};

/** The ground prop for a crate of this family. Every one is a real GLB in `public/models`. */
export const FAMILY_MODEL: Record<AmmoFamily, string> = {
  // Brook's two purpose-built crates: the gunmetal 7.62 box and the olive 9 mm / 5.56 box.
  rifle: "/models/ammo-heavy.glb",
  light: "/models/ammo-light.glb",
  shotgun: "/models/ammo-shotgun.glb",
  sniper: "/models/ammo-sniper.glb",
  // NOTE: this one's art is a shotgun box (it came from `ammo_box_-_shotgun.glb`) — it stands in
  // until there is a pistol crate. Swapping it is this one line.
  pistol: "/models/ammo-pistol.glb",
};

export type AmmoPools = Record<AmmoFamily, number>;

export function emptyPools(): AmmoPools {
  return { rifle: 0, light: 0, shotgun: 0, sniper: 0, pistol: 0 };
}

export function startingPools(loot: boolean): AmmoPools {
  return { ...(loot ? FAMILY_START_LOOT : FAMILY_START_ARENA) };
}

/** Spare rounds available to `weaponId`, i.e. its family's pool. Melee always reads 0. */
export function reserveFor(pools: AmmoPools, weaponId: string | null | undefined): number {
  const f = familyOf(weaponId);
  return f ? pools[f] : 0;
}

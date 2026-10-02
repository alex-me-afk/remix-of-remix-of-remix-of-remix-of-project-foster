/**
 * Weapon skins / Armory.
 *
 * Each skin is a cosmetic variant for a specific weapon that also tweaks its
 * stats (e.g. +damage, -reload, +fire rate). Skins are owned by the player and
 * can be swapped in the armory. The base weapon is always available; skins are
 * overlays that modify the displayed stats.
 */

export type WeaponSkin = {
  id: string;
  name: string;
  weaponId: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  /** stat deltas applied to the base weapon */
  stats: {
    damage?: number;
    fireRate?: number;
    range?: number;
    magazine?: number;
  };
  /** price in shards */
  price: number;
};

export const WEAPON_SKINS: WeaponSkin[] = [
  // AK47
  { id: "ak47-gold", name: "Gold AK47", weaponId: "ak47", rarity: "legendary", stats: { damage: 4, fireRate: -2 }, price: 200 },
  { id: "ak47-carbon", name: "Carbon AK47", weaponId: "ak47", rarity: "rare", stats: { fireRate: 4, range: 3 }, price: 80 },
  // M4A1
  { id: "m4a1-tiger", name: "Tiger M4A1", weaponId: "m4a1", rarity: "rare", stats: { damage: 2, range: 2 }, price: 90 },
  { id: "m4a1-digital", name: "Digital M4A1", weaponId: "m4a1", rarity: "epic", stats: { fireRate: 5, magazine: 5 }, price: 150 },
  // SCAR
  { id: "scar-ice", name: "Frost SCAR", weaponId: "scar", rarity: "rare", stats: { damage: 3, range: -2 }, price: 85 },
  // MP40
  { id: "mp40-neon", name: "Neon MP40", weaponId: "mp40", rarity: "epic", stats: { fireRate: 5, damage: -1 }, price: 120 },
  // UMP
  { id: "ump-steel", name: "Steel UMP", weaponId: "ump", rarity: "common", stats: { range: 3 }, price: 40 },
  // M1014
  { id: "m1014-camo", name: "Jungle M1014", weaponId: "m1014", rarity: "rare", stats: { damage: 3, range: 2 }, price: 75 },
  // AWM
  { id: "awm-dragon", name: "Dragon AWM", weaponId: "awm", rarity: "legendary", stats: { damage: 6, fireRate: -3 }, price: 250 },
  // Deagle
  { id: "deagle-platinum", name: "Platinum Deagle", weaponId: "deagle", rarity: "epic", stats: { damage: 3, range: 2 }, price: 100 },
  // Knife
  { id: "knife-crimson", name: "Crimson Knife", weaponId: "knife", rarity: "rare", stats: { damage: 5 }, price: 60 },
];

export const SKIN_RARITY_COLORS: Record<WeaponSkin["rarity"], number> = {
  common: 0x9ca3af,
  rare: 0x4fa8ff,
  epic: 0xa06bff,
  legendary: 0xffd45e,
};

export function skinForWeapon(weaponId: string) {
  return WEAPON_SKINS.filter((s) => s.weaponId === weaponId);
}

export function getSkin(id: string | null) {
  return WEAPON_SKINS.find((s) => s.id === id) ?? null;
}

export function rarityLabel(r: WeaponSkin["rarity"]) {
  return r[0]!.toUpperCase() + r.slice(1);
}

/** Apply an equipped skin's stat deltas to a base weapon. */
export function applySkinStats<T extends { damage: number; fireRate: number; range: number; magazine: number }>(
  base: T | undefined,
  skinId: string | undefined | null,
): T | undefined {
  if (!base) return undefined;
  const skin = skinId ? getSkin(skinId) : null;
  if (!skin) return base;
  return {
    ...base,
    damage: base.damage + (skin.stats.damage ?? 0),
    fireRate: base.fireRate + (skin.stats.fireRate ?? 0),
    range: base.range + (skin.stats.range ?? 0),
    magazine: base.magazine + (skin.stats.magazine ?? 0),
  };
}

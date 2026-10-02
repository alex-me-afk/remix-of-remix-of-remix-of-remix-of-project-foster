import type { Weapon } from "./weapons";

/**
 * Weapon attachments that alter in-match stats.
 *
 * Each attachment belongs to a slot. A weapon can equip one attachment
 * at a time (in addition to its cosmetic skin).
 */

export type AttachmentSlot = "muzzle" | "silencer" | "foregrip" | "magazine" | "stock" | "scope";

export type Attachment = {
  id: string;
  name: string;
  slot: AttachmentSlot;
  weaponId: string;
  price: number;
  /** stat deltas applied on top of the weapon base */
  stats: Partial<{
    damage: number;
    fireRate: number;
    range: number;
    magazine: number;
    reloadSpeed: number; // negative = faster reload
    recoil: number; // negative = less recoil
    moveSpeed: number; // % while aiming
    scopeZoom: number; // multiplier
  }>;
  /** short description shown in the armory */
  blurb: string;
};

export const ATTACHMENTS: Attachment[] = [
  // AK47
  { id: "ak47-muzzle", name: "Heavy Muzzle", slot: "muzzle", weaponId: "ak47", price: 400, stats: { range: 8, damage: 3 }, blurb: "+range +damage" },
  { id: "ak47-foregrip", name: "Tactical Foregrip", slot: "foregrip", weaponId: "ak47", price: 350, stats: { recoil: -12 }, blurb: "-recoil" },
  { id: "ak47-mag", name: "Extended Mag", slot: "magazine", weaponId: "ak47", price: 300, stats: { magazine: 10, reloadSpeed: 8 }, blurb: "+mag -reload" },
  { id: "ak47-stock", name: "Light Stock", slot: "stock", weaponId: "ak47", price: 250, stats: { moveSpeed: 0.08 }, blurb: "+ads move speed" },
  { id: "ak47-scope", name: "4x Scope", slot: "scope", weaponId: "ak47", price: 450, stats: { scopeZoom: 2.5, recoil: -5 }, blurb: "zoom + stability" },

  // M4A1
  { id: "m4a1-silencer", name: "Suppressor", slot: "silencer", weaponId: "m4a1", price: 500, stats: { damage: -2, range: 4 }, blurb: "silent shots +range" },
  { id: "m4a1-foregrip", name: "Angled Grip", slot: "foregrip", weaponId: "m4a1", price: 350, stats: { recoil: -10 }, blurb: "-recoil" },
  { id: "m4a1-mag", name: "Drum Mag", slot: "magazine", weaponId: "m4a1", price: 400, stats: { magazine: 15, reloadSpeed: 12 }, blurb: "+mag" },
  { id: "m4a1-stock", name: "Tactical Stock", slot: "stock", weaponId: "m4a1", price: 300, stats: { moveSpeed: 0.1 }, blurb: "+ads move speed" },
  { id: "m4a1-scope", name: "2x Holo", slot: "scope", weaponId: "m4a1", price: 350, stats: { scopeZoom: 2, recoil: -3 }, blurb: "zoom" },

  // SCAR
  { id: "scar-muzzle", name: "Compensator", slot: "muzzle", weaponId: "scar", price: 400, stats: { range: 6, recoil: -6 }, blurb: "+range -recoil" },
  { id: "scar-mag", name: "Quick Mag", slot: "magazine", weaponId: "scar", price: 300, stats: { magazine: 8, reloadSpeed: -10 }, blurb: "+mag +reload" },
  { id: "scar-stock", name: "Marksman Stock", slot: "stock", weaponId: "scar", price: 300, stats: { moveSpeed: 0.06, recoil: -4 }, blurb: "stable while moving" },

  // MP40
  { id: "mp40-silencer", name: "SMG Suppressor", slot: "silencer", weaponId: "mp40", price: 400, stats: { range: 3 }, blurb: "silent +range" },
  { id: "mp40-mag", name: "Dual Stack", slot: "magazine", weaponId: "mp40", price: 300, stats: { magazine: 12, reloadSpeed: 6 }, blurb: "+mag" },
  { id: "mp40-foregrip", name: "Stub Grip", slot: "foregrip", weaponId: "mp40", price: 250, stats: { recoil: -8 }, blurb: "-recoil" },

  // UMP
  { id: "ump-muzzle", name: "UMP Brake", slot: "muzzle", weaponId: "ump", price: 350, stats: { damage: 2, range: 5 }, blurb: "+damage +range" },
  { id: "ump-mag", name: "Extended UMP Mag", slot: "magazine", weaponId: "ump", price: 280, stats: { magazine: 10 }, blurb: "+mag" },

  // M1014
  { id: "m1014-choke", name: "Full Choke", slot: "muzzle", weaponId: "m1014", price: 400, stats: { range: 6, damage: 4 }, blurb: "tighter spread" },
  { id: "m1014-stock", name: "Shotgun Stock", slot: "stock", weaponId: "m1014", price: 250, stats: { moveSpeed: 0.08 }, blurb: "+ads move speed" },

  // SPAS12
  { id: "spas12-choke", name: "Duckbill", slot: "muzzle", weaponId: "spas12", price: 400, stats: { range: 5, damage: 5 }, blurb: "+range +damage" },

  // AWM
  { id: "awm-scope", name: "Thermal Scope", slot: "scope", weaponId: "awm", price: 700, stats: { scopeZoom: 4, range: 6 }, blurb: "4x thermal zoom" },
  { id: "awm-muzzle", name: "Sniper Brake", slot: "muzzle", weaponId: "awm", price: 500, stats: { range: 8, recoil: -8 }, blurb: "+range -recoil" },
  { id: "awm-stock", name: "Heavy Stock", slot: "stock", weaponId: "awm", price: 400, stats: { moveSpeed: 0.05, recoil: -6 }, blurb: "stable" },

  // KAR98K
  { id: "kar98k-scope", name: "6x Scope", slot: "scope", weaponId: "kar98k", price: 600, stats: { scopeZoom: 3, range: 4 }, blurb: "long zoom" },
  { id: "kar98k-muzzle", name: "Bolt Brake", slot: "muzzle", weaponId: "kar98k", price: 400, stats: { recoil: -10, range: 3 }, blurb: "-recoil" },

  // M249
  { id: "m249-mag", name: "Belt Box", slot: "magazine", weaponId: "m249", price: 500, stats: { magazine: 50, reloadSpeed: 15 }, blurb: "huge mag" },
  { id: "m249-foregrip", name: "Bipod Grip", slot: "foregrip", weaponId: "m249", price: 400, stats: { recoil: -15 }, blurb: "-recoil" },

  // Deagle
  { id: "deagle-muzzle", name: "Pistol Brake", slot: "muzzle", weaponId: "deagle", price: 300, stats: { range: 5, recoil: -8 }, blurb: "+range -recoil" },
  { id: "deagle-mag", name: "Extended Pistol Mag", slot: "magazine", weaponId: "deagle", price: 200, stats: { magazine: 3 }, blurb: "+mag" },
];

export function getAttachment(id: string | null) {
  return ATTACHMENTS.find((a) => a.id === id) ?? null;
}

export function attachmentsForWeapon(weaponId: string) {
  return ATTACHMENTS.filter((a) => a.weaponId === weaponId);
}

export function applyAttachmentStats(base: Weapon | undefined, attachmentId: string | null): Weapon | null {
  if (!base) return null;
  const a = getAttachment(attachmentId);
  if (!a) return base;
  return {
    ...base,
    damage: base.damage + (a.stats.damage ?? 0),
    fireRate: Math.max(1, base.fireRate + (a.stats.fireRate ?? 0)),
    range: Math.max(1, base.range + (a.stats.range ?? 0)),
    magazine: Math.max(1, base.magazine + (a.stats.magazine ?? 0)),
  };
}

export function attachmentStatText(a: Attachment) {
  const parts: string[] = [];
  if (a.stats.damage) parts.push(`${a.stats.damage > 0 ? "+" : ""}${a.stats.damage} dmg`);
  if (a.stats.fireRate) parts.push(`${a.stats.fireRate > 0 ? "+" : ""}${a.stats.fireRate} rof`);
  if (a.stats.range) parts.push(`${a.stats.range > 0 ? "+" : ""}${a.stats.range} rng`);
  if (a.stats.magazine) parts.push(`${a.stats.magazine > 0 ? "+" : ""}${a.stats.magazine} mag`);
  if (a.stats.reloadSpeed) parts.push(`${a.stats.reloadSpeed > 0 ? "" : "+"}${Math.abs(a.stats.reloadSpeed)}% reload`);
  if (a.stats.recoil) parts.push(`${a.stats.recoil > 0 ? "+" : ""}${a.stats.recoil}% recoil`);
  if (a.stats.moveSpeed) parts.push(`${Math.round(a.stats.moveSpeed * 100)}% ads move`);
  if (a.stats.scopeZoom) parts.push(`${a.stats.scopeZoom}x zoom`);
  return parts.join(" · ") || a.blurb;
}

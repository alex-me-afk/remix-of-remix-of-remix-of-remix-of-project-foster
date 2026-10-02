/**
 * What is inside a lootable container, and how it is described to the player.
 *
 * The old containers had no contents: walking within 1.7 m of a death pack ran `topUpAmmo()` and
 * added a medkit, and an airdrop silently overwrote whichever gun you were holding. Brook's
 * objection is the overwrite — "nothing should reaplce directly what the player has its should be
 * a player choice" — and the fix is that a container now carries an explicit LIST. Standing on it
 * opens that list at the side of the screen (`LootPanel`), and every line is a button.
 *
 * A stash is deliberately plain data: no meshes, no THREE, no React. The arena owns placing it,
 * `LootPanel` owns drawing it, and this module owns what a container of each type contains and
 * what each line looks like.
 */

import {
  AMMO_FAMILIES,
  FAMILY_BOX,
  FAMILY_LABEL,
  FAMILY_OF_CLASS,
  type AmmoFamily,
} from "./ammoFamily";
import { AMMO_FAMILY_ICON, GRENADE_ICON, LOOT_ICON, WALL_ICON } from "./icons";
import { GRENADE_DEFS, type GrenadeKind } from "./bomb";
import { getWeapon } from "./weapons";

export type StashEntry =
  | { kind: "weapon"; weaponId: string; qty: number }
  | { kind: "ammo"; family: AmmoFamily; qty: number }
  | { kind: "kit"; qty: number }
  | { kind: "inhaler"; qty: number }
  | { kind: "wall"; qty: number }
  | { kind: "grenade"; grenade: GrenadeKind; qty: number }
  | { kind: "armor"; slot: "vest" | "helmet"; level: 1 | 2 | 3; qty: number };

export type Stash = {
  /** Where it came from, purely for the panel's heading. */
  source: "pack" | "chest" | "crate";
  entries: StashEntry[];
};

/** Art for one line. Weapons use their own render, everything else its loot icon. */
export function entryIcon(e: StashEntry): string {
  switch (e.kind) {
    case "weapon":
      return getWeapon(e.weaponId)?.image ?? LOOT_ICON.armorPlate;
    case "ammo":
      return AMMO_FAMILY_ICON[e.family];
    case "kit":
      return LOOT_ICON.medkit;
    case "inhaler":
      return LOOT_ICON.inhaler;
    case "wall":
      return WALL_ICON;
    case "grenade":
      return GRENADE_ICON[e.grenade];
    case "armor":
      return LOOT_ICON.armorPlate;
  }
}

export function entryLabel(e: StashEntry): string {
  switch (e.kind) {
    case "weapon":
      return getWeapon(e.weaponId)?.name ?? e.weaponId;
    case "ammo":
      return FAMILY_LABEL[e.family];
    case "kit":
      return "Medkit";
    case "inhaler":
      return "Inhaler";
    case "wall":
      return "Frost wall";
    case "grenade":
      return GRENADE_DEFS[e.grenade].label;
    case "armor":
      return `${e.slot === "vest" ? "Vest" : "Helmet"} Lv.${e.level}`;
  }
}

/** Merge duplicates so a stash never shows "Medkit x1" three times in a row. */
function collapse(entries: StashEntry[]): StashEntry[] {
  const out: StashEntry[] = [];
  for (const e of entries) {
    if (e.qty <= 0) continue;
    const key = (x: StashEntry) =>
      x.kind === "ammo"
        ? `ammo:${x.family}`
        : x.kind === "grenade"
          ? `nade:${x.grenade}`
          : x.kind === "weapon"
            ? `gun:${x.weaponId}`
            : x.kind === "armor"
              ? `armor:${x.slot}:${x.level}`
              : x.kind;
    const found = out.find((o) => key(o) === key(e));
    if (found) found.qty += e.qty;
    else out.push({ ...e });
  }
  return out;
}

const chance = (p: number) => Math.random() < p;
const between = (lo: number, hi: number) => lo + ((Math.random() * (hi - lo + 1)) | 0);

/**
 * A dead fighter's kit. Their guns are the real ones they were holding, which is the point of
 * looting a body — Brook's "what that player had before". The consumables are rolled, because a
 * bot has no medkit count to read off: they carry an inventory only in the sense that the loot
 * they drop should look like one.
 */
export function rollDeathStash(carried: (string | null | undefined)[]): Stash {
  const entries: StashEntry[] = [];
  for (const id of carried) {
    // No point dropping fists, and a duplicate of a gun already in the pile reads as a bug.
    if (!id || id === "fists") continue;
    const w = getWeapon(id);
    if (!w || w.cls === "Melee") continue;
    entries.push({ kind: "weapon", weaponId: id, qty: 1 });
    // Spare rounds for that gun, so a looted weapon is not a paperweight.
    const fam = FAMILY_OF_CLASS[w.cls];
    if (fam) entries.push({ kind: "ammo", family: fam, qty: Math.round(FAMILY_BOX[fam] * 0.5) });
  }
  if (chance(0.75)) entries.push({ kind: "kit", qty: between(1, 2) });
  if (chance(0.4)) entries.push({ kind: "inhaler", qty: 1 });
  if (chance(0.5)) entries.push({ kind: "grenade", grenade: "frag", qty: between(1, 2) });
  if (chance(0.25)) entries.push({ kind: "grenade", grenade: "smoke", qty: 1 });
  if (chance(0.3)) entries.push({ kind: "wall", qty: 1 });
  return { source: "pack", entries: collapse(entries) };
}

/** A gold chest: a landmark cache. One gun, plates, and a decent spread of supplies. */
export function rollChestStash(weaponId: string | undefined): Stash {
  const entries: StashEntry[] = [];
  if (weaponId) entries.push({ kind: "weapon", weaponId, qty: 1 });
  const fam = AMMO_FAMILIES[(Math.random() * AMMO_FAMILIES.length) | 0]!;
  entries.push({ kind: "ammo", family: fam, qty: FAMILY_BOX[fam] });
  entries.push({ kind: "kit", qty: between(1, 3) });
  entries.push({ kind: "inhaler", qty: between(1, 2) });
  entries.push({ kind: "grenade", grenade: chance(0.5) ? "frag" : "flash", qty: between(1, 2) });
  entries.push({ kind: "armor", slot: chance(0.5) ? "vest" : "helmet", level: 2, qty: 1 });
  return { source: "chest", entries: collapse(entries) };
}

/** The airdrop: the tier you cannot find in the grass, plus enough to use it. */
export function rollAirdropStash(weaponId: string | undefined): Stash {
  const entries: StashEntry[] = [];
  if (weaponId) entries.push({ kind: "weapon", weaponId, qty: 1 });
  const w = weaponId ? getWeapon(weaponId) : null;
  const fam = (w ? FAMILY_OF_CLASS[w.cls] : null) ?? "rifle";
  entries.push({ kind: "ammo", family: fam, qty: FAMILY_BOX[fam] * 2 });
  entries.push({ kind: "kit", qty: 3 });
  entries.push({ kind: "inhaler", qty: 2 });
  entries.push({ kind: "grenade", grenade: "frag", qty: 2 });
  entries.push({ kind: "wall", qty: 2 });
  entries.push({ kind: "armor", slot: "vest", level: 3, qty: 1 });
  entries.push({ kind: "armor", slot: "helmet", level: 3, qty: 1 });
  return { source: "crate", entries: collapse(entries) };
}

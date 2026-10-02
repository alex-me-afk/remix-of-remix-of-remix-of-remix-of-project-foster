/**
 * Every small UI icon in one place, as a typed lookup instead of a filename.
 *
 * Why these are `@/assets` imports while the character/car/pet cards are plain `/public` URLs
 * (see `BannerArt.tsx`): the trade-off runs opposite ways for the two kinds of art. A bundled
 * import is content-hashed, so it caches forever and a missing file fails the BUILD instead of
 * 404ing at runtime — which is what you want for an icon set that is complete and that the UI
 * has no sensible fallback for. Big card art arrives one operative at a time and must NOT be
 * able to break the build, so it stays a URL with a fallback chip.
 *
 * The maps are exhaustive `Record`s on purpose: adding a weapon class, an armour level or a
 * power now fails typecheck here until it has an icon, which is cheaper than finding out from
 * a blank square in the HUD.
 */

import type { ArmorSlot, ArmorLevel } from "./armor";
import type { AttachmentSlot } from "./attachments";
import type { PowerId } from "./powers";
import type { WeaponClass } from "./weapons";
import type { GrenadeKind } from "./bomb";
import type { AmmoFamily } from "./ammoFamily";

import vest1 from "@/assets/icons/armor/vest1.png";
import vest2 from "@/assets/icons/armor/vest2.png";
import vest3 from "@/assets/icons/armor/vest3.png";
import vest4 from "@/assets/icons/armor/vest4.png";
import helmet1 from "@/assets/icons/armor/helmet1.png";
import helmet2 from "@/assets/icons/armor/helmet2.png";
import helmet3 from "@/assets/icons/armor/helmet3.png";
import helmet4 from "@/assets/icons/armor/helmet4.png";

import ammoLight from "@/assets/icons/loot/ammo-light.png";
import ammoHeavy from "@/assets/icons/loot/ammo-heavy.png";
import ammoShotgun from "@/assets/icons/loot/ammo-shotgun.png";
import ammoSniper from "@/assets/icons/loot/ammo-sniper.png";
import armorPlate from "@/assets/icons/loot/armor-plate.png";
import flashbangIcon from "@/assets/icons/loot/flashbang.png";
import smokeIcon from "@/assets/icons/loot/smoke.png";
import medkitIcon from "@/assets/icons/loot/medkit.png";
import stimIcon from "@/assets/icons/loot/stim.png";

import suppressor from "@/assets/icons/attachments/suppressor.png";
import foregrip from "@/assets/icons/attachments/foregrip.png";
import extmag from "@/assets/icons/attachments/extmag.png";
import stockIcon from "@/assets/icons/attachments/stock.png";
import laserIcon from "@/assets/icons/attachments/laser.png";
import scopeIcon from "@/assets/hud/scope.png";
import bombIcon from "@/assets/hud/bomb.png";
import wallHudIcon from "@/assets/hud/wall.png";

import skillHowl from "@/assets/icons/skills/howl-frost-wall.png";
import skillEmber from "@/assets/icons/skills/ember-flame-burst.png";
import skillVireo from "@/assets/icons/skills/vireo-radar-sweep.png";
import skillOnyx from "@/assets/icons/skills/onyx-hex-shield.png";
import skillLumen from "@/assets/icons/skills/lumen-rising-wall.png";
import skillNyx from "@/assets/icons/skills/nyx-suppressed-crosshair.png";

import rankBronze from "@/assets/icons/ranks/bronze.png";
import rankSilver from "@/assets/icons/ranks/silver.png";
import rankGold from "@/assets/icons/ranks/gold.png";
import rankPlatinum from "@/assets/icons/ranks/platinum.png";
import rankDiamond from "@/assets/icons/ranks/diamond.png";
import rankApex from "@/assets/icons/ranks/heroic.png";
import rankMaster from "@/assets/icons/ranks/master.png";
import rankGrandmaster from "@/assets/icons/ranks/grandmaster.png";

/* ---------------------------------------------------------------- armour */

const VEST = [vest1, vest2, vest3, vest4];
const HELMET = [helmet1, helmet2, helmet3, helmet4];

/** Level 0 is "no piece", so it has no icon — callers render the empty slot instead. */
export function armorIcon(slot: ArmorSlot, level: ArmorLevel): string | null {
  if (level < 1) return null;
  return (slot === "vest" ? VEST : HELMET)[level - 1] ?? null;
}

/* ------------------------------------------------------------------ loot */

/** Ammo pools follow the class, the way the pickup art does: one box per family. */
export const AMMO_ICON: Record<WeaponClass, string> = {
  Assault: ammoHeavy,
  Heavy: ammoHeavy,
  SMG: ammoLight,
  Pistol: ammoLight,
  Shotgun: ammoShotgun,
  Sniper: ammoSniper,
  Melee: ammoLight,
};

/**
 * The same four boxes, keyed by the five ammo FAMILIES that actually hold rounds (`ammoFamily.ts`).
 * `pistol` shares the light box because the pack has four ammo icons and there are five families —
 * a dedicated `ammo-pistol.png` is a one-line change here once it exists.
 */
export const AMMO_FAMILY_ICON: Record<AmmoFamily, string> = {
  rifle: ammoHeavy,
  light: ammoLight,
  shotgun: ammoShotgun,
  sniper: ammoSniper,
  pistol: ammoLight,
};

/** The frost wall charge, in loot lists and the backpack. Same glyph the touch button uses. */
export const WALL_ICON = wallHudIcon;

export const LOOT_ICON = {
  medkit: medkitIcon,
  inhaler: stimIcon,
  armorPlate: armorPlate,
} as const;

/** `decoy` has no art of its own yet, so it borrows the frag bomb icon. */
export const GRENADE_ICON: Record<GrenadeKind, string> = {
  frag: bombIcon,
  flash: flashbangIcon,
  smoke: smokeIcon,
  decoy: bombIcon,
};

/* ----------------------------------------------------------- attachments */

/**
 * By slot, not by attachment id: there are 60-odd attachments across 14 weapons and five of
 * them are the same five parts every time. `muzzle` and `silencer` share the suppressor art
 * because both are barrel devices; `scope` reuses the HUD's own scope glyph.
 */
export const ATTACH_ICON: Record<AttachmentSlot, string> = {
  muzzle: suppressor,
  silencer: suppressor,
  foregrip: foregrip,
  magazine: extmag,
  stock: stockIcon,
  scope: scopeIcon,
};

/** Spare art: no laser-sight slot exists yet. Kept here so the file is not orphaned. */
export const LASER_ICON = laserIcon;

/* ---------------------------------------------------------------- powers */

/**
 * Keyed by power, but the art is named per operative, which is the same mapping seen from the
 * other side — every operative owns exactly one power. `bulwark` is in the POWERS table and on
 * nobody's roster entry, so it falls back to Onyx's shield.
 */
export const POWER_ICON: Record<PowerId, string> = {
  coldsnap: skillHowl,
  overburn: skillEmber,
  slipstream: skillVireo,
  emberveil: skillOnyx,
  lifespring: skillLumen,
  deadeye: skillNyx,
  bulwark: skillOnyx,
};

/* ----------------------------------------------------------------- ranks */

/** Keyed by the tier NAME in `RANK_TIERS`, so the ladder stays the single source of truth. */
export const RANK_ICON: Record<string, string> = {
  Bronze: rankBronze,
  Silver: rankSilver,
  Gold: rankGold,
  Platinum: rankPlatinum,
  Diamond: rankDiamond,
  Apex: rankApex,
  Master: rankMaster,
  Grandmaster: rankGrandmaster,
};

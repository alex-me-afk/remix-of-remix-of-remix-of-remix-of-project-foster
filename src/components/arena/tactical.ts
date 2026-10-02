/**
 * Tactical loadout items — one-shot match-start boosts or special utilities.
 *
 * These are selected in the Loadout panel alongside the active power and
 * passive skills. Only one tactical item can be equipped at a time.
 */

export type TacticalId = "scanner" | "bonfire" | "airdrop" | "bounty" | "armorCrate" | "legPockets";

export type Tactical = {
  id: TacticalId;
  name: string;
  blurb: string;
  color: number;
};

export const TACTICALS: Record<TacticalId, Tactical> = {
  scanner: {
    id: "scanner",
    name: "Scanner",
    blurb: "Reveals nearby enemies on the minimap for the first 20s.",
    color: 0x3f8fff,
  },
  bonfire: {
    id: "bonfire",
    name: "Bonfire",
    blurb: "Deployable heal zone that restores HP and EP over time.",
    color: 0xff6b3d,
  },
  airdrop: {
    id: "airdrop",
    name: "Airdrop",
    blurb: "Call a personal loot crate once per match.",
    color: 0xffd45e,
  },
  bounty: {
    id: "bounty",
    name: "Bounty Token",
    blurb: "Bonus gold on your first kill of the match.",
    color: 0xf2c94c,
  },
  armorCrate: {
    id: "armorCrate",
    name: "Armor Crate",
    blurb: "Start the match with a random level helmet and vest.",
    color: 0x4fa8ff,
  },
  legPockets: {
    id: "legPockets",
    name: "Leg Pockets",
    blurb: "Larger starting backpack capacity.",
    color: 0x46d39a,
  },
};

export const TACTICAL_IDS = Object.keys(TACTICALS) as TacticalId[];

export const TACTICAL_BONUS = 150;

export function rollArmorLevel(): 1 | 2 | 3 | 4 {
  const r = Math.random();
  if (r < 0.5) return 1;
  if (r < 0.8) return 2;
  if (r < 0.95) return 3;
  return 4;
}

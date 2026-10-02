/**
 * Passive skill system — Skill Slots.
 *
 * Every operative can equip one active power (character ability) plus up to
 * three passive skills. Passives are small, always-on multipliers that stack
 * additively with the active power's effects, so a loadout can emphasise
 * defence, speed, damage or utility.
 */

import { TACTICAL_IDS, type TacticalId } from "./tactical";

export type PassiveSkillId =
  | "sprint"
  | "armor"
  | "berserker"
  | "medic"
  | "quickdraw"
  | "steady"
  | "nimble"
  | "scavenger";

export type PassiveSkill = {
  id: PassiveSkillId;
  name: string;
  blurb: string;
  /** color used by the loadout chip */
  color: number;
  effects: {
    /** incoming damage multiplier (e.g. 0.9 = 10% less damage) */
    damageTaken?: number;
    /** outgoing damage multiplier (e.g. 1.1 = 10% more damage) */
    damageDealt?: number;
    /** movement speed multiplier */
    speed?: number;
    /** HP regenerated per second */
    regen?: number;
    /** recoil multiplier */
    recoil?: number;
    /** reload time multiplier */
    reload?: number;
    /** gold earned multiplier from matches */
    gold?: number;
  };
};

export const PASSIVE_SKILLS: Record<PassiveSkillId, PassiveSkill> = {
  sprint: {
    id: "sprint",
    name: "Sprint",
    blurb: "+10% movement speed.",
    color: 0x46d39a,
    effects: { speed: 1.1 },
  },
  armor: {
    id: "armor",
    name: "Armor",
    blurb: "-10% damage taken.",
    color: 0x4fa8ff,
    effects: { damageTaken: 0.9 },
  },
  berserker: {
    id: "berserker",
    name: "Berserker",
    blurb: "+10% damage dealt.",
    color: 0xff6b3d,
    effects: { damageDealt: 1.1 },
  },
  medic: {
    id: "medic",
    name: "Medic",
    blurb: "+3 HP regenerated per second.",
    color: 0xf2c94c,
    effects: { regen: 3 },
  },
  quickdraw: {
    id: "quickdraw",
    name: "Quickdraw",
    blurb: "-10% reload time.",
    color: 0xffd23f,
    effects: { reload: 0.9 },
  },
  steady: {
    id: "steady",
    name: "Steady",
    blurb: "-15% recoil.",
    color: 0xa06bff,
    effects: { recoil: 0.85 },
  },
  nimble: {
    id: "nimble",
    name: "Nimble",
    blurb: "+8% movement speed and -5% damage taken.",
    color: 0x7cff4f,
    effects: { speed: 1.08, damageTaken: 0.95 },
  },
  scavenger: {
    id: "scavenger",
    name: "Scavenger",
    blurb: "+15% gold earned after matches.",
    color: 0xffd45e,
    effects: { gold: 1.15 },
  },
};

export const MAX_PASSIVES = 3;

/** Combine a list of passive skills into a single multiplier set. */
export function combinePassives(ids: PassiveSkillId[]) {
  const out = {
    damageTaken: 1,
    damageDealt: 1,
    speed: 1,
    regen: 0,
    recoil: 1,
    reload: 1,
    gold: 1,
  };
  for (const id of ids) {
    const s = PASSIVE_SKILLS[id];
    if (!s) continue;
    if (s.effects.damageTaken != null) out.damageTaken *= s.effects.damageTaken;
    if (s.effects.damageDealt != null) out.damageDealt *= s.effects.damageDealt;
    if (s.effects.speed != null) out.speed *= s.effects.speed;
    if (s.effects.regen != null) out.regen += s.effects.regen;
    if (s.effects.recoil != null) out.recoil *= s.effects.recoil;
    if (s.effects.reload != null) out.reload *= s.effects.reload;
    if (s.effects.gold != null) out.gold *= s.effects.gold;
  }
  return out;
}

export type Loadout = {
  /** active character power id */
  active: string;
  /** up to three passive skill ids */
  passives: PassiveSkillId[];
  /** one optional tactical item */
  tactical: TacticalId | null;
};

export const defaultLoadout = (activePowerId: string): Loadout => ({
  active: activePowerId,
  passives: [],
  tactical: null,
});

export function loadoutKey() {
  return "ironhowl.loadout.v1";
}

export function loadLoadout(activePowerId: string): Loadout {
  if (typeof window === "undefined") return defaultLoadout(activePowerId);
  try {
    const raw = window.localStorage.getItem(loadoutKey());
    if (!raw) return defaultLoadout(activePowerId);
    const saved = JSON.parse(raw) as Partial<Loadout>;
    const passives = Array.isArray(saved.passives)
      ? saved.passives.filter((id): id is PassiveSkillId => id in PASSIVE_SKILLS).slice(0, MAX_PASSIVES)
      : [];
    const tactical = (saved.tactical && TACTICAL_IDS.includes(saved.tactical as TacticalId)) ? (saved.tactical as TacticalId) : null;
    return {
      active: typeof saved.active === "string" && saved.active ? saved.active : activePowerId,
      passives,
      tactical,
    };
  } catch {
    return defaultLoadout(activePowerId);
  }
}

export function saveLoadout(loadout: Loadout) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      loadoutKey(),
      JSON.stringify({
        active: loadout.active,
        passives: loadout.passives.slice(0, MAX_PASSIVES),
        tactical: loadout.tactical,
      }),
    );
  } catch {
    /* private mode */
  }
}

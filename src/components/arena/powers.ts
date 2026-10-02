/**
 * Character powers: one active ability per operative, Free Fire style —
 * tap the ability button, the effect runs for a fixed duration, then a
 * cooldown ticks back down. Every effect is expressed as a plain multiplier
 * or flag so the render loop can read it without branching per character.
 */

export type PowerId =
  | "coldsnap"
  | "overburn"
  | "slipstream"
  | "bulwark"
  | "lifespring"
  | "deadeye"
  | "emberveil";

export type Power = {
  id: PowerId;
  name: string;
  /** short pitch shown in the picker */
  blurb: string;
  /** active seconds */
  duration: number;
  /** cooldown seconds, counted from activation */
  cooldown: number;
  /** hex colour used by the aura VFX + HUD ring */
  color: number;
  effects: {
    /** incoming damage multiplier while active */
    damageTaken?: number;
    /** outgoing damage multiplier */
    damageDealt?: number;
    /** fire interval multiplier (lower = faster) */
    fireRate?: number;
    /** recoil multiplier */
    recoil?: number;
    /** movement speed multiplier */
    speed?: number;
    /** hp restored per second while active */
    regen?: number;
    /** one-shot absorbing shield granted on activation */
    shield?: number;
    /** instantly refill the current magazine on activation */
    instantReload?: boolean;
    /** projected bubble that stops all incoming fire while active */
    barrier?: boolean;
  };
};

export const POWERS: Record<PowerId, Power> = {
  coldsnap: {
    id: "coldsnap",
    name: "Coldsnap",
    blurb: "Frost armour: take 45% less damage for 8s.",
    duration: 8,
    cooldown: 34,
    color: 0x4fa8ff,
    effects: { damageTaken: 0.55 },
  },
  overburn: {
    id: "overburn",
    name: "Overburn",
    blurb: "Instant reload, then +45% fire rate for 6s.",
    duration: 6,
    cooldown: 30,
    color: 0xff6b3d,
    effects: { fireRate: 0.55, instantReload: true },
  },
  slipstream: {
    id: "slipstream",
    name: "Slipstream",
    blurb: "+45% movement speed for 6s.",
    duration: 6,
    cooldown: 26,
    color: 0x46d39a,
    effects: { speed: 1.45 },
  },
  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    blurb: "Absorbs the next 110 damage for 10s.",
    duration: 10,
    cooldown: 40,
    color: 0x8b8fa3,
    effects: { shield: 110 },
  },
  lifespring: {
    id: "lifespring",
    name: "Lifespring",
    blurb: "Healing aura: +14 HP per second for 6s.",
    duration: 6,
    cooldown: 32,
    color: 0xf2c94c,
    effects: { regen: 14 },
  },
  deadeye: {
    id: "deadeye",
    name: "Deadeye",
    blurb: "+30% weapon damage and half recoil for 6s.",
    duration: 6,
    cooldown: 36,
    color: 0xa06bff,
    effects: { damageDealt: 1.3, recoil: 0.5 },
  },
  emberveil: {
    id: "emberveil",
    name: "Emberveil",
    blurb: "Molten bubble: enemy fire dies on the shell for 7s — you shoot out freely.",
    duration: 7,
    cooldown: 42,
    color: 0xff8a2b,
    effects: { barrier: true },
  },
};

/** Neutral effect set used whenever no power is active. */
export const NO_EFFECT: Required<Omit<Power["effects"], "shield" | "instantReload" | "barrier">> = {
  damageTaken: 1,
  damageDealt: 1,
  fireRate: 1,
  recoil: 1,
  speed: 1,
  regen: 0,
};
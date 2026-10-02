/**
 * Bot tactical brain: difficulty profiles plus the small amount of per-bot
 * state the arena's botTick needs to behave like a player instead of a
 * turret — reaction delay, burst discipline, strafing, cover pushes and
 * retreats when hurt.
 */
import * as THREE from "three";

export type BotDifficulty = "recruit" | "regular" | "veteran" | "nightmare";

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = [
  "recruit",
  "regular",
  "veteran",
  "nightmare",
] as const;

export type BotProfile = {
  label: string;
  blurb: string;
  /** seconds between spotting a fresh target and the first shot */
  reaction: number;
  /** hit chance at point-blank range */
  accuracy: number;
  /** metres of distance that shave one unit of accuracy */
  accuracyFalloff: number;
  /** multiplier on bot bullet damage */
  damageScale: number;
  /** chance a landed round counts as a headshot */
  headshotChance: number;
  /** metres per second while repositioning */
  moveSpeed: number;
  /** 0 = holds spawn, 1 = pushes hard toward its preferred range */
  aggression: number;
  /** sideways movement while shooting, as a fraction of moveSpeed */
  strafe: number;
  /** rounds per burst */
  burstMin: number;
  burstMax: number;
  /** pause between bursts, seconds */
  pauseMin: number;
  pauseMax: number;
  /** below this fraction of max HP the bot breaks contact */
  retreatHp: number;
  /** how quickly the aim tracks a moving target, 0..1 per frame-ish */
  tracking: number;
};

export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  recruit: {
    label: "Recruit",
    blurb: "Slow to react, sprays wide — good for learning a map.",
    reaction: 0.85,
    accuracy: 0.5,
    accuracyFalloff: 90,
    damageScale: 0.7,
    headshotChance: 0.02,
    moveSpeed: 2.4,
    aggression: 0.35,
    strafe: 0.25,
    burstMin: 2,
    burstMax: 3,
    pauseMin: 0.9,
    pauseMax: 1.6,
    retreatHp: 0.3,
    tracking: 0.12,
  },
  regular: {
    label: "Regular",
    blurb: "Trades fairly, uses cover, punishes standing still.",
    reaction: 0.5,
    accuracy: 0.68,
    accuracyFalloff: 130,
    damageScale: 1,
    headshotChance: 0.08,
    moveSpeed: 3.2,
    aggression: 0.6,
    strafe: 0.45,
    burstMin: 3,
    burstMax: 5,
    pauseMin: 0.55,
    pauseMax: 1.1,
    retreatHp: 0.25,
    tracking: 0.2,
  },
  veteran: {
    label: "Veteran",
    blurb: "Pushes angles, tight bursts, hunts you when you break line of sight.",
    reaction: 0.32,
    accuracy: 0.8,
    accuracyFalloff: 175,
    damageScale: 1.2,
    headshotChance: 0.16,
    moveSpeed: 3.9,
    aggression: 0.8,
    strafe: 0.62,
    burstMin: 4,
    burstMax: 6,
    pauseMin: 0.38,
    pauseMax: 0.8,
    retreatHp: 0.2,
    tracking: 0.3,
  },
  nightmare: {
    label: "Nightmare",
    blurb: "Near-instant reactions and heavy headshot pressure. Brutal.",
    reaction: 0.18,
    accuracy: 0.9,
    accuracyFalloff: 240,
    damageScale: 1.45,
    headshotChance: 0.28,
    moveSpeed: 4.5,
    aggression: 0.95,
    strafe: 0.8,
    burstMin: 5,
    burstMax: 8,
    pauseMin: 0.26,
    pauseMax: 0.55,
    retreatHp: 0.15,
    tracking: 0.42,
  },
};

export const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  recruit: BOT_PROFILES.recruit.label,
  regular: BOT_PROFILES.regular.label,
  veteran: BOT_PROFILES.veteran.label,
  nightmare: BOT_PROFILES.nightmare.label,
};

export type BotState = "hunt" | "engage" | "reposition" | "retreat";

export type BotBrain = {
  difficulty: BotDifficulty;
  state: BotState;
  /** id of the fighter this bot has committed to */
  targetId: string | null;
  /** countdown before the first shot at a freshly acquired target */
  reactionLeft: number;
  /** rounds left in the current burst */
  burstLeft: number;
  /** pause between bursts */
  pauseLeft: number;
  /** −1 / +1 sidestep direction and how long it holds */
  strafeDir: number;
  strafeLeft: number;
  /** how long the current reposition push lasts */
  moveLeft: number;
  /** last place the target was visible, used to hunt after losing sight */
  lastSeen: THREE.Vector3 | null;
  /** the range this bot tries to hold, derived from its weapon */
  preferredRange: number;
  /** throttles the expensive line-of-sight raycast */
  losTimer: number;
  losClear: boolean;
  /** seconds of flashbang blindness left; bots hold fire while blinded */
  blindLeft: number;
  /** decoy bait: position the bot is temporarily investigating */
  decoyAttract: THREE.Vector3 | null;
  /** how long the decoy distraction lasts */
  decoyAttractLeft: number;
};

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export function createBotBrain(difficulty: BotDifficulty, preferredRange: number): BotBrain {
  const p = BOT_PROFILES[difficulty];
  return {
    difficulty,
    state: "hunt",
    targetId: null,
    reactionLeft: p.reaction,
    burstLeft: Math.round(rand(p.burstMin, p.burstMax)),
    pauseLeft: 0,
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeLeft: rand(0.4, 1.2),
    moveLeft: rand(0.5, 1.5),
    lastSeen: null,
    preferredRange,
    losTimer: 0,
    losClear: false,
    blindLeft: 0,
    decoyAttract: null,
    decoyAttractLeft: 0,
  };
}

/** bait this bot toward a decoy position for a few seconds */
export function attractToDecoy(brain: BotBrain, pos: THREE.Vector3, duration = 3.5) {
  brain.decoyAttract = pos.clone();
  brain.decoyAttractLeft = Math.max(brain.decoyAttractLeft, duration);
}

/** roll a fresh burst length for this profile */
export function rollBurst(p: BotProfile) {
  return Math.round(rand(p.burstMin, p.burstMax));
}

/** roll the pause that follows a spent burst */
export function rollPause(p: BotProfile) {
  return rand(p.pauseMin, p.pauseMax);
}

/** flip the sidestep direction and pick a new hold time */
export function rerollStrafe(brain: BotBrain) {
  brain.strafeDir = Math.random() < 0.5 ? -1 : 1;
  brain.strafeLeft = rand(0.45, 1.3);
}

/** the engagement range a bot wants for its weapon */
export function preferredRangeFor(weaponRange: number) {
  return Math.max(8, Math.min(weaponRange * 0.55, 42));
}

/**
 * What a fighter IS, as a shape and a set of numbers — the vocabulary every other arena module
 * speaks.
 *
 * Brook: "the lonewolfarena file turns into a chunk of plus +9k line so ur job for this take is to
 * spreat it into files ... so its easier to debug". The tick loops, the bomb thrower and the body
 * builder all take `Fighter`s, so the type had to come out of the component file first or every
 * extracted module would have had to import from the 8k-line file it was being pulled out of.
 *
 * Types and tuning only — no THREE objects are constructed here and nothing runs on import, so this
 * is safe for any module to pull in without dragging the scene along with it.
 */

import type * as THREE from "three";

import type { ArmorState } from "./armor";
import type { Backpack } from "./backpack";
import type { BotBrain } from "./botAi";
import type { Holsters } from "./holster";
import type { OperativeRig } from "./operativeModel";
import type { SpawnFx } from "./spawnFx";
import type { WeaponSocket } from "./weaponModel";

export type Team = "blue" | "red";

export type SpawnPoint = {
  name: string;
  team: Team;
  /** top-middle of the spawn pad — where a fighter stands */
  top: THREE.Vector3;
};

export const TEAM_COLORS: Record<Team, number> = {
  blue: 0x3f8fff,
  red: 0xff3b1f,
};

/**
 * Handles for the bots, because they are standing in for players.
 *
 * Brook asked for "the name of the acc at the firend head as if somone playing with 3 ppl". The
 * nameplate that answers that renders `Fighter.name`, and the name it used to render was
 * `BOT BLUE2` — which tells the player the exact thing a squad HUD is supposed to hide. There is no
 * netcode yet, so every squadmate is a bot; a plate reading "BOT BLUE2" turns the feature into an
 * admission. The kill feed and the squad panel read the same field, so this lands in all three.
 *
 * Deliberately handle-shaped rather than name-shaped — underscores, digits, caps — so they read as
 * accounts and not as characters. `Fighter.id` still carries `BLUE_2`, so nothing that identifies a
 * fighter goes through this string.
 */
const CALLSIGNS = [
  "Ryzen_X",
  "NovaKid",
  "xX_Vortex",
  "SilentK",
  "GhostByte",
  "Kaz1ro",
  "TangoDwn",
  "Mirage77",
  "ZeroChill",
  "HexWolf",
  "Nightfa11",
  "Rekt0r",
  "AshBlade",
  "Vypr_",
  "Solaris9",
  "KingCobra",
  "Drift_ID",
  "OmenTV",
  "Frostbyte",
  "Lucid_04",
  "RavenOps",
  "BlitzGG",
  "Sn0wman",
  "Vandal_7",
] as const;

/**
 * Stable, collision-free handle for one bot slot.
 *
 * Indexed rather than random: two bots drawing the same handle would put two identical plates on the
 * same squad, and a re-roll per frame is not a thing a name can survive. The two teams start 12
 * apart, which is more than either side ever fields, so blue and red never meet in the middle.
 */
export function botCallsign(team: Team, index: number): string {
  const base = team === "red" ? index + 12 : index;
  return CALLSIGNS[base % CALLSIGNS.length]!;
}

/** Full health, and the pool every damage number below is a fraction of. */
export const MAX_HP = 200;
/** What one bot round does before profile scaling, armour and the headshot multiplier. */
export const BOT_DAMAGE = 16;
/** Knocked (dbno) tuning — Free Fire style: a bleed-out window a teammate can beat. */
export const REVIVE_SECONDS = 3;
/** How close a reviver has to stand. Also how close a bot walks before it starts the revive. */
export const REVIVE_RADIUS = 2.5;

export type Fighter = {
  id: string;
  name: string;
  team: Team;
  isHuman: boolean;
  group: THREE.Group | null;
  meshes: THREE.Mesh[];
  /**
   * The animated character drawn in place of the capsules. Null until the GLB lands — a fighter
   * spawns, shoots and can be killed before its model has finished parsing, and must not depend
   * on it.
   */
  rig: OperativeRig | null;
  /**
   * The prop in this fighter's hand and the ones hanging off their back and hip. Kept reachable
   * because a weapon draft can hand a bot a different loadout between rounds without rebuilding its
   * rig, and a fighter still holding round one's rifle is exactly the "gun out of nowhere" this is
   * meant to end. Null until the model lands, like `rig`.
   */
  weaponSocket: WeaponSocket | null;
  holsters: Holsters | null;
  /** last frame's feet position; the rig's velocity is differentiated from this */
  lastPos: THREE.Vector3;
  /** smoothed world velocity, m/s — this is what picks the locomotion clip */
  vel: THREE.Vector3;
  hp: number;
  alive: boolean;
  respawnIn: number;
  /**
   * Seconds left in the death crumple. While > 0 the fighter is `alive:false` but its body is
   * still on screen playing a held death clip; when it reaches 0 the body is hidden and, in the
   * loot modes, replaced by a crate. 0 whenever the fighter is up or already cleared away.
   */
  dying: number;
  /**
   * Knocked but alive (Free Fire dbno): crawls on the belly, bleeds out on a timer, and can
   * be revived by a teammate standing close. Only possible in elimination modes with a
   * teammate still up — otherwise a lethal hit goes straight to `kill`.
   */
  downed: boolean;
  /** seconds left before a downed fighter bleeds out and dies for real */
  bleedOut: number;
  /** revive progress on a downed fighter, 0..REVIVE_SECONDS */
  beingRevived: number;
  home: SpawnPoint;
  /** feet position */
  pos: THREE.Vector3;
  cooldown: number;
  tracer: { line: THREE.Line; mat: THREE.LineBasicMaterial; ttl: number } | null;
  /** personal spawn-in effect, played at this fighter's own spot */
  fx: SpawnFx | null;
  /** weapon id used for damage/fire-rate calculations */
  weapon: string;
  /** sidearm id carried on the back; used for melee deflection checks */
  sidearm: string | null;
  /** tactical brain — null for the human player */
  ai: BotBrain | null;
  /** equipped armor (vest + helmet) */
  armor: ArmorState;
  /** carried backpack and FF coins */
  backpack: Backpack;
};

export type HudFighter = {
  id: string;
  team: Team;
  hp: number;
  alive: boolean;
  isHuman: boolean;
  downed?: boolean;
};

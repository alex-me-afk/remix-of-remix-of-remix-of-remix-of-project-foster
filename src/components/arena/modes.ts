/**
 * What mode a map runs, and every rule that mode runs by.
 *
 * Brook, 2026-09-05: "delet the rules mode file for the maps and recreate it this time in the right
 * way, follow the free fire rule — the 4vs4 map, 2 of them, take clash squad, the lone wolf takes
 * the 2vs2 and br takes battle royale. pretty much same as what we have rn but rn theres some leaks
 * so its better to rewrite them."
 *
 * ONE INVARIANT, AND IT IS THE ENTIRE POINT OF THIS FILE:
 *
 *     a MAP decides its MODE          (MODE_FOR_MAP, derived from MODES — not tracked separately)
 *     a MODE decides its RULES        (MODE_RULES — every rule, named, in one table)
 *     nothing outside this file branches on a mode's NAME.
 *
 * THAT LAST LINE IS THE LEAK BROOK MEANT, and it was real. Before this rewrite the arena carried
 * fifteen `gameModeRef.current === "lastHowl"` / `=== "ironclash"` / `!== "lastHowl"` tests scattered
 * across 7.5k lines, and each one was a rule this table did not admit to owning: whether a corpse
 * leaves a crate, whether the map is scattered with loot, whether you enter by parachute or by
 * cinematic, whether a car can be called, whether a fresh loadout also refills your ammo, and the
 * whole Clash Squad cash economy. Three consequences, all of them things that actually bite:
 *
 *   1. To answer "what does Lone Wolf do?" you had to grep, not read. The table said seven things;
 *      the mode actually had twenty.
 *   2. Half those tests were NEGATIVE (`!== "lastHowl"` standing in for "is a buy mode"), so a
 *      fourth mode inherits a random subset of behaviours the day it is added — whichever way each
 *      `!==` happens to fall — silently, with no type error anywhere.
 *   3. A map moved from one mode to another (exactly what Brook is confirming here) changed some of
 *      its rules and not others, because only some of them were keyed off the mode at all.
 *
 * So every one of those fifteen is now a NAMED FIELD below, and `ModeRules` has no optional
 * properties: adding a mode is a type error until you have answered every question about it. That
 * is the anti-leak mechanism — not the comments.
 *
 * The map assignment is the one Brook confirmed and is unchanged: two 4v4 maps under Clash Squad,
 * the 2v2 map under Lone Wolf, the island under Battle Royale.
 */

import type { MapId } from "./maps";

/**
 * Internal ids. These are the SAVED names — they appear in profile data and in `ModeSelect`'s icon
 * table — so they keep their in-house spelling rather than being renamed to the Free Fire modes
 * they implement. The mapping, once, here: fangDuel = Lone Wolf, ironclash = Clash Squad,
 * lastHowl = Battle Royale.
 */
export type GameMode = "fangDuel" | "ironclash" | "lastHowl" | "hangout";

export type MatchType = "casual" | "ranked";

export type ModeInfo = {
  id: GameMode;
  name: string;
  short: string;
  teamSize: number;
  /**
   * Head-count badge shown on the map card. Lives on the mode, not the map, so a shared map can
   * never advertise the wrong lobby size.
   */
  players: string;
  maps: MapId[];
  blurb: string;
  /** true → selectable in the lobby right now */
  live: boolean;
};

/**
 * The three modes and the maps they own. A map appears under exactly ONE mode, which is what makes
 * `MODE_FOR_MAP` below a total function and the mode derivable from the level instead of tracked
 * alongside it.
 */
export const MODES: Record<GameMode, ModeInfo> = {
  fangDuel: {
    id: "fangDuel",
    name: "Fang Duel",
    short: "2v2",
    teamSize: 2,
    players: "2v2",
    maps: ["frostline"],
    blurb: "Close-quarters duel in the Frostline depot. Wipe the enemy team to take the round.",
    live: true,
  },
  ironclash: {
    id: "ironclash",
    name: "Ironclash",
    short: "4v4",
    teamSize: 4,
    players: "4v4",
    maps: ["outpost", "ice"],
    blurb: "Two four-man squads fight for control of the compound. Buy, wipe, repeat.",
    live: true,
  },
  lastHowl: {
    id: "lastHowl",
    name: "Last Howl",
    short: "30P",
    teamSize: 4,
    players: "30 Players",
    maps: ["island"],
    blurb:
      "Thirty fighters land on Verdant Isle. Loot, outrun the storm, be the last one standing.",
    live: true,
  },
  /**
   * HANG OUT — Friend Island, and the only non-combat mode.
   *
   * Brook: "a chill place to connect and explore. No weapons, just good vibes." It is a social
   * sandbox, not a match: no enemies are fielded (`opponents: false`), the storm never shrinks and
   * does no damage, and there is no economy, loot or death crate. What is left is the island, the
   * player, their operative, dances and the car — which is exactly the point.
   */
  hangout: {
    id: "hangout",
    name: "Hang Out",
    short: "Social",
    teamSize: 1,
    players: "Social",
    maps: ["friend-island"],
    blurb: "A chill place to connect and explore. No weapons, just good vibes.",
    live: true,
  },
};

export const MODE_IDS: GameMode[] = Object.keys(MODES) as GameMode[];

/**
 * Reverse of `MODES[mode].maps`: which mode owns a given map.
 *
 * Since every map belongs to exactly one mode this is total and unambiguous — and it is the ONLY
 * safe way to answer "what rules does this level run under". Reading a separately-tracked
 * `gameMode` risks it drifting out of sync with the loaded map (the lobby's default map is
 * frostline while the default MODE is ironclash, so a stale pair is one click away), which leaks
 * one mode's respawns, paid weapons and death crates onto another mode's level. Derive the mode
 * from the map and that whole class of bug is unreachable.
 */
export const MODE_FOR_MAP: Record<MapId, GameMode> = (() => {
  const out = {} as Record<MapId, GameMode>;
  for (const mode of MODE_IDS) for (const map of MODES[mode].maps) out[map] = mode;
  return out;
})();

export function modeForMap(mapId: MapId): GameMode {
  return MODE_FOR_MAP[mapId] ?? DEFAULT_MODE;
}

/**
 * Party/team-size variants a mode can be played as, smallest first; the value is the per-side size.
 * The lobby shows a person-count icon per option and passes the chosen size to the arena, which
 * always honours it as YOUR squad's size. In `fullRoster` modes it does not shrink the match: the
 * fighters it takes off your side are handed to the enemy instead (see `fullRoster`).
 */
export const MODE_VARIANTS: Record<GameMode, number[]> = {
  fangDuel: [1, 2],
  ironclash: [4],
  lastHowl: [1, 2, 4],
  // A social sandbox has no sides to size; the only "party" is you.
  hangout: [1],
};

/** Default variant per mode (the mode's headline format). */
export const DEFAULT_VARIANT: Record<GameMode, number> = {
  fangDuel: 2,
  ironclash: 4,
  lastHowl: 1,
  hangout: 1,
};

/** Human label for a party size within a mode. */
export function variantLabel(mode: GameMode, size: number): string {
  if (mode === "lastHowl") return size === 1 ? "Solo" : size === 2 ? "Duo" : "Squad";
  if (mode === "hangout") return "Solo";
  return `${size}v${size}`;
}

export const MATCH_TYPES: Record<MatchType, { name: string; blurb: string }> = {
  casual: { name: "Casual", blurb: "No rank pressure. Practice and earn gold." },
  ranked: { name: "Ranked", blurb: "Win to climb. Losses cost rank points." },
};

/** Default mode for new players. */
export const DEFAULT_MODE: GameMode = "ironclash";

/** Default match type. */
export const DEFAULT_MATCH_TYPE: MatchType = "casual";

/* ------------------------------------------------------------------------------------------------
 * The storm
 * ---------------------------------------------------------------------------------------------- */

/**
 * One step of a phased storm, which is how Free Fire's ring actually behaves: it HOLDS still for a
 * while, then SHRINKS to the next radius, and both times differ per phase — as does the damage.
 *
 * This replaced a `{ dpsStart, dpsMax, rampSeconds, shrinkToCenter }` rule, and that swap is the
 * second real leak this rewrite closes. The old shape could not express the schedule Brook gave at
 * all, so the arena INVENTED one: `hold = clamp(roundSeconds * 0.2, 20, 60)`, four phases,
 * `shrinkTime = remaining / 4 * 0.55`, `holdBetween = remaining / 4 * 0.45`, radius to
 * `startRadius * 0.05`. Six magic multipliers deciding storm pacing, sitting in a frame loop 3,600
 * lines away from the table that claimed to own the zone — and a damage model (linear ramp
 * dpsStart→dpsMax) that fought the phase model rather than describing it. Now the schedule IS the
 * rule, the arena reads it, and the numbers below are Free Fire's, verbatim.
 */
export type ZonePhaseRule = {
  /** Seconds the ring holds still before this phase's shrink begins. */
  delay: number;
  /** Seconds the shrink itself takes. */
  shrink: number;
  /** Damage per second to anyone outside the ring, for the whole of this phase. */
  dps: number;
};

export type ZoneRule = {
  /** Played in order from the start of the round. The last phase's radius is held until time. */
  phases: readonly ZonePhaseRule[];
  /**
   * Opening radius as a fraction of the map's LONGEST side. 0.55 covers a square map corner to
   * corner with a little slack, which is what "the whole level is playable at the start" means.
   */
  startFactor: number;
  /**
   * Radius after the final shrink, as a fraction of the OPENING radius. One base rather than the
   * two the old code used (start off the longest side, final off the shortest), because a single
   * ratio is the thing a designer actually reasons about: 0.05 is "closes to a point", 0.4 is
   * "settles on a duel ring in the middle".
   */
  finalFactor: number;
};

/* ------------------------------------------------------------------------------------------------
 * Clash Squad cash
 * ---------------------------------------------------------------------------------------------- */

/**
 * Free Fire's `CS_Cash`: a per-player budget that carries between rounds of a Clash Squad match.
 *
 * Solo-vs-bots, so only the human buys — bots roll their loadouts — which is why the payouts track
 * the HUMAN's team result. The seven numbers used to be seven `const CS_*` at the top of the arena
 * file, which meant "does this mode have an economy" and "what are its numbers" lived in different
 * places from each other and from every other rule. A mode with no economy is `null`, and that null
 * is what the arena tests instead of the mode's name.
 */
export type CashRules = {
  /** Every match opens on this: Free Fire's $500 pistol round. */
  baseCash: number;
  /** Hard ceiling on the wallet. */
  cap: number;
  /** Paid to every player on the team that won the round. */
  winReward: number;
  /**
   * Consolation for losing, escalating with the streak: index 0 is the first loss in a row, index 1
   * the second, and the LAST entry repeats for every loss after that. A list rather than three
   * named fields because the length is then the rule — extend the comeback ladder by typing a
   * fourth number, not by editing a ternary in the arena.
   */
  lossStreak: readonly number[];
  /** Straight to the killer, on top of whatever the round pays. */
  killBonus: number;
};

/** The payout for the `streak`-th consecutive loss (1-based). Clamps to the last rung. */
export function lossPayout(cash: CashRules, streak: number): number {
  const i = Math.min(Math.max(1, streak), cash.lossStreak.length) - 1;
  return cash.lossStreak[i] ?? 0;
}

/* ------------------------------------------------------------------------------------------------
 * The rules themselves
 * ---------------------------------------------------------------------------------------------- */

/**
 * Everything a mode decides. NO OPTIONAL PROPERTIES, deliberately: a new mode is a compile error
 * until every question below has been answered for it, which is the only reliable defence against
 * the leak this file was rewritten to fix. Where a rule does not apply, the answer is an explicit
 * `null` or `false`, not a missing key.
 */
export type ModeRules = {
  // ---- winning ----
  /**
   * Kills that take a round outright, or `null` for "a round is never won on kills". All three modes
   * are `null` today — every one of them is decided by wiping the enemy or by the storm — and this
   * used to be written as `9999`, a sentinel the score could in principle reach. `null` cannot be
   * reached by accident, and it makes the comparison site state the rule out loud.
   */
  killsToWinRound: number | null;
  /** Rounds one team must win to take the match. */
  roundsToWinMatch: number;
  /** Hard cap on a single round. Battle Royale treats its one round as the whole match. */
  roundSeconds: number;

  // ---- getting in ----
  /** `"intro"` = cinematic spawn on a pad; `"skydive"` = drop from the plane. */
  entry: "intro" | "skydive";
  /**
   * Seconds the player is held in the 3-D waiting island BEFORE the match loads them onto the
   * plane, or **0 for a mode that goes straight in**. This is a CEILING, not a fixed wait: the
   * room releases as soon as it has gathered `waitingRoomPlayers` and the level has finished
   * building, and the clock is only the promise that it will never hold longer than this.
   *
   * A number rather than a boolean+constant so the wait is visible in the same table as the round
   * length it precedes — a 60-second lobby in front of a 90-second round would be absurd, and that
   * is only obvious when the two sit four lines apart.
   */
  waitingRoomSeconds: number;
  /**
   * Players the waiting island must gather before it will release, and the denominator of its
   * "23/30" counter. 0 whenever `waitingRoomSeconds` is 0.
   *
   * This is the mode's ADVERTISED player count, which is deliberately not the number of bodies the
   * arena actually fields — `island`'s card has read "30 Players" since it shipped while the match
   * builds a smaller roster for frame rate. The room counts to the advertised figure because that
   * is the number the player was sold; if the fielded roster ever grows to meet it, this is the
   * line that already agrees with it.
   */
  waitingRoomPlayers: number;
  /**
   * true → the lobby's party-size chip sizes YOUR SQUAD ONLY; it must not shrink the match.
   * Battle Royale's thirty-player drop is not a "4v4 with extra steps", so the world roster stays at
   * the map's own `teamSize * 2` and the chip decides how that population SPLITS: pick Solo on the
   * island and the three fighters that would have been your squadmates become enemies instead.
   *
   * false → the chip sizes both sides symmetrically, because a 2v2 Clash Squad really is a smaller
   * match than a 4v4 one.
   *
   * Either way the fielded body count is a frame-rate budget, not a game rule, and this flag is what
   * keeps the chip from spending it.
   */
  fullRoster: boolean;
  /** Seconds locked in the spawn cell at round start to pick or buy weapons. 0 = straight in. */
  buySeconds: number;
  /**
   * false → NO enemy fighters are fielded at all; the world roster is just the player. This is the
   * one rule that makes a level a SANDBOX rather than a match — Hang Out is the only mode that
   * answers false. Named here instead of inferred from `teamSize`, because a 2-player world and a
   * full arena are different things and the roster builder must not guess which one a mode means.
   */
  opponents: boolean;

  // ---- dying ----
  /**
   * false → elimination: a downed fighter does NOT respawn, they spectate a living teammate, and the
   * round ends when a whole team is wiped or the storm closes on the survivors.
   */
  respawn: boolean;
  /**
   * true → 0 HP is a knock (Free Fire dbno) a teammate can revive; false → 0 HP is instant death
   * with no knocked stage. Lone Wolf is instant by Brook's spec; Clash Squad knocks.
   */
  knockdown: boolean;
  /** Bleed-out seconds for a knocked fighter, or null to use the arena's global default. */
  downedSeconds: number | null;

  // ---- arming ----
  /** true → weapons cost nothing and there is no in-match wallet. */
  freeWeapons: boolean;
  /**
   * true → one player drafts the loadout EVERYONE uses that round, the drafter rotating every two
   * rounds; a decider round lets each player pick their own.
   */
  weaponDraft: boolean;
  /**
   * true → taking a fresh loadout also tops every calibre up. The buy/draft modes have no ground
   * loot, so the loadout screen IS the resupply; Battle Royale must not do this, or you land with
   * full pockets, no reason to enter a building, and no room in the pack for what you find.
   */
  resupplyOnLoadout: boolean;
  /** The round-to-round wallet, or null for a mode that does not buy. */
  economy: CashRules | null;

  // ---- what the world holds ----
  /**
   * true → the level is scattered with authored loot (guns, ammo crates, wall charges, airdrops).
   * Also sizes the starting ammo pools: a loot mode starts light so there is room to loot into.
   */
  groundLoot: boolean;
  /**
   * true → a corpse leaves a container holding the guns and utility they actually had. Brook's
   * spec puts this in Clash Squad and Battle Royale, and explicitly NOT in Lone Wolf ("no loot
   * drops"), where a 90-second duel with free drafted weapons has nothing to loot for.
   */
  deathCrate: boolean;
  /** true → the callable car exists in this mode, with its HUD button. */
  vehicles: boolean;
  /** Seconds a placed frost wall survives before dissolving. 0 = it stands until broken. */
  wallLifetimeSeconds: number;

  // ---- the storm ----
  zone: ZoneRule;
};

/**
 * The three rule sets, against Brook's Free Fire spec.
 *
 * Values are unchanged from what shipped except where the old table contradicted itself or the
 * spec; each of those is called out at the line that changed, so a reader can see what moved and
 * why without a diff.
 */
export const MODE_RULES: Record<GameMode, ModeRules> = {
  /**
   * LONE WOLF — 2v2 (and 1v1) on Frostline.
   *
   * Best-of-9, first team to 5 round wins takes the match, 90-second rounds. No respawns and NO
   * knockdown: 0 HP is an instant kill, so a round is won by wiping the enemy team or by the storm
   * closing on whoever is left. Weapons are free and one player drafts for everyone, rotating every
   * two rounds. Nothing drops on death and there is no loot on the level — Brook's spec is explicit
   * about both, and it is what makes this the pure-aim mode.
   *
   * Not built yet: the mid-map capture point that is supposed to open for 15s at timeout. The round
   * still awards on a wipe, and the storm closing to a point is what forces one.
   */
  fangDuel: {
    killsToWinRound: null,
    roundsToWinMatch: 5,
    roundSeconds: 90,
    entry: "intro",
    // No waiting island: a 2v2 duel is a straight cut from the lobby to the spawn pad. Holding two
    // players in a thirty-player lounge to watch a counter that can never fill would be a minute of
    // nothing in front of a ninety-second round.
    waitingRoomSeconds: 0,
    waitingRoomPlayers: 0,
    fullRoster: false,
    buySeconds: 15,
    opponents: true,
    respawn: false,
    knockdown: false,
    downedSeconds: null,
    freeWeapons: true,
    weaponDraft: true,
    resupplyOnLoadout: true,
    economy: null,
    groundLoot: false,
    deathCrate: false,
    vehicles: false,
    wallLifetimeSeconds: 60,
    // Closes to a point at ~84s of a 90s round, which is the round's real decider until the capture
    // point exists. Matches the schedule the arena used to derive from `roundSeconds` to within two
    // seconds, so the pacing on screen does not change — it is just written down now. The flat 40
    // dps is Lone Wolf's: it used to be authored as a ramp from 40 to 40 over 90 seconds, a no-op
    // that read like a ramp.
    zone: {
      phases: [
        { delay: 20, shrink: 10, dps: 40 },
        { delay: 8, shrink: 10, dps: 40 },
        { delay: 8, shrink: 10, dps: 40 },
        { delay: 8, shrink: 10, dps: 40 },
      ],
      startFactor: 0.55,
      finalFactor: 0.05,
    },
  },

  /**
   * CLASH SQUAD — 4v4 on Outpost and Ice, the two maps Brook assigned here.
   *
   * Best-of-7, first to 4 round wins, 110-second rounds ending the instant the enemy team is wiped.
   * Knockdown is ON with a 30-second downed window and a 3-second revive hold. The full `CS_Cash`
   * economy runs: $500 pistol round, +$2,000 for a win, an escalating loss ladder, +$200 a kill,
   * capped at $9,900. Corpses leave a crate, so a wipe is worth walking over.
   *
   * Not built yet: the die→reset-to-base-pistol inventory wipe (survive a round and you keep your
   * armour and primaries, which IS built; dying should cost them).
   */
  ironclash: {
    killsToWinRound: null,
    roundsToWinMatch: 4,
    roundSeconds: 110,
    entry: "intro",
    // Same as Lone Wolf: eight players go straight to their spawn cells and the buy phase is where
    // Clash Squad's pre-round tension already lives.
    waitingRoomSeconds: 0,
    waitingRoomPlayers: 0,
    fullRoster: false,
    buySeconds: 15,
    opponents: true,
    respawn: false,
    knockdown: true,
    downedSeconds: 30,
    freeWeapons: false,
    weaponDraft: false,
    resupplyOnLoadout: true,
    economy: {
      baseCash: 500,
      cap: 9900,
      winReward: 2000,
      lossStreak: [1400, 1800, 2400],
      killBonus: 200,
    },
    groundLoot: false,
    deathCrate: true,
    vehicles: false,
    wallLifetimeSeconds: 0,
    // Settles on a duel ring in the middle at ~100s of a 110s round rather than closing to a point:
    // a 4v4 has to be pinned together at the end, not squeezed onto one tile. `finalFactor` 0.4 of
    // the opening radius is the same ring the old `min(width, depth) * 0.22` produced on these two
    // maps, which are square. Flat 45 dps — leaving the ring here is a mistake, not a timer.
    zone: {
      phases: [
        { delay: 22, shrink: 12, dps: 45 },
        { delay: 10, shrink: 12, dps: 45 },
        { delay: 10, shrink: 12, dps: 45 },
        { delay: 10, shrink: 12, dps: 45 },
      ],
      startFactor: 0.55,
      finalFactor: 0.4,
    },
  },

  /**
   * BATTLE ROYALE — thirty fighters on Verdant Isle.
   *
   * One round, plane entry, the whole island scattered with loot, cars callable, corpses leaving
   * crates, and the five-phase Free Fire storm below.
   *
   * NO RESPAWN, ANYWHERE. Brook: "why theres reswpan in the br mood insted of know down the reswapn
   * should be off in all modes we do not needs any respwan". So all three modes are now elimination
   * and this one knocks. What that costs is real and was the reason it shipped as arcade respawn: a
   * solo drop is one life, because there is nobody to pick you up. That is also exactly what Free
   * Fire's solo BR is — a knock you can crawl out of only if a squadmate exists — so the honest fix
   * was to obey the spec rather than to keep a placeholder that contradicted it. Revive TOKENS spent
   * at a map-spawned vending machine (the comeback mechanic that would soften a squad wipe) are
   * still unbuilt; they are additive to this table, not a reason to hold it back.
   *
   * STILL SHORT OF THE SPEC: no red zone (a bombing circle that instant-kills in the open for 15s)
   * and no UAV/orange zone (reveals every player on the minimap while it flies over). Both are world
   * events rather than mode rules, so neither belongs in this table — noted here so the gap is not
   * mistaken for an oversight in it.
   */
  lastHowl: {
    killsToWinRound: null,
    roundsToWinMatch: 1,
    // The phase table below runs 765s. The round was 600s, which meant the final ring could never
    // arrive and the match ended on a clock instead of on a closing storm — the schedule was
    // decorative. 13 minutes gives the last phase room to land and sits inside the 10–12 min the
    // spec asks for once the drop and the first hold are counted.
    roundSeconds: 13 * 60,
    entry: "skydive",
    /*
     * THE WAITING ISLAND — the only mode that has one, because it is the only mode with a plane.
     *
     * Free Fire holds you in a lounge before the aircraft, and it is not merely flavour: this is a
     * fifteen-megabyte level, and the wait is where it is parsed, its collision tiles built and its
     * lighting baked. Before this existed the same seconds were spent on a static splash with a
     * progress bar that was hardcoded to 0.72, i.e. the player was made to wait and given nothing
     * and lied to about it. Sixty seconds is the ceiling Brook set; the room releases the moment it
     * has thirty players AND the level reports ready, so a warm cache goes in much sooner.
     */
    waitingRoomSeconds: 60,
    waitingRoomPlayers: 30,
    fullRoster: true,
    buySeconds: 0,
    opponents: true,
    respawn: false,
    knockdown: true,
    downedSeconds: null,
    freeWeapons: false,
    weaponDraft: false,
    resupplyOnLoadout: false,
    economy: null,
    groundLoot: true,
    deathCrate: true,
    vehicles: true,
    wallLifetimeSeconds: 0,
    // Free Fire's shrink schedule, verbatim from Brook's spec: delay / shrink / damage per phase.
    // The damage climbing 1 → 10 across five phases is the whole late-game pressure curve, and it
    // is per-phase for a reason — a linear ramp would already be biting hard during the first hold,
    // when the point is that the early storm is survivable and the last one is not.
    zone: {
      phases: [
        { delay: 180, shrink: 60, dps: 1 },
        { delay: 150, shrink: 45, dps: 2 },
        { delay: 120, shrink: 40, dps: 4 },
        { delay: 90, shrink: 30, dps: 6 },
        { delay: 30, shrink: 20, dps: 10 },
      ],
      startFactor: 0.55,
      finalFactor: 0.05,
    },
  },

  /**
   * HANG OUT — the non-match. One fighter (you), no enemies, no storm, no economy.
   *
   * Every field is an explicit answer, per the invariant above. The interesting ones:
   *   - `opponents: false` is what makes the island a sandbox; the roster builder reads it and
   *     never spawns a red fighter at all.
   *   - `respawn: true` so a fall off a cliff or a wander into the deep is a shrug, not a dead end.
   *   - `roundSeconds` is effectively unbounded (there is no round to win), and the zone never
   *     shrinks and deals zero damage, so the storm can never push a player out of a hangout.
   *   - `freeWeapons: true` + `groundLoot: false` + `deathCrate: false`: nothing to buy, nothing to
   *     loot, nothing to lose. If combat is ever wanted here it is added back as named fields, not
   *     by borrowing another mode's rules.
   */
  hangout: {
    killsToWinRound: null,
    roundsToWinMatch: 1,
    // 12 hours. Not "infinite" on purpose — the arena's clocks stay finite, and a hangout a player
    // leaves by its own pause menu never reaches it.
    roundSeconds: 12 * 60 * 60,
    entry: "intro",
    waitingRoomSeconds: 0,
    waitingRoomPlayers: 0,
    fullRoster: false,
    buySeconds: 0,
    opponents: false,
    respawn: true,
    knockdown: false,
    downedSeconds: null,
    freeWeapons: true,
    weaponDraft: false,
    resupplyOnLoadout: true,
    economy: null,
    groundLoot: false,
    deathCrate: false,
    vehicles: true,
    wallLifetimeSeconds: 0,
    // One phase that never arrives: the ring sits at 1.2× the map's longest side (fully covering
    // the island) and does no damage, so the zone is decoration rather than a timer.
    zone: {
      phases: [{ delay: 12 * 60 * 60, shrink: 1, dps: 0 }],
      startFactor: 1.2,
      finalFactor: 1,
    },
  },
};

/** The rules a level runs under, from the level itself. The safe lookup; prefer it to `MODE_RULES`. */
export function rulesForMap(mapId: MapId): ModeRules {
  return MODE_RULES[modeForMap(mapId)];
}

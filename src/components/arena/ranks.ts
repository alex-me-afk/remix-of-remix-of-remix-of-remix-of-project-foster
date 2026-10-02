/**
 * The ranked ladder: tier names, their thresholds, and what a finished match is worth.
 *
 * Split out of `modes.ts` on 2026-09-05. Nothing here is a rule of PLAY — a tier does not change
 * how a round is won, what the storm does, or what a crate holds — so keeping it next to the mode
 * table only made that file look like it owned two unrelated things. `modes.ts` is now exactly
 * "what mode does this map run, and by what rules"; this is the meta-progression beside it.
 *
 * Bronze→Diamond is the genre-standard ladder and is kept. The top tier was "Heroic", which is
 * specifically Free Fire's apex rank, so it became "Apex".
 *
 * Master and Grandmaster were added on 2026-09-05 because the badge set that arrived has eight
 * crests, and both names are generic ladder vocabulary (chess, StarCraft, Overwatch) rather than
 * one game's trademark. Each `color` is sampled from its own crest so the tier text next to the
 * badge cannot clash with it — Apex moved off purple for that reason, its crest being fire-orange.
 */

export const RANK_TIERS = [
  { min: 0, name: "Bronze", color: 0xcd7f32 },
  { min: 500, name: "Silver", color: 0xc0c0c0 },
  { min: 1000, name: "Gold", color: 0xffd700 },
  { min: 1500, name: "Platinum", color: 0x3eb489 },
  { min: 2000, name: "Diamond", color: 0x3f8fff },
  { min: 2500, name: "Apex", color: 0xff7a2f },
  { min: 3200, name: "Master", color: 0x6fd4ff },
  { min: 4000, name: "Grandmaster", color: 0xdceeff },
];

export function rankTierFromPoints(points: number) {
  let tier = RANK_TIERS[0]!;
  for (const t of RANK_TIERS) {
    if (points >= t.min) tier = t;
  }
  return tier;
}

/**
 * Rank-point delta for a finished match. Wins give a positive bump, losses a penalty; kills and
 * survival time soften the blow and amplify wins. Only ranked matches call this.
 */
export function rankPointsForMatch(
  won: boolean,
  kills: number,
  deaths: number,
  survivalSeconds: number,
): number {
  const base = won ? 25 : -15;
  const killPts = kills * 3;
  const deathPts = -deaths * 2;
  const survivalPts = Math.min(10, Math.floor(survivalSeconds / 60));
  return base + killPts + deathPts + survivalPts;
}

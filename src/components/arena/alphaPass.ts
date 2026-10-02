/** Alpha Pass rewards for Ironhowl. */

export type AlphaReward = {
  tier: number;
  label: string;
  gold: number;
  shards: number;
};

export const ALPHA_REWARDS: AlphaReward[] = [
  { tier: 1, label: "Rookie crate", gold: 150, shards: 0 },
  { tier: 2, label: "Steel crate", gold: 200, shards: 0 },
  { tier: 3, label: "Gold stash", gold: 300, shards: 0 },
  { tier: 4, label: "Shard chip", gold: 100, shards: 5 },
  { tier: 5, label: "Silver crate", gold: 250, shards: 0 },
  { tier: 6, label: "Gold crate", gold: 400, shards: 0 },
  { tier: 7, label: "Frost cache", gold: 200, shards: 10 },
  { tier: 8, label: "Elite crate", gold: 500, shards: 0 },
  { tier: 9, label: "Glacier hoard", gold: 300, shards: 15 },
  { tier: 10, label: "Legendary crate", gold: 1000, shards: 25 },
];

export function rewardForTier(tier: number): AlphaReward | undefined {
  return ALPHA_REWARDS.find((r) => r.tier === tier);
}

export function claimableTiers(currentTier: number, claimed: number[]): number[] {
  const out: number[] = [];
  for (const r of ALPHA_REWARDS) {
    if (r.tier <= currentTier && !claimed.includes(r.tier)) {
      out.push(r.tier);
    }
  }
  return out;
}

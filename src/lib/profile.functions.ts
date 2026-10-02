import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const int = z.number().int().min(0).max(1_000_000_000);
const strArr = z.array(z.string().max(80)).max(500);
const strRec = z.record(z.string().max(80), z.string().max(80));

const profileSchema = z.object({
  name: z.string().trim().min(1).max(16),
  matchesPlayed: int,
  matchesWon: int,
  totalKills: int,
  totalDeaths: int,
  bestHeadshots: int,
  gold: int,
  shards: int,
  alphaPassTier: int,
  alphaPassXp: int,
  alphaPassClaimed: z.array(int).max(500),
  likesReceived: int,
  likesGiven: int,
  rankPoints: int,
  rankTier: z.string().max(40),
  characterProgress: z.record(z.string().max(80), int),
  loadout: z.object({ active: z.string().max(80), passives: z.array(z.string().max(80)).max(3), tactical: z.string().max(80).nullable() }),
  pet: z.string().max(80),
  ownedPets: strArr,
  ownedSkins: strArr,
  equippedSkins: strRec,
  ownedAttachments: strArr,
  equippedAttachments: strRec,
  vault: strArr,
  ownedDances: strArr,
  car: z.string().max(80),
  ownedCars: strArr,
  ownedCharacters: strArr,
  onboarded: z.boolean(),
});

export type CloudProfile = z.infer<typeof profileSchema>;

/** Largest jump in currency allowed between two saves — blocks obvious tampering. */
const MAX_GOLD_GAIN = 50_000;
const MAX_SHARD_GAIN = 5_000;

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("player_profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const p: CloudProfile = {
      name: data.name,
      matchesPlayed: data.matches_played,
      matchesWon: data.matches_won,
      totalKills: data.total_kills,
      totalDeaths: data.total_deaths,
      bestHeadshots: data.best_headshots,
      gold: data.gold,
      shards: data.shards,
      alphaPassTier: data.alpha_pass_tier,
      alphaPassXp: data.alpha_pass_xp,
      alphaPassClaimed: data.alpha_pass_claimed,
      likesReceived: data.likes_received,
      likesGiven: data.likes_given,
      rankPoints: data.rank_points,
      rankTier: data.rank_tier,
      characterProgress: data.character_progress as Record<string, number>,
      loadout: data.loadout as CloudProfile["loadout"],
      pet: data.pet ?? "",
      ownedPets: data.owned_pets,
      ownedSkins: data.owned_skins,
      equippedSkins: data.equipped_skins as Record<string, string>,
      ownedAttachments: data.owned_attachments,
      equippedAttachments: data.equipped_attachments as Record<string, string>,
      vault: data.vault,
      ownedDances: data.owned_dances,
      car: data.car ?? "",
      ownedCars: data.owned_cars,
      ownedCharacters: data.owned_characters,
      onboarded: data.onboarded,
    };
    return p;
  });

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => profileSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase
      .from("player_profiles")
      .select("gold, shards, onboarded, owned_characters")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (prev) {
      if (data.gold - prev.gold > MAX_GOLD_GAIN || data.shards - prev.shards > MAX_SHARD_GAIN) {
        throw new Error("Rejected suspicious currency change");
      }
    }
    // Operatives are only granted free once, during onboarding; afterwards no new ones can appear.
    const prevChars = prev?.onboarded ? prev.owned_characters : [];
    const newChars = data.ownedCharacters.filter((c) => !prevChars.includes(c));
    if (prev?.onboarded ? newChars.length > 0 : newChars.length > 1) {
      throw new Error("Rejected operative unlock");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("player_profiles").upsert({
      user_id: context.userId,
      name: data.name,
      matches_played: data.matchesPlayed,
      matches_won: data.matchesWon,
      total_kills: data.totalKills,
      total_deaths: data.totalDeaths,
      best_headshots: data.bestHeadshots,
      gold: data.gold,
      shards: data.shards,
      alpha_pass_tier: data.alphaPassTier,
      alpha_pass_xp: data.alphaPassXp,
      alpha_pass_claimed: data.alphaPassClaimed,
      likes_received: data.likesReceived,
      likes_given: data.likesGiven,
      rank_points: data.rankPoints,
      rank_tier: data.rankTier,
      character_progress: data.characterProgress,
      loadout: data.loadout as never,
      pet: data.pet,
      owned_pets: data.ownedPets,
      owned_skins: data.ownedSkins,
      equipped_skins: data.equippedSkins,
      owned_attachments: data.ownedAttachments,
      equipped_attachments: data.equippedAttachments,
      vault: data.vault,
      owned_dances: data.ownedDances,
      car: data.car,
      owned_cars: data.ownedCars,
      owned_characters: data.ownedCharacters,
      onboarded: data.onboarded,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

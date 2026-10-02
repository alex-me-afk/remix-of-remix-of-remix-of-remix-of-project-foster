import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, saveMyProfile, type CloudProfile } from "@/lib/profile.functions";
import { loadProfile, saveProfile, type PlayerProfile } from "./playerProfile";

function toCloud(p: PlayerProfile): CloudProfile {
  return {
    name: p.name.trim().slice(0, 16) || "Player",
    matchesPlayed: p.matchesPlayed,
    matchesWon: p.matchesWon,
    totalKills: p.totalKills,
    totalDeaths: p.totalDeaths,
    bestHeadshots: p.bestHeadshots,
    gold: Math.floor(p.gold),
    shards: Math.floor(p.shards),
    alphaPassTier: p.alphaPassTier,
    alphaPassXp: Math.floor(p.alphaPassXp),
    alphaPassClaimed: p.alphaPassClaimed,
    likesReceived: p.likesReceived,
    likesGiven: p.likesGiven,
    rankPoints: Math.floor(p.rankPoints),
    rankTier: p.rankTier,
    characterProgress: p.characterProgress,
    loadout: { active: p.loadout.active, passives: p.loadout.passives, tactical: p.loadout.tactical ?? null },
    pet: p.pet,
    ownedPets: p.ownedPets,
    ownedSkins: p.ownedSkins,
    equippedSkins: p.equippedSkins,
    ownedAttachments: p.ownedAttachments,
    equippedAttachments: p.equippedAttachments,
    vault: p.vault,
    ownedDances: p.ownedDances,
    car: p.car,
    ownedCars: p.ownedCars,
    ownedCharacters: p.ownedCharacters,
    onboarded: p.onboarded,
  };
}

/**
 * Cloud is the source of truth for signed-in players. On sign-in the saved cloud
 * profile replaces the local one (or the local one is uploaded the first time);
 * every later change is pushed to the cloud after a short debounce.
 */
export function useCloudProfile(
  profile: PlayerProfile,
  setProfile: (p: PlayerProfile) => void,
) {
  const [userId, setUserId] = useState<string | null>(null);
  /** true once we know whether a cloud profile exists (or the player is a guest) */
  const [loaded, setLoaded] = useState(false);
  const ready = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id ?? null;
      setUserId(id);
      if (!id) setLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setUserId(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    ready.current = false;
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const cloud = await getMyProfile();
        if (!alive) return;
        if (cloud) {
          const merged = { ...loadProfile(), ...cloud } as PlayerProfile;
          saveProfile(merged);
          setProfile(merged);
        } else {
          await saveMyProfile({ data: toCloud(profile) });
        }
        ready.current = true;
        setLoaded(true);
      } catch (e) {
        console.error("Cloud profile load failed", e);
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId || !ready.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveMyProfile({ data: toCloud(profile) }).catch((e) => console.error("Cloud save failed", e));
    }, 1500);
    return () => window.clearTimeout(timer.current);
  }, [profile, userId]);

  return { signedIn: !!userId, loaded };
}

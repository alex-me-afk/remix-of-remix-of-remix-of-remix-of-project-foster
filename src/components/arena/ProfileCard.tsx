import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Medal, Trophy, Crosshair, Skull, Coins, Gem, TrendingUp, User, Pencil, Check, X, Gift, LogOut, Link2, Car } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PlayerProfile, kdRatio, levelFromProfile, winRate } from "./playerProfile";
import { ALPHA_REWARDS, claimableTiers, rewardForTier } from "./alphaPass";
import { rankTierFromPoints } from "./ranks";
import { RANK_ICON } from "./icons";
import BannerArt from "./BannerArt";
import { hexCss, type ArenaCharacter } from "./characters";
import { carEntry, CAR_CLASS_COLORS } from "./carStore";
// `CARS` is only read for the equipped car's display NAME. It drags in three.js, which is
// why `carStore` exists as the pure-data half — but this panel is lobby-only and GameShell
// already imports CarShop eagerly, so carModel is in this chunk either way.
import { CARS } from "./carModel";

type Props = {
  profile: PlayerProfile;
  /** the operative currently selected — its banner is the profile avatar */
  character: ArenaCharacter;
  onChange: (p: PlayerProfile) => void;
  onClose?: () => void;
};

export default function ProfileCard({ profile, character, onChange, onClose }: Props) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLinkedEmail(data.session?.user.email ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setLinkedEmail(session?.user.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const level = levelFromProfile(profile);
  const kd = kdRatio(profile);
  const win = winRate(profile);
  const claimable = claimableTiers(profile.alphaPassTier, profile.alphaPassClaimed);
  const rank = rankTierFromPoints(profile.rankPoints);

  // The ride staged in the garage. `carEntry` falls back to a generic "Vehicle" for a car
  // that is in the rig but nobody has priced yet, so this row never blanks out.
  const car = carEntry(profile.car);
  const carName = CARS[profile.car]?.name ?? profile.car;
  const carAccent = hexCss(CAR_CLASS_COLORS[car.klass]);

  const saveName = () => {
    const trimmed = draftName.trim().slice(0, 16);
    if (trimmed) {
      onChange({ ...profile, name: trimmed });
    } else {
      setDraftName(profile.name);
    }
    setEditing(false);
  };

  const cancelName = () => {
    setDraftName(profile.name);
    setEditing(false);
  };

  const claimTier = (tier: number) => {
    const r = rewardForTier(tier);
    if (!r) return;
    onChange({
      ...profile,
      gold: profile.gold + r.gold,
      shards: profile.shards + r.shards,
      alphaPassClaimed: Array.from(new Set([...profile.alphaPassClaimed, tier]).values()).sort((a, b) => a - b),
    });
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[55] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card/95 p-5 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.35em] text-foreground">Operator Profile</h2>
          {onClose && (
            <button aria-label="Close profile" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* header card */}
        <div className="mt-4 rounded-2xl border border-[var(--hud-accent)]/30 bg-[var(--hud-panel)]/60 p-5">
          <div className="flex items-center gap-4">
            <div
              className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-[var(--hud-accent)]/20 text-[var(--hud-accent)]"
              style={{ borderColor: `${hexCss(character.color)}55` }}
            >
              <BannerArt
                src={character.banner}
                alt={character.name}
                className="h-full w-full object-cover"
                fallback={<User className="h-8 w-8" />}
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value.slice(0, 16))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveName();
                        if (e.key === "Escape") cancelName();
                      }}
                      autoFocus
                      className="w-40 rounded-md border border-[var(--hud-accent)]/50 bg-background px-2 py-1 text-sm font-bold uppercase tracking-wide text-foreground outline-none"
                    />
                    <button onClick={saveName} className="text-[var(--hud-accent)] hover:text-foreground">
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-black uppercase tracking-wide text-foreground">{profile.name}</p>
                    <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-[var(--hud-accent)]">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                {/* name the operative, or the avatar art above is a face with no label */}
                <span style={{ color: hexCss(character.color) }}>{character.name}</span>
                {" · Guest "}
                {profile.id.slice(0, 8)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-full bg-[var(--hud-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--hud-accent-foreground)]">
                  Lv. {level}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{win}% win rate</span>
              </div>
            </div>
            {/* ranked crest — the only place `rankPoints` is visible to the player */}
            <div className="hidden shrink-0 flex-col items-center gap-1 sm:flex">
              <img
                src={RANK_ICON[rank.name] ?? RANK_ICON["Bronze"]}
                alt={rank.name}
                draggable={false}
                className="h-14 w-14 object-contain"
                style={{ filter: `drop-shadow(0 0 6px ${hexCss(rank.color)}66)` }}
              />
              <span
                className="text-[9px] font-black uppercase tracking-[0.2em]"
                style={{ color: hexCss(rank.color) }}
              >
                {rank.name}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground tabular-nums">
                {profile.rankPoints} RP
              </span>
            </div>
          </div>
        </div>

        {/* currencies */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 px-4 py-3">
            <Coins className="h-5 w-5 text-[#ffd45e]" />
            <div>
              <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">Gold</p>
              <p className="text-base font-bold tabular-nums text-foreground">{profile.gold.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 px-4 py-3">
            <Gem className="h-5 w-5 text-[#7dd3fc]" />
            <div>
              <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">Shards</p>
              <p className="text-base font-bold tabular-nums text-foreground">{profile.shards.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* garage — the ride staged for the next match */}
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-3">
          <div
            className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background/50"
            style={{ borderColor: `${carAccent}55` }}
          >
            <BannerArt
              src={car.banner}
              alt={carName}
              className="h-full w-full object-cover"
              fallback={<Car className="h-6 w-6" style={{ color: carAccent }} />}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">Garage</p>
            <p className="truncate text-sm font-bold uppercase tracking-wide text-foreground">{carName}</p>
            <p className="text-[9px] uppercase tracking-[0.25em]" style={{ color: carAccent }}>
              {car.klass}
            </p>
          </div>
        </div>

        {/* stats */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat icon={Crosshair} label="Kills" value={profile.totalKills.toLocaleString()} />
          <Stat icon={Skull} label="Deaths" value={profile.totalDeaths.toLocaleString()} />
          <Stat icon={TrendingUp} label="K/D Ratio" value={kd.toFixed(2)} />
          <Stat icon={Trophy} label="Matches Won" value={profile.matchesWon.toLocaleString()} />
        </div>

        {/* Alpha Pass */}
        <div className="mt-3 overflow-hidden rounded-xl border border-border/50 bg-card/60">
          {/* Header art. `BannerArt` because this lives in `public/` — a missing file must
              degrade to the old flat header instead of failing the build. */}
          <div className="relative h-20 w-full">
            <BannerArt
              src="/banners/alpha-pass-header.jpg"
              alt=""
              className="h-full w-full object-cover"
              fallback={<div className="h-full w-full bg-[var(--hud-accent)]/10" />}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/50 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <Medal className="h-4 w-4 text-[var(--hud-accent)]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground">Alpha Pass</span>
              </div>
              <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--hud-accent)] backdrop-blur">
                Tier {profile.alphaPassTier}
              </span>
            </div>
          </div>
          <div className="p-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--hud-accent)]"
                style={{ width: `${profile.alphaPassXp / 10}%` }}
              />
            </div>
            <p className="mt-1.5 text-[9px] uppercase tracking-widest text-muted-foreground">
              {1000 - profile.alphaPassXp} XP to next tier
            </p>
          </div>

          {claimable.length > 0 && (
            <div className="space-y-2 px-4 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--hud-accent)]">Claimable rewards</p>
              {claimable.map((tier) => {
                const r = rewardForTier(tier)!;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => claimTier(tier)}
                    className="flex w-full items-center justify-between rounded-xl border border-[var(--hud-accent)]/30 bg-[var(--hud-accent)]/10 px-3 py-2 transition active:scale-95"
                  >
                    <div className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-[var(--hud-accent)]" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">Tier {tier} — {r.label}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--hud-accent)]">Claim</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

          {/* social link */}
        <div className="mt-3 rounded-xl border border-border/50 bg-card/60 p-3">
          {linkedEmail ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">Linked account</p>
                <p className="truncate text-xs font-semibold text-foreground">{linkedEmail}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setLinkedEmail(null);
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground active:scale-95"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--hud-accent)]/30 bg-[var(--hud-accent)]/10 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-[var(--hud-accent)] transition hover:bg-[var(--hud-accent)]/20 active:scale-95"
            >
              <Link2 className="h-4 w-4" />
              Link with Google
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
          Play matches to earn gold, shards, and unlock characters.
        </p>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Crosshair; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 px-4 py-3">
      <Icon className="h-4 w-4 text-[var(--hud-accent)]" />
      <div>
        <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
        <p className="text-sm font-bold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

import { useState, useRef } from "react";
import { Store, Sparkles, Coins, Gem, Ticket, X, RotateCcw, Package, CreditCard } from "lucide-react";
import { type PlayerProfile } from "./playerProfile";
import BannerArt from "./BannerArt";
import { WEAPON_SKINS, rarityLabel, SKIN_RARITY_COLORS } from "./weaponSkins";
import { hexCss } from "./characters";
import { playUiClick, playUiSelect, playUiError, playUiCrateOpen } from "./sfx";

type Props = {
  profile: PlayerProfile;
  onChange: (p: PlayerProfile) => void;
  onClose: () => void;
};

type Reward = {
  id: string;
  label: string;
  icon: typeof Coins;
  iconColor: string;
  gold?: number;
  shards?: number;
  xp?: number;
};

const REWARDS: Reward[] = [
  { id: "gold-big", label: "500 Gold", icon: Coins, iconColor: "#ffd45e", gold: 500 },
  { id: "gold-med", label: "250 Gold", icon: Coins, iconColor: "#ffd45e", gold: 250 },
  { id: "gold-sm", label: "100 Gold", icon: Coins, iconColor: "#ffd45e", gold: 100 },
  { id: "shards", label: "10 Shards", icon: Gem, iconColor: "#7dd3fc", shards: 10 },
  { id: "xp", label: "XP Boost", icon: Ticket, iconColor: "#4ade80", xp: 200 },
  { id: "gold-sm2", label: "100 Gold", icon: Coins, iconColor: "#ffd45e", gold: 100 },
  { id: "gold-med2", label: "250 Gold", icon: Coins, iconColor: "#ffd45e", gold: 250 },
  { id: "gold-jackpot", label: "Jackpot", icon: Sparkles, iconColor: "#f472b6", gold: 1000 },
];

const SPIN_COST = 100;

const CRATES = [
  { id: "gold-crate", name: "Frostline Crate", cost: 500, currency: "gold" as const, description: "Common to rare weapon skins." },
  { id: "shard-crate", name: "Cryo Crate", cost: 50, currency: "shards" as const, description: "Rare to legendary weapon skins." },
];

const SHARD_PACKS = [
  { id: "shards-sm", name: "Handful", amount: 100, price: "$0.99" },
  { id: "shards-md", name: "Stash", amount: 550, price: "$4.99", bonus: "+50 Bonus" },
  { id: "shards-lg", name: "Hoard", amount: 1200, price: "$9.99", bonus: "+200 Bonus" },
];

function randomSkin(legendary = false) {
  const pool = WEAPON_SKINS.filter((s) => (legendary ? s.rarity === "legendary" : s.rarity !== "legendary"));
  const weighted = pool.flatMap((s) => Array(s.rarity === "common" ? 4 : s.rarity === "rare" ? 2 : 1).fill(s));
  return (weighted[Math.floor(Math.random() * weighted.length)] ?? pool[0])!;
}

export default function StorePanel({ profile, onChange, onClose }: Props) {
  const [tab, setTab] = useState<"wheel" | "crates" | "currency">("wheel");
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<Reward | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [crateResult, setCrateResult] = useState<{ name: string; rarity: string; color: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const resultRef = useRef<Reward | null>(null);

  const canSpin = profile.gold >= SPIN_COST && !spinning;

  const spin = () => {
    if (!canSpin) {
      playUiError();
      return;
    }
    playUiSelect();
    setSpinning(true);
    setResult(null);
    setMessage(null);

    const rewardIndex = Math.floor(Math.random() * REWARDS.length);
    const reward = REWARDS[rewardIndex]!;
    resultRef.current = reward;

    const slice = 360 / REWARDS.length;
    const target = rewardIndex * slice + slice / 2;
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    const nextRotation = rotation + extraSpins * 360 + (360 - (target % 360)) + 360;

    setRotation(nextRotation);

    window.setTimeout(() => {
      setSpinning(false);
      setResult(reward);
      playUiCrateOpen();
      const next = { ...profile, gold: profile.gold - SPIN_COST };
      if (reward.gold) next.gold += reward.gold;
      if (reward.shards) next.shards += reward.shards;
      if (reward.xp) {
        next.alphaPassXp += reward.xp;
        while (next.alphaPassXp >= 1000) {
          next.alphaPassXp -= 1000;
          next.alphaPassTier += 1;
        }
      }
      onChange(next);
      setMessage(`You won: ${reward.label}`);
    }, 3200);
  };

  const buyCrate = (crateId: string) => {
    const crate = CRATES.find((c) => c.id === crateId);
    if (!crate || opening) return;
    const currency = crate.currency;
    if (profile[currency] < crate.cost) {
      playUiError();
      return;
    }
    playUiSelect();
    setOpening(true);
    setCrateResult(null);

    window.setTimeout(() => {
      playUiCrateOpen();
      const legendary = crate.currency === "shards";
      const skin = randomSkin(legendary);
      const next = { ...profile, [currency]: profile[currency] - crate.cost };
      if (!next.ownedSkins.includes(skin.id)) next.ownedSkins.push(skin.id);
      if (!next.vault.includes(skin.id)) next.vault.push(skin.id);
      onChange(next);
      setCrateResult({
        name: skin.name,
        rarity: rarityLabel(skin.rarity),
        color: hexCss(SKIN_RARITY_COLORS[skin.rarity as keyof typeof SKIN_RARITY_COLORS]),
      });
      setOpening(false);
    }, 1200);
  };

  const buyShards = (amount: number) => {
    playUiSelect();
    const next = { ...profile, shards: profile.shards + amount };
    onChange(next);
    setMessage(`Added ${amount} Shards (mock purchase)`);
  };

  const TabButton = ({ id, label, icon: Icon }: { id: typeof tab; label: string; icon: typeof Coins }) => (
    <button
      type="button"
      onClick={() => {
        playUiClick();
        setTab(id);
      }}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-[0.25em] transition ${
        tab === id
          ? "bg-[var(--hud-accent)] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)]"
          : "border border-border/60 bg-card/50 text-muted-foreground hover:bg-card"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <div className="pointer-events-auto absolute inset-0 z-[55] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[48rem] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-[var(--hud-accent)]" />
            <h2 className="text-xs font-bold uppercase tracking-[0.35em] text-foreground">Store</h2>
          </div>
          <button aria-label="Close store" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5">
          <div className="rounded-2xl border border-[var(--hud-accent)]/30 bg-[var(--hud-panel)]/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-[#ffd45e]" />
                <span className="text-sm font-bold tabular-nums text-foreground">{profile.gold.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Gem className="h-5 w-5 text-[#7dd3fc]" />
                <span className="text-sm font-bold tabular-nums text-foreground">{profile.shards.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <TabButton id="wheel" label="Luck" icon={Sparkles} />
            <TabButton id="crates" label="Crates" icon={Package} />
            <TabButton id="currency" label="Currency" icon={CreditCard} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "wheel" && (
            <div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--hud-accent)]">Luck Royale</p>
                <p className="mt-1 text-xs text-muted-foreground">Spin the wheel for gold, shards and XP.</p>
              </div>

              <div className="relative mx-auto mt-5 h-64 w-64">
                <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                  <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-[var(--hud-accent)]" />
                </div>
                <div
                  className="h-full w-full rounded-full border-4 border-[var(--hud-accent)]/40 shadow-[var(--shadow-hud)] transition-transform duration-[3000ms] ease-out"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    background: `conic-gradient(
                      from 0deg,
                      rgba(255,212,94,0.25) 0deg 45deg,
                      rgba(255,212,94,0.15) 45deg 90deg,
                      rgba(255,212,94,0.25) 90deg 135deg,
                      rgba(125,211,252,0.25) 135deg 180deg,
                      rgba(74,222,128,0.25) 180deg 225deg,
                      rgba(255,212,94,0.15) 225deg 270deg,
                      rgba(255,212,94,0.25) 270deg 315deg,
                      rgba(244,114,182,0.3) 315deg 360deg
                    )`,
                  }}
                >
                  {REWARDS.map((reward, i) => {
                    const angle = (i * 45 + 22.5) * (Math.PI / 180);
                    const x = 50 + 35 * Math.cos(angle);
                    const y = 50 + 35 * Math.sin(angle);
                    const Icon = reward.icon;
                    return (
                      <div
                        key={reward.id}
                        className="absolute flex flex-col items-center justify-center"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          transform: "translate(-50%, -50%)",
                          width: "3rem",
                        }}
                      >
                        <Icon className="h-5 w-5" style={{ color: reward.iconColor }} />
                        <span className="mt-1 text-[8px] font-bold uppercase tracking-wider text-foreground" style={{ transform: "rotate(-90deg)" }}>
                          {reward.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--hud-accent)]/40 bg-card shadow-[var(--shadow-hud)]">
                  <Sparkles className="h-5 w-5 text-[var(--hud-accent)]" />
                </div>
              </div>

              {result && (
                <div className="mt-4 rounded-xl border border-[var(--hud-accent)]/40 bg-[var(--hud-accent)]/10 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--hud-accent)]">{message}</p>
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <result.icon className="h-5 w-5" style={{ color: result.iconColor }} />
                    <span className="text-lg font-bold text-foreground">{result.label}</span>
                  </div>
                </div>
              )}

              <button
                onClick={spin}
                disabled={!canSpin}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--hud-accent)] py-3 text-sm font-black uppercase tracking-[0.25em] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
              >
                <RotateCcw className="h-4 w-4" />
                Spin · {SPIN_COST} Gold
              </button>

              {profile.gold < SPIN_COST && !spinning && (
                <p className="mt-2 text-center text-[10px] text-destructive">Not enough gold. Play matches to earn more.</p>
              )}
            </div>
          )}

          {tab === "crates" && (
            <div className="space-y-4">
              <p className="text-center text-xs text-muted-foreground">Crates contain weapon skins that change stats in the Armory.</p>
              {crateResult && (
                <div className="overflow-hidden rounded-xl border border-[var(--hud-accent)]/40 bg-[var(--hud-accent)]/10 text-center">
                  <div className="relative h-24 w-full">
                    <BannerArt
                      src="/crates/crate-open.jpg"
                      alt=""
                      className="h-full w-full object-cover"
                      fallback={<div className="h-full w-full bg-[var(--hud-accent)]/15" />}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
                  </div>
                  <div className="p-4 pt-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--hud-accent)]">Crate opened!</p>
                    <p className="mt-1 text-lg font-bold" style={{ color: crateResult.color }}>{crateResult.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{crateResult.rarity}</p>
                  </div>
                </div>
              )}
              {CRATES.map((crate) => {
                const canAfford = profile[crate.currency] >= crate.cost;
                return (
                  <div key={crate.id} className="rounded-2xl border border-border/60 bg-card/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-background/40">
                          <BannerArt
                            src="/crates/crate-closed.jpg"
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={<Package className="h-6 w-6 text-muted-foreground" />}
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">{crate.name}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{crate.description}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {crate.currency === "gold" ? <Coins className="h-4 w-4 text-[#ffd45e]" /> : <Gem className="h-4 w-4 text-[#7dd3fc]" />}
                        <span className="text-xs font-bold tabular-nums text-foreground">{crate.cost}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => buyCrate(crate.id)}
                      disabled={!canAfford || opening}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--hud-accent)] py-2.5 text-[10px] font-black uppercase tracking-[0.25em] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
                    >
                      <Package className="h-4 w-4" />
                      Open Crate
                    </button>
                    {!canAfford && !opening && (
                      <p className="mt-1.5 text-center text-[9px] text-destructive">Not enough {crate.currency}.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "currency" && (
            <div className="space-y-4">
              {/* Storefront hero for the shard packs. */}
              <div className="relative h-28 w-full overflow-hidden rounded-2xl border border-border/60">
                <BannerArt
                  src="/crates/premium-bundle.jpg"
                  alt=""
                  className="h-full w-full object-cover"
                  fallback={<div className="h-full w-full bg-[var(--hud-accent)]/10" />}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
                <p className="absolute bottom-3 left-4 text-[10px] font-black uppercase tracking-[0.3em] text-foreground">
                  Premium bundle
                </p>
              </div>
              <p className="text-center text-xs text-muted-foreground">Mock shard packs for testing. No real payment is processed.</p>
              {SHARD_PACKS.map((pack) => (
                <div key={pack.id} className="rounded-2xl border border-border/60 bg-card/60 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">{pack.name}</p>
                      {pack.bonus && <p className="mt-0.5 text-[10px] text-[var(--hud-accent)]">{pack.bonus}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Gem className="h-4 w-4 text-[#7dd3fc]" />
                      <span className="text-sm font-bold tabular-nums text-foreground">{pack.amount}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => buyShards(pack.amount)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--hud-accent)]/50 bg-card py-2.5 text-[10px] font-black uppercase tracking-[0.25em] text-foreground transition hover:bg-[var(--hud-accent)]/10 active:scale-95"
                  >
                    <CreditCard className="h-4 w-4" />
                    Buy {pack.price} — Mock
                  </button>
                </div>
              ))}
              {message && message.includes("Shards") && (
                <p className="text-center text-[10px] text-[var(--hud-accent)]">{message}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

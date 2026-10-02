import { useState } from "react";
import { PartyPopper, Coins, X, Check, Lock } from "lucide-react";

import { type PlayerProfile } from "./playerProfile";
import { DANCE_STORE, DANCE_RARITY_LABELS, DANCE_RARITY_COLORS, isDanceOwned } from "./danceStore";
import OperativeViewer from "./OperativeViewer";
import { type ArenaCharacter } from "./characters";

type Props = {
  /** the player's chosen operative — previews the dance on the real character */
  character: ArenaCharacter;
  profile: PlayerProfile;
  onChange: (p: PlayerProfile) => void;
  onClose: () => void;
};

/**
 * Dance shop — buy emotes with gold and preview them live on the operative.
 *
 * Free starters are owned from the start (see `danceStore`); the rest are gold
 * sinks. Buying just appends the id to `profile.ownedDances`; the emote wheel
 * (lobby and in-match) reads that list and unlocks the row. The preview reuses
 * `OperativeViewer` with a `danceId`, so what you see spinning here is exactly
 * what plays in the wheel.
 */
export default function DanceShop({ character, profile, onChange, onClose }: Props) {
  // Default the preview to the first dance so the panel never opens on an empty stage.
  const [selected, setSelected] = useState<string>(DANCE_STORE[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const buy = (id: string) => {
    const item = DANCE_STORE.find((d) => d.id === id);
    if (!item || isDanceOwned(profile.ownedDances, id)) return;
    if (profile.gold < item.price) {
      setMessage("Not enough gold. Play matches to earn more.");
      return;
    }
    onChange({
      ...profile,
      gold: profile.gold - item.price,
      ownedDances: [...profile.ownedDances, id],
    });
    setMessage(`Unlocked ${item.label}!`);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[55] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[48rem] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-4 w-4 text-[var(--hud-accent)]" />
            <h2 className="text-xs font-bold uppercase tracking-[0.35em] text-foreground">Dances</h2>
          </div>
          <button aria-label="Close dance shop" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* gold balance */}
        <div className="px-5">
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--hud-accent)]/30 bg-[var(--hud-panel)]/60 p-4">
            <Coins className="h-5 w-5 text-[#ffd45e]" />
            <span className="text-sm font-bold tabular-nums text-foreground">{profile.gold.toLocaleString()}</span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Gold</span>
          </div>
        </div>

        {/* live preview of the selected dance on the player's operative */}
        <div className="mx-5 mt-4 h-48 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-[radial-gradient(ellipse_at_50%_120%,color-mix(in_oklab,var(--hud-accent)_16%,transparent),transparent_65%)]">
          <OperativeViewer
            key={character.id}
            character={character}
            danceId={selected || undefined}
            interactive
            zoom={1.05}
            className="h-full w-full"
          />
        </div>

        {message && (
          <p className="px-5 pt-3 text-center text-[10px] uppercase tracking-[0.3em] text-[var(--hud-accent)]">{message}</p>
        )}

        {/* the catalogue */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            {DANCE_STORE.map((d) => {
              const owned = isDanceOwned(profile.ownedDances, d.id);
              const active = selected === d.id;
              const color = DANCE_RARITY_COLORS[d.rarity];
              const canAfford = profile.gold >= d.price;
              return (
                <div
                  key={d.id}
                  className={`flex flex-col gap-2 rounded-2xl border bg-card/60 p-3 transition ${
                    active ? "border-[var(--hud-accent)]" : "border-border/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(d.id)}
                    className="flex items-center justify-between text-left"
                  >
                    <span className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">{d.label}</span>
                    {owned ? (
                      <Check className="h-3.5 w-3.5 text-[var(--hud-accent)]" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  <span className="text-[8px] font-bold uppercase tracking-[0.25em]" style={{ color }}>
                    {DANCE_RARITY_LABELS[d.rarity]}
                  </span>
                  {owned ? (
                    <div className="rounded-lg border border-[var(--hud-accent)]/40 bg-[var(--hud-accent)]/10 py-1.5 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--hud-accent)]">
                      Owned
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => buy(d.id)}
                      disabled={!canAfford}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--hud-accent)] py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
                    >
                      <Coins className="h-3 w-3" />
                      {d.price.toLocaleString()}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

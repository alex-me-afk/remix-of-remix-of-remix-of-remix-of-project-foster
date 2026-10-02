import { useState } from "react";
import { Car, Coins, X, Check, Lock, Unlock, Gauge } from "lucide-react";

import CarViewer from "./CarViewer";
import BannerArt from "./BannerArt";
import { CAR_IDS, CARS } from "./carModel";
import { carEntry, isCarOwned, carPriceLabel, CAR_CLASS_COLORS } from "./carStore";
import { type PlayerProfile } from "./playerProfile";
import { hexCss } from "./characters";

type Props = {
  profile: PlayerProfile;
  onChange: (p: PlayerProfile) => void;
  onClose: () => void;
};

/**
 * Garage — buy cars with gold and equip the one you drive.
 *
 * The roster is the live `CAR_IDS` from `carModel`, so a new car in the rig shows
 * up here automatically; driving stats (top speed, accel, steering) come from
 * `CARS` and price / class / blurb from `carStore`. Buying appends the id to
 * `profile.ownedCars`; equipping sets `profile.car`. Free starters are always
 * owned (see `isCarOwned`), so the corvette opens on "Equip", never "Buy".
 *
 * Layout mirrors PetPicker (big live preview left, roster right, one action
 * button); buy/gold handling mirrors DanceShop. The action is per PREVIEWED car:
 * unowned -> Buy, owned-but-not-driven -> Equip, driven -> Equipped badge.
 */
export default function CarShop({ profile, onChange, onClose }: Props) {
  // Open on the car you currently drive so the panel never starts on an empty stage.
  const [preview, setPreview] = useState<string>(profile.car ?? CAR_IDS[0] ?? "corvette");
  const [message, setMessage] = useState<string | null>(null);

  // Normalise the stat bars against the whole roster so they read as "fast for this game",
  // not against an absolute scale the player can't see.
  const maxSpeed = Math.max(1, ...CAR_IDS.map((id) => CARS[id]?.topSpeed ?? 0));
  const maxAccel = Math.max(1, ...CAR_IDS.map((id) => CARS[id]?.accel ?? 0));
  const maxSteer = Math.max(1, ...CAR_IDS.map((id) => CARS[id]?.steerDeg ?? 0));

  const def = CARS[preview];
  const entry = carEntry(preview);
  const owned = isCarOwned(profile.ownedCars, preview);
  const equipped = profile.car === preview;
  const accent = hexCss(CAR_CLASS_COLORS[entry.klass]);
  const canAfford = profile.gold >= entry.price;

  const buy = (id: string) => {
    const e = carEntry(id);
    if (isCarOwned(profile.ownedCars, id)) return;
    if (profile.gold < e.price) {
      setMessage("Not enough gold. Play matches to earn more.");
      return;
    }
    onChange({
      ...profile,
      gold: profile.gold - e.price,
      ownedCars: [...profile.ownedCars, id],
    });
    setMessage(`Unlocked ${CARS[id]?.name ?? id}!`);
  };

  const equip = (id: string) => {
    if (!isCarOwned(profile.ownedCars, id)) return;
    onChange({ ...profile, car: id });
    setMessage(`${CARS[id]?.name ?? id} staged in the garage.`);
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-md">
      <div className="flex h-full max-h-[42rem] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-[var(--shadow-hud)]">
        {/* header: title · gold · close */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-[var(--hud-accent)]" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.4em] text-foreground">Garage</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                Buy a ride and stage it for the arena
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--hud-accent)]/30 bg-[var(--hud-panel)]/60 px-3 py-2">
              <Coins className="h-4 w-4 text-[#ffd45e]" />
              <span className="text-sm font-bold tabular-nums text-foreground">{profile.gold.toLocaleString()}</span>
              <span className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">Gold</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close garage"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-foreground transition hover:bg-card active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-4 p-5 sm:grid-cols-[1.1fr_1fr] sm:grid-rows-1">
          {/* preview + spec sheet */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="relative min-h-[13rem] flex-1 overflow-hidden rounded-2xl border border-border/50 bg-[radial-gradient(ellipse_at_50%_120%,color-mix(in_oklab,var(--hud-accent)_20%,transparent),transparent_65%)]">
              <CarViewer key={preview} carId={preview} className="absolute inset-0" />
              <span
                className="pointer-events-none absolute left-4 top-4 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.25em]"
                style={{ borderColor: accent, color: accent }}
              >
                {entry.klass}
              </span>
              <div className="pointer-events-none absolute bottom-3 left-5 right-5">
                <p className="text-lg font-black uppercase tracking-[0.25em] text-foreground">{def?.name ?? preview}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{entry.blurb}</p>
              </div>
            </div>

            {/* driving spec — bars normalised across the roster */}
            <div className="shrink-0 rounded-2xl border border-border/50 bg-background/40 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground">Spec</span>
                <span className="ml-auto text-[10px] font-bold tabular-nums text-foreground">
                  {Math.round((def?.topSpeed ?? 0) * 3.6)} km/h
                </span>
              </div>
              <StatBar label="Top Speed" value={def?.topSpeed ?? 0} max={maxSpeed} color={accent} />
              <StatBar label="Acceleration" value={def?.accel ?? 0} max={maxAccel} color={accent} />
              <StatBar label="Handling" value={def?.steerDeg ?? 0} max={maxSteer} color={accent} />
            </div>
          </div>

          {/* roster + action */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {CAR_IDS.map((id) => {
                const d = CARS[id];
                const e = carEntry(id);
                const active = id === preview;
                const isOwned = isCarOwned(profile.ownedCars, id);
                const isEquipped = profile.car === id;
                const chip = hexCss(CAR_CLASS_COLORS[e.klass]);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreview(id)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition active:scale-95 ${
                      active
                        ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/10"
                        : "border-border/50 bg-card/40 hover:bg-card/70"
                    } ${!isOwned ? "opacity-70" : ""}`}
                  >
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background/50"
                      style={{ borderColor: `${chip}55`, boxShadow: `0 0 12px ${chip}33` }}
                    >
                      <BannerArt
                        src={e.banner}
                        alt={d?.name ?? id}
                        className="h-full w-full object-cover"
                        fallback={
                          <span
                            className="h-8 w-5 rounded-sm"
                            style={{ background: chip, boxShadow: `0 0 12px ${chip}66` }}
                          />
                        }
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
                        {d?.name ?? id}
                      </span>
                      <span className="block truncate text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                        {isOwned ? e.klass : carPriceLabel(id)}
                      </span>
                    </span>
                    {isEquipped ? (
                      <Check className="ml-auto h-4 w-4 text-[var(--hud-accent)]" />
                    ) : isOwned ? (
                      <Unlock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>

            {message && (
              <p className="shrink-0 text-center text-[10px] uppercase tracking-[0.3em] text-[var(--hud-accent)]">
                {message}
              </p>
            )}

            {/* action button — state for the PREVIEWED car */}
            {equipped ? (
              <div className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[var(--hud-accent)]/50 bg-[var(--hud-accent)]/10 text-sm font-black uppercase tracking-[0.4em] text-[var(--hud-accent)]">
                <Check className="h-4 w-4" /> Equipped
              </div>
            ) : owned ? (
              <button
                type="button"
                onClick={() => equip(preview)}
                className="h-12 shrink-0 rounded-2xl bg-[var(--hud-accent)] text-sm font-black uppercase tracking-[0.4em] text-[var(--hud-accent-foreground)] transition hover:brightness-110 active:scale-95"
              >
                Equip
              </button>
            ) : (
              <button
                type="button"
                onClick={() => buy(preview)}
                disabled={!canAfford}
                className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--hud-accent)] text-sm font-black uppercase tracking-[0.4em] text-[var(--hud-accent-foreground)] transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              >
                <Coins className="h-4 w-4" />
                {`Buy · ${entry.price.toLocaleString()}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One normalised spec bar. `value/max` drives the fill; label + raw value sit above it. */
function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0.04, Math.min(1, value / (max || 1)));
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
    </div>
  );
}

import { useState } from "react";
import { Check, X, Zap, Shield, Crosshair, Heart, Timer, Target, Footprints, Coins, LayoutGrid, Package, Radar, Flame, Plane, CircleDollarSign, Briefcase, Backpack } from "lucide-react";

import { POWERS, type PowerId } from "./powers";
import { POWER_ICON } from "./icons";
import { PASSIVE_SKILLS, MAX_PASSIVES, combinePassives, type PassiveSkillId, type Loadout } from "./skills";
import { TACTICALS, TACTICAL_IDS, type TacticalId } from "./tactical";
import { hexCss } from "./characters";

const PASSIVE_ICONS: Record<PassiveSkillId, typeof Zap> = {
  sprint: Footprints,
  armor: Shield,
  berserker: Crosshair,
  medic: Heart,
  quickdraw: Timer,
  steady: Target,
  nimble: Footprints,
  scavenger: Coins,
};

const TACTICAL_ICONS: Record<TacticalId, typeof Package> = {
  scanner: Radar,
  bonfire: Flame,
  airdrop: Plane,
  bounty: CircleDollarSign,
  armorCrate: Briefcase,
  legPockets: Backpack,
};

type Props = {
  loadout: Loadout;
  characterPowerId: string;
  onChange: (l: Loadout) => void;
  onClose: () => void;
};

export default function LoadoutPanel({ loadout, characterPowerId, onChange, onClose }: Props) {
  const [preview, setPreview] = useState<Loadout>(loadout);
  /** Fall back to the first power so an unknown id still renders a card and an icon. */
  const activePowerId: PowerId = characterPowerId in POWERS ? (characterPowerId as PowerId) : (Object.keys(POWERS)[0] as PowerId);
  const activePower = POWERS[activePowerId]!;
  const combined = combinePassives(preview.passives);

  const togglePassive = (id: PassiveSkillId) => {
    if (preview.passives.includes(id)) {
      setPreview({ ...preview, passives: preview.passives.filter((p) => p !== id) });
    } else if (preview.passives.length < MAX_PASSIVES) {
      setPreview({ ...preview, passives: [...preview.passives, id] });
    }
  };

  const save = () => {
    onChange({ ...preview, active: characterPowerId });
    onClose();
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-md">
      <div className="flex h-full max-h-[42rem] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.4em] text-foreground">Loadout</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              One active power · up to three passive skills · one tactical item
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-foreground transition hover:bg-card active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-4 p-5 sm:grid-cols-[1.1fr_1fr] sm:grid-rows-1">
          {/* active + summary */}
          <div className="flex min-h-0 flex-col gap-4">
            <div className="rounded-2xl border border-[var(--hud-accent)]/30 bg-[var(--hud-panel)]/60 p-5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" style={{ color: hexCss(activePower.color) }} />
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-foreground">Active power</p>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={POWER_ICON[activePowerId]}
                  alt=""
                  draggable={false}
                  className="h-12 w-12 shrink-0 rounded-xl border object-contain p-0.5"
                  style={{
                    borderColor: `${hexCss(activePower.color)}66`,
                    background: `${hexCss(activePower.color)}1a`,
                  }}
                />
                <div className="min-w-0">
                  <p className="text-lg font-black uppercase tracking-wide text-foreground">{activePower.name}</p>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    {activePower.duration}s · {activePower.cooldown}s cooldown
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{activePower.blurb}</p>
            </div>

            <div className="flex-1 rounded-2xl border border-border/50 bg-card/60 p-5">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-[var(--hud-accent)]" />
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-foreground">Combined passives</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest">
                <Summary label="Damage" value={`${Math.round((combined.damageDealt - 1) * 100)}%`} />
                <Summary label="Defence" value={`${Math.round((1 - combined.damageTaken) * 100)}%`} />
                <Summary label="Speed" value={`${Math.round((combined.speed - 1) * 100)}%`} />
                <Summary label="Regen" value={`${combined.regen.toFixed(1)}/s`} />
                <Summary label="Recoil" value={`${Math.round((1 - combined.recoil) * 100)}%`} />
                <Summary label="Reload" value={`${Math.round((1 - combined.reload) * 100)}%`} />
                <Summary label="Gold" value={`${Math.round((combined.gold - 1) * 100)}%`} />
              </div>
            </div>
          </div>

          {/* passive grid + tactical */}
          <div className="flex min-h-0 flex-col gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Selected {preview.passives.length}/{MAX_PASSIVES}
            </p>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {(Object.keys(PASSIVE_SKILLS) as PassiveSkillId[]).map((id) => {
                const s = PASSIVE_SKILLS[id];
                const active = preview.passives.includes(id);
                const full = !active && preview.passives.length >= MAX_PASSIVES;
                const Icon = PASSIVE_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={full}
                    onClick={() => togglePassive(id)}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition active:scale-95 ${
                      active
                        ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/10"
                        : full
                          ? "border-border/40 bg-card/30 opacity-50"
                          : "border-border/50 bg-card/40 hover:bg-card/70"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Icon className="h-4 w-4" style={{ color: hexCss(s.color) }} />
                      {active && <Check className="h-4 w-4 text-[var(--hud-accent)]" />}
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">{s.name}</span>
                    <span className="text-[10px] leading-snug text-muted-foreground">{s.blurb}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Tactical item</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TACTICAL_IDS.map((id) => {
                const t = TACTICALS[id];
                const active = preview.tactical === id;
                const Icon = TACTICAL_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreview({ ...preview, tactical: active ? null : id })}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition active:scale-95 ${
                      active
                        ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/10"
                        : "border-border/50 bg-card/40 hover:bg-card/70"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Icon className="h-4 w-4" style={{ color: hexCss(t.color) }} />
                      {active && <Check className="h-4 w-4 text-[var(--hud-accent)]" />}
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">{t.name}</span>
                    <span className="text-[10px] leading-snug text-muted-foreground">{t.blurb}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={save}
              className="h-12 shrink-0 rounded-2xl bg-[var(--hud-accent)] text-sm font-black uppercase tracking-[0.4em] text-[var(--hud-accent-foreground)] transition hover:brightness-110 active:scale-95"
            >
              Save loadout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-card/40 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-[var(--hud-accent)]">{value}</span>
    </div>
  );
}

export { hexCss };

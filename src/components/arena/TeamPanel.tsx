/**
 * In-match teammate status panel.
 *
 * Shows every friendly fighter's name, HP bar and alive/dead state. Keeps
 * the list compact so it fits beside the minimap on small screens.
 */

import { Skull, Crosshair, HeartPulse } from "lucide-react";

export type Teammate = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  isHuman: boolean;
  /** knocked but alive (dbno) — still revivable */
  downed?: boolean;
};

type Props = {
  teammates: Teammate[];
  scale?: number;
  opacity?: number;
};

export default function TeamPanel({ teammates, scale = 1, opacity = 1 }: Props) {
  const alive = teammates.filter((t) => t.alive).length;
  const total = teammates.length;

  return (
    <div
      className="pointer-events-none absolute left-3 top-[132px] z-10 flex w-36 flex-col gap-1.5 sm:left-4 sm:top-[144px] sm:w-40"
      style={{ transform: `scale(${scale})`, transformOrigin: "top left", opacity }}
    >
      <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.25em] text-white/70">
        <span>Squad</span>
        <span className="tabular-nums text-white/50">
          {alive}/{total}
        </span>
      </div>
      {teammates.map((t) => {
        const pct = Math.max(0, Math.min(100, (t.hp / t.maxHp) * 100));
        return (
          <div
            key={t.id}
            className="rounded-md border border-white/10 bg-black/55 px-2 py-1 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 truncate text-[10px] font-semibold uppercase tracking-wide text-white/90">
                {t.isHuman && <Crosshair className="h-2.5 w-2.5 text-[var(--hud-accent)]" />}
                <span className="truncate">{t.name}</span>
              </span>
              {!t.alive && <Skull className="h-3 w-3 text-white/40" />}
              {t.alive && t.downed && <HeartPulse className="h-3 w-3 animate-pulse text-red-400" />}
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-sm bg-white/10">
              <div
                className="h-full rounded-sm transition-all duration-150"
                style={{
                  width: `${t.alive ? pct : 0}%`,
                  background: t.alive
                    ? pct > 60
                      ? "oklch(0.75 0.16 85)"
                      : pct > 30
                        ? "oklch(0.75 0.14 95)"
                        : "oklch(0.62 0.2 27)"
                    : "transparent",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { Lock } from "lucide-react";

import { DANCES } from "./operativeAnims";

type Props = {
  /** The dance currently looping, or undefined when the character is idle. */
  active?: string | undefined;
  /**
   * Owned dance ids. When provided, dances NOT in the list render locked and
   * can't be picked (buy them in the Dance shop). Omit to show everything
   * unlocked — the in-match wheel passes it; a caller that doesn't care can skip it.
   */
  owned?: readonly string[] | undefined;
  /** Pick a dance to play. */
  onPick: (id: string) => void;
  /** Stop dancing and return to idle. */
  onStop: () => void;
  /** Dismiss the wheel without changing the dance. */
  onClose: () => void;
};

/**
 * The lobby emote wheel — the "circle" Brook asked for: click the operative and a ring of
 * dances fans out around it, pick one and the character loops it.
 *
 * All dances are unlocked. The shop that gates them is deferred, so nothing here reads a
 * purchase flag yet; when it lands, this is where a lock badge and a disabled state go.
 *
 * Laid out with trig rather than a CSS grid because a ring is what reads as an emote wheel
 * (and matches the battle-royale convention players already know). The backdrop is a full
 * layer so a click anywhere off the ring closes it.
 */
export default function EmoteWheel({ active, owned, onPick, onStop, onClose }: Props) {
  const n = DANCES.length;
  // Radius in rem; large enough that the labels don't collide at this count.
  const R = 8.5;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      // Any click that reaches the backdrop (i.e. missed the ring) dismisses.
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[rgba(4,7,12,0.55)] backdrop-blur-sm" />

      {/* The ring. Stop propagation so clicks on the buttons don't bubble to the backdrop. */}
      <div
        className="relative h-0 w-0"
        onClick={(e) => e.stopPropagation()}
      >
        {DANCES.map((d, i) => {
          // Start at the top and go clockwise.
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(angle) * R;
          const y = Math.sin(angle) * R;
          const on = active === d.id;
          const locked = owned ? !owned.includes(d.id) : false;
          return (
            <button
              key={d.id}
              type="button"
              disabled={locked}
              onClick={() => onPick(d.id)}
              style={{ transform: `translate(-50%, -50%) translate(${x}rem, ${y}rem)` }}
              className={
                "absolute left-0 top-0 flex h-16 w-16 items-center justify-center rounded-full border text-center text-[9px] font-black uppercase leading-tight tracking-[0.12em] transition active:scale-95 " +
                (on
                  ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/25 text-foreground shadow-[0_0_20px_var(--hud-accent)]"
                  : locked
                    ? "cursor-not-allowed border-border/40 bg-card/50 text-muted-foreground/60"
                    : "border-border/60 bg-card/80 text-foreground/90 backdrop-blur-md hover:border-[var(--hud-accent)] hover:bg-card")
              }
            >
              {locked ? <Lock className="h-4 w-4 opacity-70" /> : d.label}
            </button>
          );
        })}

        {/* Center hub — stop dancing, or just close when already idle. */}
        <button
          type="button"
          onClick={() => (active ? onStop() : onClose())}
          className="absolute left-0 top-0 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-border/60 bg-card/90 text-[10px] font-black uppercase tracking-[0.15em] text-foreground backdrop-blur-md transition active:scale-95 hover:border-[var(--hud-accent)]"
        >
          {active ? "Stop" : "Close"}
        </button>
      </div>
    </div>
  );
}

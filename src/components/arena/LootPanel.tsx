import { useState } from "react";
import { X } from "lucide-react";

import { entryIcon, entryLabel, type Stash, type StashEntry } from "./lootStash";
import { getWeapon } from "./weapons";
import backpackIcon from "@/assets/hud/backpack.png";

const SOURCE_TITLE: Record<Stash["source"], string> = {
  pack: "Death crate",
  chest: "Gold chest",
  crate: "Airdrop",
};

type Props = {
  stash: Stash;
  /** How many of this line fit in the pack right now. 0 greys the line out. */
  roomFor: (e: StashEntry) => number;
  /**
   * For a weapon line: the ids the player would have to give up, or null when a slot is free.
   * Returning a list is what turns the row into a choice instead of a silent overwrite.
   */
  swapTargets: (e: StashEntry) => string[] | null;
  onTake: (index: number, swapWith?: string) => void;
  onTakeAll: () => void;
  onClose: () => void;
  /** 0..1 pack load, mirrored from the backpack ring so the cost of taking is visible here. */
  fill: number;
};

/**
 * The container you are standing on, listed down the side of the screen.
 *
 * Brook: "when the player steps on it he will see the icons on the side of the scren of what that
 * player had before medkit guns boombs ..etc the player can click on them to take the stuff thats
 * he cant take for exa,ple medkit and can change for stuff that can be changed a guns ... nothing
 * should reaplce directly what the player has its should be a player choice".
 *
 * So: nothing is granted on contact. Every line is a button, a line that will not fit says so
 * instead of silently doing nothing, and a gun with no free slot expands into "swap with which of
 * these two" rather than taking the choice away.
 */
export default function LootPanel({
  stash,
  roomFor,
  swapTargets,
  onTake,
  onTakeAll,
  onClose,
  fill,
}: Props) {
  const [swapping, setSwapping] = useState<number | null>(null);
  const pct = Math.round(fill * 100);

  return (
    <div className="pointer-events-auto absolute right-3 top-1/2 z-30 w-[228px] -translate-y-1/2 rounded-xl border border-[var(--hud-accent)]/40 bg-black/70 p-2.5 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--hud-accent)]">
          {SOURCE_TITLE[stash.source]}
        </p>
        <button
          aria-label="Close loot"
          onClick={onClose}
          className="text-white/50 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Pack load, so "why is this greyed out" is answerable without opening the backpack. */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <img
          src={backpackIcon}
          alt=""
          className="h-3 w-3 object-contain [filter:invert(1)] opacity-70"
        />
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${pct}%`, background: pct >= 100 ? "#ff3b1f" : "#ff6b4a" }}
          />
        </div>
        <span className="text-[9px] font-bold tabular-nums text-white/60">{pct}%</span>
      </div>

      <div className="mt-2 max-h-[46vh] space-y-1 overflow-y-auto">
        {stash.entries.map((e, i) => {
          const room = roomFor(e);
          const targets = e.kind === "weapon" ? swapTargets(e) : null;
          const needsSwap = e.kind === "weapon" && targets !== null;
          const blocked = room <= 0 && !needsSwap;
          const open = swapping === i;
          return (
            <div key={`${e.kind}-${i}`}>
              <button
                type="button"
                disabled={blocked}
                onClick={() => {
                  if (blocked) return;
                  if (needsSwap) {
                    setSwapping(open ? null : i);
                    return;
                  }
                  onTake(i);
                }}
                className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition active:scale-95 ${
                  blocked
                    ? "border-white/10 bg-white/5 opacity-45"
                    : "border-white/20 bg-white/10 hover:border-[var(--hud-accent)]/60"
                }`}
              >
                <img
                  src={entryIcon(e)}
                  alt=""
                  draggable={false}
                  className={`h-6 shrink-0 object-contain ${e.kind === "weapon" ? "w-9" : "w-6"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-white">
                    {entryLabel(e)}
                  </span>
                  <span className="block text-[9px] uppercase tracking-widest text-white/45">
                    {blocked
                      ? e.kind === "weapon"
                        ? "Carried"
                        : "Pack full"
                      : needsSwap
                        ? "Swap"
                        : `x${Math.min(room, e.qty)}`}
                  </span>
                </span>
                {e.qty > 1 && (
                  <span className="shrink-0 rounded bg-black/60 px-1.5 text-[10px] font-bold tabular-nums text-white/80">
                    {e.qty}
                  </span>
                )}
              </button>

              {/* Which gun to give up. Only shown once the player has asked for the swap. */}
              {open && targets && (
                <div className="mt-1 space-y-1 rounded-lg border border-[var(--hud-accent)]/30 bg-[var(--hud-accent)]/10 p-1.5">
                  <p className="text-[9px] uppercase tracking-widest text-white/60">
                    Replace which?
                  </p>
                  {targets.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setSwapping(null);
                        onTake(i, id);
                      }}
                      className="flex w-full items-center gap-2 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-left active:scale-95"
                    >
                      <img
                        src={getWeapon(id)?.image ?? ""}
                        alt=""
                        className="h-4 w-7 object-contain"
                      />
                      <span className="truncate text-[9px] font-bold uppercase text-white">
                        {getWeapon(id)?.name ?? id}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {stash.entries.length === 0 && (
          <p className="py-3 text-center text-[10px] uppercase tracking-widest text-white/40">
            Empty
          </p>
        )}
      </div>

      {stash.entries.length > 0 && (
        <button
          type="button"
          onClick={onTakeAll}
          className="mt-2 w-full rounded-lg bg-[var(--hud-accent)] px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--hud-accent-foreground)] active:scale-95"
        >
          Take all that fits
        </button>
      )}
    </div>
  );
}

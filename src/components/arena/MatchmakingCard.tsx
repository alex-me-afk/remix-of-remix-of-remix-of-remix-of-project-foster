import { useLayoutEffect, useRef, useState } from "react";
import { Bomb, Users, X } from "lucide-react";

type Props = {
  /** players found so far */
  found: number;
  /** the mode's advertised lobby size (30 for Last Howl) */
  players: number;
  /** seconds this search has been running */
  elapsed: number;
  /** the queue's "average wait", in seconds */
  average: number;
  /** roster full AND the match level built — the drop is about to start */
  ready: boolean;
  onCancel: () => void;
};

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, "0");
const mmss = (seconds: number) => `${pad(seconds / 60)}:${pad(seconds % 60)}`;

/**
 * The matchmaking card that sits over the normal lobby while a Battle Royale lobby is filling.
 *
 * It exists so the player never leaves the lobby for a splash: they keep their operative, their
 * pet, their settings and the shop, and this corner of the screen tells them what the queue is
 * doing. Draggable, because it lands where the player's own HUD might be.
 */
export default function MatchmakingCard({ found, players, elapsed, average, ready, onCancel }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  /** null until measured, so the card can be centred without a first-frame flash */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const box = cardRef.current?.getBoundingClientRect();
    if (!box) return;
    setPos({ x: Math.round(window.innerWidth / 2 - box.width / 2), y: 64 });
  }, []);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = cardRef.current?.getBoundingClientRect();
    if (!box) return;
    drag.current = { id: e.pointerId, dx: e.clientX - box.left, dy: e.clientY - box.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const w = cardRef.current?.offsetWidth ?? 260;
    const h = cardRef.current?.offsetHeight ?? 96;
    setPos({
      x: Math.min(Math.max(8, e.clientX - d.dx), Math.max(8, window.innerWidth - w - 8)),
      y: Math.min(Math.max(8, e.clientY - d.dy), Math.max(8, window.innerHeight - h - 8)),
    });
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const accent = ready ? "#4ade80" : "#f87171";

  return (
    <div
      ref={cardRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="pointer-events-auto absolute z-[70] w-[248px] cursor-grab touch-none select-none overflow-hidden rounded-xl border border-[#b91c1c]/45 bg-[#220a0d]/92 shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur active:cursor-grabbing"
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 64, visibility: pos ? "visible" : "hidden" }}
    >
      {/* header: the little grenade, the state, and the bail-out */}
      <div className="flex items-center gap-2 border-b border-[#b91c1c]/30 px-2.5 py-1.5">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full border"
          style={{ borderColor: `${accent}66`, color: accent }}
        >
          <Bomb className="h-3 w-3" strokeWidth={2.5} />
        </span>
        <span
          className="flex-1 text-[9px] font-black uppercase tracking-[0.22em]"
          style={{ color: accent }}
        >
          {ready ? "Match found" : "Finding players"}
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onCancel}
          aria-label="Cancel matchmaking"
          className="pointer-events-auto rounded-md p-0.5 text-white/55 transition hover:text-white active:scale-90"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>

      {/* the count the player is actually watching */}
      <div className="flex items-end justify-between px-2.5 py-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black tabular-nums leading-none text-white">{found}</span>
          <span className="text-xs font-bold tabular-nums text-white/45">/ {players}</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
          <Users className="h-3 w-3" strokeWidth={2.5} />
          players
        </div>
      </div>

      {/* the two clocks: how long you have waited, and how long this queue usually takes */}
      <div className="flex items-center justify-between border-t border-[#b91c1c]/25 px-2.5 py-1.5 text-[9px] font-semibold tabular-nums text-white/45">
        <span>{mmss(elapsed)} searching</span>
        <span>avg {mmss(average)}</span>
      </div>

      {/* a bar that fills with the roster, so the card reads at a glance */}
      <div className="h-[3px] w-full bg-white/5">
        <div
          className="h-full transition-[width] duration-300 ease-out"
          style={{
            width: `${Math.min(100, Math.round((found / Math.max(1, players)) * 100))}%`,
            background: ready ? "#4ade80" : "linear-gradient(90deg,#7f1d1d,#ef4444)",
          }}
        />
      </div>
    </div>
  );
}

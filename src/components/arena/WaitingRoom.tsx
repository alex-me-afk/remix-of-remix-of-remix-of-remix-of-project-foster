import { useEffect, useRef, useState } from "react";

import BrandMark from "./BrandMark";
import { createWaitingIsland, type WaitingIsland } from "./waitingIsland";

/**
 * THE WAITING ROOM — the HUD bolted onto the 3-D waiting island.
 *
 * This is the Free Fire pre-match room: you stand on the island with the players you are about to
 * fight, a clock counts down, a roster fills to its cap, and the match starts. It replaces the
 * static "Building the arena" splash for Battle Royale, and it exists because that splash was a
 * blurred JPEG with a progress bar hardcoded to 72% — a whole minute of dead air on a slow phone.
 *
 * The wait is not decoration: `GameShell` mounts the arena behind this screen, so the 15 MB level
 * and the bodies, guns and pets that go on it are fetched, parsed, tiled and lit WHILE the player
 * walks around in here. That is the entire point — the room is the loading screen.
 *
 * Everything three-dimensional lives in `waitingIsland.ts`; this file owns only the overlay and
 * the two decisions on top of it: when the roster is full, and when to release.
 */

type Props = {
  /** The player's own body GLB, so the operative they picked is the one standing on the deck. */
  bodyUrl?: string | undefined;
  /** false → no crowd bodies. A phone, or Quality: Low. */
  crowd?: boolean | undefined;
  pixelRatio?: number | undefined;
  /** `waitingRoomSeconds` from the mode's rules — a CEILING on the wait, not a fixed duration. */
  seconds: number;
  /** `waitingRoomPlayers` — the denominator on the roster counter. */
  players: number;
  /** Whether the match level has finished building behind this screen. */
  mapReady: boolean;
  /**
   * The room drew its first real frame. Optional: the shell now reveals the room when it has fully
   * LOADED (`onLoaded`), not on its first frame, so a caller may have nothing to do with this.
   */
  onFirstFrame?: () => void;
  /**
   * The room has finished building — GLB, collider, bodies, all of it. The shell waits for this
   * before it mounts the arena, so the match level and this room are never being built at the same
   * time: doing both at once is what took the tab out on an 8 GB machine.
   */
  onLoaded: () => void;
  /** Release the player into the match. Fires exactly once. */
  onDeploy: () => void;
  /** Rotating tip line. Owned by the shell so the app has one tip list, not two. */
  tip: string;
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Radius of the touch stick in CSS pixels — the knob travel, not the ring. */
const PAD_R = 52;

export default function WaitingRoom(props: Props) {
  const { seconds, players, mapReady } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const islandRef = useRef<WaitingIsland | null>(null);

  // Callbacks through refs: the parent passes inline arrows, and a dependency on those would tear
  // the whole room — GLB, collider, nine rigs — down and rebuild it on every parent render.
  const firstFrameRef = useRef(props.onFirstFrame);
  firstFrameRef.current = props.onFirstFrame;
  const loadedRef = useRef(props.onLoaded);
  loadedRef.current = props.onLoaded;
  const deployRef = useRef(props.onDeploy);
  deployRef.current = props.onDeploy;
  /** Read once, at mount: changing the body mid-wait is not a thing the lobby can do. */
  const initRef = useRef({
    bodyUrl: props.bodyUrl,
    crowd: props.crowd,
    pixelRatio: props.pixelRatio,
  });

  const [elapsed, setElapsed] = useState(0);
  /**
   * The room gave up on itself — a lost WebGL context, or seconds of sustained stall on a device
   * that cannot carry it. It has already freed its own memory; everything below this line keeps
   * working, because the countdown and the release are this component's job, not the island's.
   */
  const [bailed, setBailed] = useState(false);
  // Coarse pointer → show the stick. On a desktop the drag-look and WASD are enough, and a
  // thumbstick drawn on a monitor just says "we built this for a phone".
  const [coarse] = useState(() => window.matchMedia?.("(pointer: coarse)")?.matches ?? false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const island = createWaitingIsland({
      host,
      bodyUrl: initRef.current.bodyUrl,
      crowd: initRef.current.crowd,
      pixelRatio: initRef.current.pixelRatio,
      onFirstFrame: () => firstFrameRef.current?.(),
      onLoaded: () => loadedRef.current(),
      onBail: () => {
        islandRef.current = null;
        setBailed(true);
      },
    });
    islandRef.current = island;
    return () => {
      islandRef.current = null;
      island.dispose();
    };
  }, []);

  useEffect(() => {
    const t0 = performance.now();
    const id = window.setInterval(() => setElapsed((performance.now() - t0) / 1000), 200);
    return () => window.clearInterval(id);
  }, []);

  /*
   * The roster fills in its own time rather than over the whole ceiling. The minute exists to cover
   * a slow map on a slow phone; nobody should sit through a full one because their machine finished
   * in four seconds. So: fill over ~18 s, then release the moment the level reports ready.
   *
   * The cap is `players - 1` until the level IS ready, which is the deliberate part. When the map is
   * slow the counter parks one short, so the wait reads as "one more player" — a thing that happens
   * in every lobby ever built — instead of a 30/30 that sits there insisting it is finished.
   */
  const fill = clamp(seconds * 0.3, 8, 20);
  const cap = mapReady ? players : players - 1;
  const joined = clamp(Math.round(players * (0.4 + 0.6 * (elapsed / fill))), 1, cap);
  const roomFull = joined >= players;
  const left = Math.max(0, Math.ceil(seconds - elapsed));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  /** Both release paths need the level: a full room, or the ceiling reached. */
  const releasing = mapReady && (roomFull || elapsed >= seconds);

  useEffect(() => {
    if (!releasing) return;
    // A beat on "MATCH STARTING" so the release reads as an event and not as a cut.
    const id = window.setTimeout(() => deployRef.current(), 900);
    return () => window.clearTimeout(id);
  }, [releasing]);

  // Push the same numbers onto the wall screen inside the room. The HUD is the copy the player can
  // always read; the board is the copy that makes the room feel like it is running the match.
  useEffect(() => {
    const island = islandRef.current;
    if (!island) return;
    island.setBoard(
      releasing ? "GO" : clock,
      releasing
        ? "MATCH STARTING"
        : mapReady
          ? `${joined} / ${players} PLAYERS`
          : "PREPARING ISLAND",
    );
    island.setCrowd(joined / players);
  }, [clock, joined, players, mapReady, releasing]);

  // The room runs at half rate and 1:1 pixels until the match level is built. Both are drawing on
  // the same GPU and parsing on the same thread, and the one the player is not looking at yet is
  // the one that should be starved.
  useEffect(() => {
    islandRef.current?.setBusy(!mapReady);
  }, [mapReady]);

  const padId = useRef<number | null>(null);
  const padRef = useRef<HTMLDivElement | null>(null);

  const trackPad = (e: React.PointerEvent) => {
    const box = padRef.current?.getBoundingClientRect();
    if (!box) return;
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / PAD_R);
    const nx = (dx / d) * k;
    const ny = (dy / d) * k;
    setKnob({ x: nx * PAD_R, y: ny * PAD_R });
    islandRef.current?.setStick(nx, -ny); // screen y grows downward; the stick's forward is +y
  };

  const onPadDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (padId.current !== null) return;
    padId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    trackPad(e);
  };
  const onPadMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === padId.current) trackPad(e);
  };
  const onPadUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== padId.current) return;
    padId.current = null;
    setKnob({ x: 0, y: 0 });
    islandRef.current?.setStick(0, 0);
  };

  const chip = "rounded-2xl border border-foreground/10 bg-background/70 px-4 py-2.5 backdrop-blur";

  return (
    <div className="absolute inset-0 z-50 overflow-hidden bg-[#070b13]">
      {/* The canvas owns every pointer event that is not on a control, so drag-to-look works
          anywhere on screen. Hence pointer-events-none on the HUD layer and auto on the controls. */}
      <div ref={hostRef} className="absolute inset-0" />
      {/* The room dropped itself on a device that could not carry it. Something has to be behind the
          HUD, and it must not be a black void — the countdown still has up to a minute to run. */}
      {bailed && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,rgba(30,44,68,0.95)_0%,#070b13_72%)]" />
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className={chip}>
            <p className="text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
              {releasing ? "Deploying" : "Match starts in"}
            </p>
            <p className="mt-0.5 text-2xl font-bold leading-none tabular-nums text-foreground">
              {releasing ? "GO" : clock}
            </p>
          </div>
          <BrandMark size="sm" />
          <div className={`${chip} text-right`}>
            <p className="text-[9px] uppercase tracking-[0.35em] text-muted-foreground">Players</p>
            <p className="mt-0.5 text-2xl font-bold leading-none tabular-nums text-foreground">
              <span className="text-[var(--hud-accent)]">{joined}</span>
              <span className="text-muted-foreground">/{players}</span>
            </p>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          {bailed ? (
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Holding for the match
            </p>
          ) : coarse ? (
            <div
              ref={padRef}
              onPointerDown={onPadDown}
              onPointerMove={onPadMove}
              onPointerUp={onPadUp}
              onPointerCancel={onPadUp}
              className="pointer-events-auto relative h-[128px] w-[128px] shrink-0 touch-none rounded-full border border-foreground/15 bg-background/30 backdrop-blur"
            >
              <div
                className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full border border-[var(--hud-accent)]/60 bg-background/70"
                style={{
                  transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
                }}
              />
            </div>
          ) : (
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Drag to look · WASD to walk · Space to jump
            </p>
          )}

          <div className="flex max-w-sm flex-col items-end gap-3 text-right">
            <p className="min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
              {props.tip}
            </p>
            {/* Only offered once the level is actually built — a skip that dropped the player into
                an unfinished arena would be the one bug this whole screen exists to prevent. */}
            <button
              type="button"
              disabled={!mapReady || releasing}
              onClick={() => deployRef.current()}
              className="pointer-events-auto rounded-full border border-[var(--hud-accent)]/60 bg-background/50 px-8 py-2.5 text-[11px] font-bold uppercase tracking-[0.4em] text-foreground backdrop-blur transition enabled:hover:bg-[var(--hud-accent)] enabled:hover:text-[var(--hud-accent-foreground)] enabled:active:scale-95 disabled:opacity-40"
            >
              {mapReady ? "Deploy now" : "Preparing island"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

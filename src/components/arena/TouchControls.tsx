import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Move, X } from "lucide-react";

import backpackIcon from "@/assets/hud/backpack.png";
import crouchIcon from "@/assets/hud/crouch.png";
import fistIcon from "@/assets/hud/fist.png";
import bombIcon from "@/assets/hud/bomb.png";
import medkitIcon from "@/assets/hud/medkit.png";
import proneIcon from "@/assets/hud/prone.png";
import scopeIcon from "@/assets/hud/scope.png";
import sprintIcon from "@/assets/hud/sprint.png";
import standIcon from "@/assets/hud/stand.png";
import jumpIcon from "@/assets/hud/jump.svg";
import reloadIcon from "@/assets/hud/reload.svg";
import inhalerIcon from "@/assets/hud/inhaler.svg";
import emoteIcon from "@/assets/hud/emote.svg";
import pingIcon from "@/assets/hud/ping.svg";
import wallIcon from "@/assets/hud/wall.png";
import { CONTROL_LABELS, type ArenaSettings, type ControlId } from "./settings";
import { getWeapon } from "./weapons";
import { AMMO_FAMILIES, FAMILY_LABEL, type AmmoFamily } from "./ammoFamily";
import { AMMO_FAMILY_ICON, GRENADE_ICON, LOOT_ICON } from "./icons";
import { GRENADE_DEFS, type GrenadeKind } from "./bomb";

/** What a bag row can hand back to the world. `ammo`/`grenade` carry which family or kind. */
export type ThrowRequest =
  | { kind: "kit" | "inhaler" | "wall" }
  | { kind: "ammo"; family: AmmoFamily }
  | { kind: "grenade"; grenade: GrenadeKind };

type Props = {
  press: (code: string) => void;
  release: (code: string) => void;
  onShootStart: () => void;
  onShootEnd: () => void;
  onScopeToggle: () => void;
  scoped: boolean;
  onJump: () => void;
  onReload: () => void;
  onCrouchToggle: () => void;
  crouch: boolean;
  onProneToggle: () => void;
  prone: boolean;
  kits: number;
  onHeal: () => void;
  /** inhalers left; instant HP + EP, usable on the move */
  inhalers?: number;
  onUseInhaler?: () => void;
  /** 0..1 while a medkit is being applied */
  healProgress?: number;
  bombs: number;
  bombArmed?: boolean;
  onThrowBomb: () => void;
  /** short label of the selected throwable, e.g. FRG / FLS / SMK */
  grenadeLabel?: string;
  /** art for the selected throwable; falls back to the generic bomb glyph */
  grenadeIcon?: string;
  /** step to the next throwable type */
  onCycleGrenade?: () => void;
  walls: number;
  onThrowWall: () => void;
  onPing?: () => void;
  /** open the emote / dance wheel. Free-Fire-style; placeholder icon for now. */
  onEmote?: () => void;
  slots: (string | null)[];
  onDropWeapon: (index: number) => void;
  /**
   * 0..1 pack load. Draws the red ring around the backpack button — Brook: "add like a cricle
   * around the backpack icon show how much the backpack is fell the circle should be in red".
   */
  bagFill?: number;
  /** Shared reserves by calibre group, so the pack lists what the guns actually eat. */
  ammoPool?: Record<AmmoFamily, number>;
  /** Every throwable held, not just the armed one — the pack shows all four kinds. */
  grenadeCounts?: Record<GrenadeKind, number>;
  /** Put one of something on the ground so a teammate can pick it up. */
  onThrowItem?: (req: ThrowRequest) => void;
  scale?: number;
  settings: ArenaSettings;
  editing?: boolean;
  onMoveControl?: ((id: ControlId, dx: number, dy: number) => void) | undefined;
  selected?: ControlId | null;
  onSelectControl?: ((id: ControlId) => void) | undefined;
  hideEditHint?: boolean;
  /** hide every combat/utility control (keep only the move stick) — used while
   *  riding the dropship / skydiving so no shooting UI shows mid-air */
  combatHidden?: boolean;
  /** social hangout map: keep only movement, jump, crouch, prone and one dance button */
  hangout?: boolean;
};

type ControlProps = {
  id: ControlId;
  anchor: string;
  origin: string;
  centerX?: boolean;
  settings: ArenaSettings;
  scale: number;
  editing: boolean;
  onMoveControl?: ((id: ControlId, dx: number, dy: number) => void) | undefined;
  selected?: ControlId | null;
  onSelectControl?: ((id: ControlId) => void) | undefined;
  children: ReactNode;
};

const MOVE_KEYS = ["KeyW", "KeyS", "KeyA", "KeyD"] as const;
type MoveKey = (typeof MOVE_KEYS)[number];

const disc =
  "pointer-events-auto touch-none select-none flex items-center justify-center rounded-full border border-white/25 bg-black/45 backdrop-blur-sm transition active:scale-95 active:bg-white/25";
const glyph = "pointer-events-none object-contain [filter:invert(1)] opacity-90";

function ControlWrap({
  id,
  anchor,
  origin,
  centerX = false,
  settings,
  scale,
  editing,
  onMoveControl,
  selected,
  onSelectControl,
  children,
}: ControlProps) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; dx: number; dy: number } | null>(null);
  const cfg = settings.controls[id];
  if (cfg.hidden && !editing) return null;

  const totalScale = Math.max(0.01, scale * cfg.scale);
  const editHandlers = editing
    ? {
        onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          onSelectControl?.(id);
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            dx: cfg.dx,
            dy: cfg.dy,
          };
        },
        onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          event.preventDefault();
          onMoveControl?.(
            id,
            drag.dx + (event.clientX - drag.x) / totalScale,
            drag.dy + (event.clientY - drag.y) / totalScale,
          );
        },
        onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
        },
        onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
        },
      }
    : {};

  return (
    <div
      {...editHandlers}
      className={`absolute ${anchor} ${editing ? "pointer-events-auto touch-none cursor-move" : ""}`}
      style={{
        transform: `${centerX ? "translateX(-50%) " : ""}translate(${cfg.dx}px, ${cfg.dy}px) scale(${totalScale})`,
        transformOrigin: origin,
        opacity: cfg.hidden ? 0.25 : settings.hudOpacity,
      }}
    >
      <div
        className={
          editing
            ? `pointer-events-none relative rounded-xl outline-dashed outline-2 outline-offset-4 ${
                selected === id ? "outline-[var(--hud-accent)]" : "outline-white/35"
              }`
            : "relative"
        }
      >
        {children}
        {editing && (
          <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white">
            {CONTROL_LABELS[id]}
          </span>
        )}
      </div>
    </div>
  );
}

export default function TouchControls({
  press,
  release,
  onShootStart,
  onShootEnd,
    onScopeToggle,
    scoped,
    onJump,
    onReload,
    onCrouchToggle,
    crouch,
    onProneToggle,
    prone,
  kits,
  onHeal,
  inhalers,
  onUseInhaler,
  healProgress = 0,
  bombs,
  bombArmed,
  grenadeLabel,
  grenadeIcon,
  onCycleGrenade,
  onThrowBomb,
  walls,
  onThrowWall,
  onPing,
  onEmote,
  slots,
  onDropWeapon,
  bagFill = 0,
  ammoPool,
  grenadeCounts,
  onThrowItem,
  scale = 1,
  settings,
  editing = false,
  onMoveControl,
  selected = null,
  onSelectControl,
  hideEditHint = false,
  combatHidden = false,
  hangout = false,
}: Props) {
  const [bagOpen, setBagOpen] = useState(false);
  const [stickActive, setStickActive] = useState(false);
  const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
  const [sprintLock, setSprintLock] = useState(false);
  const [firing, setFiring] = useState(false);

  const stickRef = useRef<HTMLDivElement>(null);
  const stickPointerRef = useRef<number | null>(null);
  const firePointerRef = useRef<number | null>(null);
  const movementRef = useRef<Set<MoveKey>>(new Set());
  const sprintLockRef = useRef(sprintLock);
  const callbacksRef = useRef({ press, release, onShootEnd });
  const updateStickRef = useRef<(pointerId: number, clientX: number, clientY: number) => void>(() => {});

  sprintLockRef.current = sprintLock;
  callbacksRef.current = { press, release, onShootEnd };

  const setMovement = useCallback((next: Set<MoveKey>, sprint: boolean) => {
    const callbacks = callbacksRef.current;
    for (const key of MOVE_KEYS) {
      const wasPressed = movementRef.current.has(key);
      const shouldPress = next.has(key);
      if (shouldPress && !wasPressed) callbacks.press(key);
      if (!shouldPress && wasPressed) callbacks.release(key);
    }
    movementRef.current = next;
    if (sprint) callbacks.press("ShiftLeft");
    else callbacks.release("ShiftLeft");
  }, []);

  const resetStick = useCallback(() => {
    stickPointerRef.current = null;
    setStickActive(false);
    setStickPosition({ x: 0, y: 0 });
    // sprint lock keeps the player running forward with no finger on the stick
    if (sprintLockRef.current) setMovement(new Set<MoveKey>(["KeyW"]), true);
    else setMovement(new Set(), false);
  }, [setMovement]);

  // toggling run starts/stops the auto-run immediately
  useEffect(() => {
    if (stickPointerRef.current !== null) return;
    if (sprintLock) setMovement(new Set<MoveKey>(["KeyW"]), true);
    else setMovement(new Set(), false);
  }, [sprintLock, setMovement]);

  const releaseFire = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && firePointerRef.current !== pointerId) return;
    if (firePointerRef.current === null) return;
    firePointerRef.current = null;
    callbacksRef.current.onShootEnd();
  }, []);

  useEffect(() => {
    const movePointer = (event: PointerEvent) => {
      if (stickPointerRef.current !== event.pointerId) return;
      event.preventDefault();
      updateStickRef.current(event.pointerId, event.clientX, event.clientY);
    };
    const releasePointer = (event: PointerEvent) => {
      if (stickPointerRef.current === event.pointerId) resetStick();
      releaseFire(event.pointerId);
    };
    const resetAll = () => {
      resetStick();
      releaseFire();
    };
    window.addEventListener("pointermove", movePointer, { capture: true, passive: false });
    window.addEventListener("pointerup", releasePointer, true);
    window.addEventListener("pointercancel", releasePointer, true);
    window.addEventListener("blur", resetAll);
    document.addEventListener("visibilitychange", resetAll);
    return () => {
      window.removeEventListener("pointermove", movePointer, true);
      window.removeEventListener("pointerup", releasePointer, true);
      window.removeEventListener("pointercancel", releasePointer, true);
      window.removeEventListener("blur", resetAll);
      document.removeEventListener("visibilitychange", resetAll);
      resetAll();
    };
  }, [releaseFire, resetStick]);

  const updateStick = (pointerId: number, clientX: number, clientY: number) => {
    if (stickPointerRef.current !== pointerId) return;
    const element = stickRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const visualRadius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
    const distance = Math.hypot(dx, dy);
    const ratio = distance > visualRadius ? visualRadius / distance : 1;
    setStickPosition({ x: (dx * ratio) / Math.max(scale * settings.controls.stick.scale, 0.01), y: (dy * ratio) / Math.max(scale * settings.controls.stick.scale, 0.01) });

    const next = new Set<MoveKey>();
    const deadZone = visualRadius * 0.18;
    if (distance >= deadZone) {
      const nx = dx / visualRadius;
      const ny = dy / visualRadius;
      if (ny < -0.28) next.add("KeyW");
      if (ny > 0.28) next.add("KeyS");
      if (nx < -0.28) next.add("KeyA");
      if (nx > 0.28) next.add("KeyD");
    }
    if (next.size === 0 && sprintLockRef.current) next.add("KeyW");
    setMovement(next, sprintLockRef.current || distance > visualRadius * 0.9);
  };
  updateStickRef.current = updateStick;

  const tap = (action: () => void) =>
    editing
      ? {}
      : {
          onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            action();
          },
          onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
        };

  if (!settings.showTouchControls && !editing) return null;
  // while skydiving we keep only the movement stick (to steer the dive) and hide
  // every shooting / utility button; the controls editor still shows everything.
  const showCombat = !combatHidden || editing;
  const showFight = showCombat && (!hangout || editing);
  const wrap = { settings, scale, editing, onMoveControl, selected, onSelectControl };

  return (
    <div
      className={`absolute z-30 touch-none select-none ${editing ? "pointer-events-auto" : "pointer-events-none"}`}
      // keep the thumb controls clear of notches / rounded corners / the home
      // indicator in fullscreen landscape (env(...) is 0 on desktop → no change)
      style={{
        top: "env(safe-area-inset-top, 0px)",
        right: "env(safe-area-inset-right, 0px)",
        bottom: "env(safe-area-inset-bottom, 0px)",
        left: "env(safe-area-inset-left, 0px)",
      }}
    >
      {showCombat && (
        <ControlWrap {...wrap} id="sprint" anchor="bottom-[228px] left-8" origin="bottom left">
          <button
            type="button"
            aria-label="Toggle sprint"
            aria-pressed={sprintLock}
            {...tap(() => setSprintLock((value) => !value))}
            className={`${editing ? "" : "pointer-events-auto"} rounded-full p-1 ${sprintLock ? "ring-2 ring-primary bg-primary/20" : ""}`}
          >
            <img src={sprintIcon} alt="" className={`h-12 w-12 object-contain ${sprintLock ? "opacity-100" : "opacity-40"}`} />
          </button>
        </ControlWrap>
      )}

      <ControlWrap {...wrap} id="stick" anchor="bottom-8 left-8" origin="bottom left">
        <div
          ref={stickRef}
          className={`${editing ? "" : "pointer-events-auto"} relative h-[210px] w-[210px] touch-none rounded-full`}
          onPointerDown={
            editing
              ? undefined
              : (event) => {
                  if (stickPointerRef.current !== null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  stickPointerRef.current = event.pointerId;
                  setStickActive(true);
                   updateStick(event.pointerId, event.clientX, event.clientY);
                }
          }
          onPointerUp={(event) => stickPointerRef.current === event.pointerId && resetStick()}
          onPointerCancel={(event) => stickPointerRef.current === event.pointerId && resetStick()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className={`absolute inset-5 rounded-full border-2 bg-black/30 backdrop-blur-sm ${stickActive ? "border-[var(--hud-accent)]/70" : "border-white/20"}`}>
            <span className="absolute left-1/2 top-3 -translate-x-1/2 text-[11px] text-white/40">▲</span>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-white/40">▼</span>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-white/40">◀</span>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/40">▶</span>
          </div>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[76px] w-[76px] rounded-full border border-white/30 bg-white/20 shadow-lg backdrop-blur-sm"
            style={{ transform: `translate(calc(-50% + ${stickPosition.x}px), calc(-50% + ${stickPosition.y}px))` }}
          />
        </div>
      </ControlWrap>

      {showCombat && (
        <>
      {showFight && (
      <ControlWrap {...wrap} id="backpack" anchor="bottom-8 left-[210px]" origin="bottom left">
        <button aria-label="Open backpack" className={`${disc} relative h-12 w-12`} {...tap(() => setBagOpen((value) => !value))}>
          <img src={backpackIcon} alt="" className={`h-6 w-6 ${glyph}`} />
          {/* Capacity ring. Same conic-gradient trick as the medkit heal sweep, in red, and it
              turns solid at 100% so "no room" is readable at a glance mid-fight. */}
          <span
            className="pointer-events-none absolute -inset-[3px] rounded-full"
            style={{
              background: `conic-gradient(${bagFill >= 1 ? "#ff2d0f" : "#ff3b1f"} ${Math.min(1, bagFill) * 360}deg, rgba(255,255,255,0.14) 0deg)`,
              mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              opacity: bagFill >= 1 ? 1 : 0.9,
            }}
          />
          {bagFill >= 1 && (
            <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#ff2d0f] px-1 text-[8px] font-bold uppercase text-white">
              Full
            </span>
          )}
        </button>
      </ControlWrap>
      )}

      {showFight && (
      <ControlWrap {...wrap} id="wall" anchor="bottom-8 left-[270px]" origin="bottom left">
        <button aria-label="Throw shield wall" disabled={walls <= 0 && !editing} className={`${disc} relative h-14 w-14 ${walls <= 0 ? "opacity-35" : ""}`} {...tap(() => walls > 0 && onThrowWall())}>
          <img src={wallIcon} alt="" className={`h-7 w-7 ${glyph}`} />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-black/85 px-1.5 text-[10px] font-bold text-white">{walls}</span>
        </button>
      </ControlWrap>
      )}

      {showFight && (
      <ControlWrap {...wrap} id="medkits" anchor="bottom-[54px] left-1/2" origin="bottom center" centerX>
        <button
          aria-label="Use medkit"
          disabled={kits <= 0 && !editing}
          className={`${disc} relative h-14 w-14 ${kits <= 0 ? "opacity-35" : ""}`}
          {...tap(() => kits > 0 && onHeal())}
        >
          <img src={medkitIcon} alt="" className={`h-7 w-7 ${glyph}`} />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-black/85 px-1.5 text-[10px] font-bold text-white">{kits}</span>
          {healProgress > 0 && (
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: `conic-gradient(rgba(110,231,255,0.75) ${healProgress * 360}deg, transparent 0deg)`, opacity: 0.55 }}
            />
          )}
        </button>
        {onUseInhaler && (
          <button
            aria-label="Use inhaler"
            disabled={(inhalers ?? 0) <= 0 && !editing}
            className={`absolute -top-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/25 bg-black/75 px-2 py-[1px] text-[9px] font-bold tracking-wide text-amber-200 ${(inhalers ?? 0) <= 0 ? "opacity-40" : ""}`}
            {...tap(() => (inhalers ?? 0) > 0 && onUseInhaler())}
          >
            <img src={inhalerIcon} alt="" className="h-3 w-3 object-contain" />
            {inhalers ?? 0}
          </button>
        )}
      </ControlWrap>
      )}

      {showFight && (
      <ControlWrap {...wrap} id="bomb" anchor="bottom-[54px] left-[calc(50%+76px)]" origin="bottom center" centerX>
        <button
          aria-label="Throw bomb"
          disabled={bombs <= 0 && !editing}
          className={`${disc} relative h-14 w-14 ${bombs <= 0 ? "opacity-35" : ""} ${bombArmed ? "ring-2 ring-amber-400" : ""}`}
          {...tap(() => bombs > 0 && onThrowBomb())}
        >
          <img src={grenadeIcon ?? bombIcon} alt="" className={`h-7 w-7 ${glyph}`} />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-black/85 px-1.5 text-[10px] font-bold text-white">{bombs}</span>
        </button>
        {grenadeLabel && onCycleGrenade && (
          <button
            aria-label="Switch throwable"
            className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border border-white/25 bg-black/75 px-2 py-[1px] text-[9px] font-bold tracking-wide text-white"
            {...tap(onCycleGrenade)}
          >
            {grenadeLabel}
          </button>
        )}
      </ControlWrap>
      )}

      {showFight && (
      <ControlWrap {...wrap} id="ping" anchor="bottom-[122px] right-[172px]" origin="bottom right">
        <button aria-label="Place ping" className={`${disc} h-12 w-12`} {...tap(() => onPing?.())}>
          <img src={pingIcon} alt="" className={`h-6 w-6 ${glyph}`} />
        </button>
      </ControlWrap>
      )}

      <ControlWrap {...wrap} id="emote" anchor="bottom-[122px] right-[234px]" origin="bottom right">
        <button aria-label="Emote / dance" className={`${disc} h-12 w-12`} {...tap(() => onEmote?.())}>
          <img src={emoteIcon} alt="" className={`h-6 w-6 ${glyph}`} />
        </button>
      </ControlWrap>

      {showFight && (
      <ControlWrap {...wrap} id="scope" anchor="bottom-[122px] right-[110px]" origin="bottom right">
        <button aria-label="Toggle scope" className={`${disc} h-12 w-12 ${scoped ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/35" : ""}`} {...tap(onScopeToggle)}>
          <img src={scopeIcon} alt="" className={`h-6 w-6 ${glyph}`} />
        </button>
      </ControlWrap>
      )}

      {showFight && (
      <ControlWrap {...wrap} id="fire" anchor="bottom-8 right-8" origin="bottom right">
        <button
          aria-label="Fire"
          className={`${disc} h-[104px] w-[104px] border-white/35 bg-white/10 ${firing ? "scale-95 bg-white/20 ring-2 ring-[var(--hud-accent)]" : ""}`}
          onPointerDown={
            editing
              ? undefined
              : (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (firePointerRef.current !== null) return;
                  firePointerRef.current = event.pointerId;
                  setFiring(true);
                  onShootStart();
                }
          }
          onPointerUp={(event) => {
            setFiring(false);
            releaseFire(event.pointerId);
          }}
          onPointerCancel={(event) => {
            setFiring(false);
            releaseFire(event.pointerId);
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <img src={fistIcon} alt="" className={`h-12 w-12 ${glyph}`} />
        </button>
      </ControlWrap>
      )}

      {showFight && (
      <ControlWrap {...wrap} id="reload" anchor="bottom-[184px] right-6" origin="bottom right">
        <button aria-label="Reload" className={`${disc} h-12 w-12`} {...tap(onReload)}>
          <img src={reloadIcon} alt="" className={`h-6 w-6 ${glyph}`} />
        </button>
      </ControlWrap>
      )}
      <ControlWrap {...wrap} id="jump" anchor="bottom-[130px] right-6" origin="bottom right">
        <button aria-label="Jump" className={`${disc} h-12 w-12`} {...tap(onJump)}>
          <img src={jumpIcon} alt="" className={`h-7 w-7 ${glyph}`} />
        </button>
      </ControlWrap>
      <ControlWrap {...wrap} id="crouch" anchor="bottom-[76px] right-6" origin="bottom right">
        <button aria-label="Crouch" className={`${disc} h-12 w-12 ${crouch ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/35" : ""}`} {...tap(onCrouchToggle)}><img src={crouchIcon} alt="" className={`h-7 w-7 ${glyph}`} /></button>
      </ControlWrap>
      <ControlWrap {...wrap} id="prone" anchor="bottom-6 right-6" origin="bottom right">
        <button aria-label="Toggle prone" className={`${disc} h-12 w-12 ${prone ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/35" : ""}`} {...tap(onProneToggle)}><img src={proneIcon} alt="" className={`h-7 w-7 ${glyph}`} /></button>
      </ControlWrap>
        </>
      )}

      {editing && !hideEditHint && <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white"><Move className="mr-2 inline h-3 w-3" />Drag any control to reposition</div>}

      {bagOpen && !editing && !hangout && (
        <div className="pointer-events-auto absolute left-1/2 top-1/2 max-h-[80vh] w-[320px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border/60 bg-card/95 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Backpack</p>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold tabular-nums ${bagFill >= 1 ? "text-[#ff3b1f]" : "text-muted-foreground"}`}>
                {Math.round(Math.min(1, bagFill) * 100)}%
              </span>
              <button aria-label="Close backpack" onClick={() => setBagOpen(false)}><X className="h-4 w-4" /></button>
            </div>
          </div>
          {/* The same load the ring shows, as a bar, because a number is what tells you how much
              more you can take before the next crate. */}
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${Math.min(1, bagFill) * 100}%`, background: bagFill >= 1 ? "#ff2d0f" : "#ff6b4a" }} />
          </div>
          <div className="mt-3 space-y-1.5">
            {slots.map((id, index) => {
              const weapon = getWeapon(id);
              if (!weapon) return null;
              return <div key={`${weapon.id}-${index}`} className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5"><img src={weapon.image} alt={weapon.name} className="h-7 w-11 object-contain" /><span className="flex-1 text-[11px] font-semibold uppercase text-foreground">{weapon.name}</span>{weapon.id !== "fists" && <button onClick={() => onDropWeapon(index)} className="rounded bg-destructive/80 px-2 py-1 text-[9px] font-bold uppercase text-destructive-foreground">Throw</button>}</div>;
            })}

            <p className="pt-1 text-[9px] uppercase tracking-widest text-muted-foreground">Ammo</p>
            {AMMO_FAMILIES.map((f) => (
              <BagRow
                key={f}
                icon={AMMO_FAMILY_ICON[f]}
                label={FAMILY_LABEL[f]}
                count={ammoPool?.[f] ?? 0}
                {...(onThrowItem ? { onThrow: () => onThrowItem({ kind: "ammo", family: f }) } : {})}
              />
            ))}

            <p className="pt-1 text-[9px] uppercase tracking-widest text-muted-foreground">Gear</p>
            <BagRow icon={medkitIcon} label="Medkits" count={kits} onUse={onHeal} {...(onThrowItem ? { onThrow: () => onThrowItem({ kind: "kit" }) } : {})} />
            <BagRow icon={LOOT_ICON.inhaler} label="Inhalers" count={inhalers ?? 0} {...(onUseInhaler ? { onUse: onUseInhaler } : {})} {...(onThrowItem ? { onThrow: () => onThrowItem({ kind: "inhaler" }) } : {})} />
            <BagRow icon={wallIcon} label="Frost walls" count={walls} onUse={onThrowWall} {...(onThrowItem ? { onThrow: () => onThrowItem({ kind: "wall" }) } : {})} />
            {(Object.keys(GRENADE_DEFS) as GrenadeKind[]).map((k) => (
              <BagRow
                key={k}
                icon={GRENADE_ICON[k]}
                label={GRENADE_DEFS[k].label}
                count={grenadeCounts?.[k] ?? (k === "frag" ? bombs : 0)}
                {...(onThrowItem ? { onThrow: () => onThrowItem({ kind: "grenade", grenade: k }) } : {})}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One line of the backpack: icon, name, count, and up to two verbs.
 *
 * "Throw" is the one Brook asked for — "in the backpack we have a throw button if the player
 * decidde to throw a gun or ammo or whatever will it show in the grond so his teamet can pick it".
 * It is deliberately separate from "Use": a medkit row can do both, an ammo row only the first.
 */
function BagRow({
  icon,
  label,
  count,
  onUse,
  onThrow,
}: {
  icon: string;
  label: string;
  count: number;
  onUse?: () => void;
  onThrow?: () => void;
}) {
  const empty = count <= 0;
  return (
    <div className={`flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-[11px] ${empty ? "opacity-40" : ""}`}>
      <img src={icon} alt="" className="h-5 w-5 shrink-0 object-contain" />
      <span className="flex-1 truncate uppercase">{label}</span>
      <span className="tabular-nums">{count}</span>
      {onUse && (
        <button onClick={onUse} disabled={empty} className="rounded bg-[var(--hud-accent)] px-2 py-1 text-[9px] font-bold uppercase text-[var(--hud-accent-foreground)] disabled:opacity-40">
          Use
        </button>
      )}
      {onThrow && (
        <button onClick={onThrow} disabled={empty} className="rounded bg-destructive/80 px-2 py-1 text-[9px] font-bold uppercase text-destructive-foreground disabled:opacity-40">
          Throw
        </button>
      )}
    </div>
  );
}

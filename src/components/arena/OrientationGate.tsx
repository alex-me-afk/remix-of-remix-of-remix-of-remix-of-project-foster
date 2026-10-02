import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * True for phones and tablets, false for anything with a mouse.
 *
 * Deliberately NOT `maxTouchPoints > 0` / `"ontouchstart" in window`: those report TOUCH
 * CAPABILITY, and a huge share of Windows laptops are touch-capable while being played with a
 * mouse and keyboard — they were being sent through the "rotate your phone" gate and asked to
 * lock landscape on a screen that never rotates.
 *
 * `(pointer: coarse)` asks the different, right question: is the PRIMARY pointer a finger? A
 * phone or tablet says yes; a touchscreen laptop says no, because its primary pointer is the
 * mouse (that machine still answers yes to `any-pointer: coarse`, which is exactly why that
 * variant is not used here). A 2-in-1 folded into tablet mode flips to coarse and gets the gate,
 * which is correct. The touch HUD itself is always on for everyone by design, so this only
 * decides the gate.
 */
function isTouchDevice() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    /*
     * BOTH halves matter. `(pointer: coarse)` alone still reports true on some touch-capable
     * Windows machines whose touchscreen is treated as the primary pointer, which sent a PC played
     * with a mouse and keyboard through the phone gate and on into fullscreen it never asked for.
     * A mouse hovers and a finger does not, so `hover: none` is what separates a real phone or
     * tablet from a touch-capable PC.
     */
    return window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  }
  return "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
}

function isLandscape() {
  if (typeof window === "undefined") return true;
  return window.innerWidth > window.innerHeight;
}

/**
 * Gates the game behind a "rotate your phone + go fullscreen" screen on touch devices.
 * The children (game) are never mounted until the device is landscape and fullscreen.
 */
export default function OrientationGate({ children }: { children: ReactNode }) {
  const [touch, setTouch] = useState(false);
  const [landscape, setLandscape] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  /**
   * The player chose to keep playing in a normal window. Fullscreen is a convenience for phones —
   * it hides the browser chrome and stops the page scrolling under a thumb — but it is never
   * required, and nobody should be trapped in it.
   */
  const [windowed, setWindowed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTouch(isTouchDevice());
    setLandscape(isLandscape());
    setFullscreen(Boolean(document.fullscreenElement));
    setReady(true);

    const onResize = () => setLandscape(isLandscape());
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  const enter = useCallback(async () => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      }
    } catch {
      /* ignore — user can still play if fullscreen is refused */
    }
    const orientation = screen.orientation as (ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    }) | undefined;
    try {
      await orientation?.lock?.("landscape");
    } catch {
      /* not supported — the rotate prompt handles it */
    }
    setFullscreen(Boolean(document.fullscreenElement) || true);
    setLandscape(isLandscape());
  }, []);

  /** Windowed path: try to lock landscape, but never ask for fullscreen. */
  const playWindowed = useCallback(async () => {
    const orientation = screen.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    try {
      await orientation?.lock?.("landscape");
    } catch {
      /* not supported outside fullscreen on most browsers — the rotate prompt covers it */
    }
    setWindowed(true);
  }, []);

  if (!ready) return null;

  // Desktop / non-touch: play as-is.
  if (!touch) return <>{children}</>;

  if (!landscape) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-background px-8 text-center">
        <div className="animate-[spin_3s_ease-in-out_infinite] text-5xl">📱</div>
        <h1 className="text-lg font-bold uppercase tracking-[0.25em] text-foreground">
          Rotate your phone
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Ironhowl only plays in landscape. Turn your device sideways to continue.
        </p>
      </div>
    );
  }

  if (!fullscreen && !windowed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-background px-8 text-center">
        <h1 className="text-lg font-bold uppercase tracking-[0.25em] text-foreground">
          Ironhowl
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Fullscreen hides the browser bars and keeps the screen from scrolling. Play in a window
          instead if you would rather keep your tabs.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            onClick={enter}
            className="rounded-md bg-primary px-8 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary-foreground"
          >
            Enter Arena
          </button>
          <button
            onClick={() => void playWindowed()}
            className="rounded-md border border-border bg-card/70 px-8 py-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground transition hover:bg-secondary"
          >
            Play in window
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

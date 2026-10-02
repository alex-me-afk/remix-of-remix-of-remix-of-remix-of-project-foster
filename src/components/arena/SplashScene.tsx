/**
 * The animated backdrop behind the splash screens.
 *
 * Brook wanted two different things on two different screens, so this has two modes:
 *
 *   `mode="boot"` — the FIRST screen. Only two hero shots (the title key-art and the dropship
 *   skydive), a gentle up/down float so "u feel the pic is moving a little bit", and ~35 drifting
 *   embers like Free Fire's title screen — small sparks that rise and sway. Nothing aggressive.
 *
 *   `mode="loading"` — the deploy / loading screen. A slow crossfade montage through ALL the action
 *   shots, replacing the old blurred single still. This is where the extra art earns its keep.
 *
 * Everything is CSS (see `splash-*` in styles.css): no video, no canvas, nothing on the render loop.
 * The montage stacks every layer at once rather than swapping one `<img src>` — swapping src
 * mid-fade flashes the old frame while the new one decodes, so all layers mount decoded (they are
 * the same PNGs the boot bar preloaded) and only opacity animates.
 */
import { useMemo } from "react";

import combat from "@/assets/splash-frostline-combat.png";
import truck from "@/assets/splash-monster-truck.png";
import lobby from "@/assets/splash-arena-lobby.png";
import dropship from "@/assets/splash-dropship.png";
import keyArt from "@/assets/splash-key-art.jpg";

/** The two hero shots for the first screen: the title key-art and the dropship skydive. */
export const BOOT_FRAMES = [keyArt, dropship] as const;

/** The loading montage — every shot. The two boot heroes are reused here too, as Brook asked. */
export const LOADING_FRAMES = [combat, truck, dropship, lobby, keyArt] as const;

/** Every unique image the splash system touches, so the preloader can warm exactly this set. */
export const SPLASH_FRAMES = [combat, truck, dropship, lobby, keyArt] as const;

/** One full pass through the montage, seconds. Each frame owns an equal slice. */
const MONTAGE_SECONDS = 22;
/** How long the boot screen holds on one hero before crossfading to the other. */
const BOOT_FRAME_SECONDS = 9;
/** Free-Fire-style ember count. Enough to read as a field, few enough to stay subtle. */
const EMBER_COUNT = 35;

/** Deterministic pseudo-random in [0,1) from an integer seed — stable across renders, no state. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function SplashScene({
  mode = "boot",
  /** Dim + blur, for a splash that sits UNDER foreground UI (the deploy screen does this). */
  recede = false,
  className = "",
}: {
  mode?: "boot" | "loading";
  recede?: boolean;
  className?: string;
}) {
  const frames = mode === "boot" ? BOOT_FRAMES : LOADING_FRAMES;
  const cycle = mode === "boot" ? BOOT_FRAME_SECONDS * frames.length : MONTAGE_SECONDS;
  const each = cycle / frames.length;
  const dim = recede ? "opacity-60 blur-[2px]" : "";

  // Embers only on the boot screen, and only their layout is memoised — the animation itself is CSS.
  const embers = useMemo(() => {
    if (mode !== "boot") return [];
    return Array.from({ length: EMBER_COUNT }, (_, i) => {
      const left = rand(i) * 100; // vw start
      const size = 2 + rand(i + 100) * 4; // 2–6 px
      const dur = 7 + rand(i + 200) * 8; // 7–15 s rise
      const delay = -rand(i + 300) * dur; // negative so the field is already populated at mount
      const drift = (rand(i + 400) - 0.5) * 12; // ±6 vw lateral sway
      const opacity = 0.4 + rand(i + 500) * 0.5;
      return { left, size, dur, delay, drift, opacity };
    });
  }, [mode]);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* Image stack. Boot floats the whole stack together so its two heroes drift as one; loading
          gives each layer its own crossfade + Ken Burns clock. */}
      <div className={`absolute inset-0 ${mode === "boot" ? "splash-float" : ""}`}>
        {frames.map((src, i) => {
          const pan = i % 2 === 1 ? "splash-kenburns-alt" : "splash-kenburns";
          return (
            <img
              key={i}
              src={src}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover ${dim}`}
              style={
                frames.length > 1
                  ? {
                      // Same negative delay on the fade and the pan so a layer starts its move as it
                      // fades in. Boot only pans on the montage path, so it uses the fade alone.
                      animation:
                        mode === "loading"
                          ? `splash-crossfade ${cycle}s ease-in-out ${-(i * each)}s infinite, ${pan} ${cycle}s ease-out ${-(i * each)}s infinite`
                          : `splash-crossfade ${cycle}s ease-in-out ${-(i * each)}s infinite`,
                      willChange: "opacity, transform",
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      {/* Free-Fire embers — boot only. Each is a positioned glow driven by one CSS keyframe; the
          per-spark variance rides in on custom properties so all 35 share one animation definition. */}
      {embers.map((e, i) => (
        <span
          key={i}
          className="splash-ember"
          style={
            {
              left: `${e.left}vw`,
              width: `${e.size}px`,
              height: `${e.size}px`,
              "--ember-dur": `${e.dur}s`,
              "--ember-delay": `${e.delay}s`,
              "--ember-dx": `${e.drift}vw`,
              "--ember-o": e.opacity,
              "--ember-s": 1,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

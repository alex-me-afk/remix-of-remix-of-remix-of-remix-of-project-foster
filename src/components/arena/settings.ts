/**
 * Player-facing arena settings: look sensitivity, crosshair, HUD, audio,
 * video, gameplay assists, keybinds and a fully customisable touch HUD (each
 * control can be moved, resized or hidden). Everything persists to
 * localStorage so a loadout of preferences survives reloads.
 */

import type { BotDifficulty } from "./botAi";

export type Quality = "low" | "medium" | "high";

export type WallPlacement = "aim" | "instant";

export type HoldMode = "hold" | "toggle";

/**
 * Which camera the player actually plays on.
 *
 * "third" is the default because the game now has a real animated character and a first-person
 * view is the one view that never shows it. Aiming down sights drops to first person on either
 * setting — a scope drawn over a third-person shot is not a sight picture.
 */
export type CameraView = "third" | "first";

export type AimAssist = "off" | "light" | "standard" | "strong";

export type CrosshairStyle = "cross" | "dot" | "circle" | "none";

export type ControlId =
  | "stick"
  | "sprint"
  | "backpack"
  | "wall"
  | "medkits"
  | "bomb"
  | "scope"
  | "fire"
  | "reload"
  | "jump"
  | "crouch"
  | "prone"
  | "emote"
  | "ping";

export type ControlLayout = {
  /** pixel offset from the control's default anchor */
  dx: number;
  dy: number;
  /** 0.6 – 1.8 size multiplier */
  scale: number;
  hidden: boolean;
};

export type BindAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "jump"
  | "sprint"
  | "crouch"
  | "prone"
  | "reload"
  | "wall"
  | "bomb"
  | "heal"
  | "power"
  | "shop"
  | "ping"
  | "inhaler"
  | "grenade"
  | "eject"
  | "dance";

export const BIND_LABELS: Record<BindAction, string> = {
  forward: "Move forward",
  back: "Move back",
  left: "Strafe left",
  right: "Strafe right",
  jump: "Jump",
  sprint: "Sprint",
  crouch: "Crouch",
  prone: "Prone",
  reload: "Reload",
  wall: "Frost wall",
  bomb: "Throw bomb",
  heal: "Use medkit",
  power: "Character power",
  shop: "Open shop",
  ping: "Place ping",
  inhaler: "Use inhaler",
  grenade: "Cycle grenade",
  eject: "Eject from plane",
  dance: "Emote / dance",
};

export const BIND_ACTIONS = Object.keys(BIND_LABELS) as BindAction[];

export const defaultBinds = (): Record<BindAction, string> => ({
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  sprint: "ShiftLeft",
  crouch: "KeyC",
  prone: "KeyX",
  reload: "KeyR",
  wall: "KeyF",
  bomb: "KeyG",
  heal: "KeyQ",
  power: "KeyE",
  shop: "KeyB",
  ping: "KeyT",
  // Inhaler used to be hard-wired to F — the same key as the Frost wall — so one
  // press did both. It now has its own default (H) and its own Settings row.
  inhaler: "KeyH",
  // Grenade-cycle used to be hard-wired to G, colliding with "Throw bomb". Split
  // onto V so throwing and switching grenade type are separate keys.
  grenade: "KeyV",
  // Bail out of the dropship. Space matches the jump muscle-memory but only fires
  // during the skydive boarding phase, so it never clashes with jumping on foot.
  eject: "Space",
  // Emote wheel. E was the natural pick but it is Character power; Z is free, sits under
  // the movement hand, and matches the "quick emote" key several shooters use.
  dance: "KeyZ",
});

/** Human-readable label for a KeyboardEvent.code */
export function keyLabel(code: string) {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return `${code.slice(5)} arrow`;
  const map: Record<string, string> = {
    Space: "Space",
    ShiftLeft: "L Shift",
    ShiftRight: "R Shift",
    ControlLeft: "L Ctrl",
    ControlRight: "R Ctrl",
    AltLeft: "L Alt",
    AltRight: "R Alt",
    Backquote: "`",
    Tab: "Tab",
    CapsLock: "Caps",
    Enter: "Enter",
  };
  return map[code] ?? code;
}

export type ArenaSettings = {
  /* ---- aim ---- */
  /** mouse look, radians per pixel of movement */
  mouseSensitivity: number;
  /** touch drag look, radians per pixel */
  touchSensitivity: number;
  /** sensitivity multiplier while aiming down sights */
  adsMultiplier: number;
  invertY: boolean;
  /** vertical camera field of view in degrees */
  fov: number;
  aimAssist: AimAssist;
  adsMode: HoldMode;
  sprintMode: HoldMode;
  /** third-person by default; first person stays available here */
  cameraView: CameraView;

  /* ---- crosshair ---- */
  crosshairStyle: CrosshairStyle;
  crosshairColor: string;
  crosshairSize: number;
  crosshairThickness: number;
  crosshairOpacity: number;
  crosshairDynamic: boolean;
  centerDot: boolean;

  /* ---- audio ---- */
  masterVolume: number;
  sfxVolume: number;
  muted: boolean;
  hitSounds: boolean;

  /* ---- interface ---- */
  hudOpacity: number;
  hudScale: number;
  showTouchControls: boolean;
  showMinimap: boolean;
  showKillFeed: boolean;
  showDamageNumbers: boolean;
  showHitMarkers: boolean;
  showFps: boolean;
  damageFlash: boolean;
  screenShake: number;

  /* ---- video ---- */
  /** performance preset — defaults to low on phones/tablets */
  quality: Quality;
  shadows: boolean;
  /**
   * Fold static lighting into the level's vertex colours and draw the map
   * unlit. Much faster; map shadows become static.
   */
  bakedLight: boolean;
  /** internal render resolution multiplier */
  renderScale: number;
  /** particle / impact FX density */
  particles: number;

  /* ---- atmosphere (outdoor maps / day skybox) ---- */
  /** exposure of the painted day sky: 0.5 moody → 1.8 blown out */
  skyBrightness: number;
  /** distance-haze strength; 0 = no fog, 1 = default, 2 = thick */
  fogIntensity: number;
  /** cloud drift speed multiplier; 0 = frozen sky */
  cloudMotion: number;
  /**
   * Extra light folded into the level's baked vertex colours — mainly lifts
   * the ground. Applies on the next map load.
   */
  groundBrightness: number;

  /* ---- gameplay ---- */
  /** shorter matches for casual sessions */
  quickMatch: boolean;
  /** hold fire to shoot; when on, tapping the fire button keeps firing */
  autoFire: boolean;
  autoReload: boolean;
  /**
   * "aim" (default): tapping the frost wall shows a preview you place yourself.
   * "instant": the wall drops on the nearest surface in front of you.
   */
  wallPlacement: WallPlacement;
  /** enemy bot skill tier */
  botDifficulty: BotDifficulty;

  keybinds: Record<BindAction, string>;
  controls: Record<ControlId, ControlLayout>;
};

export const CONTROL_LABELS: Record<ControlId, string> = {
  stick: "Movement stick",
  sprint: "Sprint indicator",
  backpack: "Backpack",
  wall: "Shield wall",
  medkits: "Medkits",
  bomb: "Bomb",
  scope: "Aim / scope",
  fire: "Fire button",
  reload: "Reload button",
  jump: "Jump",
  crouch: "Crouch",
  prone: "Prone",
  emote: "Emote / dance",
  ping: "Ping",
};

export const QUALITY_LABELS: Record<Quality, string> = {
  low: "Low (performance)",
  medium: "Balanced",
  high: "High (quality)",
};

export const AIM_ASSIST_LABELS: Record<AimAssist, string> = {
  off: "Off",
  light: "Light",
  standard: "Standard",
  strong: "Strong",
};

export const AIM_ASSIST_STRENGTH: Record<AimAssist, number> = {
  off: 0,
  light: 0.6,
  standard: 1,
  strong: 1.5,
};

export const CROSSHAIR_COLORS = [
  "#ffffff",
  "#00e5ff",
  "#7cff4f",
  "#ffd23f",
  "#ff4d6d",
  "#c77dff",
];

export const CONTROL_IDS = Object.keys(CONTROL_LABELS) as ControlId[];

const baseControl = (): ControlLayout => ({ dx: 0, dy: 0, scale: 1, hidden: false });

function isMobileLike() {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function defaultSettings(): ArenaSettings {
  const controls = {} as Record<ControlId, ControlLayout>;
  for (const id of CONTROL_IDS) controls[id] = baseControl();
  const mobile = isMobileLike();
  return {
    mouseSensitivity: 0.0022,
    touchSensitivity: 0.006,
    adsMultiplier: 0.6,
    invertY: false,
    fov: 70,
    aimAssist: "standard",
    adsMode: "hold",
    sprintMode: "hold",
    cameraView: "third",

    crosshairStyle: "cross",
    crosshairColor: "#ffffff",
    crosshairSize: 1,
    crosshairThickness: 2,
    crosshairOpacity: 0.9,
    crosshairDynamic: true,
    centerDot: true,

    masterVolume: 0.5,
    sfxVolume: 1,
    muted: false,
    hitSounds: true,

    hudOpacity: 1,
    hudScale: 1,
    showTouchControls: true,
    showMinimap: true,
    showKillFeed: true,
    showDamageNumbers: true,
    showHitMarkers: true,
    showFps: false,
    damageFlash: true,
    screenShake: 1,

    quality: mobile ? "low" : "medium",
    shadows: !mobile,
    bakedLight: true,
    renderScale: 1,
    particles: 1,

    skyBrightness: 1.12,
    fogIntensity: 0.85,
    cloudMotion: 1,
    groundBrightness: 1.25,

    quickMatch: false,
    autoFire: false,
    autoReload: true,
    wallPlacement: "aim",
    botDifficulty: "regular",

    keybinds: defaultBinds(),
    controls,
  };
}

const KEY = "lonewolf.settings.v1";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, fallback: number, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const pick = <T extends string>(v: unknown, opts: readonly T[], fallback: T) =>
  typeof v === "string" && (opts as readonly string[]).includes(v) ? (v as T) : fallback;

export function loadSettings(): ArenaSettings {
  const base = defaultSettings();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ArenaSettings>;
    const merged: ArenaSettings = {
      ...base,
      ...saved,
      controls: { ...base.controls },
      keybinds: { ...base.keybinds },
    };
    for (const id of CONTROL_IDS) {
      const c = saved.controls?.[id];
      if (!c) continue;
      merged.controls[id] = {
        dx: num(c.dx, 0, -1200, 1200),
        dy: num(c.dy, 0, -1200, 1200),
        scale: num(c.scale, 1, 0.6, 1.8),
        hidden: !!c.hidden,
      };
    }
    for (const a of BIND_ACTIONS) {
      const code = saved.keybinds?.[a];
      if (typeof code === "string" && code) merged.keybinds[a] = code;
    }

    merged.mouseSensitivity = num(merged.mouseSensitivity, base.mouseSensitivity, 0.0004, 0.008);
    merged.touchSensitivity = num(merged.touchSensitivity, base.touchSensitivity, 0.0015, 0.02);
    merged.adsMultiplier = num(merged.adsMultiplier, base.adsMultiplier, 0.2, 1.2);
    merged.invertY = bool(merged.invertY, false);
    merged.fov = num(merged.fov, 70, 55, 110);
    merged.aimAssist = pick(merged.aimAssist, ["off", "light", "standard", "strong"] as const, "standard");
    merged.adsMode = pick(merged.adsMode, ["hold", "toggle"] as const, "hold");
    merged.sprintMode = pick(merged.sprintMode, ["hold", "toggle"] as const, "hold");
    merged.cameraView = pick(merged.cameraView, ["third", "first"] as const, "third");

    merged.crosshairStyle = pick(merged.crosshairStyle, ["cross", "dot", "circle", "none"] as const, "cross");
    merged.crosshairColor = typeof merged.crosshairColor === "string" ? merged.crosshairColor : "#ffffff";
    merged.crosshairSize = num(merged.crosshairSize, 1, 0.5, 2);
    merged.crosshairThickness = num(merged.crosshairThickness, 2, 1, 6);
    merged.crosshairOpacity = num(merged.crosshairOpacity, 0.9, 0.2, 1);
    merged.crosshairDynamic = bool(merged.crosshairDynamic, true);
    merged.centerDot = bool(merged.centerDot, true);

    merged.masterVolume = num(merged.masterVolume, 0.5, 0, 1);
    merged.sfxVolume = num(merged.sfxVolume, 1, 0, 1);
    merged.muted = bool(merged.muted, false);
    merged.hitSounds = bool(merged.hitSounds, true);

    merged.hudOpacity = num(merged.hudOpacity, 1, 0.3, 1);
    merged.hudScale = num(merged.hudScale, 1, 0.7, 1.3);
    merged.showTouchControls = bool(merged.showTouchControls, true);
    merged.showMinimap = bool(merged.showMinimap, true);
    merged.showKillFeed = bool(merged.showKillFeed, true);
    merged.showDamageNumbers = bool(merged.showDamageNumbers, true);
    merged.showHitMarkers = bool(merged.showHitMarkers, true);
    merged.showFps = bool(merged.showFps, false);
    merged.damageFlash = bool(merged.damageFlash, true);
    merged.screenShake = num(merged.screenShake, 1, 0, 1.5);

    merged.quality = pick(merged.quality, ["low", "medium", "high"] as const, base.quality);
    merged.shadows = bool(merged.shadows, base.shadows);
    merged.bakedLight = bool(merged.bakedLight, base.bakedLight);
    merged.renderScale = num(merged.renderScale, 1, 0.5, 1);
    merged.particles = num(merged.particles, 1, 0, 1.5);
    merged.skyBrightness = num(merged.skyBrightness, base.skyBrightness, 0.5, 1.8);
    merged.fogIntensity = num(merged.fogIntensity, base.fogIntensity, 0, 2);
    merged.cloudMotion = num(merged.cloudMotion, base.cloudMotion, 0, 3);
    merged.groundBrightness = num(merged.groundBrightness, base.groundBrightness, 0.6, 1.8);

    merged.quickMatch = bool(merged.quickMatch, false);
    merged.autoFire = bool(merged.autoFire, false);
    merged.autoReload = bool(merged.autoReload, true);
    merged.wallPlacement = merged.wallPlacement === "instant" ? "instant" : "aim";
    merged.botDifficulty = pick(
      merged.botDifficulty,
      ["recruit", "regular", "veteran", "nightmare"] as const,
      "regular",
    );
    return merged;
  } catch {
    return base;
  }
}

export function saveSettings(s: ArenaSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage can be unavailable (private mode) — settings just won't persist */
  }
}

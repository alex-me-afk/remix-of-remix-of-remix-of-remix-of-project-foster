/**
 * Keyboard-layout aware key labels.
 *
 * KeyboardEvent.code is physical, so bindings already sit in the right place on
 * AZERTY/QWERTZ/Dvorak — but the *printed* character differs. CrazyGames asks
 * that controls adapt to the player's layout, so we resolve every label through
 * the Keyboard Map API when the browser exposes it and fall back to the QWERTY
 * label otherwise.
 */
import { keyLabel as qwertyLabel } from "./settings";

let layout: Map<string, string> | null = null;
const listeners = new Set<() => void>();

type NavigatorWithKeyboard = Navigator & {
  keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
};

/** Fetches the browser's layout map once; safe to call repeatedly. */
export async function initKeyboardLayout() {
  if (typeof navigator === "undefined" || layout) return;
  const kb = (navigator as NavigatorWithKeyboard).keyboard;
  if (!kb?.getLayoutMap) return;
  try {
    layout = await kb.getLayoutMap();
    listeners.forEach((l) => l());
  } catch {
    /* unsupported or blocked — QWERTY labels stay in place */
  }
}

/** Subscribe to the moment the layout resolves so labels can re-render. */
export function onKeyboardLayout(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Printed character for a physical key code, upper-cased for HUD use. */
export function layoutKeyLabel(code: string) {
  if (!code) return "—";
  const printed = layout?.get(code);
  if (printed && printed.length <= 3) return printed.toUpperCase();
  return qwertyLabel(code);
}

/** True when the physical WASD block does not print W/A/S/D (AZERTY, QWERTZ…). */
export function isNonQwertyLayout() {
  if (!layout) return false;
  return layout.get("KeyW")?.toLowerCase() !== "w" || layout.get("KeyA")?.toLowerCase() !== "a";
}

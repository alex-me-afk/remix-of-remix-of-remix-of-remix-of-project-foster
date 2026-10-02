/**
 * Throwing a grenade: the arc you see before you let go, and the moment you do.
 *
 * Brook: "Bomb/grenade throwing + trajectory preview — already fairly self-contained (bombOrigin,
 * updateBombPreview, releaseBomb)". It was, and this is that code moved out whole. What it is NOT is
 * the grenade itself — the flight, the fuse, the blast and the damage all still live in `bomb.ts`.
 * This is only the player's end of it: two flags, a line, a ring on the ground, and the rule that a
 * bomb leaves from the eye rather than from the hand.
 *
 * THE FLAGS ARE THE REASON THIS IS A MODULE. `bombArmed` and `bombAiming` used to be two `let`s in
 * an 8k-line effect, read by four input handlers and the frame loop. Worse, the component above also
 * has a `bombArmed` React state for the HUD, so the effect's local was shadowing it — and any read
 * left behind after the move would have silently resolved to the frozen state variable instead of a
 * type error. They are now private, reachable only through `armed()`, which is checkable.
 *
 * Everything the throw needs about the player is a getter, because all of it changes every frame:
 * where they are looking, whether their feet are down, whether they are still alive.
 */

import * as THREE from "three";

import { predictBombPath, THROW_SPEED, THROW_SPEED_JUMP, type GrenadeKind } from "./bomb";
import type { Fighter } from "./fighter";
import { playSfx } from "./sfx";
import { EYE_HEIGHT } from "./walkPhysics";

/** How many points the arc line is drawn with. Fixed, so the buffer is allocated once. */
const ARC_POINTS = 151;

export type BombThrower = {
  /** Is a bomb in hand right now? The HUD mirrors this and the fire button branches on it. */
  armed: () => boolean;
  /** Bomb button: take one out, or put it away. Returns the new state for the HUD. */
  arm: () => boolean;
  /** Trigger down while armed — start showing the arc. */
  beginAim: () => void;
  /** Per frame, from the animate loop. Cheap and self-cancelling when nothing is being aimed. */
  updatePreview: () => void;
  /** Trigger up while aiming — let it go. */
  release: () => void;
  dispose: () => void;
};

export function createBombThrower(deps: {
  scene: THREE.Scene;
  /** The player's fighter, or null before they spawn. */
  human: () => Fighter | null;
  /** FEET position, mutated in place by the walk physics — held, not copied. */
  walkPos: THREE.Vector3;
  yaw: () => number;
  pitch: () => number;
  grounded: () => boolean;
  /** False in orbit/spectate, where there is nobody to throw from. */
  walking: () => boolean;
  groundAt: (x: number, z: number, fromY: number, maxRise?: number) => number | null;
  /** `bomb.ts`'s live system — this module only ever asks it to launch one. */
  throwBomb: (from: THREE.Vector3, dir: THREE.Vector3, speed: number, kind: GrenadeKind) => void;
  /** Which grenade is selected, read at release so a mid-aim switch is honoured. */
  grenadeKind: () => GrenadeKind;
  /** Spend the grenade from the pack — the caller owns the count, not this module. */
  onThrown: () => void;
}): BombThrower {
  const {
    scene,
    human,
    walkPos,
    yaw,
    pitch,
    grounded,
    walking,
    groundAt,
    throwBomb,
    grenadeKind,
    onThrown,
  } = deps;

  /* ---- landing preview while a bomb is held ---- */
  let bombArmed = false;
  let bombAiming = false;
  const arcPoints: THREE.Vector3[] = [];
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
  const arcLine = new THREE.Line(
    arcGeo,
    new THREE.LineBasicMaterial({
      color: 0xffb45c,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  arcLine.frustumCulled = false;
  arcLine.renderOrder = 999;
  arcLine.visible = false;
  scene.add(arcLine);
  const landMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.62, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffb45c,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  landMarker.rotation.x = -Math.PI / 2;
  landMarker.renderOrder = 999;
  landMarker.visible = false;
  scene.add(landMarker);

  const bombOrigin = () => {
    const dir = new THREE.Vector3(
      -Math.sin(yaw()) * Math.cos(pitch()),
      Math.sin(-pitch()),
      -Math.cos(yaw()) * Math.cos(pitch()),
    ).normalize();
    const from = walkPos
      .clone()
      .setY(walkPos.y + EYE_HEIGHT - 0.15)
      .addScaledVector(dir, 0.7);
    return { dir, from, speed: grounded() ? THROW_SPEED : THROW_SPEED_JUMP };
  };

  const updateBombPreview = () => {
    if (!bombAiming || !human()?.alive) {
      arcLine.visible = false;
      landMarker.visible = false;
      return;
    }
    const { dir, from, speed } = bombOrigin();
    const { points, landing } = predictBombPath(
      from,
      dir,
      speed,
      (x: number, z: number, fy: number, mr?: number) => groundAt(x, z, fy, mr ?? 4),
      arcPoints,
    );
    const attr = arcGeo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const n = Math.min(points.length, ARC_POINTS);
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    for (let i = n; i < ARC_POINTS; i++) {
      const p = points[n - 1]!;
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    attr.needsUpdate = true;
    arcGeo.setDrawRange(0, ARC_POINTS);
    arcGeo.computeBoundingSphere();
    arcLine.visible = true;
    if (landing) {
      landMarker.position.copy(landing).setY(landing.y + 0.06);
      landMarker.visible = true;
    } else {
      landMarker.visible = false;
    }
  };

  /** bomb button: take a bomb in hand (or put it away) */
  const armBomb = () => {
    if (!human()?.alive || !walking()) return false;
    bombArmed = !bombArmed;
    if (!bombArmed) {
      bombAiming = false;
      arcLine.visible = false;
      landMarker.visible = false;
    } else {
      playSfx("equip", 0.6, 0.3);
    }
    return bombArmed;
  };

  /** release the fire button while holding a bomb -> throw it */
  const releaseBomb = () => {
    if (!bombArmed || !bombAiming) return;
    bombAiming = false;
    bombArmed = false;
    arcLine.visible = false;
    landMarker.visible = false;
    const { dir, from, speed } = bombOrigin();
    throwBomb(from, dir, speed, grenadeKind());
    playSfx("equip", 0.7, 0.5);
    onThrown();
  };

  return {
    armed: () => bombArmed,
    arm: armBomb,
    beginAim: () => {
      bombAiming = true;
    },
    updatePreview: updateBombPreview,
    release: releaseBomb,
    dispose: () => {
      arcLine.removeFromParent();
      landMarker.removeFromParent();
      arcGeo.dispose();
      arcLine.material.dispose();
      landMarker.geometry.dispose();
      landMarker.material.dispose();
    },
  };
}

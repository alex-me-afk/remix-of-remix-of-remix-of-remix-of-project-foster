import * as THREE from "three";

import type { ZonePhaseRule } from "./modes";

/**
 * Free-Fire / Garena-style phased storm.
 *
 * The ring does NOT drift smoothly from the first second. It sits still for an
 * opening grace period (so nobody is punished for their spawn), then plays a
 * sequence of phases: HOLD in place for a while, SHRINK to the next smaller
 * radius over a few seconds, HOLD again, SHRINK again — stepping inward until
 * the final radius. Damage is horizontal-only (x/z); height is cosmetic.
 *
 * The SCHEDULE is not computed here — it is authored per mode in `modes.ts` and handed in, because
 * hold and shrink times differ per phase in Free Fire and so does the damage. This file's job is
 * only to turn that schedule plus a pair of radii into a timeline, and to read the timeline back on
 * demand. It used to derive its own uniform schedule from a phase count, which meant storm pacing
 * was decided by multipliers in the arena's frame loop rather than by the mode. See
 * `ZonePhaseRule`'s doc comment for what that cost.
 */

export type ZonePhase = {
  /** seconds from zone start when this phase's shrink BEGINS */
  shrinkStart: number;
  /** seconds from zone start when this phase's shrink ENDS */
  shrinkEnd: number;
  /** radius held before the shrink */
  fromRadius: number;
  /** radius reached at shrinkEnd */
  toRadius: number;
  /** damage/second to anyone outside the ring while this phase is the live one */
  dps: number;
};

export type SafeZone = {
  center: THREE.Vector3;
  currentRadius: number;
  phases: ZonePhase[];
  /** performance.now()/1000 captured when the zone was (re)built */
  startTime: number;
  /** Written by `updateSafeZone` from the live phase — not a constant, do not set it by hand. */
  damagePerSecond: number;
  active: boolean;
};

/**
 * Build a zone timeline from a mode's phase schedule.
 *
 * Each step contributes `delay` seconds of hold followed by `shrink` seconds of movement, so the
 * schedule's own numbers decide the pacing end to end. Radii step GEOMETRICALLY from `startRadius`
 * down to `finalRadius` — big early bites, tightening as it closes, which reads like a real storm
 * where equal steps read like a machine.
 */
export function createSafeZone(
  center: THREE.Vector3,
  startRadius: number,
  finalRadius: number,
  schedule: readonly ZonePhaseRule[],
): SafeZone {
  const phases: ZonePhase[] = [];
  const steps = Math.max(1, schedule.length);
  const ratio = startRadius > 0 ? Math.pow(finalRadius / startRadius, 1 / steps) : 1;
  let cursor = 0;
  let fromR = startRadius;
  for (let i = 0; i < schedule.length; i++) {
    const step = schedule[i]!;
    const toR = i === schedule.length - 1 ? finalRadius : fromR * ratio;
    const shrinkStart = cursor + step.delay;
    const shrinkEnd = shrinkStart + step.shrink;
    phases.push({ shrinkStart, shrinkEnd, fromRadius: fromR, toRadius: toR, dps: step.dps });
    cursor = shrinkEnd;
    fromR = toR;
  }
  return {
    center: center.clone(),
    currentRadius: startRadius,
    phases,
    startTime: performance.now() / 1000,
    damagePerSecond: phases[0]?.dps ?? 0,
    active: true,
  };
}

/**
 * Advance the ring. Sets BOTH the live radius and the live damage rate, because in a phased storm
 * they are two readings of the same clock — splitting them was what let a damage ramp in the frame
 * loop disagree with the phase table.
 */
export function updateSafeZone(zone: SafeZone, now: number, _dt: number) {
  if (!zone.active || zone.phases.length === 0) return;
  const t = now - zone.startTime;
  // Before the first shrink → hold at the opening radius.
  const first = zone.phases[0]!;
  if (t <= first.shrinkStart) {
    zone.currentRadius = first.fromRadius;
    zone.damagePerSecond = first.dps;
    return;
  }
  // After the last shrink → hold at the final radius, at the final phase's rate.
  const last = zone.phases[zone.phases.length - 1]!;
  if (t >= last.shrinkEnd) {
    zone.currentRadius = last.toRadius;
    zone.damagePerSecond = last.dps;
    return;
  }
  // Find the active phase: either mid-shrink or holding between two shrinks.
  for (let i = 0; i < zone.phases.length; i++) {
    const p = zone.phases[i]!;
    if (t < p.shrinkStart) {
      // Holding between the previous shrink and this one. The damage is already this phase's — the
      // storm announces itself during the hold, which is what makes the hold tense.
      zone.currentRadius = p.fromRadius;
      zone.damagePerSecond = p.dps;
      return;
    }
    if (t <= p.shrinkEnd) {
      const k = (t - p.shrinkStart) / Math.max(0.001, p.shrinkEnd - p.shrinkStart);
      zone.currentRadius = p.fromRadius + (p.toRadius - p.fromRadius) * k;
      zone.damagePerSecond = p.dps;
      return;
    }
  }
}

export function damageOutsideZone(zone: SafeZone, pos: THREE.Vector3, dt: number) {
  if (!zone.active) return 0;
  const dx = pos.x - zone.center.x;
  const dz = pos.z - zone.center.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist <= zone.currentRadius) return 0;
  return zone.damagePerSecond * dt;
}

/**
 * The storm boundary is a WALL, not a floor disc — a vertical curtain that
 * converges as the radius shrinks, with no top or bottom cap. Open-ended
 * cylinder at unit radius; the caller scales x/z by the live radius each frame.
 */
export function createSafeZoneVisual(_radius: number, color = 0x4ade80) {
  const WALL_HEIGHT = 80;
  const geometry = new THREE.CylinderGeometry(1, 1, WALL_HEIGHT, 96, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = WALL_HEIGHT / 2;
  return { mesh, material };
}

/**
 * A fighter's own axes, read off the skeleton instead of assumed.
 *
 * Anything bolted to a bone — the worn backpack, a holstered gun — has to be posed in that BONE's
 * local space, and "Spine2's local +Z is forward" is a convention no exporter promises. What a
 * humanoid rig does promise is its bone TOPOLOGY: a spine carries a neck and two shoulders, hips
 * carry a spine and two thighs. Those children's local `position` values already describe the
 * parent's frame, so the frame can be derived rather than guessed, and the derivation holds on any
 * rig with those bone names whichever way its axes happen to point.
 *
 * POSITIONS, NOT ROTATIONS, ON PURPOSE. A bone's local translation is fixed by the skeleton and no
 * clip in the library touches it (only `Hips` is animated in translation, and nothing here reads
 * it), so these frames come out identical whether they are computed at attach time or mid-stride.
 * A bone's local QUATERNION is animated every frame, which is why nothing below reads one — a
 * frame built from rotations would silently bake in whatever pose the fighter happened to be in.
 *
 * No world matrices either, so none of this depends on the rig having been added to a scene or on
 * `updateMatrixWorld` having run this frame.
 *
 * Extracted from `wornPack.ts`, which derived the torso frame first and is still the reference
 * implementation of a prop hung on a bone; `holster.ts` needs the same trick one bone lower.
 */

import * as THREE from "three";

import type { OperativeRig } from "./operativeModel";

/** An orthonormal right-handed frame in some bone's local space. */
export type BodyBasis = {
  /** Towards the fighter's right hand. */
  right: THREE.Vector3;
  /** Along the bone chain towards the crown of the head. */
  up: THREE.Vector3;
  /** Straight out of the fighter's back. */
  back: THREE.Vector3;
};

/** Spine bones in preference order, so a rig missing `Spine2` still gets its props. */
export const SPINE_BONES = ["Spine2", "Spine1", "Spine"];

/** The highest spine bone this rig actually has, or undefined on an unrecognisable skeleton. */
export function spineBone(rig: OperativeRig): THREE.Object3D | undefined {
  return SPINE_BONES.map((n) => rig.bone(n)).find((b): b is THREE.Object3D => Boolean(b));
}

/**
 * Build a frame from three sibling bone offsets: one pointing up the chain and a left/right pair.
 *
 * Returns null rather than a degenerate frame — better no prop than one lying at ninety degrees
 * through the chest.
 */
function basisFrom(
  upOffset: THREE.Vector3,
  leftOffset: THREE.Vector3,
  rightOffset: THREE.Vector3,
): BodyBasis | null {
  const up = upOffset.clone();
  const right = rightOffset.clone().sub(leftOffset);
  if (up.lengthSq() < 1e-12 || right.lengthSq() < 1e-12) return null;
  up.normalize();
  // The left/right pair is rarely exactly perpendicular to the chain; project it onto the plane
  // across `up` so the frame is orthonormal and nothing hung in it shears.
  right.addScaledVector(up, -right.dot(up));
  if (right.lengthSq() < 1e-12) return null;
  right.normalize();
  // right x up is the direction out of the wearer's back: with +X right and +Y up on a body facing
  // -Z (three.js's forward), that cross product is +Z, which is behind them.
  const back = right.clone().cross(up).normalize();
  return { right, up, back };
}

/**
 * The torso's axes, in the spine bone's local space. `Neck`, `LeftShoulder` and `RightShoulder` are
 * all children of the spine, so their offsets are exactly the three vectors needed.
 */
export function torsoBasis(rig: OperativeRig): BodyBasis | null {
  const neck = rig.bone("Neck");
  const left = rig.bone("LeftShoulder");
  const right = rig.bone("RightShoulder");
  if (!neck || !left || !right) return null;
  return basisFrom(neck.position, left.position, right.position);
}

/**
 * The pelvis's axes, in `Hips`' local space, from its three children: `Spine` is up, and the two
 * `UpLeg` bones straddle the centreline the way the shoulders do higher up.
 */
export function hipBasis(rig: OperativeRig): BodyBasis | null {
  const spine = rig.bone("Spine");
  const left = rig.bone("LeftUpLeg");
  const right = rig.bone("RightUpLeg");
  if (!spine || !left || !right) return null;
  return basisFrom(spine.position, left.position, right.position);
}

/**
 * How many of a bone's local units make one metre of character.
 *
 * Accumulated from the bone up to the rig root rather than assumed, so this returns 100 for the
 * Mixamo bodies (0.01 bone scale, centimetres) and the right number for anything else. A zero or
 * absurd result means the chain had a degenerate scale; callers treat that as "no prop" rather
 * than dividing by it.
 */
export function boneUnitsPerMetre(bone: THREE.Object3D, stopAt: THREE.Object3D): number {
  let accumulated = 1;
  let node: THREE.Object3D | null = bone;
  while (node && node !== stopAt) {
    accumulated *= node.scale.x;
    node = node.parent;
  }
  return accumulated > 1e-9 ? 1 / accumulated : 0;
}

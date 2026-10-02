/**
 * In-match pet companion.
 *
 * The equipped pet trots after the player, keeps a small offset to their rear
 * left, plays random flavour acts while idle, and can be re-called with the
 * HUD "Call pet" button (snaps back to the owner and barks/acts).
 */

import * as THREE from "three";

import { createPetRig, makeActTimer, type PetRig } from "./petModel";
import type { Pet } from "./pets";

export type PetCompanion = {
  pet: Pet;
  root: THREE.Group;
  /** advance the follow behaviour; ownerPos is a FEET position */
  update: (dt: number, ownerPos: THREE.Vector3, ownerYaw: number) => void;
  /** teleport next to the owner and play a flavour act */
  call: (ownerPos: THREE.Vector3, ownerYaw: number) => void;
  dispose: () => void;
};

const FOLLOW_DIST = 2.0;
const CATCHUP_DIST = 14;

export async function createPetCompanion(
  pet: Pet,
  parent: THREE.Object3D,
  spawn: THREE.Vector3,
  renderer?: THREE.WebGLRenderer,
): Promise<PetCompanion> {
  const rig = await createPetRig(pet, renderer);
  const root = new THREE.Group();
  root.add(rig.root);
  root.position.copy(spawn);
  parent.add(root);

  const desired = new THREE.Vector3();
  const flat = new THREE.Vector3();
  const actTimer = makeActTimer(7, 15);
  let speed = 0;

  const anchor = (ownerPos: THREE.Vector3, ownerYaw: number, out: THREE.Vector3) => {
    // behind and slightly to the left of the owner
    const fx = Math.sin(ownerYaw);
    const fz = Math.cos(ownerYaw);
    out.set(ownerPos.x - fx * FOLLOW_DIST - fz * 0.7, ownerPos.y, ownerPos.z - fz * FOLLOW_DIST + fx * 0.7);
  };

  return {
    pet,
    root,
    update: (dt, ownerPos, ownerYaw) => {
      anchor(ownerPos, ownerYaw, desired);
      flat.copy(desired).sub(root.position);
      flat.y = 0;
      const dist = flat.length();

      if (dist > CATCHUP_DIST) {
        // lost the owner (respawn / teleport) — snap in
        root.position.copy(desired);
        speed = 0;
      } else if (dist > 0.35) {
        const target = THREE.MathUtils.clamp(dist * 2.4, 1.2, 7.5);
        speed += (target - speed) * Math.min(1, dt * 6);
        flat.normalize();
        root.position.addScaledVector(flat, speed * dt);
        const face = Math.atan2(flat.x, flat.z);
        root.rotation.y = dampAngle(root.rotation.y, face, dt, 9);
      } else {
        speed += (0 - speed) * Math.min(1, dt * 8);
        // idle: turn to look roughly the same way as the owner
        root.rotation.y = dampAngle(root.rotation.y, ownerYaw, dt, 3);
        if (actTimer(dt)) rig.act();
      }

      root.position.y = ownerPos.y;
      rig.setSpeed(speed);
      rig.update(dt);
    },
    call: (ownerPos, ownerYaw) => {
      anchor(ownerPos, ownerYaw, desired);
      root.position.copy(desired);
      root.rotation.y = ownerYaw + Math.PI;
      speed = 0;
      rig.act();
    },
    dispose: () => {
      rig.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}

function dampAngle(from: number, to: number, dt: number, rate: number) {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * Math.min(1, dt * rate);
}

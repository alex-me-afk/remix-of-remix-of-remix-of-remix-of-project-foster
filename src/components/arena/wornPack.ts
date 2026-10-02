/**
 * The backpack every fighter wears, bolted to the spine.
 *
 * Cosmetic only — capacity lives in `backpack.ts`, which is the inventory economy and shares
 * nothing with this file but a name. This is one rigid prop parented to a bone, so it inherits
 * every clip for free: it swings with the run, twists with the reload, hits the dirt with the
 * death crumple. Nothing here ticks per frame.
 *
 * TWO THINGS HAVE TO BE RIGHT, AND NEITHER IS A GUESS.
 *
 * 1. SCALE. The rig's bones carry a uniform world scale of 0.01 (Mixamo authors in centimetres),
 *    so a child of a bone needs local scale 100 to render at its authored size — the same trap
 *    `weaponModel.ts` documents for the hand socket. That 100 is NOT hardcoded here: it is
 *    measured from the bone's own accumulated scale at attach time (`boneUnitsPerMetre`), so a
 *    body exported at a different unit scale wears a correctly-sized pack instead of a doll's one.
 *
 * 2. WHICH WAY ROUND. The pack is authored +Y up (its longest axis, span 2.0) with X as the
 *    left-right axis and Z front-to-back. Measured with tools/glb-orient.mjs, not eyeballed:
 *    X scores 0.83 on mirror symmetry against Z's 0.34, which is what makes X the width axis, and
 *    the Z profile ends in a WALL at -Z (cross-section jumps straight from nothing to 0.85 of full
 *    width) while tapering smoothly over three slabs to +Z. A flat wall is the panel that rests
 *    against a spine; the taper is the rounded front. So the pack's -Z faces the wearer.
 *
 * The bone's axes are then read off the SKELETON rather than assumed, because "Spine2's local +Z
 * is forward" is a convention no exporter promises. Both derivations — the torso frame and the
 * metres-per-bone-unit measurement — now live in `rigFrame.ts`, because a holstered gun needs the
 * same two answers as a worn pack.
 */

import * as THREE from "three";

import { boneUnitsPerMetre, spineBone, torsoBasis } from "./rigFrame";
import { loadWeaponModel } from "./weaponModel";
import type { OperativeRig } from "./operativeModel";

export const WORN_PACK_URL = "/models/backpack.glb";

/**
 * Everything adjustable, in one block, in metres and radians of the CHARACTER's own space — not
 * bone units, and not the pack's authored units. If the pack sits too high or clips the shoulder
 * blades, these five numbers are the fix and nothing below them needs touching.
 */
const PACK = {
  /** Top-to-bottom height. A 30-litre daypack is about half a metre on a 1.8 m body. */
  height: 0.5,
  /** Clearance behind the spine. Roughly half the pack's own depth, so the panel just touches. */
  back: 0.1,
  /** Along the spine from Spine2's origin, which sits high on the sternum. Negative = lower. */
  rise: -0.06,
  /** Sideways. Zero keeps it centred; a value here hangs it off one shoulder. */
  side: 0,
  /** Tilt about the shoulder axis. Positive leans the top of the pack away from the neck. */
  lean: 0.07,
};

/**
 * Hang the pack on a fighter's spine. Fire-and-forget: the GLB lands a frame or two later and the
 * fighter is complete without it, exactly as the weapon socket works. Returns a disposer.
 */
export function attachWornPack(rig: OperativeRig, renderer?: THREE.WebGLRenderer): () => void {
  let cancelled = false;
  let attached: THREE.Object3D | null = null;

  const spine = spineBone(rig);
  const basis = torsoBasis(rig);
  const perMetre = spine ? boneUnitsPerMetre(spine, rig.root) : 0;
  if (!spine || !basis || perMetre <= 0) {
    return () => {
      /* nothing was attached */
    };
  }

  loadWeaponModel(WORN_PACK_URL, renderer)
    .then(({ scene }) => {
      if (cancelled) return;
      const model = scene.clone(true); // shares geometry + materials with the cache
      // Normalise the content to a 1-unit-tall pack centred on its own origin, so PACK.height is
      // read in metres and the offsets below act on a predictable centre.
      const inner = new THREE.Group();
      inner.add(model);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const k = size.y > 1e-6 ? 1 / size.y : 1;
      model.scale.multiplyScalar(k);
      model.position.sub(centre.multiplyScalar(k));

      // Pose the pack in the torso's frame: the authored -Z (its flat back panel) points at the
      // wearer, so the pack's +Z maps onto `back`.
      const holder = new THREE.Group();
      holder.add(inner);
      const m = new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.back);
      holder.quaternion.setFromRotationMatrix(m);
      holder.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), PACK.lean),
      );
      inner.scale.setScalar(PACK.height * perMetre);
      holder.position
        .copy(basis.back)
        .multiplyScalar(PACK.back * perMetre)
        .addScaledVector(basis.up, PACK.rise * perMetre)
        .addScaledVector(basis.right, PACK.side * perMetre);

      holder.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Same call as the guns: the arena's lighting is baked and grounding is a blob sprite, so
        // thirty packs in a shadow pass would cost frames and change nothing on screen.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });

      spine.add(holder);
      attached = holder;
    })
    .catch((err) => {
      // Loud, because an absent pack is invisible and the cause is always the same one thing.
      console.error("[wornPack] backpack failed to load", WORN_PACK_URL, err);
    });

  return () => {
    cancelled = true;
    attached?.removeFromParent();
    attached = null;
  };
}

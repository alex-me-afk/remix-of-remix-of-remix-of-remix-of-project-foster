/**
 * The guns a fighter is carrying but not holding — heavies across the back, sidearm on the right hip.
 *
 * Brook: "now we needs to put the unsed weapens thats the player have in his back insted of showing
 * from the nwhere and the gun in his right leg". That is the whole point: before this, swapping to
 * your second rifle made it appear in your hands out of nothing and the first one vanish. Now the
 * pair is on the body the entire round and a swap is two props trading places.
 *
 * Same shape as `wornPack.ts` — rigid props parented to bones, so they inherit every clip for free
 * and cost nothing per frame — with one thing the pack does not need: the set CHANGES. Each of the
 * three slots therefore carries a token, so a slow GLB that lands after the player has already
 * swapped again is dropped instead of stacking a second rifle on the same shoulder.
 *
 * ORIENTATION IS SOLVED, NOT AUTHORED. There is no second set of hand-tuned per-weapon transforms
 * here, because nineteen guns times three slots is not a thing anyone should tune by hand. Instead
 * both sides of the problem are read from what is already known:
 *
 *   - The MODEL's axes come from `prop.muzzle`, which every roster entry already carries as the
 *     muzzle tip in model space. Normalised, it IS the barrel direction; the roster is authored +Y
 *     up (the sight rail), which gives a second axis and therefore a full frame.
 *   - The BODY's axes come from the skeleton (`rigFrame.ts`), never from a bone's animated rotation.
 *
 * The prop's rotation is then the one rotation carrying the first frame onto the second. A gun added
 * to `WEAPON_PROPS` tomorrow gets holstered correctly with no work here; a gun that is not in that
 * table at all has no model to hang and is silently skipped, exactly as in the hand.
 *
 * The sidearm hangs off `Hips`, not `RightUpLeg`. A thigh has a single child, so it offers no second
 * axis to build a frame from, and deriving one from the leg's own quaternion would bake in whatever
 * pose the fighter happened to be in when the prop attached. `Hips` has three children and reads as
 * "on his right leg" all the same; if a real drop-leg mount is wanted later it is one line.
 */

import * as THREE from "three";

import { boneUnitsPerMetre, hipBasis, spineBone, torsoBasis, type BodyBasis } from "./rigFrame";
import { loadWeaponModel, prepareProp, WEAPON_PROPS, type WeaponProp } from "./weaponModel";
import type { OperativeRig } from "./operativeModel";

/**
 * Everything adjustable, in one block, in metres and radians of the CHARACTER's own space. If the
 * rifles clip the pack or the pistol floats off the thigh, the fix is here and nothing below needs
 * touching.
 */
const BACK = {
  /** Clearance behind the spine. Must clear the worn pack, which sits at 0.1 and is ~0.2 deep. */
  out: 0.21,
  /** Along the spine from Spine2's origin, which is high on the sternum. Negative sits lower. */
  rise: -0.09,
  /** Sideways from the centreline. The first heavy goes right, the second mirrors to the left. */
  side: 0.055,
  /** Barrel angle off vertical, muzzle-down and outwards, so a pair crosses in an X. */
  cant: 0.36,
  /** Tips the muzzle end away from the spine, so the stock does not sink into the pack. */
  lean: 0.11,
};

const HIP = {
  /** Out to the right hip, past the thigh rather than inside it. */
  side: 0.155,
  /** Below the Hips origin, level with the top of the thigh. Negative is down. */
  drop: -0.13,
  /** Forwards from the hip's centreline, where a hand naturally falls. */
  front: 0.03,
  /** Barrel angle off vertical. Positive swings the muzzle forward, angling the grip back. */
  tilt: 0.26,
};

/** A prop's own axes, or a target for them: barrel, sight rail, and the flank between the two. */
type Frame = { long: THREE.Vector3; up: THREE.Vector3; side: THREE.Vector3 };

/** Orthonormal frame from a long axis and a preferred up, right-handed as `side x up = long`. */
function frame(long: THREE.Vector3, preferUp: THREE.Vector3): Frame {
  const l = long.clone().normalize();
  const up = preferUp.clone();
  up.addScaledVector(l, -up.dot(l));
  up.normalize();
  return { long: l, up, side: up.clone().cross(l) };
}

/**
 * Which way a weapon model points in its own space.
 *
 * The roster is authored barrel along +Z (m4a1 along +X, katana along +X) with +Y as the sight rail,
 * so the muzzle vector gives the long axis and +Y gives the up. The axe is the one entry whose long
 * axis IS +Y, which would leave no up at all — it falls back to +Z, and a hatchet has no rail to
 * keep level anyway.
 */
function propFrame(prop: WeaponProp): Frame {
  const long = new THREE.Vector3(...prop.muzzle);
  if (long.lengthSq() < 1e-12) long.set(0, 0, 1);
  long.normalize();
  const up = Math.abs(long.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  return frame(long, up);
}

/**
 * The rotation carrying a model's frame onto a target frame.
 *
 * Both are orthonormal and right-handed, so each is a pure rotation as a matrix and the answer is
 * `target * modelᵀ` — no scale or mirroring sneaks in.
 */
function align(model: Frame, target: Frame): THREE.Quaternion {
  const fm = new THREE.Matrix4().makeBasis(model.side, model.up, model.long).transpose();
  const ft = new THREE.Matrix4().makeBasis(target.side, target.up, target.long);
  return new THREE.Quaternion().setFromRotationMatrix(ft.multiply(fm));
}

/** The three places a carried gun can hang. */
type Slot = "back0" | "back1" | "hip";
const SLOTS: Slot[] = ["back0", "back1", "hip"];

/** A resolved place on the skeleton: which bone, where on it, and which way a gun faces there. */
type Anchor = {
  bone: THREE.Object3D;
  /** Offset in the bone's own units. */
  position: THREE.Vector3;
  target: Frame;
  /** Bone units per metre of character, for cancelling the bone chain's scale. */
  perMetre: number;
};

/** A slung heavy: muzzle down and outwards, sights facing out of the back. `mirror` flips it left. */
function backAnchor(bone: THREE.Object3D, b: BodyBasis, perMetre: number, mirror: 1 | -1): Anchor {
  const long = b.up
    .clone()
    .multiplyScalar(-Math.cos(BACK.cant))
    .addScaledVector(b.right, mirror * Math.sin(BACK.cant));
  // Lean tilts the whole gun about the shoulder axis, barrel and rail together. Negative about
  // `right` swings the (downward-pointing) muzzle backwards, out away from the body.
  const lean = new THREE.Quaternion().setFromAxisAngle(b.right, -BACK.lean);
  const target = frame(long.applyQuaternion(lean), b.back.clone().applyQuaternion(lean));
  const position = b.back
    .clone()
    .multiplyScalar(BACK.out)
    .addScaledVector(b.up, BACK.rise)
    .addScaledVector(b.right, mirror * BACK.side)
    .multiplyScalar(perMetre);
  return { bone, position, target, perMetre };
}

/** The sidearm on the right hip: muzzle down, tilted forward, sights facing away from the leg. */
function hipAnchor(bone: THREE.Object3D, b: BodyBasis, perMetre: number): Anchor {
  const long = b.up
    .clone()
    .multiplyScalar(-Math.cos(HIP.tilt))
    .addScaledVector(b.back, -Math.sin(HIP.tilt));
  const position = b.right
    .clone()
    .multiplyScalar(HIP.side)
    .addScaledVector(b.up, HIP.drop)
    .addScaledVector(b.back, -HIP.front)
    .multiplyScalar(perMetre);
  return { bone, position, target: frame(long, b.right), perMetre };
}

/** Everything on the body right now, with the gun in hand already taken out. */
export type HolsterSet = {
  /**
   * The two heavy slots, POSITIONALLY: index 0 crosses to the right shoulder, index 1 to the left,
   * and a null is a shoulder with nothing on it. Not a compacted list, deliberately — compacting it
   * would slide the spare rifle across the wearer's back every time the other one was drawn.
   */
  back: (string | null)[];
  /** The sidearm, when it is not the gun in hand. */
  hip: string | null;
};

export type Holsters = {
  /**
   * Show exactly this set. Idempotent per slot — a slot whose weapon has not changed is left alone,
   * so calling this every frame with the same set costs three string compares.
   */
  set: (carried: HolsterSet) => void;
  dispose: () => void;
};

/**
 * Give a fighter somewhere to keep the guns they are not using. Fire-and-forget, like the hand
 * socket: props land a frame or two after they are asked for and the fighter is complete without
 * them.
 *
 * No disposer needs keeping by the caller — every prop is a child of a bone inside the rig's own
 * graph, so `rig.dispose()` drops them, and their geometry and textures belong to the shared cache.
 * `dispose` is here for the one case that is not a teardown: reusing a rig for a different fighter.
 */
export function attachHolsters(rig: OperativeRig, renderer?: THREE.WebGLRenderer): Holsters {
  const spine = spineBone(rig);
  const torso = torsoBasis(rig);
  const spineScale = spine ? boneUnitsPerMetre(spine, rig.root) : 0;
  const hips = rig.bone("Hips");
  const pelvis = hipBasis(rig);
  const hipScale = hips ? boneUnitsPerMetre(hips, rig.root) : 0;

  // Solved once. Nothing here depends on the weapon, so a swap only recomputes the rotation that
  // carries that particular model's axes onto the frame already sitting in the anchor.
  const anchors: Record<Slot, Anchor | null> = {
    back0: spine && torso && spineScale > 0 ? backAnchor(spine, torso, spineScale, 1) : null,
    back1: spine && torso && spineScale > 0 ? backAnchor(spine, torso, spineScale, -1) : null,
    hip: hips && pelvis && hipScale > 0 ? hipAnchor(hips, pelvis, hipScale) : null,
  };

  /** What each slot has been ASKED to show, set before the load starts so it is not retried. */
  const shown = new Map<Slot, string | null>();
  /** What each slot actually has on the bone. */
  const live = new Map<Slot, THREE.Object3D>();
  const tokens = new Map<Slot, number>();
  let disposed = false;

  const mount = (slot: Slot, anchor: Anchor, prop: WeaponProp) => {
    const token = tokens.get(slot);
    loadWeaponModel(prop.url, renderer)
      .then(({ scene }) => {
        if (disposed || tokens.get(slot) !== token) return;
        const holder = prepareProp(scene.clone(true), prop);
        holder.position.copy(anchor.position);
        holder.quaternion.copy(align(propFrame(prop), anchor.target));
        // `prop.scale` was solved to cancel a 0.01 bone scale, and these bones carry the same one,
        // so a holstered gun matches the held one. Dividing through by the MEASURED factor makes
        // that a fact rather than a coincidence: identical output on today's rigs, still right on a
        // body exported in other units.
        holder.scale.setScalar((prop.scale * anchor.perMetre) / 100);
        holder.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          // Same as the hand prop and the pack: lighting is baked and grounding is a blob sprite,
          // so putting sixty slung rifles through a shadow pass would cost frames and change
          // nothing on screen.
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        });
        anchor.bone.add(holder);
        live.set(slot, holder);
      })
      .catch((err) => {
        console.error("[holster] prop failed to load", prop.url, err);
      });
  };

  const set = (carried: HolsterSet) => {
    if (disposed) return;
    const want: Record<Slot, string | null> = {
      back0: carried.back[0] ?? null,
      back1: carried.back[1] ?? null,
      hip: carried.hip,
    };
    for (const slot of SLOTS) {
      const id = want[slot];
      if (shown.has(slot) && shown.get(slot) === id) continue;
      shown.set(slot, id);
      // Bumped before anything is loaded, which is what invalidates an in-flight prop for this
      // slot — the reason a fast double swap cannot leave two rifles on one shoulder.
      tokens.set(slot, (tokens.get(slot) ?? 0) + 1);
      live.get(slot)?.removeFromParent();
      live.delete(slot);
      const anchor = anchors[slot];
      // A weapon with no entry in the roster has no model to hang, in the hand or anywhere else.
      const prop = id ? WEAPON_PROPS[id] : undefined;
      if (anchor && prop) mount(slot, anchor, prop);
    }
  };

  return {
    set,
    dispose: () => {
      disposed = true;
      for (const obj of live.values()) obj.removeFromParent();
      live.clear();
      shown.clear();
    },
  };
}

/**
 * Split what a fighter carries into what is in their hands and what is on their body.
 *
 * Takes the player's four-slot array — [heavy, heavy, sidearm, fists] — so neither call site has to
 * repeat "everything except the one I'm holding", which is the entire rule. A bot has the same shape
 * with one heavy: `carriedOnBody([bot.weapon, null, bot.sidearm, null], inHand)`.
 */
export function carriedOnBody(slots: readonly (string | null)[], held: string | null): HolsterSet {
  const spare = (id: string | null | undefined) => (id && id !== held ? id : null);
  return { back: [spare(slots[0]), spare(slots[1])], hip: spare(slots[2]) };
}

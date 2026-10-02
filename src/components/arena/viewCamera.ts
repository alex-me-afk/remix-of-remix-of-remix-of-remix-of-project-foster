/**
 * Where the camera ends up once the player's eye is known.
 *
 * Brook: "Camera logic (third-person boom solving, ADS, spawn intro) — complex math,
 * self-contained, doesn't need most of the file's other state". The boom solve is the part of that
 * which is genuinely separable, and it is the part with the math in it. The spawn intro, the
 * spectate orbit, the driving chase and the ADS zoom ramp all still live in the frame loop, because
 * each is a few lines wedged between phase checks that read half the match state — moving those
 * would mean passing the frame loop's whole world in and would make them harder to follow, not
 * easier.
 *
 * WHAT COMES IN is a camera whose `position` is already the eye, screen shake included. What goes
 * out is a camera pulled back along the view axis and aimed at a point on the eye ray. The shake
 * has to arrive baked into the eye rather than be applied afterwards: added after the boom it would
 * shake the pivot and swing the whole shot instead of jittering it.
 *
 * Moved verbatim out of `LoneWolfArena.tsx`'s frame loop, scratch vectors and all.
 */

import * as THREE from "three";

/*
 * Third-person camera rig.
 *
 * THIRD_DIST is how far the camera trails the eye along the view axis, and the spawn intro eases
 * out to exactly this value so the cinematic hands over to gameplay without a jump.
 *
 * THIRD_RIGHT / THIRD_UP push the camera off that axis so the character's own head isn't parked
 * on the crosshair. They are the reason the camera cannot simply look down the view axis: the
 * bullet leaves the EYE (`shoot()` is deliberately built off the player's state, not the
 * camera's), so an offset camera aimed parallel to the eye ray would draw the crosshair a fixed
 * angle away from where the round actually goes. Instead the camera converges on a point
 * THIRD_CONVERGE metres down the eye ray, which puts the crosshair exactly on the eye ray at
 * that distance and within a few pixels of it across normal engagement range. It drifts at
 * point-blank distance, which is the one range where ADS — and therefore first person, where the
 * crosshair is exact by construction — is the answer anyway.
 *
 * The honest long-term fix is to cast the shot from the camera instead and let the character be
 * cosmetic; that means touching hit registration, aim assist and the aim lock, so it is not
 * bundled into the change that introduces the camera.
 */
export const THIRD_DIST = 2.5;
export const THIRD_RIGHT = 0.5;
export const THIRD_UP = 0.32;
export const THIRD_CONVERGE = 20;
/** the camera never ends up closer than this to the eye, however tight the wall behind is */
export const THIRD_MIN_DIST = 0.45;
/** how far short of a hit surface the camera stops, so the near plane never eats into it */
export const THIRD_SKIN = 0.5;
/** and how far above the ground it stays, resolved by pulling in rather than by lifting */
export const THIRD_FLOOR_CLEAR = 0.25;

/**
 * Frame-loop scratch. Module level rather than per call because this runs sixty times a second and
 * a Raycaster allocation per frame is a garbage-collector pause you can feel; nothing here is held
 * across a call, so there is no state to leak between frames or between cameras.
 */
const camRay = new THREE.Raycaster();
const camScratch = new THREE.Vector3();
const camEye = new THREE.Vector3();

export function solveViewCamera(o: {
  /** Position must already be the eye. Mutated in place — position and orientation both. */
  camera: THREE.PerspectiveCamera;
  /** Unit vector the player is looking DOWN, recoil included. */
  lookAxis: THREE.Vector3;
  /** Yaw with recoil applied, for the shoulder offset. */
  yaw: number;
  /** False leaves the camera on the eye and only aims it. */
  thirdPerson: boolean;
  /** The culled collider set the movement code already built this frame — a boom is metres long. */
  colliders: THREE.Mesh[];
  groundAt: (x: number, z: number, fromY: number, maxRise?: number) => number | null;
}) {
  const { camera, lookAxis, yaw, thirdPerson, colliders, groundAt } = o;

  if (thirdPerson) {
    /*
     * Third person. `camera.position` currently holds the eye, screen shake included, and
     * the shake has to stay on the eye rather than be applied after the boom or it would
     * shake the pivot and swing the whole shot instead of jittering it.
     *
     * ONE RULE HERE: every obstruction is resolved by SHORTENING THE BOOM. The camera
     * slides in toward the player and is never lifted, dropped or pushed sideways to get
     * clear. Two reasons, and the second is the one that bites:
     *
     *  - Displacing the camera changes where it is without changing what it is looking
     *    down, so the character swings across frame and the view lurches. Pulling in along
     *    the axis it is already aimed down only changes how much of him you can see.
     *  - The look target is a point on the EYE ray (see THIRD_CONVERGE). Move the camera
     *    off that ray and the crosshair stops agreeing with where the bullet goes; move it
     *    ALONG the ray and the crosshair is untouched.
     */
    camEye.copy(camera.position);
    camScratch.copy(lookAxis).multiplyScalar(-1); // straight back down the view axis

    /** Put the camera `boom` metres back, shoulder offset scaled by how far back it got. */
    const placeCam = (boom: number) => {
      const shoulder = boom / THIRD_DIST; // shrink the offset as the boom is squeezed in
      camera.position.copy(camEye).addScaledVector(camScratch, boom);
      camera.position.x += Math.cos(yaw) * THIRD_RIGHT * shoulder;
      camera.position.z += -Math.sin(yaw) * THIRD_RIGHT * shoulder;
      camera.position.y += THIRD_UP * shoulder;
    };

    let boom = THIRD_DIST;

    /*
     * Anything solid behind. The cast runs down the full 3D view axis, not just its
     * horizontal part, so this covers a ceiling caught while looking down just as well as
     * a wall caught while looking level. `colliders` is the set the movement code culled a
     * few lines ago, which is the right one — a boom is a couple of metres and anything
     * outside that set is far too distant to block it.
     */
    camRay.set(camEye, camScratch);
    camRay.far = boom + THIRD_SKIN;
    const blocked = camRay.intersectObjects(colliders, false);
    if (blocked.length > 0) boom = blocked[0]!.distance - THIRD_SKIN;

    /*
     * Ground below. This is the case that used to climb: the old code let the boom run
     * long and then shoved `position.y` up to sit above the floor, which lifted the shot
     * and dragged the crosshair off the eye ray. Now it solves for the boom instead.
     *
     * `y` is linear in the boom — `camEye.y + dy * boom` — so one subtraction gives the
     * exact length that lands on the clearance line. Only worth doing when `dy` is
     * negative, i.e. the camera descends as it pulls back (looking up a slope); if it
     * rises with distance it cannot dive into the floor by going further.
     *
     * Twice, because the floor is sampled under the camera's own x/z and shortening the
     * boom moves that sample. Flat ground converges on the first pass; a slope is close
     * enough on the second that a third raycast is not worth paying for.
     */
    const dy = camScratch.y + THIRD_UP / THIRD_DIST;
    if (dy < -1e-3) {
      for (let i = 0; i < 2; i++) {
        boom = Math.max(THIRD_MIN_DIST, boom);
        placeCam(boom);
        // `groundAt` starts its ray at `fromY + maxRise`, so this pair puts the origin
        // 0.31 m above the camera and looks down from there. The old call passed
        // (y + 1.2, 1.6), which started 2.81 m ABOVE the camera — and since the cast
        // returns the FIRST hit going down through double-sided colliders, any overhang
        // within that reach was reported as "the floor", above the camera, and the clamp
        // dutifully teleported the camera up into the ceiling. That is the climb.
        const floor = groundAt(camera.position.x, camera.position.z, camera.position.y, 0.3);
        if (floor === null) break;
        const room = camera.position.y - (floor + THIRD_FLOOR_CLEAR);
        if (room >= 0) break;
        boom -= room / dy; // room < 0 and dy < 0, so this always shortens
      }
    }

    placeCam(Math.max(THIRD_MIN_DIST, boom));
    // Converge on the eye ray so the crosshair means what it says. See THIRD_CONVERGE.
    camera.lookAt(camEye.addScaledVector(lookAxis, THIRD_CONVERGE));
  } else {
    camera.lookAt(camScratch.copy(camera.position).add(lookAxis));
  }
}

import * as THREE from "three";

/**
 * Walk physics for a human-controlled fighter: ground probing, horizontal
 * collision resolution and the vertical (jump / gravity / snap / rescue) step.
 *
 * Extracted verbatim out of `LoneWolfArena.tsx`'s frame loop. The behaviour is
 * intentionally unchanged by the move — the point of pulling it out is that the
 * resolver used to be buried in a 6000-line React effect, so it could only ever
 * be tested by playing the game. Here it takes its world access through three
 * injected functions, which means a node harness can load a real map GLB, build
 * the real BVH collision tiles, and run *this exact code* against an actual
 * staircase instead of guessing at it.
 *
 * What deliberately stays in the component: map bounds clamping, the Timber
 * Outpost hard barrier, and the buy-phase spawn cage. Those are level rules
 * layered on top of movement, not movement itself, and keeping them out holds
 * the dependency surface small enough to run headlessly.
 */

export const PLAYER_RADIUS = 0.7;
export const EYE_HEIGHT = 1.7;
export const STEP_UP = 0.55; // anything taller must be jumped
// Nothing playable on any map sits below this. If the walker ever drops past it
// they've fallen through a hole/seam in the collision proxy, so the physics step
// snaps them back to their last solid footing instead of falling forever.
export const VOID_FLOOR_Y = -30;
/**
 * How deep a ground probe looks. This has to span the tallest authored drop in
 * any level, not just a step: Verdant Isle puts its spawn pads at y = 78 while
 * the island floor under them sits between y = 3.9 and y = 29.4. The old
 * hard-coded 60 fell short on six of the eight pads, so the probe returned null
 * and every caller — which reads null as "no floor" and does nothing — left the
 * fighter hanging at spawn height.
 */
export const GROUND_RAY_FAR = 400;
export const GRAVITY = 24;
export const JUMP_SPEED = 8.2;
/**
 * How far overhead the per-slice step check may look for "the ground ahead".
 *
 * This was 2.5 m, and that was the doorway bug. `groundAt` returns the FIRST hit
 * going down and colliders are DoubleSide, so a ray starting 2.51 m above the
 * feet reports the UNDERSIDE OF A DOOR LINTEL as the floor — "ground is 2.17 m
 * above you" — which is taller than STEP_UP, so the slice loop breaks. The
 * player stops dead 0.27 m short of the threshold at every door with a head
 * below ~2.5 m. Jumping gets through only because the whole check is gated on
 * `grounded`, and a jump clears that flag. Measured in
 * tools/doorway-harness.ts: blocked at head 2.5, clear at 2.6, and completely
 * independent of the threshold step height (flush and 0.40 m behave alike),
 * which is why "it's the little step in the doorway" was a red herring.
 *
 * Lowering it costs nothing. The check samples only |stepVec| ahead (0.133 m at
 * walk speed), so for a hit to land more than STEP_UP above the feet the ground
 * would have to rise 0.55 m over 0.133 m — steeper than 76 degrees, i.e. a wall,
 * which the blockingNormal/stepClear gate already stops. The slope sweep
 * confirms it empirically: ramps up to 60 degrees are walked without this check
 * ever firing, and 75/85 degree faces are refused by stepClear, not by here.
 *
 * 1.0 m keeps a usable margin for odd low geometry while sitting well clear of
 * the lowest door head anyone would author. A genuine crawl-height hatch (under
 * ~1 m) will still block, which is the correct answer for a standing player.
 */
export const STEP_CHECK_RISE = 1.0;

/** Closest-hit raycast. Omitting `objects` must fall back to every collider. */
export type CastFirst = (
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  far: number,
  objects?: THREE.Object3D[],
) => THREE.Intersection | null;

/** Authored XZ extent of the level. */
export type WalkBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type WalkPhysicsDeps = {
  castFirst: CastFirst;
  /**
   * Read lazily, never captured: the caller's bounds are reassigned once the
   * level GLB has loaded, so a snapshot taken at construction time would be the
   * default ±200 box forever.
   */
  getBounds: () => WalkBounds;
  /** Only jump/land cues. Optional so a headless harness can skip audio. */
  playSfx?: (kind: "jump" | "land", volume?: number) => void;
};

/** The two mutable scalars the vertical step owns. */
export type VerticalState = { velY: number; grounded: boolean };

export type StepVerticalArgs = VerticalState & {
  /** Feet position — mutated in place. */
  walkPos: THREE.Vector3;
  /** Last confirmed footing — mutated in place, and the void net's target. */
  lastGroundPos: THREE.Vector3;
  dt: number;
  /** Whether the jump key is down this frame. */
  jump: boolean;
};

export function createWalkPhysics({ castFirst, getBounds, playSfx }: WalkPhysicsDeps) {
  const down = new THREE.Vector3(0, -1, 0);
  const scratch = new THREE.Vector3();

  /**
   * Highest walkable surface under (x, z), or null when the column is empty.
   * Anything higher than `fromY + maxRise` is treated as a ceiling / roof
   * overhead and skipped — otherwise standing inside a shed snaps you onto
   * its roof and every doorway reads as a wall.
   *
   * `maxRise` only positions the ray's ORIGIN (how far overhead we start);
   * `far` is how deep it reaches. Lengthening `far` is safe by construction:
   * we return the FIRST hit going down, i.e. the highest surface in the
   * column, so a longer ray can only turn a null into a real surface — it can
   * never change an answer we already had. See GROUND_RAY_FAR for why the old
   * fixed 60 stranded Verdant Isle's bots in the sky.
   */
  const groundAt = (
    x: number,
    z: number,
    fromY: number,
    maxRise = STEP_UP + 0.4,
    far = GROUND_RAY_FAR,
  ): number | null => {
    // Start the ray just under the ceiling limit so the very first hit is
    // already the answer — no need to gather (and sort) the whole column.
    const hit = castFirst(scratch.set(x, fromY + maxRise + 0.01, z), down, far);
    return hit ? hit.point.y : null;
  };

  const SKIN = 0.06;
  // Dense vertical sampling: three rays (knee/chest/head) slipped
  // straight through thin geometry that sits between them — railings,
  // fence rails, pipes. Anything the player can physically touch now
  // gets a ray within ~0.35m of it.
  const PROBE_HEIGHTS = [0.2, 0.55, 0.9, 1.25, 1.6, 1.85];
  // Map-edge / perimeter band: these barriers are hard walls, never
  // subject to the "shorter than the player" step-over leniency.
  const HARD_EDGE_BAND = 3;

  /**
   * Slide the walker horizontally by `move`, stopping at or sliding along
   * anything solid. Mutates `walkPos` in place (x/z only — the vertical step
   * owns y). `colliders` is the local tile selection; `grounded` gates the
   * per-slice step-height check, which only applies when we have footing.
   */
  const moveHorizontal = (
    walkPos: THREE.Vector3,
    move: THREE.Vector3,
    colliders: THREE.Object3D[],
    grounded: boolean,
  ) => {
    const bounds = getBounds();
    const nearHardEdge = (x: number, z: number) =>
      x - bounds.minX < HARD_EDGE_BAND ||
      bounds.maxX - x < HARD_EDGE_BAND ||
      z - bounds.minZ < HARD_EDGE_BAND ||
      bounds.maxZ - z < HARD_EDGE_BAND;

    const probe = (dir: THREE.Vector3, far: number) => {
      let best: THREE.Intersection | null = null;
      for (const h of PROBE_HEIGHTS) {
        const hit = castFirst(scratch.copy(walkPos).setY(walkPos.y + h), dir, far, colliders);
        if (hit && (!best || hit.distance < best.distance)) best = hit;
        if (best && best.distance < 0.05) break;
      }
      return best;
    };

    /**
     * True when a near-vertical obstacle just ahead is short enough to
     * walk straight up (a door sill, curb, low ledge, a single stair
     * riser) rather than a full wall. We cast a ray at just above step
     * height in the travel direction, reaching only a hair past the
     * exact obstacle the low probe already found: if nothing solid sits
     * up there, the collision doesn't reach above the step and the
     * ground-snap can lift us over it. A real wall spans that height too
     * and still blocks. `dist` is the low hit's distance.
     *
     * The reach is deliberately tiny (`dist + 0.15`). Anything longer —
     * the old `PLAYER_RADIUS + 0.35` — overshoots the first stair riser
     * and hits the SECOND step, so an entire staircase read as a wall and
     * demanded a jump; on a doorway it grazed the frame at glancing
     * angles, which is why the sill only cleared from certain approaches.
     */
    const stepClear = (dir: THREE.Vector3, dist: number) => {
      const reach = dist + 0.15;
      const high = castFirst(
        scratch.copy(walkPos).setY(walkPos.y + STEP_UP + 0.15),
        dir,
        reach,
        colliders,
      );
      return !high;
    };

    /**
     * Horizontal blocking normal for a hit, or null when the surface is
     * genuinely walkable.
     *
     * Colliders are DoubleSide, so a flipped face can hand back a normal
     * pointing away from us — orient it against the ray first. Vertical
     * faces always block. A near-horizontal face (prop top, slope,
     * ledge) only blocks when it sits higher than the player can step,
     * or when it belongs to a hard perimeter barrier.
     */
    const blockingNormal = (hit: THREE.Intersection, dir: THREE.Vector3, hard: boolean) => {
      const raw = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
        : dir.clone().negate();
      if (raw.dot(dir) > 0) raw.negate();
      const facing = dir.clone().negate().setY(0);
      if (Math.abs(raw.y) < 0.7) {
        // Near-vertical face. Unless it's a hard perimeter barrier, let a
        // low sill / curb / door-lip through — the ground-snap then steps
        // us up over it, so doorways no longer demand a jump. Two tests:
        // the contact must START at or below step height (so a waist-high
        // rail with open space beneath still blocks, not walks-through),
        // and nothing solid may reach above step height there (a real wall
        // spans that height, fails stepClear, and still blocks).
        if (!hard && hit.point.y - walkPos.y <= STEP_UP + 0.05 && stepClear(dir, hit.distance))
          return null;
        const n = raw.setY(0);
        return n.lengthSq() > 0.01
          ? n.normalize()
          : facing.lengthSq() > 1e-6
            ? facing.normalize()
            : null;
      }
      if (hard || hit.point.y - walkPos.y > STEP_UP)
        return facing.lengthSq() > 1e-6 ? facing.normalize() : null;
      return null;
    };

    const resolve = (sub: THREE.Vector3) => {
      if (colliders.length === 0) return;
      const dir = sub.clone().normalize();
      const hit = probe(dir, PLAYER_RADIUS + sub.length() + SKIN);
      if (!hit) return;
      const hard = nearHardEdge(walkPos.x + sub.x, walkPos.z + sub.z);
      const n = blockingNormal(hit, dir, hard);
      if (!n) return;
      const into = sub.dot(n);
      if (into < 0) sub.addScaledVector(n, -into);
      const forward = Math.max(0, hit.distance - PLAYER_RADIUS - SKIN);
      if (into >= 0 && forward < sub.length()) sub.setLength(forward);
      // re-check the slide direction; if still blocked, stop short
      if (sub.lengthSq() > 1e-6) {
        const d2 = sub.clone().normalize();
        const hit2 = probe(d2, PLAYER_RADIUS + sub.length() + SKIN);
        if (hit2) {
          const hard2 = nearHardEdge(walkPos.x + sub.x, walkPos.z + sub.z);
          if (blockingNormal(hit2, d2, hard2)) {
            const allowed = Math.max(0, hit2.distance - PLAYER_RADIUS - SKIN);
            if (allowed < sub.length()) sub.setLength(allowed);
          }
        }
      }
    };

    // Sub-stepping: at sprint speed a single frame's movement could be
    // longer than a wall is thick, so one probe-and-move tunnelled
    // straight through it. Advance in slices no longer than half the
    // player radius, re-probing from the new position each slice.
    const total = move.length();
    const slices = Math.max(1, Math.ceil(total / (PLAYER_RADIUS * 0.5)));
    const stepVec = move.clone().divideScalar(slices);
    for (let s = 0; s < slices; s++) {
      const sub = stepVec.clone();
      resolve(sub);
      if (sub.lengthSq() <= 1e-9) break;

      // step check: only small ledges are walkable, taller must be jumped
      if (grounded) {
        const nx = walkPos.x + sub.x;
        const nz = walkPos.z + sub.z;
        const nextGround = groundAt(nx, nz, walkPos.y, STEP_CHECK_RISE);
        if (nextGround !== null && nextGround - walkPos.y > STEP_UP) break;
        walkPos.x += sub.x;
        walkPos.z += sub.z;
      } else {
        walkPos.x += sub.x;
        walkPos.z += sub.z;
      }
    }
  };

  /**
   * Jump, gravity, ground snap, sunk-through-terrain rescue and the void net.
   * Mutates `walkPos.y` and `lastGroundPos`; returns the new vertical state
   * because `velY`/`grounded` are read from a dozen other places in the
   * component (grenade throw force, footsteps, heal cancel) and stay owned
   * there rather than hidden inside this module.
   */
  const stepVertical = ({
    walkPos,
    lastGroundPos,
    velY,
    grounded,
    dt,
    jump,
  }: StepVerticalArgs): VerticalState => {
    // jump + gravity
    if (jump && grounded) {
      velY = JUMP_SPEED;
      grounded = false;
      playSfx?.("jump", 0.5);
    }
    velY -= GRAVITY * dt;
    walkPos.y += velY * dt;

    const gy = groundAt(walkPos.x, walkPos.z, walkPos.y);
    if (gy !== null) {
      const wasAirborne = !grounded;
      const impact = -velY;
      if (walkPos.y <= gy + 0.02) {
        walkPos.y = gy;
        velY = 0;
        grounded = true;
        if (wasAirborne && impact > 3) playSfx?.("land", Math.min(0.7, 0.25 + impact * 0.03));
      } else if (velY <= 0 && walkPos.y - gy < 0.35) {
        walkPos.y = gy;
        velY = 0;
        grounded = true;
        if (wasAirborne && impact > 3) playSfx?.("land", Math.min(0.7, 0.25 + impact * 0.03));
      } else {
        grounded = false;
      }
    } else if (velY < 0) {
      // Falling with no ground in the normal step window. The usual cause is
      // that we've sunk *below* the surface — on a steep seam, a compressed
      // ground rim or a bad landing. Once the down-ray's origin drops under
      // the terrain it can never see the floor again and gravity drags us
      // through the world (the "straight through the ground" fall). Re-probe
      // from well overhead: if a surface sits at or above our feet, pop back
      // up onto it immediately, before any plunge can build up.
      const rescue = groundAt(walkPos.x, walkPos.z, walkPos.y, 16);
      if (rescue !== null && rescue >= walkPos.y - 0.5) {
        walkPos.y = rescue;
        velY = 0;
        grounded = true;
      } else {
        grounded = false;
      }
    }
    // remember the last spot we truly had footing, so the void net below can
    // drop us back there (right where we fell in) instead of the far spawn pad
    if (grounded) lastGroundPos.copy(walkPos);

    // last-resort net: if we somehow blew past every recovery above and are
    // still dropping through the level, restore the last footing we recorded
    // (right where we fell in) rather than yanking all the way back to spawn —
    // spawns can sit embedded in a rock, which is the "restart inside a rock"
    // Brook hit. lastGroundPos is always a spot the player actually stood on.
    if (walkPos.y < VOID_FLOOR_Y) {
      walkPos.copy(lastGroundPos);
      velY = 0;
      grounded = true;
    }

    return { velY, grounded };
  };

  return { groundAt, moveHorizontal, stepVertical };
}

export type WalkPhysics = ReturnType<typeof createWalkPhysics>;

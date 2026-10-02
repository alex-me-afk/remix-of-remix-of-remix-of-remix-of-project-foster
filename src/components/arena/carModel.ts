/**
 * CAR RIG — loads a car GLB and drives it procedurally.
 *
 * WHY PROCEDURAL. Every car asset in the pack was inspected before a line of this was
 * written (tools/glb-inspect.cjs) and NONE of them carries a usable drive animation. Four of
 * the five have zero animation tracks at all; the fifth (drunk_monster_truck) has a single
 * clip named `Object_0` of unverified content, and also uses KHR_materials_pbrSpecularGlossiness,
 * which three.js drops on the floor — so it is not in the roster. There is no clip to play.
 * Motion, wheel spin and steering are therefore all computed here, every frame.
 *
 * WHY THE RIG IS SYNTHESISED RATHER THAN READ. Only the GT-R was exported with a real rig
 * (`bone_wheel_FL_steer` -> `bone_wheel_FL_rotation` per corner). The others range from
 * partially named (1970 truck: three `*tire_low*` nodes and nothing else) through absurd
 * (corvette: 2648 nodes, wheels shattered into hundreds of `polySurface*` fragments) to
 * completely anonymous (McLaren: every node is `Object_2`..`Object_59`). Writing a name map per
 * car would be four bespoke maps, each one broken by the next asset that arrives.
 *
 * So this module does not trust names for structure. It finds the wheels GEOMETRICALLY — the
 * four low corner clusters of the mesh — and then BUILDS the rig it wants: a steer group and a
 * spin group per corner, with the existing wheel objects re-parented into them via
 * `Object3D.attach`, which preserves world transform. The result is that a car with no rig and a
 * car with a perfect rig both end up driving through the same two groups. Names are still used,
 * but only as a hint to boost candidates, never as the sole source of truth.
 *
 * HANDLING. A kinematic bicycle model, not a physics sim: yaw rate is
 * `(speed / wheelBase) * tan(steerAngle)`, which is what stops a car pirouetting on the spot at
 * zero speed the way a naive `yaw += steer * dt` does. Body roll and pitch are cosmetic springs.
 */

import * as THREE from "three";

import { makeGltfLoader } from "./ktx2";

/** Uniform in-game size multiplier for every car (1.5 = 150% of real-world size). */
export const CAR_SIZE = 1.2;

export const CAR_CORNERS = ["FL", "FR", "BL", "BR"] as const;
export type CarCorner = (typeof CAR_CORNERS)[number];

/**
 * Which axle a wheel unit belongs to, and which side of the car it is on.
 *
 * `C` — centre — is not a mistake. Some exports merge both wheels of an axle into ONE mesh spanning
 * the full track (the 1970 truck does exactly this: a single 1.81 m wide, 0.60 m round mesh per
 * axle). Such a unit can still be SPUN correctly, because both wheels of an axle really do rotate
 * together about the same axle line, but it cannot be STEERED — yawing it would swing both wheels
 * sideways about the car's centreline. So a `C` unit spins and never steers, and that is recorded in
 * the type rather than discovered as a bug later.
 */
export type CarAxle = "F" | "B";
export type CarSide = "L" | "R" | "C";


export type CarDef = {
  url: string;
  /** Display name. Invented, like the weapon roster — the source models are third-party. */
  name: string;
  /**
   * Real-world length in metres. The model is uniformly scaled so its longest horizontal axis
   * matches this, which is the only reason four exports authored at four different scales end up
   * the same size next to a 1.8 m fighter.
   */
  length: number;
  /**
   * Set when the model's long axis ends up pointing backwards after normalisation. Which END of
   * a box is the front cannot be derived from geometry, so it is a per-car fact that has to be
   * observed once on /car-lab and written down here.
   */
  flip?: boolean;
  /**
   * Meshes to DELETE from the loaded scene, by node name.
   *
   * This is for junk geometry that is part of the export rather than part of the car, and it has to
   * be a removal rather than `visible = false` because `Box3.setFromObject` does not check
   * visibility — a hidden mesh still contributes to `normaliseCar`'s bounds and so still poisons
   * the scale. See the gtr entry for the case that made this necessary.
   */
  cull?: RegExp;
  /** Top speed, m/s. 30 m/s is about 108 km/h. */
  topSpeed: number;
  /** Forward acceleration, m/s^2. */
  accel: number;
  /** Braking deceleration, m/s^2. */
  brake: number;
  /** Maximum steering angle at the front wheels, degrees. */
  steerDeg: number;
  /** Cosmetic: how hard the body leans in a turn, radians at full lateral load. */
  roll?: number;
};

/**
 * The drivable roster. `length` values are the real cars' published lengths, which is a better
 * starting point than eyeballing scale — a GT-R really is 4.7 m and a 1970 pickup really is
 * longer than a McLaren F1.
 *
 * TWO ASSETS FROM THE PACK ARE DELIBERATELY NOT HERE.
 *
 * `drunk_monster_truck.glb` used to be excluded for two reasons, and BOTH are now handled, so it is
 * back in the roster below as `monster`. (1) It shipped every material as
 * KHR_materials_pbrSpecularGlossiness, which three.js does not implement — it rendered untextured.
 * The staged copy is run through gltf-transform's `metalrough` first (see tools/_cars_stage), which
 * rewrites all nine materials to metallic-roughness; the shipped monster.glb is already converted.
 * (2) It has no wheel names, but the geometric detector never needed them — it finds the four wheel
 * discs by shape, and the offline harness confirms a clean four-corner rig (r ~0.9 m, i.e. the ~1.7 m
 * tyres a monster truck actually has). Its one `PlaneShape` billboard quad is culled: it is the only
 * blend-mode material on the car and reads as a floating decal, not bodywork.
 *
 * `mclaren_f1_1993_by_alex.ka..glb` has an unbaked node hierarchy in the same family as the
 * katana's (see weaponModel.ts): its 58 meshes are individually tiny but scattered, so its bounds
 * measure 4.48 m WIDE by 0.56 m TALL — not a car shape, which makes every downstream number
 * (scale, ground offset, wheel search window) garbage. Every node is also called `Object_N`, so
 * there is no name to fall back on. Fixing it means rebaking the asset, not changing this code.
 */
export const CARS: Record<string, CarDef> = {
  // `flip: true` on all three: every one of these exports faces +Z, i.e. backwards relative to the
  // house convention of nose-at-minus-Z. Confirmed on /car-lab — with FLIP on, the drive controls
  // move each car the way the button says, and with it off they all drive in reverse.
  //
  // `cull` on the gtr removes `lights_position_front_and_back_glows`, and that mesh is worth a
  // paragraph because it broke two things at once. It holds the little emissive quads for the front
  // and rear position lamps AND two long grey light-cone volumes projecting out of the headlights,
  // all in ONE primitive, so there is no way to keep the quads and drop the cones. The cones read as
  // two grey blades sticking a metre and a half out of the nose, which is how it was noticed. The
  // quieter half of the damage: those cones put the raw bounds at z -2.241..3.708, i.e. 6.07 m long
  // for a car whose bodywork ends at 2.30, so `normaliseCar` was scaling the GT-R by 4.71/6.07 and
  // shrinking it to 78% while pushing its wheels off-centre (measured wheelbase 2.16 m against a
  // real 2.78). Deleting the mesh fixes the scale, the wheelbase and the blades together.
  gtr: { url: "/models/cars/gtr.glb", name: "SHINDEN GT", length: 4.71, flip: true, cull: /lights_position_front_and_back_glows/i, topSpeed: 26, accel: 8, brake: 18, steerDeg: 38, roll: 0.055 },
  corvette: { url: "/models/cars/corvette.glb", name: "STINGRAY Z", length: 4.46, flip: true, topSpeed: 25, accel: 7.5, brake: 17, steerDeg: 38, roll: 0.06 },
  truck70: { url: "/models/cars/truck70.glb", name: "HAULER 70", length: 5.4, flip: true, topSpeed: 20, accel: 5, brake: 12, steerDeg: 40, roll: 0.11 },
  // The recovered monster truck. `flip` is UNSET on purpose: which end is the nose cannot be read
  // off geometry, and unlike the other three its wheels are anonymous so there is no name to check
  // either. It has to be eyeballed once on /car-lab with the FLIP toggle and the winning value
  // pasted here — exactly the workflow the toggle exists for. `roll` is high because it is tall and
  // top-heavy; `cull` drops the lone blend-mode billboard quad (see the header note).
  monster: { url: "/models/cars/monster.glb", name: "DIREWOLF", length: 4.9, cull: /PlaneShape/i, topSpeed: 20, accel: 6, brake: 13, steerDeg: 40, roll: 0.13 },
};

export const CAR_IDS = Object.keys(CARS);

/** Driver intent for one frame. All values are already smoothed by the caller if it wants them smoothed. */
export type CarInput = {
  /** -1 (reverse) .. +1 (full throttle) */
  throttle: number;
  /** -1 (right) .. +1 (left), in the same handedness as a yaw increase */
  steer: number;
  /** brake pedal, 0..1 */
  brake?: number;
  /** locks the rear wheels: kills grip so the car slides */
  handbrake?: boolean;
};

export type CarWheel = {
  axle: CarAxle;
  side: CarSide;
  /** "FL" / "BR" / "F(pair)" — display only. */
  label: string;
  /** yawed by the steering angle (front, non-pair only) */
  steer: THREE.Group;
  /** spun about its axle by distance travelled */
  spin: THREE.Group;
  /** metres, measured from the wheel's own bounds */
  radius: number;
  /** position in car-local space, metres */
  offset: THREE.Vector3;
  /** how the wheel was found, surfaced in the lab so a bad detection is visible */
  source: "named" | "geometric";
};

// ---- GLB cache ----------------------------------------------------------------------------

type LoadedCar = { scene: THREE.Object3D };

const cache = new Map<string, Promise<LoadedCar>>();

/**
 * Force a material opaque if its own alpha says it has no business being transparent.
 *
 * THE BUG THIS FIXES. Several of these exports set glTF `alphaMode: BLEND` on solid bodywork —
 * truck70 does it on two of its three materials — which three.js honours as `transparent = true`.
 * A transparent material stops writing depth, so the panel behind is drawn over the panel in front
 * and the truck reads as see-through. Nothing about the asset is actually translucent. This is the
 * same defect the pets had, and there it was fixed by re-exporting; doing it in code instead means
 * the next car in is covered too.
 *
 * THE TEST IS OPACITY, NOT NAMES. Blend mode with `opacity >= 1` cannot produce a visible effect
 * except the depth-sorting artefact, so clearing it is information-preserving. Genuine glass has a
 * real alpha and is left alone — the GT-R's windows carry `baseColorFactor` alpha 0.5 and must stay
 * transparent, which is why this is not a blanket "cars are opaque" sweep.
 *
 * WHAT THIS RULE CANNOT SEE, and it is a real limit. A blend material can also do its transparency
 * through the ALPHA CHANNEL of its base-colour texture — a decal or grille cutout, opacity 1 on the
 * material. three.js does not surface that as `alphaMap` or `alphaTest`, so from here it is
 * indistinguishable from truck70's mis-tagged solid bodywork, and this function WILL force it opaque.
 * That is the right call for bodywork and the wrong one for a genuine cutout; there is no cheap way
 * to tell them apart without decoding the texture. When it guesses wrong the fix is to `cull` that
 * mesh (the monster truck's lone `PlaneShape` billboard is handled exactly that way), not to loosen
 * this test — loosening it lets truck70 go see-through again.
 */
function deblend(mat: THREE.Material) {
  const m = mat as THREE.MeshStandardMaterial;
  if (!m.transparent) return;
  if (m.opacity < 1) return;
  if (m.alphaMap) return;
  if (m.alphaTest > 0) return;
  m.transparent = false;
  m.depthWrite = true;
  m.needsUpdate = true;
}

/** Parse (once) and cache a car GLB. Clones share geometry and materials. */
export function loadCarModel(url: string, renderer?: THREE.WebGLRenderer, def?: CarDef): Promise<LoadedCar> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = new Promise<LoadedCar>((resolve, reject) => {
    makeGltfLoader(renderer).load(
      url,
      (gltf) => {
        // Collect first, remove after: mutating the hierarchy inside its own traverse skips siblings.
        const doomed: THREE.Object3D[] = [];
        gltf.scene.traverse((o) => {
          if (def?.cull?.test(o.name)) { doomed.push(o); return; }
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = false;
          m.receiveShadow = false;
          // A few of these exports ship single-sided panels that read as holes from inside the
          // cabin. Cars are seen from outside, so this is cheap insurance rather than a fix.
          m.frustumCulled = true;
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            if (!mat) continue;
            deblend(mat);
          }
        });
        for (const o of doomed) o.removeFromParent();
        resolve({ scene: gltf.scene });
      },
      undefined,
      reject,
    );
  });
  cache.set(url, p);
  return p;
}

/** Warm the cache for a car id. */
export function preloadCar(carId: string, renderer?: THREE.WebGLRenderer) {
  const def = CARS[carId];
  if (!def) return Promise.resolve(null);
  return loadCarModel(def.url, renderer, def).catch(() => null);
}

// ---- geometry helpers ---------------------------------------------------------------------

/**
 * A mesh's bounds expressed in `root`'s local space.
 *
 * Not `Box3.setFromObject`, which would give the bounds in WORLD space and so fold in whatever
 * transform the car holder happens to be carrying this frame. Detection has to be scale- and
 * position-invariant, so every candidate is measured in the same fixed frame.
 */
function boundsInRoot(mesh: THREE.Mesh, rootInverse: THREE.Matrix4, out: THREE.Box3): THREE.Box3 | null {
  const geom = mesh.geometry;
  if (!geom) return null;
  if (!geom.boundingBox) geom.computeBoundingBox();
  const bb = geom.boundingBox;
  if (!bb) return null;
  out.copy(bb).applyMatrix4(TMP_MAT.multiplyMatrices(rootInverse, mesh.matrixWorld));
  return out;
}

const TMP_MAT = new THREE.Matrix4();

/** Wheel-ish by name. Only a HINT — see the module header on why names are not trusted for structure. */
const WHEEL_NAME = /wheel|tire|tyre|rim|hubcap/i;
/** Parts that ride with the steering knuckle but must NOT spin: a spinning brake caliper reads as broken. */
const NO_SPIN_NAME = /caliper|brake|disc|rotor|shock|strut|suspension/i;

type Candidate = { mesh: THREE.Mesh; centre: THREE.Vector3; size: THREE.Vector3; named: boolean };

/**
 * Bring an arbitrary car export onto the house convention: origin at the centre of the
 * wheelbase on the ground plane, length along Z with the front at -Z, `def.length` metres long.
 *
 * Orientation is derived, not assumed. The longest HORIZONTAL axis of the bounds is the car's
 * length whichever way the exporter happened to lay it out, so a model authored along X is
 * yawed 90 degrees onto Z. Only which end is the nose is undecidable from a box, and that is
 * what `def.flip` records.
 *
 * Returns the inner holder that the caller keeps around, plus the metres-per-model-unit factor
 * so wheel radii can be reported in real units.
 */
function normaliseCar(scene: THREE.Object3D, def: CarDef): { inner: THREE.Group; box: THREE.Box3 } {
  const inner = new THREE.Group();
  inner.add(scene);

  scene.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return { inner, box };

  const size = box.getSize(new THREE.Vector3());
  // Yaw the model so its long horizontal axis lands on Z. A car is always longer than it is wide.
  if (size.x > size.z) {
    scene.rotateY(Math.PI / 2);
    scene.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(scene);
    box.getSize(size);
  }
  if (def.flip) {
    scene.rotateY(Math.PI);
    scene.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(scene);
    box.getSize(size);
  }

  const k = size.z > 1e-6 ? (def.length * CAR_SIZE) / size.z : 1;
  scene.scale.multiplyScalar(k);
  scene.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(scene);

  // Centre on X/Z, and sit the lowest point on y=0 so the car rests on the ground rather than
  // hovering or sinking by however much padding its author left under the tyres.
  const centre = box.getCenter(new THREE.Vector3());
  scene.position.x -= centre.x;
  scene.position.z -= centre.z;
  scene.position.y -= box.min.y;
  scene.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(scene);
  return { inner, box };
}

type CornerHit = { objs: THREE.Mesh[]; centre: THREE.Vector3; radius: number; named: boolean };
type WheelUnit = CornerHit & { axle: CarAxle; side: CarSide };

/**
 * Find the wheels by shape and position, in `inner`'s local (already normalised) space.
 *
 * SEED AND GROW, not threshold. The obvious implementation — "a wheel is a low part more than X% of
 * the way out from the centre in both X and Z" — was written first and is wrong, and the GT-R
 * proves it: its axles sit at z = -1.53 and z = +0.53 in normalised space, nowhere near symmetric
 * about the bounding-box centre, because the body extends much further past one axle than the other.
 * Any |z| threshold loose enough to admit the near axle admits half the underbody, and any threshold
 * tight enough to reject the underbody rejects a real wheel. The first version kept the brake
 * calipers and threw away the tyres, and reported four wheels while doing it. See tools/car-wheels.cjs,
 * which reproduces this whole function offline so that claim is checkable without a browser.
 *
 * Two layouts are tried, in order:
 *   1. FOUR CORNERS — one wheel unit per quadrant. What a properly built car export gives you.
 *   2. TWO AXLE PAIRS — a single mesh per axle spanning the full track. Spins, does not steer.
 * Within either, each unit seeds on its largest-volume part (always the tyre — nothing else in a
 * wheel well is as bulky) and grows a capture radius until the set settles.
 */
function detectWheels(inner: THREE.Group, box: THREE.Box3): WheelUnit[] {
  inner.updateWorldMatrix(true, true);
  const rootInverse = new THREE.Matrix4().copy(inner.matrixWorld).invert();
  const size = box.getSize(new THREE.Vector3());
  const halfW = size.x / 2;

  const all: Candidate[] = [];
  const tmp = new THREE.Box3();
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!boundsInRoot(m, rootInverse, tmp)) return;
    if (tmp.isEmpty()) return;
    // Name matching walks UP the hierarchy: exporters put the wheel name on a group and leave the
    // meshes under it called things like `tyres_Material.005_0`, which matches nothing on its own.
    let named = false;
    for (let p: THREE.Object3D | null = m; p && p !== inner; p = p.parent) {
      if (WHEEL_NAME.test(p.name)) { named = true; break; }
    }
    all.push({
      mesh: m,
      centre: tmp.getCenter(new THREE.Vector3()),
      size: tmp.getSize(new THREE.Vector3()),
      named,
    });
  });
  if (!all.length) return [];

  // Anything in the top half of the car is bodywork, glass or interior — never a wheel.
  const low = all.filter((c) => c.centre.y <= box.min.y + size.y * 0.5);
  const maxRadius = size.y * 0.55;
  /** Round in side view and a fraction of the car's own height. Named parts skip this. */
  const roundish = (c: Candidate) => {
    if (c.named) return true;
    const ratio = c.size.z > 1e-6 ? c.size.y / c.size.z : 99;
    return ratio >= 0.55 && ratio <= 1.9 && c.size.y <= size.y * 0.6;
  };

  // --- layout 1: four separate corners ---
  for (const outFrac of [0.35, 0.2, 0.08]) {
    const buckets: Record<CarCorner, Candidate[]> = { FL: [], FR: [], BL: [], BR: [] };
    for (const c of low) {
      if (Math.abs(c.centre.x) < halfW * outFrac) continue;
      if (!roundish(c)) continue;
      buckets[`${c.centre.z < 0 ? "F" : "B"}${c.centre.x < 0 ? "L" : "R"}` as CarCorner].push(c);
    }
    if (CAR_CORNERS.some((k) => buckets[k].length === 0)) continue;
    return CAR_CORNERS.map((k) => ({
      ...growCorner(buckets[k], maxRadius),
      axle: (k[0] === "F" ? "F" : "B") as CarAxle,
      side: (k[1] === "L" ? "L" : "R") as CarSide,
    }));
  }

  // --- layout 2: one merged mesh per axle ---
  const pairs = low.filter((c) => Math.abs(c.centre.x) < halfW * 0.3 && c.size.x > halfW && roundish(c));
  const front = pairs.filter((c) => c.centre.z < 0);
  const back = pairs.filter((c) => c.centre.z >= 0);
  if (front.length && back.length) {
    return [
      { ...growCorner(front, maxRadius), axle: "F" as CarAxle, side: "C" as CarSide },
      { ...growCorner(back, maxRadius), axle: "B" as CarAxle, side: "C" as CarSide },
    ];
  }
  return [];
}


const boxOf = (c: Candidate) => new THREE.Box3().setFromCenterAndSize(c.centre, c.size);

/**
 * Collapse one quadrant of candidates into a single wheel.
 *
 * Seeds on the largest-volume part (the tyre) and grows a capture radius around it until the set
 * stops changing, measuring distance in the YZ plane only — the axle runs along X, so a wheel's
 * parts spread along X (tyre, rim, caliper, hub) and must not be penalised for it.
 *
 * RADIUS IS THE **SMALLER** OF THE Y AND Z SPANS, not the larger, and that is the whole trick. A
 * wheel is a circle in the YZ plane, so a clean cluster has y span == z span; when they disagree,
 * the cluster has picked up something that is NOT part of the circle, and the disagreement is
 * always in the direction of MORE. Taking the max therefore trusts exactly the axis the
 * contamination is on. The corvette is the case that proves it: its rear cluster measures y 0.673
 * (right) by z 1.131 (a full extra tyre's worth of trim behind the wheel), and `max` turned that
 * into a 0.566 m radius — a 1.13 m tall wheel on a 1.23 m tall car, spinning at half the correct
 * rate. `min` reads 0.337 and agrees with the front axle to three decimals.
 *
 * Taking `min` also stops the growth loop running away, because the gate is a multiple of `radius`:
 * an elongated union can no longer inflate the gate that produced it.
 */
function growCorner(group: Candidate[], maxRadius: number): CornerHit {
  const volume = (c: Candidate) => c.size.x * c.size.y * c.size.z;
  let seed = group[0] as Candidate;
  for (const c of group) if (volume(c) > volume(seed)) seed = c;

  let centre = seed.centre.clone();
  let radius = Math.min(maxRadius, Math.min(seed.size.y, seed.size.z) / 2);
  let kept: Candidate[] = [seed];
  for (let i = 0; i < 4; i++) {
    const gate = radius * 1.9;
    const next = group.filter((c) => Math.hypot(c.centre.y - centre.y, c.centre.z - centre.z) <= gate);
    if (!next.length) break;
    const union = new THREE.Box3();
    for (const c of next) union.union(boxOf(c));
    const gs = union.getSize(new THREE.Vector3());
    const nextRadius = Math.min(maxRadius, Math.min(gs.y, gs.z) / 2);
    const settled = next.length === kept.length && Math.abs(nextRadius - radius) < 1e-4;
    kept = next;
    centre = union.getCenter(new THREE.Vector3());
    radius = nextRadius;
    if (settled) break;
  }

  // TRIM. The grow loop is deliberately greedy — it has to be, or a wheel split into 173 fragments
  // never assembles. The cost is that it also captures whatever sits just beyond the tyre in the
  // same low, outboard band: a rocker panel, a mudflap, a diffuser edge. Those must NOT end up in
  // the spin group, because a rotating sill is far more obviously wrong than a missing one.
  //
  // The catch is that the contamination also moves the CENTRE, and a centre that has drifted makes
  // every distance test wrong in the same direction — so trimming on the union's own centre just
  // trims the wrong side. Z is fixed to the SEED part's centre instead, and that choice is the
  // load-bearing one:
  //
  //   - Z is the only axis where a car has wheel-adjacent geometry at wheel height: sills and
  //     valances live fore and aft of the arch, which is exactly where the drift comes from.
  //   - Y needs no help. The union is bounded below by the ground and above by the tyre's crown, so
  //     its midpoint and half-span are already the hub height and the radius. (They agree to within
  //     a centimetre on all three roster cars, which is the cheapest available proof.)
  //   - The seed is the largest-volume part in the quadrant, which on every export tried is the
  //     tyre or the rim — both concentric with the wheel, so both give the same Z.
  //
  // The corvette rear is the case that forced it: seed Z 1.289 against a union Z of 1.042, and the
  // 0.25 m of drift was a stripe of underbody trim ahead of the wheel. Anchoring Z on the seed puts
  // the hub back and the trim then evicts the trim panel on the next pass.
  const anchorZ = seed.centre.z;
  for (let pass = 0; pass < 3; pass++) {
    const limit = radius * 1.15;
    const trimmed = kept.filter((c) => Math.hypot(c.centre.y - centre.y, c.centre.z - anchorZ) <= limit);
    if (!trimmed.length) break;
    const union = new THREE.Box3();
    for (const c of trimmed) union.union(boxOf(c));
    const mid = union.getCenter(new THREE.Vector3());
    const gs = union.getSize(new THREE.Vector3());
    const done = trimmed.length === kept.length;
    kept = trimmed;
    centre = new THREE.Vector3(mid.x, mid.y, anchorZ);
    radius = Math.min(maxRadius, gs.y / 2);
    if (done) break;
  }

  return {
    objs: kept.map((c) => c.mesh),
    centre,
    radius: Math.max(0.1, radius),
    named: kept.some((c) => c.named),
  };
}


// ---- rig ----------------------------------------------------------------------------------

export type CarRig = {
  /** Add this to the scene. Carries world position and heading. */
  root: THREE.Object3D;
  /** Cosmetic roll/pitch, between `root` and the model. */
  body: THREE.Object3D;
  wheels: CarWheel[];
  /** metres */
  length: number;
  wheelBase: number;
  /** signed, m/s — positive is forward */
  speed: number;
  /** heading, radians */
  yaw: number;
  /** current front-wheel angle, radians */
  steerAngle: number;
  update: (dt: number, input: CarInput) => void;
  /** Drop the car back on the origin, stopped and straight. */
  reset: () => void;
  dispose: () => void;
  /** One-line detection report, printed in the lab so a bad rig is visible without guessing. */
  info: string;
};

const DEG2RAD = Math.PI / 180;
/** Rolling resistance when the driver is off both pedals, m/s^2. */
const COAST_DRAG = 3.2;
/** How fast the steering rack follows the input, radians/second. */
const STEER_RATE = 4.5;

function moveToward(v: number, target: number, maxStep: number) {
  const d = target - v;
  if (Math.abs(d) <= maxStep) return target;
  return v + Math.sign(d) * maxStep;
}

export async function createCarRig(opts: {
  carId: string;
  renderer?: THREE.WebGLRenderer;
  /** Overrides `CarDef.flip` — this is what /car-lab's FLIP toggle drives while the value is being found. */
  flip?: boolean;
}): Promise<CarRig> {
  const base = CARS[opts.carId];
  if (!base) throw new Error(`[car] unknown car id "${opts.carId}"`);
  const def: CarDef = opts.flip === undefined ? base : { ...base, flip: opts.flip };
  const { scene } = await loadCarModel(def.url, opts.renderer, def);

  const { inner, box } = normaliseCar(scene.clone(true), def);
  const units = detectWheels(inner, box);

  const wheels: CarWheel[] = [];
  inner.updateWorldMatrix(true, true);
  for (const unit of units) {
    const label = `${unit.axle}${unit.side === "C" ? "(pair)" : unit.side}`;
    const steer = new THREE.Group();
    steer.name = `car_steer_${label}`;
    steer.position.copy(unit.centre);
    inner.add(steer);
    const spin = new THREE.Group();
    spin.name = `car_spin_${label}`;
    steer.add(spin);
    inner.updateWorldMatrix(true, true);
    // attach(), not add(): it re-parents while preserving world transform, which is the whole
    // trick that lets a synthesised rig slot into a hierarchy it did not author.
    for (const m of unit.objs) {
      const target = NO_SPIN_NAME.test(m.name) ? steer : spin;
      target.attach(m);
    }
    wheels.push({
      axle: unit.axle,
      side: unit.side,
      label,
      steer,
      spin,
      radius: Math.max(0.1, unit.radius),
      offset: unit.centre.clone(),
      source: unit.named ? "named" : "geometric",
    });
  }

  const body = new THREE.Group();
  body.name = "car_body";
  body.add(inner);
  const root = new THREE.Group();
  root.name = `car_${opts.carId}`;
  root.add(body);

  const front = wheels.filter((w) => w.axle === "F");
  const rear = wheels.filter((w) => w.axle === "B");
  const avgZ = (ws: CarWheel[]) => (ws.length ? ws.reduce((a, w) => a + w.offset.z, 0) / ws.length : 0);
  // Fall back to a plausible fraction of the body: a wheelbase of 0 would make the bicycle model
  // divide by zero and send the yaw rate to infinity on the first frame of any steering input.
  const wheelBase = front.length && rear.length
    ? Math.abs(avgZ(rear) - avgZ(front)) || def.length * 0.6
    : def.length * 0.6;

  const size = box.getSize(new THREE.Vector3());
  const dims = `body ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}m`;
  const info = wheels.length
    ? `${wheels.length} wheel units [${wheels.map((w) => w.label).join(" ")}] ${wheels[0]?.source} · r=${wheels.map((w) => w.radius.toFixed(2)).join("/")}m · wheelbase ${wheelBase.toFixed(2)}m · ${dims}${wheels.some((w) => w.side === "C") ? " · AXLE-PAIR MODE: spins, cannot steer" : ""}`
    : `NO WHEELS DETECTED · ${dims} (drives, but nothing spins)`;

  // Spin is tracked per wheel because the radii differ — on the truck the fronts are visibly
  // smaller than the rears, and a shared angle would make one pair skid.
  const spinAngle = wheels.map(() => 0);
  let roll = 0;
  let rollVel = 0;
  let pitch = 0;
  let pitchVel = 0;
  let lastSpeed = 0;

  const rig: CarRig = {
    root,
    body,
    wheels,
    length: def.length * CAR_SIZE,
    wheelBase,
    speed: 0,
    yaw: 0,
    steerAngle: 0,
    info,
    update(dt, input) {
      if (dt <= 0) return;
      const throttle = Math.max(-1, Math.min(1, input.throttle));
      const brake = Math.max(0, Math.min(1, input.brake ?? 0));

      // Longitudinal: chase a target speed set by the pedal, then bleed off with drag and brakes.
      const target = throttle >= 0 ? throttle * def.topSpeed : throttle * def.topSpeed * 0.35;
      if (throttle !== 0) rig.speed = moveToward(rig.speed, target, def.accel * Math.abs(throttle) * dt);
      else rig.speed = moveToward(rig.speed, 0, COAST_DRAG * dt);
      if (brake > 0) rig.speed = moveToward(rig.speed, 0, brake * def.brake * dt);
      if (input.handbrake) rig.speed = moveToward(rig.speed, 0, def.brake * 0.45 * dt);

      // Steering rack: less lock the faster you go, or the car becomes uncontrollable at speed.
      // The old 0.55 bled away more than half the lock at top speed, which — stacked on top of
      // top speeds in the 40s — gave a turning circle wider than most of the map and read as
      // "the steering is broken". 0.3 keeps high-speed cornering stable without erasing it.
      const speedFrac = Math.min(1, Math.abs(rig.speed) / def.topSpeed);
      const maxLock = def.steerDeg * DEG2RAD * (1 - 0.3 * speedFrac);
      rig.steerAngle = moveToward(rig.steerAngle, input.steer * maxLock, STEER_RATE * dt);

      // Kinematic bicycle model. The `speed` factor is what keeps a stationary car from spinning
      // in place when the wheel is turned — a real car has to roll to change heading.
      const grip = input.handbrake ? 1.9 : 1;
      const yawRate = (rig.speed / wheelBase) * Math.tan(rig.steerAngle) * grip;
      rig.yaw += yawRate * dt;
      root.rotation.y = rig.yaw;
      root.position.x += -Math.sin(rig.yaw) * rig.speed * dt;
      root.position.z += -Math.cos(rig.yaw) * rig.speed * dt;

      // Cosmetic springs: lean out of the turn, squat under acceleration, dive under braking.
      const lateral = rig.speed * yawRate;
      const longitudinal = (rig.speed - lastSpeed) / dt;
      lastSpeed = rig.speed;
      const rollTarget = Math.max(-1, Math.min(1, lateral / 12)) * (def.roll ?? 0.06);
      const pitchTarget = Math.max(-1, Math.min(1, longitudinal / 14)) * 0.035;
      const spring = (v: number, vel: number, t: number) => {
        const k = 90;
        const c = 13;
        return vel + (t - v) * k * dt - vel * c * dt;
      };
      rollVel = spring(roll, rollVel, rollTarget);
      roll += rollVel * dt;
      pitchVel = spring(pitch, pitchVel, pitchTarget);
      pitch += pitchVel * dt;
      body.rotation.z = roll;
      body.rotation.x = pitch;

      // Wheels. Negative X because rotating +X about the axle carries the top of the wheel
      // backwards, and a wheel whose top goes backwards while the car goes forwards reads as a
      // reversing car — the single most common giveaway of a hand-rolled car rig.
      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        if (!w) continue;
        spinAngle[i] = (spinAngle[i] ?? 0) + (rig.speed * dt) / w.radius;
        w.spin.rotation.x = -(spinAngle[i] ?? 0);
        // `side === "C"` is a merged axle mesh: steering it would swing both wheels sideways about
        // the car's centreline rather than turning them, so it is left alone. See CarSide.
        if (w.axle === "F" && w.side !== "C") w.steer.rotation.y = rig.steerAngle;
      }
    },
    reset() {
      rig.speed = 0;
      rig.yaw = 0;
      rig.steerAngle = 0;
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
      roll = rollVel = pitch = pitchVel = lastSpeed = 0;
      for (let i = 0; i < spinAngle.length; i++) spinAngle[i] = 0;
      for (const w of wheels) {
        w.spin.rotation.set(0, 0, 0);
        w.steer.rotation.set(0, 0, 0);
      }
    },
    dispose() {
      root.removeFromParent();
      // Geometry and materials are shared with the module cache, so they are deliberately NOT
      // disposed here — the next car of the same model reuses them.
      root.clear();
    },
  };

  return rig;
}





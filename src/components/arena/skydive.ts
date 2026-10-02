/**
 * Battle-royale drop-in: the plane flyover and the freefall skydive.
 *
 * Free-Fire style entry. When a BR match starts the player is "on" the plane
 * (never rendered as a body) while a chase camera follows the aircraft along a
 * straight run across the map, engine/propeller animation turning. Pressing
 * LAUNCH / Space ejects: the camera drops behind the player, who dives head-
 * down, steers with the look direction, and slows into an upright flare as the
 * ground approaches before touching down — at which point normal FPS control
 * takes over. A crowd of cosmetic divers bails out alongside so the sky reads
 * as a full lobby, not a solo drop.
 *
 * Everything here is self-contained: the director owns the plane object, the
 * cosmetic crowd, the freefall integration and the camera during the whole
 * sequence. The arena only has to call begin(), feed update() each frame while
 * the match phase is "skydive", and copy the returned feet position into the
 * player once it reports landed.
 */

import * as THREE from "three";
import {
  startPlaneEngine,
  stopPlaneEngine,
  startWindLoop,
  setWindIntensity,
  stopWindLoop,
} from "./sfx";

/** authored plane is ~400 units long — scale it down to a ~16 m aircraft */
export const PLANE_SCALE = 0.04;

// ---- flight + freefall tuning (metres, seconds) ----
const PLANE_ALTITUDE = 96; // above the sampled reference ground
const FLIGHT_SECONDS = 17; // time to cross the map end to end
const AUTO_EJECT_T = 0.72; // bail the player out automatically near the far end
const GRAVITY = 24;
const TERMINAL_FALL = 40; // head-down freefall speed cap (cosmetic crowd only)
const FLARE_HEIGHT = 16; // start slowing this far above the ground
/**
 * How low the diver must be before the rig is allowed to play `hard_landing`.
 *
 * This used to be FLARE_HEIGHT, i.e. the animation was keyed off the same 16 m threshold that
 * starts the physical braking. `hard_landing` loops as locomotion (see operativeModel.ts), and
 * 16 m at LAND_SPEED is about three seconds — so the brace-and-stand played through two or three
 * full cycles while the player was still visibly in the air, then again on touchdown. The two
 * concerns are now separate: braking still begins high, the animation waits until landing is
 * about half a second away, which is roughly when a real jumper's legs come down.
 */
const LANDING_ANIM_HEIGHT = 3.2;
const LAND_SPEED = 5.5; // gentle descent once flaring
/*
 * WINGSUIT GLIDE, not a rock.
 *
 * The player used to fall on plain gravity to a 40 m/s terminal — from 96 m that is barely
 * three seconds of "skydive", which is why the drop read as being thrown off the plane rather
 * than flying. Now the descent rate is a CONTROLLED target, not an acceleration: hands off you
 * sink at GLIDE_FALL, and the harder you fly forward the steeper you trade altitude for ground
 * speed (up to DIVE_FALL). At GLIDE_FALL the 96 m drop is ~15 s of hang time and ~6 s flat out,
 * so a player who mixes the two gets the ~15 s Brook asked for — and because the sink rate never
 * reaches zero, nobody can hover above the match. The altitude stays at the original 96 m: 110 m
 * bought nothing the slower sink hadn't already paid for, and every extra metre widens the
 * horizon the renderer has to draw for the whole (now 5x longer) dive.
 */
const GLIDE_FALL = 6.2; // steady sink with no input, m/s
const DIVE_FALL = 15; // sink at full forward flight, m/s
const FALL_RESPONSE = 2.6; // how fast the sink rate chases its target
const STEER_ACCEL = 22; // horizontal glide responsiveness
const MAX_GLIDE = 30; // horizontal speed cap while flying
const GLIDE_DRAG = 1.6; // bleed horizontal speed with no input
const LAUNCH_FORWARD = 0.35; // fraction of plane speed inherited on bail-out

// ---- camera while riding the plane ----
/** Chase distance from the aircraft. 20% tighter than the original 26 m — the plane read as a distant speck. */
const PLANE_CAM_DIST = 20.8;
const PLANE_CAM_HEIGHT = 8;

// ---- plane model orientation ----
// The authored plane's nose direction in its own local space decides how much
// we must spin it to point along the flight path. If the aircraft ever looks
// like it's flying sideways (or tail-first), this is the single knob to turn:
//   nose along -Z  → Math.PI
//   nose along +Z  → 0
//   nose along +X  → -Math.PI / 2
//   nose along -X  →  Math.PI / 2
// This model is an Otto Celera 500L (pusher-prop): the glass canopy sits at
// local +X (~+112) and the propeller at local -X (~-118), so the nose runs
// along +X and we spin it by -90°. (The old value assumed a -Z nose, which is
// why the plane looked like it was flying sideways.)
const PLANE_YAW_OFFSET = -Math.PI / 2;
const PLANE_BANK = -0.12; // gentle roll so the belly reads banked into the run

export type SkydivePhase = "boarding" | "freefall" | "flare" | "landed";

export type SkydiveInput = {
  dt: number;
  /** look yaw (same convention as the arena FPS controller) */
  yaw: number;
  /** WASD as -1..1 on each axis; forward is +z of the look basis */
  moveF: number;
  moveR: number;
  /** true this frame if the player asked to bail out */
  eject: boolean;
};

export type SkydiveFrame = {
  phase: SkydivePhase;
  /** feet position — copy into walkPos once landed */
  feet: THREE.Vector3;
  /** metres above the ground directly below (for the HUD altimeter) */
  altitude: number;
  landed: boolean;
  /**
   * true only once touchdown is imminent (below LANDING_ANIM_HEIGHT). The caller gates the
   * `hard_landing` clip on THIS, never on `phase === "flare"` — see LANDING_ANIM_HEIGHT for why
   * the flare threshold made the brace animation loop two or three times in mid-air.
   */
  landingAnim: boolean;
};

type GroundAt = (x: number, z: number, fromY: number, maxRise?: number) => number | null;

type DiverVisual = {
  group: THREE.Group;
  /** parachute canopy, revealed once the diver flares */
  canopy: THREE.Mesh;
};

type CrowdDiver = {
  v: DiverVisual;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  dropT: number; // plane-path t at which this diver bails
  dropped: boolean;
  targetGround: number; // cached ground height at the landing spot
  flaring: boolean;
  fade: number; // 1 → 0 once landed, then removed
  yaw: number;
};

export type SkydiveDirector = ReturnType<typeof createSkydiveDirector>;

/**
 * A shared, cheap humanoid silhouette used for the cosmetic crowd.
 *
 * The geometries and materials below are built ONCE for the whole module and reused by every
 * diver. The header used to claim that was already happening ("one geometry set, one material —
 * cloned per diver") while the code actually called `new CapsuleGeometry` / `new SphereGeometry` /
 * `new BoxGeometry` / `new MeshLambertMaterial` inside the per-diver loop: four fresh geometries
 * and two fresh materials each, up to 24 divers, allocated afresh on every `begin()`. Teardown
 * disposed the geometries but never the materials, and `spawnCrowd` re-entered on a rematch
 * without disposing anything at all — so each Battle Royale round leaked another ~100 GPU
 * buffers. That is what turned BR progressively laggy and eventually took the tab down.
 * Shared statics cannot leak: there is exactly one copy no matter how many matches are played.
 */
const DIVER_SKIN = new THREE.MeshLambertMaterial({ color: 0x1c2230 });
const CANOPY_MAT = new THREE.MeshLambertMaterial({ color: 0xff7a3c, side: THREE.DoubleSide });
const DIVER_BODY_GEO = new THREE.CapsuleGeometry(0.28, 0.9, 3, 6);
const DIVER_HEAD_GEO = new THREE.SphereGeometry(0.24, 8, 6);
const DIVER_PACK_GEO = new THREE.BoxGeometry(0.5, 0.55, 0.28);
const CANOPY_GEO = new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);

/**
 * Rushing-air streaks: short bright lines that stream past the diver, the only cheap visual cue
 * that reads as speed when there is nothing but sky around you. Deliberately a single
 * `LineSegments` — one geometry, one material, one draw call for the whole effect — and a module
 * singleton so repeated matches reuse it instead of leaking a fresh buffer each drop (the same
 * mistake the crowd made). It is parented to nothing: the director positions each streak in
 * world space around the diver every frame and wraps them as they fall behind.
 */
const WIND_STREAK_COUNT = 96;
/** Half-extent of the box the streaks are scattered in, metres. */
const WIND_BOX = 9;
let windStreaks: THREE.LineSegments | null = null;
/** Per-streak drift seeds (x, y, z, length scale), regenerated on wrap. */
let windSeeds: Float32Array | null = null;

function getWindStreaks(): { mesh: THREE.LineSegments; seeds: Float32Array } {
  if (windStreaks && windSeeds) return { mesh: windStreaks, seeds: windSeeds };
  const positions = new Float32Array(WIND_STREAK_COUNT * 6);
  const seeds = new Float32Array(WIND_STREAK_COUNT * 4);
  for (let i = 0; i < WIND_STREAK_COUNT; i += 1) {
    seeds[i * 4 + 0] = (Math.random() * 2 - 1) * WIND_BOX;
    seeds[i * 4 + 1] = (Math.random() * 2 - 1) * WIND_BOX;
    seeds[i * 4 + 2] = (Math.random() * 2 - 1) * WIND_BOX;
    seeds[i * 4 + 3] = 0.5 + Math.random(); // per-streak length multiplier
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xdff2ff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const mesh = new THREE.LineSegments(geo, mat);
  mesh.frustumCulled = false; // it is always right on top of the camera
  mesh.visible = false;
  windStreaks = mesh;
  windSeeds = seeds;
  return { mesh, seeds };
}

function buildDiverVisual(): DiverVisual {
  const group = new THREE.Group();
  const body = new THREE.Mesh(DIVER_BODY_GEO, DIVER_SKIN);
  body.position.y = 0.9;
  const head = new THREE.Mesh(DIVER_HEAD_GEO, DIVER_SKIN);
  head.position.y = 1.7;
  const pack = new THREE.Mesh(DIVER_PACK_GEO, DIVER_SKIN);
  pack.position.set(0, 1.0, 0.28);
  group.add(body, head, pack);

  // canopy hidden until the diver flares near the ground
  const canopy = new THREE.Mesh(CANOPY_GEO, CANOPY_MAT);
  canopy.position.y = 3.6;
  canopy.scale.setScalar(0.01);
  canopy.visible = false;
  group.add(canopy);

  return { group, canopy };
}

export function createSkydiveDirector(opts: {
  scene: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  /** the loaded, scaled plane scene */
  plane: THREE.Object3D;
  planeMixer: THREE.AnimationMixer | null;
  /** the player's (normally hidden) body group, reused for the dive pose */
  humanBody: THREE.Group;
  groundAt: GroundAt;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** ground height sampled at the map centre — the flight altitude reference */
  refGroundY: number;
  /** cosmetic crowd size (scaled by quality upstream) */
  crowdSize: number;
}) {
  const { scene, camera, plane, planeMixer, humanBody, groundAt, bounds, refGroundY } = opts;

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const altitude = refGroundY + PLANE_ALTITUDE;

  // straight run on a fixed diagonal heading. The near map edge is unfinished
  // sand/water, so the plane STARTS ~25% farther in toward the centre than the
  // far edge it flies out to, keeping the whole drop path over finished ground.
  const heading = 0.62; // radians; purely cosmetic
  const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)).normalize();
  const half = span * 0.92;
  const startHalf = half * 0.75; // pull the entry point 25% inward off the raw edge
  const startPos = new THREE.Vector3(cx - dir.x * startHalf, altitude, cz - dir.z * startHalf);
  const endPos = new THREE.Vector3(cx + dir.x * half, altitude, cz + dir.z * half);
  const planeSpeed = startPos.distanceTo(endPos) / FLIGHT_SECONDS;

  let t = 0; // 0..1 along the flight path
  let phase: SkydivePhase = "boarding";
  let active = false;
  /**
   * Latched once the diver drops below LANDING_ANIM_HEIGHT and never cleared until the next
   * `begin()`. A latch rather than a live comparison because `groundAt` returns null over gaps
   * in the collision proxy and the caller then falls back to `refGroundY` — so the computed
   * height can jump up by tens of metres for a frame, which un-triggers and re-triggers the
   * clip. That flicker is the other half of "the landing animation plays 2/3 times".
   */
  let landingAnim = false;
  /** wingsuit cosmetic springs: roll into the steer, and a speed-scaled shudder. */
  let bank = 0;
  let buffetT = 0;
  /** camera FOV to restore on teardown — the dive widens it for a speed rush. */
  const baseFov = camera.fov;

  const feet = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let travelYaw = Math.atan2(dir.x, dir.z);

  const crowd: CrowdDiver[] = [];

  // scratch vectors reused every frame — never allocate in the hot loop
  const _tmp = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();

  const planePosAt = (tt: number, out: THREE.Vector3) => out.copy(startPos).lerp(endPos, tt);

  const wind = getWindStreaks();

  /**
   * Scatter the streaks around the diver and stretch them along the airflow.
   *
   * Each streak is a segment from a scattered point to that point minus the flight direction
   * times a speed-scaled length, so at a hover they collapse to invisible dots and flat out they
   * become long hard lines. When a streak drifts outside the box it is re-seeded on the opposite
   * side, which keeps a constant density without ever allocating.
   */
  const updateWind = (dt: number, speed: number, opacity: number) => {
    const mat = wind.mesh.material as THREE.LineBasicMaterial;
    if (opacity <= 0.001) {
      wind.mesh.visible = false;
      return;
    }
    wind.mesh.visible = true;
    mat.opacity = opacity;

    const attr = wind.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    // Airflow is the reverse of travel. `vel` includes the sink, so a straight-down drop streams
    // the lines upward past the camera and a fast glide rakes them backwards — both correct.
    const inv = 1 / Math.max(0.001, speed);
    const ax = -vel.x * inv;
    const ay = -vel.y * inv;
    const az = -vel.z * inv;
    const streakLen = 0.6 + speed * 0.11;

    for (let i = 0; i < WIND_STREAK_COUNT; i += 1) {
      const s = i * 4;
      // drift along the airflow, then wrap back around the diver
      wind.seeds[s + 0] = (wind.seeds[s + 0] ?? 0) + ax * speed * dt;
      wind.seeds[s + 1] = (wind.seeds[s + 1] ?? 0) + ay * speed * dt;
      wind.seeds[s + 2] = (wind.seeds[s + 2] ?? 0) + az * speed * dt;
      for (let k = 0; k < 3; k += 1) {
        const v = wind.seeds[s + k] ?? 0;
        if (v > WIND_BOX) wind.seeds[s + k] = v - WIND_BOX * 2;
        else if (v < -WIND_BOX) wind.seeds[s + k] = v + WIND_BOX * 2;
      }
      const len = streakLen * (wind.seeds[s + 3] ?? 1);
      const px = feet.x + (wind.seeds[s + 0] ?? 0);
      const py = feet.y + 1 + (wind.seeds[s + 1] ?? 0);
      const pz = feet.z + (wind.seeds[s + 2] ?? 0);
      const o = i * 6;
      arr[o + 0] = px;
      arr[o + 1] = py;
      arr[o + 2] = pz;
      arr[o + 3] = px - ax * len;
      arr[o + 4] = py - ay * len;
      arr[o + 5] = pz - az * len;
    }
    attr.needsUpdate = true;
  };

  /** face the model along the travel direction, belly slightly banked */
  const orientPlane = () => {
    plane.rotation.set(0, travelYaw + PLANE_YAW_OFFSET, 0);
    plane.rotation.z = PLANE_BANK;
  };

  const spawnCrowd = () => {
    for (const c of crowd) scene.remove(c.v.group);
    crowd.length = 0;
    const n = Math.max(0, Math.floor(opts.crowdSize));
    for (let i = 0; i < n; i += 1) {
      const v = buildDiverVisual();
      v.group.visible = false;
      scene.add(v.group);
      // spread bail-outs across the run so they trail behind the plane, but keep
      // them off the near sea edge (floor ~0.16) and out before the far edge
      // (~0.83) — roughly a 3–14 s window across the 17 s flight.
      const dropT = 0.16 + (i / Math.max(1, n)) * 0.62 + (((i * 37) % 11) / 11) * 0.05;
      // land the crowd on the central island, not the surrounding sea: keep each
      // random landing column inside the middle ~45% of the playable box.
      const tx = cx + (((i * 53) % 100) / 100 - 0.5) * (bounds.maxX - bounds.minX) * 0.45;
      const tz = cz + (((i * 71) % 100) / 100 - 0.5) * (bounds.maxZ - bounds.minZ) * 0.45;
      const g = groundAt(tx, tz, altitude, altitude) ?? refGroundY;
      crowd.push({
        v,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        dropT,
        dropped: false,
        targetGround: g,
        flaring: false,
        fade: 1,
        yaw: travelYaw,
        // stash the target on the diver via closure through pos later
      });
      // remember the target column in the diver's group userData for glide
      v.group.userData["tx"] = tx;
      v.group.userData["tz"] = tz;
    }
  };

  /** pose a body group into a head-down dive, banked along its travel yaw */
  const poseDive = (g: THREE.Group, yaw: number) => {
    g.rotation.set(-2.35, yaw + Math.PI, 0); // nose-dive: head leads down, feet trail up
  };
  /** pose a body group upright with a slight forward lean (flare / under canopy) */
  const poseFlare = (g: THREE.Group, yaw: number) => {
    g.rotation.set(0.25, yaw + Math.PI, 0);
  };
  /**
   * Face the PLAYER's rigged body along a yaw with NO pitch. Unlike the cosmetic crowd —
   * capsule silhouettes with no skeleton, which must be tilted head-down by hand — the player
   * body plays the authored `freefall` / `hard_landing` clips, and those supply the belly-down
   * dive and the brace-to-stand themselves. So the container only points them the right way;
   * the mesh yaw is already corrected inside the rig, so there is no `+ Math.PI` here.
   *
   * If the diver ever reads upright instead of belly-down, the knob is the freefall clip's
   * import orientation, NOT a pitch here — a tilt would double up on the clip's own pose.
   */
  const faceRiggedBody = (g: THREE.Group, yaw: number) => {
    g.rotation.set(0, yaw, 0);
  };

  const begin = () => {
    active = true;
    t = 0;
    phase = "boarding";
    vel.set(0, 0, 0);
    travelYaw = Math.atan2(dir.x, dir.z);
    plane.visible = true;
    planePosAt(0, plane.position);
    orientPlane();
    if (planeMixer) planeMixer.timeScale = 1;
    humanBody.visible = false;
    spawnCrowd();
    landingAnim = false;
    startPlaneEngine(0.5); // engine roar while the lobby rides the plane out
  };

  /** the player asked to bail (button or key), or the plane reached auto-eject */
  const doEject = () => {
    phase = "freefall";
    planePosAt(t, _tmp);
    feet.copy(_tmp);
    feet.y -= 3; // step out from under the belly
    // inherit a little of the plane's momentum, plus a downward nudge
    vel.copy(dir).multiplyScalar(planeSpeed * LAUNCH_FORWARD);
    vel.y = -6;
    humanBody.visible = true;
    humanBody.position.copy(feet);
    faceRiggedBody(humanBody, travelYaw);
    stopPlaneEngine(); // you've bailed — the plane roars off behind you
    scene.add(wind.mesh);
    startWindLoop(0); // opened silent; setWindIntensity fades it in with airspeed
  };

  const updateCrowd = (dt: number) => {
    for (const c of crowd) {
      if (c.fade <= 0) continue;
      if (!c.dropped) {
        if (t >= c.dropT) {
          c.dropped = true;
          planePosAt(c.dropT, c.pos);
          c.pos.y -= 3;
          c.vel.set(dir.x * planeSpeed * LAUNCH_FORWARD, -6, dir.z * planeSpeed * LAUNCH_FORWARD);
          c.v.group.visible = true;
        } else {
          continue;
        }
      }
      const height = c.pos.y - c.targetGround;
      if (height > FLARE_HEIGHT) {
        // freefall: drift toward the landing column
        c.vel.y = Math.max(c.vel.y - GRAVITY * dt, -TERMINAL_FALL);
        const tx = c.v.group.userData["tx"] as number;
        const tz = c.v.group.userData["tz"] as number;
        _tmp.set(tx - c.pos.x, 0, tz - c.pos.z);
        if (_tmp.lengthSq() > 1) {
          _tmp.normalize().multiplyScalar(MAX_GLIDE * 0.5);
          c.vel.x += (_tmp.x - c.vel.x) * Math.min(1, dt * 1.5);
          c.vel.z += (_tmp.z - c.vel.z) * Math.min(1, dt * 1.5);
        }
        c.yaw = Math.atan2(c.vel.x, c.vel.z);
        poseDive(c.v.group, c.yaw);
      } else if (height > 0.1) {
        // flare: pop the canopy and settle
        if (!c.flaring) {
          c.flaring = true;
          c.v.canopy.visible = true;
        }
        c.v.canopy.scale.setScalar(Math.min(1, c.v.canopy.scale.x + dt * 4));
        c.vel.y += (-LAND_SPEED - c.vel.y) * Math.min(1, dt * 3);
        c.vel.x *= 1 - Math.min(1, dt * 2);
        c.vel.z *= 1 - Math.min(1, dt * 2);
        poseFlare(c.v.group, c.yaw);
      } else {
        // touched down — fade out and drop the canopy
        c.pos.y = c.targetGround;
        c.fade -= dt * 1.6;
        c.v.canopy.visible = false;
        const s = Math.max(0.01, c.fade);
        c.v.group.scale.setScalar(s);
        if (c.fade <= 0) {
          scene.remove(c.v.group);
          continue;
        }
      }
      c.pos.addScaledVector(c.vel, dt);
      c.v.group.position.copy(c.pos);
    }
  };

  /**
   * Advance the whole sequence one frame. Returns the current freefall state and
   * the player's feet position; positions the camera itself.
   */
  const update = (input: SkydiveInput): SkydiveFrame => {
    const dt = Math.min(0.05, input.dt);
    if (planeMixer) planeMixer.update(dt);

    if (phase === "boarding") {
      t = Math.min(1, t + dt / FLIGHT_SECONDS);
      planePosAt(t, plane.position);
      orientPlane();
      updateCrowd(dt);
      /*
       * Orbit camera around the aircraft, driven by the look yaw — riding the plane used to
       * pin the camera on a fixed line behind it, so the mouse was dead for the whole
       * boarding leg and you could not see the map you were about to drop into.
       */
      _tmp.set(
        plane.position.x + Math.sin(input.yaw) * PLANE_CAM_DIST,
        plane.position.y + PLANE_CAM_HEIGHT,
        plane.position.z + Math.cos(input.yaw) * PLANE_CAM_DIST,
      );
      camera.position.lerp(_tmp, Math.min(1, dt * 3));
      camera.lookAt(plane.position.x, plane.position.y - 1, plane.position.z);
      if (input.eject || t >= AUTO_EJECT_T) doEject();
      return {
        phase,
        feet: feet.copy(plane.position),
        altitude: PLANE_ALTITUDE,
        landed: false,
        landingAnim: false,
      };
    }

    // ---- the player is now in freefall / flare ----
    // keep flying the plane on out of shot, and keep the crowd dropping
    if (t < 1) {
      t = Math.min(1, t + dt / FLIGHT_SECONDS);
      planePosAt(t, plane.position);
      orientPlane();
    }
    updateCrowd(dt);

    // Ground under the diver. `maxRise` only lifts the ray's ORIGIN, so the old `altitude + 8`
    // started the cast ~118 m overhead — high enough to report a rooftop, a bridge deck or the
    // plane's own hull as "the ground", and to sweep the entire vertical column of the map on
    // every frame of a now-17-second dive. 4 m of clearance is all a falling body needs; `far`
    // still reaches the full way down, so nothing that was found before is lost.
    const groundY = groundAt(feet.x, feet.z, feet.y, 4) ?? refGroundY;
    const height = feet.y - groundY;

    // steering basis from the look yaw (matches the FPS controller's convention)
    _fwd.set(-Math.sin(input.yaw), 0, -Math.cos(input.yaw));
    _right.set(Math.cos(input.yaw), 0, -Math.sin(input.yaw));

    if (height > FLARE_HEIGHT) {
      phase = "freefall";
      // WASD flies; forward goes where you LOOK, so the mouse is the steering wheel.
      const wishX = _fwd.x * input.moveF + _right.x * input.moveR;
      const wishZ = _fwd.z * input.moveF + _right.z * input.moveR;
      if (wishX || wishZ) {
        vel.x += wishX * STEER_ACCEL * dt;
        vel.z += wishZ * STEER_ACCEL * dt;
      } else {
        vel.x -= vel.x * Math.min(1, GLIDE_DRAG * dt);
        vel.z -= vel.z * Math.min(1, GLIDE_DRAG * dt);
      }
      const hs = Math.hypot(vel.x, vel.z);
      if (hs > MAX_GLIDE) {
        vel.x = (vel.x / hs) * MAX_GLIDE;
        vel.z = (vel.z / hs) * MAX_GLIDE;
      }
      // Sink rate is a target chased smoothly, not free acceleration: fly fast and you
      // trade altitude for it, coast and you stretch the glide out.
      const fastFrac = Math.min(1, Math.hypot(vel.x, vel.z) / MAX_GLIDE);
      const sink = -(GLIDE_FALL + (DIVE_FALL - GLIDE_FALL) * fastFrac);
      vel.y += (sink - vel.y) * Math.min(1, FALL_RESPONSE * dt);
      // The body points where the player is looking — that is what makes the mouse feel
      // connected. Facing the VELOCITY (the old behaviour) meant turning the mouse did
      // nothing visible until the glide had already swung around.
      //
      // On top of the yaw, two small cosmetic springs so the wingsuit reads as flown rather than
      // dropped: BANK rolls the body into whatever direction you are steering, and BUFFET adds a
      // fast low-amplitude shudder that scales with airspeed. Both are container transforms on
      // top of the authored `freefall` clip, so they cost nothing and cannot fight the animation.
      const bankTarget = -input.moveR * 0.55 + (input.moveF > 0 ? 0.12 : 0);
      bank += (bankTarget - bank) * Math.min(1, dt * 4);
      buffetT += dt;
      const shake = Math.min(1, Math.hypot(vel.x, vel.z) / MAX_GLIDE);
      faceRiggedBody(humanBody, input.yaw);
      humanBody.rotation.z = bank + Math.sin(buffetT * 21) * 0.035 * shake;
      humanBody.rotation.x = Math.sin(buffetT * 17.3) * 0.03 * shake - input.moveF * 0.1;
    } else if (height > 0.05) {
      // flare: brake the fall and stand the body up for landing
      phase = "flare";
      vel.y += (-LAND_SPEED - vel.y) * Math.min(1, dt * 4);
      vel.x -= vel.x * Math.min(1, dt * 3);
      vel.z -= vel.z * Math.min(1, dt * 3);
      // Rigged player: the hard_landing clip supplies the brace-and-stand; just face the look.
      faceRiggedBody(humanBody, input.yaw);
    } else {
      phase = "landed";
      feet.y = groundY;
      humanBody.visible = false;
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
      wind.mesh.visible = false;
      stopWindLoop();
      return { phase, feet, altitude: 0, landed: true, landingAnim: true };
    }

    feet.addScaledVector(vel, dt);
    // never let the diver punch through the terrain mid-integration
    if (feet.y < groundY) feet.y = groundY;
    humanBody.position.copy(feet);

    // Latch the brace animation only once touchdown is close. Latched, never re-evaluated down
    // (see the `landingAnim` declaration): a null ground probe over a gap must not un-trigger it.
    if (height <= LANDING_ANIM_HEIGHT) landingAnim = true;

    /*
     * Sell the speed. Three cheap cues, all driven off the same airspeed number:
     *  - streaks raking past the camera (one draw call),
     *  - the wind loop's pitch and level rising,
     *  - and a few degrees of FOV, which is the strongest speed cue in the whole list and costs
     *    a matrix rebuild. Nothing here touches gameplay, so a slow machine losing it loses only
     *    the feel, never the drop.
     * All three fade with `rush`, so hanging under a coast is calm and a full dive is violent.
     */
    const airSpeed = vel.length();
    const rush = Math.min(1, Math.max(0, (airSpeed - 6) / (MAX_GLIDE + DIVE_FALL - 6)));
    updateWind(dt, airSpeed, 0.1 + 0.5 * rush);
    setWindIntensity(rush);
    const wantFov = baseFov + 9 * rush;
    if (Math.abs(camera.fov - wantFov) > 0.05) {
      camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }

    // third-person chase: behind the diver along the look direction, angled down
    _tmp.copy(feet).addScaledVector(_fwd, -6.5);
    _tmp.y = feet.y + 4.5;
    camera.position.lerp(_tmp, Math.min(1, dt * 6));
    camera.lookAt(feet.x, feet.y + 1.2, feet.z);

    return { phase, feet, altitude: Math.max(0, height), landed: false, landingAnim };
  };

  const dispose = () => {
    active = false;
    plane.visible = false;
    stopPlaneEngine(); // safety: never leave the engine droning after teardown
    stopWindLoop();
    // The streak mesh is a module singleton (see getWindStreaks) — detach it and reset the
    // camera, but never dispose, or the next drop has no wind.
    wind.mesh.visible = false;
    scene.remove(wind.mesh);
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    humanBody.rotation.set(0, 0, 0);
    // Geometry and materials are module-level statics shared by every diver in every match —
    // disposing them here would blank the crowd on the NEXT match. Just detach the groups.
    for (const c of crowd) scene.remove(c.v.group);
    crowd.length = 0;
    humanBody.visible = false;
  };

  return {
    begin,
    update,
    dispose,
    get active() {
      return active;
    },
    get phase() {
      return phase;
    },
    /**
     * True once touchdown is imminent. The rig's `hard_landing` clip must be gated on THIS, not
     * on `phase === "flare"` — see LANDING_ANIM_HEIGHT.
     */
    get landingAnim() {
      return landingAnim;
    },
    get planeGroup() {
      return plane;
    },
  };
}

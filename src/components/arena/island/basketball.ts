import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * In-world basketball for Friend Island. The player picks up the ball on the court, stands
 * still, holds to charge and releases to throw. While holding, a dotted arc and a ring show
 * where the ball will go. The player body plays CLIP.basketballThrow on release (see LoneWolfArena).
 */

// Hoops measured from the island model (rim ring centre, world coords).
const HOOPS = [new THREE.Vector3(0.05, 2.65, 193.02), new THREE.Vector3(16.8, 2.65, 193.02)];
const RIM_R = 0.23;
const BOARD_Z = 192.72; // backboard face
const BOARD_HALF_W = 0.6;
const BOARD_Y = [2.5, 3.4] as const;
const BALL_R = 0.12;
const G = 9.81;
// Court area where the ball can be picked up.
/**
 * Seconds after release() until the ball leaves the hand. The throw clip (3.83 s authored,
 * played at THROW_CLIP_RATE) lets go of the ball around this point; the ball rides the right
 * hand until then so the animation and the flight line up.
 */
export const THROW_CLIP_RATE = 1.8;
const THROW_RELEASE_DELAY = (3.83 * 0.42) / THROW_CLIP_RATE;
const COURT = { minX: -4, maxX: 21, minZ: 190, maxZ: 199.5 };

export function onCourt(x: number, z: number) {
  return x > COURT.minX && x < COURT.maxX && z > COURT.minZ && z < COURT.maxZ;
}

type Sim = { p: THREE.Vector3; v: THREE.Vector3; floorY: number; scored: boolean; prevY: number };

function step(s: Sim, dt: number): "score" | "rim" | "board" | "floor" | null {
  s.prevY = s.p.y;
  s.v.y -= G * dt;
  s.p.addScaledVector(s.v, dt);
  let ev: "score" | "rim" | "board" | "floor" | null = null;
  for (const h of HOOPS) {
    // backboard
    if (Math.abs(s.p.x - h.x) < BOARD_HALF_W && s.p.y > BOARD_Y[0] && s.p.y < BOARD_Y[1] && Math.abs(s.p.z - BOARD_Z) < BALL_R && s.v.z < 0) {
      s.p.z = BOARD_Z + BALL_R;
      s.v.z *= -0.6;
      ev = "board";
    }
    // through the hoop, going down
    const dx = s.p.x - h.x;
    const dz = s.p.z - h.z;
    const horiz = Math.hypot(dx, dz);
    if (!s.scored && s.prevY >= h.y && s.p.y < h.y && s.v.y < 0 && horiz < RIM_R - BALL_R * 0.4) {
      s.scored = true;
      ev = "score";
    }
    // rim ring collision
    if (Math.abs(s.p.y - h.y) < BALL_R * 1.5 && horiz > 0.001) {
      const ringDist = Math.hypot(horiz - RIM_R, s.p.y - h.y);
      if (ringDist < BALL_R) {
        const rx = h.x + (dx / horiz) * RIM_R;
        const rz = h.z + (dz / horiz) * RIM_R;
        const n = new THREE.Vector3(s.p.x - rx, s.p.y - h.y, s.p.z - rz).normalize();
        const vn = s.v.dot(n);
        if (vn < 0) {
          s.v.addScaledVector(n, -1.6 * vn);
          s.v.multiplyScalar(0.8);
          ev = ev ?? "rim";
        }
        s.p.set(rx, h.y, rz).addScaledVector(n, BALL_R);
      }
    }
  }
  if (s.p.y < s.floorY + BALL_R) {
    s.p.y = s.floorY + BALL_R;
    if (s.v.y < 0) s.v.y *= -0.62;
    s.v.x *= 0.85;
    s.v.z *= 0.85;
    ev = ev ?? "floor";
  }
  return ev;
}

export type HoopEvent = "score" | "miss" | "rim";

export function createBasketball(scene: THREE.Scene, onEvent: (e: HoopEvent) => void) {
  const group = new THREE.Group();
  scene.add(group);

  const ball = new THREE.Group();
  const fallback = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xd9662b, roughness: 0.7 }),
  );
  ball.add(fallback);
  ball.visible = false;
  group.add(ball);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    "/models/basketball.glb",
    (g) => {
      const m = g.scene;
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3()).length() / Math.sqrt(3);
      m.scale.setScalar((BALL_R * 2) / (size || 1));
      const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      m.position.sub(c);
      m.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
      ball.remove(fallback);
      ball.add(m);
    },
    undefined,
    () => {},
  );

  // aim preview
  const N = 90;
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const arc = new THREE.Points(
    arcGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  arc.frustumCulled = false;
  const landing = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.24, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  );
  landing.rotation.x = -Math.PI / 2;
  const preview = new THREE.Group();
  preview.add(arc, landing);
  preview.visible = false;
  group.add(preview);

  let holding = false;
  let charging = false;
  let power = 0;
  let chargeDir = 1;
  let flight: (Sim & { t: number; bounced: boolean }) | null = null;
  let canShoot = false;
  const launchP = new THREE.Vector3();
  const launchV = new THREE.Vector3();
  let floorY = 0;
  /** >0 while the throw animation winds up; the ball is launched when it reaches 0. */
  let windup = 0;
  const handP = new THREE.Vector3();

  const computeLaunch = (feet: THREE.Vector3, camDir: THREE.Vector3) => {
    const flat = new THREE.Vector3(camDir.x, 0, camDir.z);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
    flat.normalize();
    launchP.set(feet.x, feet.y + 1.55, feet.z).addScaledVector(flat, 0.35);
    // look up a little = steeper arc
    const elev = THREE.MathUtils.clamp(0.85 + Math.asin(THREE.MathUtils.clamp(camDir.y, -1, 1)) * 0.8, 0.45, 1.35);
    const speed = 4 + power * 8;
    launchV.copy(flat).multiplyScalar(Math.cos(elev) * speed);
    launchV.y = Math.sin(elev) * speed;
  };

  const updatePreview = () => {
    const s: Sim = { p: launchP.clone(), v: launchV.clone(), floorY, scored: false, prevY: launchP.y };
    const arr = arcGeo.attributes["position"]!.array as Float32Array;
    let landed = false;
    for (let i = 0; i < N; i++) {
      if (!landed) {
        for (let k = 0; k < 2; k++) {
          const ev = step(s, 1 / 60);
          if (ev === "floor" || ev === "score") {
            landed = true;
            landing.position.set(s.p.x, ev === "score" ? HOOPS.reduce((a, h) => (h.distanceTo(s.p) < a.distanceTo(s.p) ? h : a)).y + 0.01 : floorY + 0.03, s.p.z);
            (landing.material as THREE.MeshBasicMaterial).color.set(ev === "score" ? 0x4dff88 : 0xffd34d);
            break;
          }
        }
      }
      arr[i * 3] = s.p.x;
      arr[i * 3 + 1] = s.p.y;
      arr[i * 3 + 2] = s.p.z;
    }
    if (!landed) landing.position.set(s.p.x, floorY + 0.03, s.p.z);
    arcGeo.attributes["position"]!.needsUpdate = true;
  };

  return {
    get holding() {
      return holding;
    },
    get charging() {
      return charging;
    },
    get power() {
      return power;
    },
    get canShoot() {
      return canShoot;
    },
    get inFlight() {
      return !!flight || windup > 0;
    },
    setHolding(h: boolean) {
      holding = h;
      charging = false;
      if (!h) windup = 0;
      if (!h && !flight) ball.visible = false;
    },
    startCharge() {
      if (!holding || flight || windup > 0 || !canShoot) return false;
      charging = true;
      power = 0;
      chargeDir = 1;
      return true;
    },
    release() {
      if (!charging) return false;
      charging = false;
      if (!canShoot) return false;
      // Freeze the aimed launch now; the ball leaves the hand when the clip reaches release.
      windup = THROW_RELEASE_DELAY;
      preview.visible = false;
      return true;
    },
    update(dt: number, feet: THREE.Vector3, camDir: THREE.Vector3, moving: boolean, hand?: THREE.Object3D | null) {
      floorY = feet.y;
      const hasHand = !!hand && !!hand.parent;
      if (hasHand) hand!.getWorldPosition(handP);
      if (windup > 0) {
        windup -= dt;
        ball.visible = true;
        if (hasHand) ball.position.copy(handP);
        else ball.position.copy(launchP);
        if (windup <= 0) {
          windup = 0;
          // Launch from where the hand actually is, keeping the aimed velocity.
          const p = ball.position.clone();
          flight = { p, v: launchV.clone(), floorY, scored: false, prevY: p.y, t: 0, bounced: false };
        }
        return;
      }
      canShoot = holding && !moving && !flight;
      if (charging) {
        power += chargeDir * dt * 0.9;
        if (power >= 1) (power = 1), (chargeDir = -1);
        if (power <= 0) (power = 0), (chargeDir = 1);
        if (moving) charging = false;
      }
      if (flight) {
        const sub = 4;
        for (let i = 0; i < sub; i++) {
          const ev = step(flight, dt / sub);
          if (ev === "score") onEvent("score");
          else if (ev === "rim" || ev === "board") onEvent("rim");
          else if (ev === "floor" && !flight.bounced) {
            flight.bounced = true;
            if (!flight.scored) onEvent("miss");
          }
        }
        flight.t += dt;
        ball.visible = true;
        ball.position.copy(flight.p);
        ball.rotation.x -= dt * 8;
        if (flight.t > 2.6) {
          flight = null;
        }
        preview.visible = false;
        return;
      }
      if (!holding) {
        ball.visible = false;
        preview.visible = false;
        return;
      }
      if (!charging && power === 0) power = 0.45; // show a default arc before charging
      computeLaunch(feet, camDir);
      ball.visible = true;
      // Ball sits in the right hand while held; aim arc still starts at the release point.
      if (hasHand) ball.position.copy(handP);
      else ball.position.copy(launchP);
      preview.visible = canShoot;
      if (canShoot) updatePreview();
      if (!charging && power === 0.45) power = 0.45;
    },
    dispose() {
      scene.remove(group);
      arcGeo.dispose();
    },
  };
}

export type Basketball = ReturnType<typeof createBasketball>;

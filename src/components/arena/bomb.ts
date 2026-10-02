/**
 * Throwable bomb.
 *
 * The bomb always detonates on a fixed 5 second fuse — bouncing off the ground
 * or a wall never sets it off early. Uses the uploaded bomb GLB when it loads,
 * otherwise a dark sphere with a hot fuse light.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const BOMB_FUSE = 5;

/** throwables: frag damages, flash blinds, smoke blocks line of sight, decoy fakes shots */
export type GrenadeKind = "frag" | "flash" | "smoke" | "decoy";

export const GRENADE_DEFS: Record<
  GrenadeKind,
  { label: string; short: string; fuse: number; color: number; light: number }
> = {
  frag: { label: "Frag", short: "FRG", fuse: 5, color: 0xff8a3c, light: 0xff5a1e },
  flash: { label: "Flashbang", short: "FLS", fuse: 1.7, color: 0xfff6d0, light: 0xfff0b0 },
  smoke: { label: "Smoke", short: "SMK", fuse: 1.5, color: 0xbfc8d4, light: 0x9fb0c4 },
  decoy: { label: "Decoy", short: "DEC", fuse: 1.5, color: 0x8ee36d, light: 0x6cd14a },
};

export const GRENADE_KINDS = Object.keys(GRENADE_DEFS) as GrenadeKind[];

/** flashbang blind radius / smoke cloud radius, metres */
export const FLASH_RADIUS = 16;
export const SMOKE_RADIUS = 4.2;
export const SMOKE_LIFE = 9;
/** decoy lifetime and how often it barks a fake gunshot */
export const DECOY_LIFE = 8;
export const DECOY_BARK_INTERVAL = 0.9;
/** blast radius in metres */
export const BOMB_RADIUS = 5;
/** damage at the very centre of the blast */
export const BOMB_DAMAGE = 300;
/** gravity used by both the live bomb and the landing preview */
export const BOMB_GRAVITY = 20;
/** flat-ground max range ~30 m (v = sqrt(R * g)) */
export const THROW_SPEED = Math.sqrt(30 * BOMB_GRAVITY);
/** thrown while airborne: ~45 m */
export const THROW_SPEED_JUMP = Math.sqrt(45 * BOMB_GRAVITY);

const BOMB_URL = "/models/bomb.glb";
const BOMB_SIZE = 0.085;

let templatePromise: Promise<THREE.Object3D | null> | null = null;

export function loadBombTemplate(): Promise<THREE.Object3D | null> {
  if (templatePromise) return templatePromise;
  templatePromise = new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      BOMB_URL,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const max = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(max) || max <= 0) {
          resolve(null);
          return;
        }
        model.scale.setScalar((BOMB_SIZE * 2) / max);
        const box2 = new THREE.Box3().setFromObject(model);
        const c = new THREE.Vector3();
        box2.getCenter(c);
        model.position.sub(c);
        const holder = new THREE.Group();
        holder.add(model);
        resolve(holder);
      },
      undefined,
      () => resolve(null),
    );
  });
  return templatePromise;
}

function fallbackBomb() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(BOMB_SIZE, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.6 }),
  );
  g.add(body);
  return g;
}

/**
 * Ballistic preview: where a bomb thrown from `from` along `dir` at `speed`
 * would land. Pure maths + the ground probe, no allocation per frame beyond
 * the returned points.
 */
export function predictBombPath(
  from: THREE.Vector3,
  dir: THREE.Vector3,
  speed: number,
  groundAt: (x: number, z: number, fromY: number, maxRise?: number) => number | null,
  out: THREE.Vector3[] = [],
): { points: THREE.Vector3[]; landing: THREE.Vector3 | null } {
  const vel = dir.clone().normalize().multiplyScalar(speed);
  const p = from.clone();
  const step = 1 / 30;
  let landing: THREE.Vector3 | null = null;
  out.length = 0;
  out.push(p.clone());
  for (let i = 0; i < 150; i++) {
    vel.y -= BOMB_GRAVITY * step;
    p.addScaledVector(vel, step);
    out.push(p.clone());
    const gy = groundAt(p.x, p.z, p.y + 2.5, 4);
    if (gy !== null && p.y <= gy + BOMB_SIZE) {
      p.y = gy + BOMB_SIZE;
      out[out.length - 1]!.copy(p);
      landing = p.clone();
      break;
    }
    if (p.y < -40) break;
  }
  return { points: out, landing };
}

type Live = {
  root: THREE.Group;
  vel: THREE.Vector3;
  fuse: number;
  light: THREE.PointLight;
  spin: THREE.Vector3;
  kind: GrenadeKind;
};

export type BombSystem = {
  group: THREE.Group;
  /** number of bombs currently in the air / ticking */
  count: () => number;
  throwBomb: (
    from: THREE.Vector3,
    dir: THREE.Vector3,
    power?: number,
    kind?: GrenadeKind,
  ) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export function createBombSystem(opts: {
  /** ground height under a point, or null when there is nothing below */
  groundAt: (x: number, z: number, fromY: number, maxRise?: number) => number | null;
  /** called at the detonation point when the fuse runs out */
  onExplode: (at: THREE.Vector3, kind: GrenadeKind) => void;
  /** called every frame with the shortest remaining fuse (null when idle) */
  onTick?: (fuse: number | null) => void;
}): BombSystem {
  const group = new THREE.Group();
  /*
   * Effect lights are pre-created and parented to `group`, which the arena adds to the scene once
   * at build time. Creating one per throw and removing it on detonation changes the scene's active
   * light count, and `three` answers a count change by relinking every lit material — a one-frame
   * main-thread stall on each throw AND each explosion. A fixed pool keeps the count constant; a
   * bomb just borrows a slot and drives its intensity. Same reasoning as `impactFx.ts`.
   */
  const lightPool: THREE.PointLight[] = [];
  for (let i = 0; i < 1; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 6, 2);
    l.position.set(0, -1000, 0);
    group.add(l);
    lightPool.push(l);
  }
  let lightCursor = 0;
  const live: Live[] = [];
  let template: THREE.Object3D | null = null;
  void loadBombTemplate().then((t) => (template = t));

  const throwBomb = (
    from: THREE.Vector3,
    dir: THREE.Vector3,
    power = THROW_SPEED,
    kind: GrenadeKind = "frag",
  ) => {
    const def = GRENADE_DEFS[kind];
    const root = new THREE.Group();
    root.add(template ? template.clone(true) : fallbackBomb());
    root.position.copy(from);
    // Borrow a pooled light instead of creating one — see the note on `lightPool`.
    const light = lightPool[lightCursor % lightPool.length]!;
    lightCursor += 1;
    light.color.setHex(def.light);
    light.distance = 6;
    light.decay = 2;
    light.position.copy(from);
    group.add(root);
    live.push({
      root,
      vel: dir.clone().normalize().multiplyScalar(power),
      fuse: def.fuse,
      kind,
      light,
      spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
    });
  };

  const update = (dt: number) => {
    let soonest: number | null = null;
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i]!;
      b.fuse -= dt;
      // physics
      b.vel.y -= BOMB_GRAVITY * dt;
      b.root.position.addScaledVector(b.vel, dt);
      b.root.rotation.x += b.spin.x * dt;
      b.root.rotation.y += b.spin.y * dt;
      b.root.rotation.z += b.spin.z * dt;
      // the light lives on `group`, not on the bomb root, so it has to be carried along
      b.light.position.copy(b.root.position);

      const p = b.root.position;
      const gy = opts.groundAt(p.x, p.z, p.y + 2.5, 4);
      if (gy !== null && p.y <= gy + BOMB_SIZE) {
        p.y = gy + BOMB_SIZE;
        if (b.vel.y < 0) b.vel.y = -b.vel.y * 0.24;
        b.vel.x *= 0.55;
        b.vel.z *= 0.55;
        b.spin.multiplyScalar(0.6);
        if (Math.abs(b.vel.y) < 0.6) b.vel.y = 0;
      }
      if (p.y < -60) b.fuse = Math.min(b.fuse, 0);

      // fuse blink speeds up as it gets close
      const urgency = 1 - Math.max(0, b.fuse) / GRENADE_DEFS[b.kind].fuse;
      b.light.intensity = 1.5 + 3.5 * urgency * (0.5 + 0.5 * Math.sin(performance.now() * 0.006 * (1 + urgency * 6)));

      if (b.fuse <= 0) {
        opts.onExplode(b.root.position.clone(), b.kind);
        // hand the pooled light back dark — the slot is reused by the next throw
        b.light.intensity = 0;
        b.light.position.set(0, -1000, 0);
        group.remove(b.root);
        b.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
        });
        live.splice(i, 1);
        continue;
      }
      soonest = soonest === null ? b.fuse : Math.min(soonest, b.fuse);
    }
    opts.onTick?.(soonest);
  };

  return {
    group,
    count: () => live.length,
    throwBomb,
    update,
    dispose: () => {
      for (const b of live) group.remove(b.root);
      live.length = 0;
      for (const l of lightPool) {
        l.intensity = 0;
        l.position.set(0, -1000, 0);
      }
    },
  };
}

/**
 * Battle-royale world loot: authored props, placed on open ground.
 *
 * Replaces the old `weaponDrops.ts`, which built every pickup out of `BoxGeometry` — a dark box
 * with a coloured lid and two smaller boxes floating above it standing in for a gun. The repo
 * ships the real art (every weapon in the BR loot table has a GLB, plus `lootbox.glb`,
 * `medkit.glb`, `backpack.glb` and `airdrop.glb`), so a pickup is now the actual object lying on
 * the ground.
 *
 * The one primitive kept is the thin upward beacon. That is a marker, not a model: without it a
 * rifle lying in grass 40 m away is invisible, and on a 600 m island that makes the map
 * unlootable. It is deliberately faint and additive.
 *
 * The other half of this module is placement. The old code scattered loot around the SPAWN PADS,
 * and on Verdant Isle all eight pads sit within 80 m of the origin on a 600 x 600 map — so every
 * crate piled up in the middle and half of them landed inside buildings or on their roofs.
 * `createLootPlacer` samples the level itself and sorts every column of the map into one of three
 * kinds: open ground, a floor under a roof, or unusable. Loot then goes to BOTH of the first two,
 * because a battle royale where the houses are empty is a battle royale with no reason to enter a
 * house — the thing to avoid was never "indoors", it was loot buried in a wall or standing on a
 * roof ridge.
 */

import * as THREE from "three";
import { playSfx, playSfxAt } from "./sfx";
import { loadWeaponModel } from "./weaponModel";
import { FAMILY_COLOR, FAMILY_MODEL, type AmmoFamily } from "./ammoFamily";
import type { WeaponClass } from "./weapons";

export const MEDKIT_URL = "/models/medkit.glb";
export const BACKPACK_URL = "/models/backpack.glb";
export const VEST_URL = "/models/vest.glb";
export const HELMET_URL = "/models/helmet.glb";
/** The frost-wall charge prop. Small, so its beacon is what you actually spot. */
export const WALL_CHARGE_URL = "/models/wall-charge.glb";
/**
 * The gold pirate chest and the supply crate, the right way round.
 *
 * These two were swapped, and the swap was in the FILES, not in this code: `airdrop.glb` on disk is
 * byte-for-byte identical to `treasure_chest.glb` (md5 42627458d2b4668f38041d78c81ff91a), so the
 * thing parachuting out of the sky was a pirate chest, and the only other container left for the
 * gold cache was `lootbox.glb` — which its normal map shows to be a ribbed military crate with
 * stencilled numbers on the side. Hence Brook's "you used the lootbox for the gold tresser thing
 * thats not right". `chest.glb` is a fresh copy of the treasure chest under an honest name; the
 * crate goes where a crate belongs, under the parachute. `airdrop.glb` is now unreferenced and is a
 * duplicate of `chest.glb` — 2.6 MB that can be deleted whenever Brook says so.
 */
export const CHEST_URL = "/models/chest.glb";
export const AIRDROP_URL = "/models/lootbox.glb";
/**
 * A dead fighter's drop is the military crate, not their rucksack.
 *
 * Brook: "when a person the player should find bhind him the lootbox we have rn u r using it as
 * an airdop anyway we place this after he dieas insted of his backpack". So the crate takes the
 * death-drop role, at roughly half the size the airdrop uses — the parachute, the red smoke and
 * the 2x scale are what tell the two apart at a glance, and a body drop wants to read as
 * something you can crouch over rather than a landmark. `backpack.glb` is now unreferenced.
 */
export const DEATH_DROP_URL = "/models/lootbox.glb";


/** Beacon tint per class, so a sniper reads different from an SMG before you can see the gun. */
const CLASS_COLOR: Record<WeaponClass, number> = {
  Assault: 0xffb020,
  SMG: 0x36c6ff,
  Shotgun: 0xff5a3c,
  Sniper: 0xb968ff,
  Heavy: 0x28e0a0,
  Pistol: 0xffd45e,
  Melee: 0xbcc6d4,
};

/**
 * Scale a loaded prop so its largest axis is `targetSize` metres, centre it horizontally on the
 * origin and sit its lowest point at y = 0 — i.e. resting on the ground rather than half sunk
 * into it. `fitProp` in `tacticalMatch.ts` centres on all three axes instead, which is right for
 * something hanging under a parachute and wrong for something lying in the dirt.
 */
function fitOnGround(scene: THREE.Object3D, targetSize: number): THREE.Group {
  const wrap = new THREE.Group();
  wrap.add(scene);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = targetSize / maxDim;
  scene.position.set(-center.x, -box.min.y, -center.z);
  wrap.scale.setScalar(s);
  return wrap;
}

/**
 * A faint upward light column. Additive and depth-write-off so it layers over terrain without
 * z-fighting, and cheap enough (a 6-sided open cylinder) to have thirty of them on screen.
 */
function beacon(color: number, height = 6): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, height, 6, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  m.position.y = height / 2;
  return m;
}

/**
 * Load a prop into `holder` when it arrives. Returns nothing: the caller already has a Group in
 * the scene graph, which keeps every call site synchronous (the BR scatter runs inside
 * `loadLevel`, where returning a promise per pickup would mean thirty of them to await). If the
 * GLB fails the holder keeps just its beacon, so the pickup is still findable and still works —
 * an invisible pickup would be a silent trap.
 */
function attachProp(
  holder: THREE.Group,
  url: string,
  targetSize: number,
  renderer?: THREE.WebGLRenderer,
  orient?: (prop: THREE.Group) => void,
) {
  loadWeaponModel(url, renderer)
    .then(({ scene }) => {
      if (!holder.parent) return; // picked up / match torn down before the load landed
      const prop = fitOnGround(scene.clone(true), targetSize);
      orient?.(prop);
      holder.add(prop);
    })
    .catch(() => {
      /* beacon-only fallback */
    });
}

/** The real weapon GLB lying flat on the ground, plus a class-tinted beacon. */
export function createWeaponPickup(
  weaponId: string,
  cls: WeaponClass,
  renderer?: THREE.WebGLRenderer,
  beaconH = 6,
): THREE.Group {
  const g = new THREE.Group();
  const color = CLASS_COLOR[cls] ?? 0xffffff;
  g.add(beacon(color, beaconH));
  // No tipping. The guns are authored LYING FLAT already — measured with tools/glb-orient.mjs,
  // ak47.glb is 0.14 x 0.61 x 2.00, so the barrel runs along Z, the sight rail is +Y and the 0.14
  // is the receiver's thickness. The `rotation.z = PI/2` that used to be here rolled each gun a
  // quarter turn about its own barrel and stood it up on its edge, which is exactly what Brook
  // saw: "the guns ... r now like standing insted of the side". Only the yaw is wanted, so a row
  // of drops does not look stamped.
  attachProp(g, `/models/weapons/${weaponId}.glb`, cls === "Pistol" ? 0.42 : 0.95, renderer, (p) => {
    p.rotation.y = Math.random() * Math.PI * 2;
  });
  return g;
}

/** A first-aid case on the ground. Heals are the other half of BR looting. */
export function createMedkitPickup(renderer?: THREE.WebGLRenderer, beaconH = 5): THREE.Group {
  const g = new THREE.Group();
  g.add(beacon(0x38e08a, beaconH));
  attachProp(g, MEDKIT_URL, 0.5, renderer, (p) => {
    p.rotation.y = Math.random() * Math.PI * 2;
  });
  return g;
}

/** The gold treasure chest: a fixed landmark cache, richer than a single ground drop. */
export function createChestPickup(renderer?: THREE.WebGLRenderer, beaconH = 8): THREE.Group {
  const g = new THREE.Group();
  g.add(beacon(0xffd23f, beaconH));
  attachProp(g, CHEST_URL, 1.1, renderer, (p) => {
    p.rotation.y = Math.random() * Math.PI * 2;
  });
  return g;
}

/**
 * A dead fighter's drop, on the ground where they fell and lootable by whoever gets there.
 *
 * No spin and no bob (the caller passes `animate: false`): this is placed at a deliberate spot
 * BEHIND the body, and a crate rotating in mid-air beside a corpse looks like a physics bug. The
 * caller also sets the yaw, so the crate faces the way the body was facing.
 */
export function createDeathPack(renderer?: THREE.WebGLRenderer, beaconH = 5): THREE.Group {
  const g = new THREE.Group();
  g.add(beacon(0x7fc4ff, beaconH));
  attachProp(g, DEATH_DROP_URL, 0.72, renderer);
  return g;
}

/**
 * A crate of one ammo family on the ground. Brook's two new boxes plus the three older ones —
 * "those assest should be thrown in the ground so the player can catch them".
 *
 * Every one of the five GLBs is authored at a different scale (0.58 m, 0.46 m, a 20-unit box
 * off-origin in two axes, and two normalised unit cubes), which `fitOnGround` handles: it
 * measures the loaded bounds and normalises to `targetSize` rather than trusting the file, so a
 * new crate can be dropped in without a magic number per asset.
 */
export function createAmmoPickup(
  family: AmmoFamily,
  renderer?: THREE.WebGLRenderer,
  beaconH = 3.5,
): THREE.Group {
  const g = new THREE.Group();
  g.add(beacon(FAMILY_COLOR[family], beaconH));
  attachProp(g, FAMILY_MODEL[family], 0.42, renderer, (p) => {
    p.rotation.y = Math.random() * Math.PI * 2;
  });
  return g;
}

/** A frost-wall charge: `bomb_conry_complex.glb`, which Brook confirmed is the wall device. */
export function createWallChargePickup(renderer?: THREE.WebGLRenderer, beaconH = 3.5): THREE.Group {
  const g = new THREE.Group();
  g.add(beacon(0x6ee7ff, beaconH));
  attachProp(g, WALL_CHARGE_URL, 0.34, renderer, (p) => {
    p.rotation.y = Math.random() * Math.PI * 2;
  });
  return g;
}

/** Beacon tint per armour level, carried over from the procedural crates it replaces. */
const ARMOR_COLOR: Record<number, number> = { 1: 0x8ee36d, 2: 0x3f8fff, 3: 0xc77dff };

/**
 * A vest or a helmet on the ground, as the real prop instead of a tinted box and a dome.
 *
 * The beacon keeps the level colour the procedural version used (`createArmorPickupMesh` in
 * `armor.ts`), so a level-2 vest still reads blue from across a field — the tint is the only thing
 * the box was carrying that the model does not.
 */
export function createArmorPickup(
  slot: "vest" | "helmet",
  level: 1 | 2 | 3,
  renderer?: THREE.WebGLRenderer,
  beaconH = 4,
): THREE.Group {
  const g = new THREE.Group();
  g.add(beacon(ARMOR_COLOR[level] ?? 0xffd23f, beaconH));
  attachProp(g, slot === "vest" ? VEST_URL : HELMET_URL, slot === "vest" ? 0.52 : 0.34, renderer, (p) => {
    p.rotation.y = Math.random() * Math.PI * 2;
  });
  return g;
}


/* ------------------------------------------------------------------ placement */

/** What one probe found in a column of the map. `open` false means something is roofing it. */
export type GroundProbe = { y: number; open: boolean };

export type LootPlacerDeps = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /**
   * Standing height at (x, z) and whether the sky is open above it, or null for nothing usable.
   *
   * One call rather than the two this used to take, because both answers come off the same first
   * ray and the sampler wants both: open ground for the fields, roofed floors for the insides of
   * the houses. The arena implements it, because only the arena owns the raycaster.
   *
   * Distinguishing a roof from a hillside cannot be done by asking "is something overhead?" from
   * the ground — a downward ray started in the sky returns the ROOF and one started low returns the
   * interior FLOOR, so a flat roof looks exactly like flat outdoor ground. The test that works is
   * the other way up: find the topmost surface, then look underneath it. A roof has a floor beneath
   * it; a hillside has nothing.
   */
  probeGround: (x: number, z: number) => GroundProbe | null;
  /**
   * Height of the water plane in world space, or null on a map with no water.
   *
   * MEASURED BY THE CALLER off the level's own `Water` mesh, not inferred here, because inferring
   * it does not work on Verdant Isle and that is why every drop ended up in the sea. The waterline
   * is in the VISUAL glb; the collision glb (`verdant-isle-collision.glb`, 279 meshes) has no water
   * in it at all — you do not collide with water. So the sampler's rays pass straight through the
   * surface and land on the seabed, which is a smooth slope with nothing under it: valid open
   * ground by every test, and below sea level. The height histogram this used to fall back on
   * never saw a flat plane to lock onto, returned null, and null meant "no waterline, accept
   * everything".
   */
  waterY?: number | null;
};

export type PickOptions = {
  /** Metres to keep clear of every spot already claimed. */
  minGap?: number;
  /** `true` = must have a building within ~8 m, `false` = must not, omitted = don't care. */
  nearCover?: boolean;
  /** `"open"` = out in the fields, `"indoor"` = on a floor under a roof, `"any"` = either. */
  where?: "open" | "indoor" | "any";
};

export type LootPlacer = {
  /** The waterline in use, echoed back so a wrong one is visible in a log rather than in the sea. */
  waterY: number | null;
  /** Sampled columns that are valid open ground — 0 means the map defeated us. */
  openCount: number;
  /** Sampled columns that are a floor under a roof, i.e. somewhere inside a building. */
  indoorCount: number;
  /** A spot matching `opts`, or null if every sample failed. */
  pick: (opts?: PickOptions) => THREE.Vector3 | null;
  /** Reserve a spot so later picks keep their distance. `pick` does this for you. */
  claim: (p: THREE.Vector3) => void;
};


/**
 * Samples the level on a grid once, then hands out spots that pass every test below. Rejection
 * sampling against the real geometry is the only approach that survives a map being re-exported:
 * hand-authored loot coordinates go stale the moment a building moves, and the previous
 * spawn-pad-relative scatter was wrong on day one.
 */
export function createLootPlacer(deps: LootPlacerDeps): LootPlacer {
  const { bounds, probeGround } = deps;
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  // 72 x 72 = 5184 columns, so a cell is ~8 m on a 600 m island. The old 44 gave 13.6 m cells,
  // which is wider than a house — most buildings had no sample inside them at all, which is the
  // other half of why the houses came out empty. A BVH ray is microseconds; this is load-time noise.
  const GRID = 72;
  const cellX = spanX / GRID;
  const cellZ = spanZ / GRID;
  /** Everything at or below this is water or shoreline slop. */
  const floorY = deps.waterY == null ? -Infinity : deps.waterY + 0.7;

  type Sample = { x: number; z: number };
  const open: Sample[] = [];
  const indoor: Sample[] = [];
  for (let ix = 0; ix < GRID; ix += 1) {
    for (let iz = 0; iz < GRID; iz += 1) {
      const x = bounds.minX + (ix + 0.5) * cellX;
      const z = bounds.minZ + (iz + 0.5) * cellZ;
      const g = probeGround(x, z);
      if (g == null || g.y <= floorY) continue;
      (g.open ? open : indoor).push({ x, z });
    }
  }

  const claimed: THREE.Vector3[] = [];

  /**
   * Is (x, z) somewhere a player would find a gun lying where they can pick it up?
   *
   * Above the waterline, the right side of a roof for what the caller asked for, and level — four
   * probes are all the same kind of spot and land within 0.6 m of the middle, so nothing perches on
   * a roof ridge, a windowsill or a 45-degree cliff. The probe reach is shorter indoors because a
   * room is not 2.4 m wide to spare and a wall 1.2 m away is normal there, not a rejection.
   */
  const validate = (x: number, z: number, wantOpen: boolean | null): number | null => {
    const g = probeGround(x, z);
    if (g == null || g.y <= floorY) return null;
    if (wantOpen !== null && g.open !== wantOpen) return null;
    const reach = g.open ? 1.2 : 0.7;
    for (const [dx, dz] of [
      [reach, 0],
      [-reach, 0],
      [0, reach],
      [0, -reach],
    ] as const) {
      const n = probeGround(x + dx, z + dz);
      if (n == null || n.open !== g.open || Math.abs(n.y - g.y) > 0.6) return null;
    }
    return g.y;
  };

  /**
   * Something roofed within ~8 m — a building, since that is the only roofed thing on these maps.
   * Reuses the same primitive from the other side: a spot under a roof is one the probe calls
   * closed.
   */
  const coverNear = (x: number, z: number): boolean => {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const g = probeGround(x + Math.cos(a) * 7.5, z + Math.sin(a) * 7.5);
      if (g == null || !g.open) return true;
    }
    return false;
  };

  const claim = (p: THREE.Vector3) => {
    claimed.push(p.clone());
  };

  const pick = (opts: PickOptions = {}): THREE.Vector3 | null => {
    const minGap = opts.minGap ?? 12;
    const where = opts.where ?? "open";
    const pool = where === "indoor" ? indoor : where === "open" ? open : [...open, ...indoor];
    const wantOpen = where === "any" ? null : where === "open";
    if (pool.length === 0) return null;
    // Two passes: honour `nearCover` first, then drop it rather than return nothing, because a
    // map with no enclosed buildings would otherwise place no chests at all.
    for (let pass = 0; pass < 2; pass += 1) {
      const wantCover = pass === 0 ? opts.nearCover : undefined;
      for (let t = 0; t < 260; t += 1) {
        const s = pool[(Math.random() * pool.length) | 0]!;
        const x = s.x + (Math.random() - 0.5) * cellX;
        const z = s.z + (Math.random() - 0.5) * cellZ;
        const y = validate(x, z, wantOpen);
        if (y == null) continue;
        let tooClose = false;
        for (const c of claimed) {
          const dx = c.x - x;
          const dz = c.z - z;
          if (dx * dx + dz * dz < minGap * minGap) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
        if (wantCover !== undefined && coverNear(x, z) !== wantCover) continue;
        const p = new THREE.Vector3(x, y + 0.02, z);
        claim(p);
        return p;
      }
    }
    return null;
  };

  return {
    waterY: deps.waterY ?? null,
    openCount: open.length,
    indoorCount: indoor.length,
    pick,
    claim,
  };
}


/* ------------------------------------------------------------------ airdrops */

export type Airdrop = {
  root: THREE.Group;
  /** Ground position under the crate. */
  pos: THREE.Vector3;
  /** Falling until this timestamp (ms, `performance.now` clock). */
  landAt: number;
  landed: boolean;
  chute: THREE.Object3D[];
};

export type AirdropDirectorDeps = {
  parent: THREE.Object3D;
  placer: LootPlacer;
  renderer?: THREE.WebGLRenderer;
  /** Seconds between drops. */
  interval: number;
  /** Seconds into the match before the first drop. */
  firstAt: number;
  /** Fired when a plane is inbound, for the announcer line. */
  onInbound: () => void;
  /** Human position, for distance-attenuated audio. */
  listener: () => THREE.Vector3;
};

/**
 * Periodic supply drops, one at a time, somewhere new each time.
 *
 * The old behaviour Brook reported — "all the airdrops are going into one specific place and stay
 * there" — was the ground-loot scatter being mistaken for airdrops: it built yellow-lidded boxes
 * around the spawn pads, which on Verdant Isle all sit in the middle of the island. There was no
 * periodic airdrop in BR at all; the only one in the game was the personal, once-per-match
 * tactical in `tacticalMatch.ts`. This is the real thing.
 */
export function createAirdropDirector(deps: AirdropDirectorDeps) {
  const { parent, placer, renderer, interval, firstAt, onInbound, listener } = deps;
  /** Landed, unopened crates. The caller owns looting and splices them out. */
  const crates: Airdrop[] = [];
  let falling: Airdrop | null = null;
  let next = firstAt;
  let elapsed = 0;
  const DESCENT = 7; // seconds under canopy
  const HEIGHT = 70;

  const spawn = () => {
    // Well clear of the last crate so successive drops pull the fight to a new part of the map.
    const at = placer.pick({ minGap: 60 }) ?? placer.pick({ minGap: 18 });
    if (!at) return;

    const root = new THREE.Group();
    root.position.set(at.x, at.y + HEIGHT, at.z);

    const chute = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
      new THREE.MeshBasicMaterial({
        color: 0xf2f5ff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    chute.position.y = 2.9;
    const lines: THREE.Object3D[] = [chute];
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(a) * 2.1, 1.7, Math.sin(a) * 2.1),
        new THREE.Vector3(Math.cos(a) * 0.5, 0.7, Math.sin(a) * 0.5),
      ]);
      lines.push(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd8dde8 })));
    }
    for (const l of lines) root.add(l);

    // Red smoke marker, bright while falling and left burning on the ground.
    root.add(beacon(0xff3b1f, 26));
    attachProp(root, AIRDROP_URL, 1.6, renderer);

    parent.add(root);
    falling = {
      root,
      pos: at.clone(),
      landAt: performance.now() + DESCENT * 1000,
      landed: false,
      chute: lines,
    };
    onInbound();
    playSfx("equip", 0.6, -0.4);
  };

  const tick = (dt: number) => {
    elapsed += dt;
    if (!falling && elapsed >= next) {
      next = elapsed + interval;
      spawn();
    }
    const f = falling;
    if (!f) return;
    const now = performance.now();
    const remaining = Math.max(0, f.landAt - now);
    const k = 1 - remaining / (DESCENT * 1000);
    f.root.position.y = f.pos.y + HEIGHT * (1 - k) + 0.5 * k;
    f.root.rotation.y += dt * 0.5;
    if (remaining > 0) return;
    // touchdown: cut the canopy away, keep the crate and its smoke
    for (const c of f.chute) {
      c.removeFromParent();
      const m = c as THREE.Mesh;
      m.geometry?.dispose?.();
    }
    f.chute = [];
    f.landed = true;
    f.root.position.y = f.pos.y + 0.02;
    playSfxAt("land", f.pos.distanceTo(listener()), 1, -0.3);
    crates.push(f);
    falling = null;
  };

  const dispose = () => {
    falling?.root.removeFromParent();
    for (const c of crates) c.root.removeFromParent();
    crates.length = 0;
    falling = null;
  };

  return { tick, crates, dispose };
}

/**
 * In-match backpack and FF Coin loot economy.
 *
 * ONE SHARED POOL, measured in units, not one cap per item type. This is Brook's rule and his
 * worked example is the spec: "the backpack can hold 2 guns and pistool and 10 medkit and 4
 * boombs and 5 forsatwall as max but what if the player decide to only take boombs or only ammo
 * then he can lets say hold 30 boomb only as max while having nothing else". Both of those loads
 * have to come out at the cap, which pins the numbers exactly:
 *
 *   10 medkits x 2  +  4 bombs x 1  +  5 walls x 1  =  29
 *   30 bombs   x 1                                  =  30
 *
 * Hence `CAPACITY[1] = 30` with a medkit costing 2 and everything small costing 1. Nothing here
 * has a private cap: what the player carries is entirely their choice of mix, which is the whole
 * point — and it is why looting has to ASK rather than top you up.
 *
 * Guns are not in the pool. They live in the loadout's own slots (two heavies plus a sidearm),
 * which is the "2 guns and pistool" half of the same sentence and was already enforced there.
 *
 * The old model counted `items: string[]` with a cap of 6/8/12 and was never wired to anything
 * except FF Coins — nothing called `addItem`, so nothing was ever actually limited.
 *
 * FF Coins are yellow tokens looted from the ground and spent at vending machines (future).
 * The Leg Pockets tactical starts the holder with a larger backpack.
 */

import * as THREE from "three";

import { AMMO_FAMILIES, FAMILY_BOX, type AmmoFamily, type AmmoPools } from "./ammoFamily";
import type { GrenadeKind } from "./bomb";

export type BackpackLevel = 1 | 2 | 3;

/** Units of room. Level 1 is Brook's 30; the upgrades are a third and two thirds more. */
export const BACKPACK_CAPACITY: Record<BackpackLevel, number> = {
  1: 30,
  2: 40,
  3: 52,
};

/**
 * What one of each thing costs. A medkit is the bulky one (2) because that is what makes his two
 * example loads add up; inhalers, throwables and wall charges are 1 each.
 */
export const ITEM_UNITS = { kit: 2, inhaler: 1, grenade: 1, wall: 1 } as const;

/** Everything the pool counts. Weapons are excluded on purpose — see the header. */
export type BagLoad = {
  kits: number;
  inhalers: number;
  grenades: Record<GrenadeKind, number>;
  walls: number;
  ammo: AmmoPools;
};

/**
 * Rounds cost room by the CRATE, rounded up: one spare bullet still means carrying the box it
 * came in. Without the rounding a pool of 1 sniper round would be free, and "only ammo" could
 * never fill a pack the way Brook describes.
 */
export function ammoUnits(pools: AmmoPools): number {
  let u = 0;
  for (const f of AMMO_FAMILIES) u += Math.ceil(Math.max(0, pools[f]) / FAMILY_BOX[f]);
  return u;
}

export function bagUnits(load: BagLoad): number {
  let u = load.kits * ITEM_UNITS.kit + load.inhalers * ITEM_UNITS.inhaler + load.walls * ITEM_UNITS.wall;
  for (const n of Object.values(load.grenades)) u += n * ITEM_UNITS.grenade;
  return u + ammoUnits(load.ammo);
}

export function bagCapacity(level: BackpackLevel): number {
  return BACKPACK_CAPACITY[level];
}

/** 0..1 for the red ring around the backpack button. Clamped: an arena start can exceed the cap. */
export function bagFill(load: BagLoad, level: BackpackLevel): number {
  return Math.min(1, bagUnits(load) / bagCapacity(level));
}

export function bagFree(load: BagLoad, level: BackpackLevel): number {
  return Math.max(0, bagCapacity(level) - bagUnits(load));
}

/** How many of `kind` actually fit right now — 0 means the take button greys out. */
export function roomForItem(
  load: BagLoad,
  level: BackpackLevel,
  kind: keyof typeof ITEM_UNITS,
  want: number,
): number {
  const per = ITEM_UNITS[kind];
  return Math.max(0, Math.min(want, Math.floor(bagFree(load, level) / per)));
}

/**
 * How many ROUNDS of `family` fit. Partial crates already paid for their box, so the space left
 * inside the open crate is free — take 10 of 60 rifle rounds and the next 50 cost nothing.
 */
export function roomForAmmo(
  load: BagLoad,
  level: BackpackLevel,
  family: AmmoFamily,
  want: number,
): number {
  const box = FAMILY_BOX[family];
  const held = Math.max(0, load.ammo[family]);
  const slack = Math.ceil(held / box) * box - held;
  return Math.max(0, Math.min(want, slack + bagFree(load, level) * box));
}

export type Backpack = {
  level: BackpackLevel;
  capacity: number;
  /** FF Coins currently held */
  coins: number;
  /** item ids carried (medkits, inhalers, grenades, ammo boxes) */
  items: string[];
};

export function defaultBackpack(level: BackpackLevel = 1): Backpack {
  return {
    level,
    capacity: BACKPACK_CAPACITY[level],
    coins: 0,
    items: [],
  };
}

export type FfCoinPickup = {
  id: string;
  pos: THREE.Vector3;
  mesh: THREE.Mesh;
  value: number;
  alive: boolean;
  spawnAt: number;
};

const COIN_PICKUP_RADIUS = 2.2;
const COIN_VALUE = 50;
const COIN_RESCAN_INTERVAL = 0.25;

export function createFfCoinMesh(): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffd23f,
    emissive: 0xffa500,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.8,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.z = Math.PI / 2;
  mesh.userData["ffCoin"] = true;
  return mesh;
}

export function spawnFfCoins(
  scene: THREE.Object3D,
  count: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  groundAt: (x: number, z: number) => number | null,
): FfCoinPickup[] {
  const pickups: FfCoinPickup[] = [];
  const meshTemplate = createFfCoinMesh();
  for (let i = 0; i < count; i++) {
    const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
    const y = groundAt(x, z);
    if (y == null) continue;
    const pos = new THREE.Vector3(x, y + 0.35, z);
    const mesh = meshTemplate.clone();
    mesh.position.copy(pos);
    scene.add(mesh);
    pickups.push({
      id: `coin_${Math.random().toString(36).slice(2)}`,
      pos,
      mesh,
      value: COIN_VALUE,
      alive: true,
      spawnAt: performance.now(),
    });
  }
  meshTemplate.geometry.dispose();
  (meshTemplate.material as THREE.Material).dispose();
  return pickups;
}

let lastScan = 0;

/**
 * Auto-pickup coins that are close enough to the player. Returns the total
 * value collected this frame and mutates the pickup list.
 */
export function scanFfCoinPickups(
  pickups: FfCoinPickup[],
  playerPos: THREE.Vector3,
  backpack: Backpack,
  now: number,
): number {
  if (now - lastScan < COIN_RESCAN_INTERVAL * 1000) return 0;
  lastScan = now;
  let collected = 0;
  for (const coin of pickups) {
    if (!coin.alive) continue;
    if (coin.pos.distanceTo(playerPos) <= COIN_PICKUP_RADIUS) {
      coin.alive = false;
      coin.mesh.visible = false;
      backpack.coins += coin.value;
      collected += coin.value;
    }
  }
  return collected;
}

export function disposeFfCoins(pickups: FfCoinPickup[]) {
  for (const coin of pickups) {
    coin.mesh.geometry.dispose();
    (coin.mesh.material as THREE.Material).dispose();
    coin.mesh.parent?.remove(coin.mesh);
  }
  pickups.length = 0;
}

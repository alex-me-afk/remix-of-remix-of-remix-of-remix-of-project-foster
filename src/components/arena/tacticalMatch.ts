/**
 * In-match tactical item logic.
 *
 * Tacticals are selected in the loadout panel. Some are passive on spawn
 * (Armor Crate, Leg Pockets, Bounty Token) and already handled in the arena.
 * This module implements the remaining match-start / deployable tacticals:
 * Scanner, Bonfire and Airdrop.
 */

import * as THREE from "three";
import { playSfx, playSfxAt } from "./sfx";
import { getWeapon, type Weapon } from "./weapons";
import { loadWeaponModel } from "./weaponModel";
import { AIRDROP_URL } from "./worldLoot";

/**
 * Center a loaded prop on its own bounding box and scale it to a target size in metres,
 * so an arbitrary GLB drops in where a hand-placed primitive used to sit. Returns the
 * wrapper to add to the scene graph.
 */
function fitProp(scene: THREE.Object3D, targetSize: number): THREE.Group {
  const wrap = new THREE.Group();
  wrap.add(scene);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = targetSize / maxDim;
  scene.position.sub(center); // recenter on origin
  wrap.scale.setScalar(s);
  return wrap;
}

export type TacticalId = "scanner" | "bonfire" | "airdrop" | "bounty" | "armorCrate" | "legPockets";

type MinimalFighter = {
  pos: THREE.Vector3;
  hp: number;
  alive: boolean;
  ep?: number;
};

export type TacticalMatchState = {
  scannerLeft: number;
  bonfires: Bonfire[];
  airdropCalled: boolean;
  airdropDropping: boolean;
  airdropRoot: THREE.Group | null;
  airdropSmoke: THREE.PointLight | null;
  airdropLandAt: number;
  airdropPos: THREE.Vector3 | null;
  airdropOpened: boolean;
};

type Bonfire = {
  root: THREE.Group;
  pos: THREE.Vector3;
  light: THREE.PointLight;
  ttl: number;
  pulse: number;
};

export function createTacticalState(): TacticalMatchState {
  return {
    scannerLeft: 0,
    bonfires: [],
    airdropCalled: false,
    airdropDropping: false,
    airdropRoot: null,
    airdropSmoke: null,
    airdropLandAt: 0,
    airdropPos: null,
    airdropOpened: false,
  };
}

/** Called once when the human fighter spawns at the start of a match. */
export function applySpawnTactical(
  state: TacticalMatchState,
  tacticalId: TacticalId | null | undefined,
  scene: THREE.Object3D,
  humanPos: THREE.Vector3,
  groundAt: (x: number, z: number, fromY: number, maxRise?: number) => number | null,
) {
  if (!tacticalId) return;
  if (tacticalId === "scanner") {
    state.scannerLeft = 20;
    playSfx("equip", 0.6, 0.5);
  }
  if (tacticalId === "bonfire") {
    placeBonfire(state, scene, humanPos, groundAt);
  }
}

/** Call the Airdrop tactical manually (e.g. from a dedicated button). */
export function callAirdrop(
  state: TacticalMatchState,
  scene: THREE.Object3D,
  humanPos: THREE.Vector3,
  groundAt: (x: number, z: number, fromY: number, maxRise?: number) => number | null,
): boolean {
  if (state.airdropCalled || state.airdropDropping) return false;
  state.airdropCalled = true;
  state.airdropDropping = true;

  const dir = new THREE.Vector3(Math.sin(Math.random() * Math.PI * 2), 0, Math.cos(Math.random() * Math.PI * 2));
  const dropPos = humanPos.clone().addScaledVector(dir, 18 + Math.random() * 10);
  const gy = groundAt(dropPos.x, dropPos.z, humanPos.y + 2, 4);
  dropPos.y = gy ?? humanPos.y;
  state.airdropPos = dropPos.clone();
  state.airdropLandAt = performance.now() + 4200;

  const root = new THREE.Group();
  root.position.copy(dropPos).setY(dropPos.y + 45);

  // crate body — a plain box shows instantly (and stays as the fallback if the GLB fails);
  // the authored airdrop model is loaded async and swapped in when ready.
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.1, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4, metalness: 0.5 }),
  );
  crate.castShadow = true;
  root.add(crate);
  loadWeaponModel(AIRDROP_URL)
    .then(({ scene: propScene }) => {
      if (state.airdropRoot !== root) return; // match ended / airdrop cleared before load landed
      const prop = fitProp(propScene.clone(true), 1.4);
      root.remove(crate);
      crate.geometry.dispose();
      (crate.material as THREE.Material).dispose();
      root.add(prop);
    })
    .catch(() => {
      /* keep the placeholder box */
    });

  // red smoke stream
  const smoke = new THREE.PointLight(0xff3b1f, 0, 28, 2);
  smoke.position.set(0, 0.6, 0);
  root.add(smoke);
  state.airdropSmoke = smoke;

  // parachute
  const chute = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  chute.position.y = 2.4;
  root.add(chute);
  const lines: THREE.Line[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(angle) * 1.8, 1.3, Math.sin(angle) * 1.8),
      new THREE.Vector3(Math.cos(angle) * 0.55, 0.55, Math.sin(angle) * 0.55),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xdddddd }));
    lines.push(line);
    root.add(line);
  }

  scene.add(root);
  state.airdropRoot = root;
  playSfx("equip", 0.7, 0.2);
  return true;
}

function placeBonfire(
  state: TacticalMatchState,
  scene: THREE.Object3D,
  at: THREE.Vector3,
  groundAt: (x: number, z: number, fromY: number, maxRise?: number) => number | null,
) {
  const pos = at.clone();
  const gy = groundAt(pos.x, pos.z, pos.y + 1, 2);
  pos.y = gy ?? pos.y;

  const root = new THREE.Group();
  root.position.copy(pos);

  // stone ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.12, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  root.add(ring);

  // flame core
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.9, 12),
    new THREE.MeshBasicMaterial({ color: 0xff6b3d, transparent: true, opacity: 0.85 }),
  );
  flame.position.y = 0.45;
  root.add(flame);

  // warm light
  const light = new THREE.PointLight(0xff6b3d, 3.5, 9, 2);
  light.position.y = 0.7;
  root.add(light);

  scene.add(root);
  state.bonfires.push({ root, pos, light, ttl: 45, pulse: Math.random() * 10 });
  playSfx("equip", 0.55, 0.35);
}

/** True while the scanner tactical is active — used by the minimap/radar. */
export function scannerActive(state: TacticalMatchState) {
  return state.scannerLeft > 0;
}

export function updateTacticals(
  state: TacticalMatchState,
  dt: number,
  scene: THREE.Object3D,
  human: MinimalFighter | null,
  syncHud: () => void,
) {
  // scanner timer
  if (state.scannerLeft > 0) {
    state.scannerLeft = Math.max(0, state.scannerLeft - dt);
  }

  // bonfire heal zone
  const t = performance.now() * 0.004;
  for (let i = state.bonfires.length - 1; i >= 0; i--) {
    const b = state.bonfires[i]!;
    b.ttl -= dt;
    if (b.ttl <= 0) {
      scene.remove(b.root);
      state.bonfires.splice(i, 1);
      continue;
    }
    const flicker = 0.85 + Math.sin(t + b.pulse) * 0.15;
    b.light.intensity = 3.5 * flicker;
    const flame = b.root.children.find((c) => (c as THREE.Mesh).geometry?.type === "ConeGeometry") as THREE.Mesh | undefined;
    if (flame) {
      flame.scale.setScalar(0.9 + Math.sin(t * 2 + b.pulse) * 0.12);
      flame.rotation.y += dt * 1.5;
    }
    if (human && human.alive && human.hp < 200) {
      const d = human.pos.distanceTo(b.pos);
      if (d < 5) {
        human.hp = Math.min(200, human.hp + 12 * dt);
        human.ep = Math.min(100, (human.ep ?? 0) + 8 * dt);
        syncHud();
      }
    }
  }

  // airdrop descent and landing
  if (state.airdropDropping && state.airdropRoot && state.airdropPos) {
    const now = performance.now();
    const remaining = Math.max(0, state.airdropLandAt - now);
    const startY = state.airdropPos.y + 45;
    const endY = state.airdropPos.y + 0.55;
    const progress = 1 - remaining / 4200;
    const eased = progress * progress * (3 - 2 * progress);
    state.airdropRoot.position.y = startY + (endY - startY) * eased;
    state.airdropRoot.rotation.y += dt * 0.8;

    if (state.airdropSmoke) {
      state.airdropSmoke.intensity = 2.5 * (1 - eased * 0.6);
    }

    if (remaining <= 0) {
      state.airdropDropping = false;
      playSfxAt("land", state.airdropPos.distanceTo(human?.pos ?? state.airdropPos), 1, -0.2);
      // remove parachute and lines, keep crate + smoke
      const toRemove = state.airdropRoot.children.filter(
        (c) =>
          (c as THREE.Mesh).geometry?.type === "SphereGeometry" ||
          c.type === "Line",
      );
      for (const c of toRemove) state.airdropRoot.remove(c);
      if (state.airdropSmoke) {
        state.airdropSmoke.color.setHex(0x8ee36d);
        state.airdropSmoke.intensity = 2.2;
      }
    }
  }
}

/** Returns the weapon granted by opening the landed airdrop crate, or null if not ready. */
export function openAirdrop(
  state: TacticalMatchState,
  humanPos: THREE.Vector3,
): Weapon | null {
  if (!state.airdropPos || state.airdropDropping || state.airdropOpened) return null;
  if (humanPos.distanceTo(state.airdropPos) > 2.5) return null;
  state.airdropOpened = true;
  playSfx("equip", 0.85, 0.6);
  // high-tier pool
  const pool = ["awm", "m249", "m1014", "mp40"];
  const id = pool[Math.floor(Math.random() * pool.length)]!;
  return getWeapon(id) ?? null;
}

export function disposeTacticals(state: TacticalMatchState, scene: THREE.Object3D) {
  for (const b of state.bonfires) scene.remove(b.root);
  state.bonfires.length = 0;
  if (state.airdropRoot) scene.remove(state.airdropRoot);
  state.airdropRoot = null;
  state.airdropSmoke = null;
}

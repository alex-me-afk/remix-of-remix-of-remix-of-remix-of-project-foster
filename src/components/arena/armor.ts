/**
 * Armor system — vests and helmets.
 *
 * Four levels of each: higher levels absorb more damage and have more durability.
 * Vests reduce body shots; helmets reduce headshots. Armor absorbs a percentage of
 * incoming damage and loses the same amount of durability.
 */

import * as THREE from "three";

export type ArmorLevel = 0 | 1 | 2 | 3 | 4;

export type ArmorSlot = "vest" | "helmet";

export type ArmorPiece = {
  slot: ArmorSlot;
  level: ArmorLevel;
  /** durability absorbed so far; when durability reaches 0 the piece breaks */
  durability: number;
  /** max durability for this level */
  maxDurability: number;
  /** fraction of relevant damage absorbed (0..1) */
  absorb: number;
  /** price in the armory buy phase */
  price: number;
};

export type ArmorState = {
  vest: ArmorPiece | null;
  helmet: ArmorPiece | null;
};

const VEST_ABSORB: Record<ArmorLevel, number> = {
  0: 0,
  1: 0.2,
  2: 0.35,
  3: 0.5,
  4: 0.65,
};

const HELMET_ABSORB: Record<ArmorLevel, number> = {
  0: 0,
  1: 0.3,
  2: 0.45,
  3: 0.6,
  4: 0.75,
};

const MAX_DURABILITY: Record<ArmorLevel, number> = {
  0: 0,
  1: 100,
  2: 150,
  3: 220,
  4: 300,
};

const PRICES: Record<ArmorLevel, number> = {
  0: 0,
  1: 600,
  2: 1200,
  3: 2000,
  4: 3200,
};

export function createArmorPiece(slot: ArmorSlot, level: ArmorLevel): ArmorPiece {
  const absorb = slot === "vest" ? VEST_ABSORB[level] : HELMET_ABSORB[level];
  const maxDurability = MAX_DURABILITY[level];
  return {
    slot,
    level,
    durability: maxDurability,
    maxDurability,
    absorb,
    price: PRICES[level],
  };
}

export function armorLevelName(level: ArmorLevel) {
  switch (level) {
    case 0:
      return "None";
    case 1:
      return "Level 1";
    case 2:
      return "Level 2";
    case 3:
      return "Level 3";
    case 4:
      return "Level 4";
  }
}

export function armorIconLabel(slot: ArmorSlot, level: ArmorLevel) {
  return slot === "vest" ? `V${level}` : `H${level}`;
}

/** Absorb damage against a piece. Returns the absorbed amount and the remaining damage. */
function absorbWith(piece: ArmorPiece, rawDamage: number) {
  const absorbed = Math.round(rawDamage * piece.absorb);
  piece.durability = Math.max(0, piece.durability - absorbed);
  const remaining = Math.max(0, rawDamage - absorbed);
  return { absorbed, remaining, broken: piece.durability <= 0 };
}

/**
 * Apply armor to incoming damage.
 * Vests reduce body shots; helmets reduce headshots.
 * Returns the final damage after armor and updates armor durability.
 */
export function applyArmor(state: ArmorState, rawDamage: number, headshot: boolean): { damage: number; absorbed: number; broken: boolean } {
  let remaining = rawDamage;
  let absorbed = 0;
  let broken = false;

  if (headshot && state.helmet) {
    const res = absorbWith(state.helmet, remaining);
    absorbed += res.absorbed;
    remaining = res.remaining;
    if (res.broken) {
      state.helmet = null;
      broken = true;
    }
  } else if (!headshot && state.vest) {
    const res = absorbWith(state.vest, remaining);
    absorbed += res.absorbed;
    remaining = res.remaining;
    if (res.broken) {
      state.vest = null;
      broken = true;
    }
  }

  return { damage: Math.max(0, Math.round(remaining)), absorbed, broken };
}

export function emptyArmor(): ArmorState {
  return { vest: null, helmet: null };
}

/** Build a small world pickup for armor crates/helmets. */
export function createArmorPickupMesh(slot: ArmorSlot, level: ArmorLevel) {
  const group = new THREE.Group();
  const color = level === 1 ? 0x8ee36d : level === 2 ? 0x3f8fff : level === 3 ? 0xc77dff : 0xffd23f;
  const boxMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 });

  if (slot === "vest") {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.35), boxMat);
    box.position.y = 0.18;
    group.add(box);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), glowMat);
    glow.position.y = 0.18;
    group.add(glow);
  } else {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), boxMat);
    dome.position.y = 0.24;
    group.add(dome);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), glowMat);
    glow.position.y = 0.24;
    group.add(glow);
  }

  // floating label plate
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  plate.position.y = 0.62;
  plate.rotation.x = -Math.PI / 6;
  group.add(plate);

  group.userData["armorSlot"] = slot;
  group.userData["armorLevel"] = level;
  return group;
}

/** True if the new armor is better than the existing piece (or there is none). */
export function shouldPickupArmor(current: ArmorPiece | null, level: ArmorLevel) {
  if (!current) return true;
  return level > current.level;
}

/** Equip a piece, returning the replaced piece if any. */
export function equipArmor(state: ArmorState, slot: ArmorSlot, level: ArmorLevel): ArmorPiece | null {
  const old = state[slot];
  state[slot] = createArmorPiece(slot, level);
  return old;
}

export function armorTotalAbsorb(state: ArmorState) {
  return (state.vest?.absorb ?? 0) + (state.helmet?.absorb ?? 0);
}

/**
 * Pet companions.
 *
 * Every pet is a real animated GLB (KTX2/ETC1S textures capped at 720x720,
 * meshopt-compressed geometry, T-pose clips stripped at build time so the
 * rig can never snap into a T-pose). Pets are bought with Gold or Shards,
 * a player can own many but only equip one at a time, can be renamed, and
 * they idle/act in the lobby plus follow the player in a match.
 */

export type PetId = "nibbles" | "sable" | "biscuit" | "zest";

/** clip reference: a case-insensitive name fragment, or an index into the GLB's clip list */
export type ClipRef = string | number;

export type PetEffect = {
  damageTaken?: number;
  damageDealt?: number;
  speed?: number;
  regen?: number;
  gold?: number;
  reload?: number;
  /** medkit channel speed multiplier (2 = twice as fast) */
  healSpeed?: number;
  /** enemies inside this radius (metres) are pinged on the minimap */
  senseRadius?: number;
  /** digs up an inhaler every N seconds */
  fetchEvery?: number;
};

export type Pet = {
  id: PetId;
  name: string;
  species: string;
  blurb: string;
  /** signature ability shown in the UI */
  ability: { name: string; text: string };
  color: number;
  accent: number;
  model: {
    url: string;
    /** uniform scale so every pet lands around knee height */
    scale: number;
    /** vertical offset applied after scaling, in metres */
    y: number;
    /** model-space yaw correction so the pet faces +Z */
    yaw: number;
  };
  clips: {
    idle: ClipRef;
    walk: ClipRef | null;
    run: ClipRef | null;
    /** random lobby/idle flavour acts, played once then blended back to idle */
    acts: ClipRef[];
  };
  effect: PetEffect;
  /** free starter pet — owned from the first boot */
  free: boolean;
  price: { currency: "gold" | "shards"; cost: number };
};

export const PETS: Record<PetId, Pet> = {
  nibbles: {
    id: "nibbles",
    name: "Nibbles",
    species: "Root sprite",
    blurb: "A jittery carrot sprite that hoards field supplies in its leaves.",
    ability: {
      name: "Field Rations",
      text: "Medkits apply twice as fast while Nibbles is equipped.",
    },
    color: 0xff8a3d,
    accent: 0x8ee36d,
    model: { url: "/models/pets/carrot.glb", scale: 2.1, y: 0, yaw: 0 },
    clips: { idle: 0, walk: null, run: null, acts: [1] },
    effect: { healSpeed: 2 },
    free: true,
    price: { currency: "gold", cost: 0 },
  },
  sable: {
    id: "sable",
    name: "Sable",
    species: "Doberman",
    blurb: "Ex-security hound. Nose first, questions later.",
    ability: {
      name: "Scent Sweep",
      text: "Pings every enemy within 30 m on your minimap.",
    },
    color: 0x2b2f38,
    accent: 0xff8a3d,
    model: { url: "/__l5e/assets-v1/2ac5b0f6-7b11-4dbf-b3ea-05dde377fb01/doberman.glb", scale: 0.9, y: 0, yaw: 0 },
    clips: {
      idle: "Idle",
      walk: "WalkLoop",
      run: "RunLoop",
      acts: ["Sniff", "Restless", "Bark1", "Ready2", "Barking"],
    },
    effect: { senseRadius: 30 },
    free: false,
    price: { currency: "gold", cost: 4500 },
  },
  biscuit: {
    id: "biscuit",
    name: "Biscuit",
    species: "Puppy",
    blurb: "Small, fast, and utterly convinced your ammo is a toy.",
    ability: {
      name: "Fetch",
      text: "Reloads 15% faster and digs up an inhaler every 45 s.",
    },
    color: 0xd9a05b,
    accent: 0xfff0d6,
    model: { url: "/models/pets/puppy.glb", scale: 1.0, y: 0, yaw: 0 },
    clips: {
      idle: "IdleEnergetic",
      walk: "Walk",
      run: "Run",
      acts: ["IdleLayDown", "IdleEnergetic"],
    },
    effect: { reload: 0.85, fetchEvery: 45 },
    free: false,
    price: { currency: "gold", cost: 2500 },
  },
  zest: {
    id: "zest",
    name: "Zest",
    species: "Citrus familiar",
    blurb: "A bottled-lightning citrus familiar that keeps you standing.",
    ability: {
      name: "Zest Shield",
      text: "Regenerates 2 HP/s and shaves 4% off incoming damage.",
    },
    color: 0xf5e050,
    accent: 0x8ee36d,
    model: { url: "/models/pets/leminha.glb", scale: 1.0, y: 0, yaw: 0 },
    clips: { idle: 0, walk: null, run: null, acts: [0] },
    effect: { regen: 2, damageTaken: 0.96 },
    free: false,
    price: { currency: "shards", cost: 300 },
  },
};

export const PET_LIST = Object.values(PETS);

export const defaultPet = (): PetId => "nibbles";

/** every pet that is owned from the first boot */
export const starterPets = (): PetId[] => PET_LIST.filter((p) => p.free).map((p) => p.id);

const KEY = "ironhowl.pet.v1";
const NAME_KEY = "ironhowl.petnames.v1";

export function loadPet(): PetId {
  if (typeof window === "undefined") return defaultPet();
  try {
    const id = window.localStorage.getItem(KEY);
    return id && id in PETS ? (id as PetId) : defaultPet();
  } catch {
    return defaultPet();
  }
}

export function savePet(id: PetId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* private mode */
  }
}

export function loadPetNames(): Partial<Record<PetId, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NAME_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<PetId, string>> = {};
    for (const [k, v] of Object.entries(saved)) {
      if (k in PETS && typeof v === "string" && v.trim()) out[k as PetId] = v.trim().slice(0, 16);
    }
    return out;
  } catch {
    return {};
  }
}

export function savePetNames(names: Partial<Record<PetId, string>>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAME_KEY, JSON.stringify(names));
  } catch {
    /* private mode */
  }
}

/** display name: the player's nickname if set, else the pet's default name */
export function petDisplayName(p: { petNames?: Partial<Record<PetId, string>> }, id: PetId) {
  return p.petNames?.[id]?.trim() || PETS[id].name;
}

export function isPetOwned(p: { ownedPets?: PetId[] }, pet: Pet) {
  return pet.free || (p.ownedPets ?? []).includes(pet.id);
}

/** kept for older call sites: ownership is what gates a pet now */
export function isPetUnlocked(p: { ownedPets?: PetId[] }, pet: Pet) {
  return isPetOwned(p, pet);
}

export function petPriceLabel(pet: Pet) {
  if (pet.free) return "Free";
  return `${pet.price.cost.toLocaleString()} ${pet.price.currency === "gold" ? "Gold" : "Shards"}`;
}

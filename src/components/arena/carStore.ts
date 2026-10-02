/**
 * Garage catalogue — the store-facing metadata for the drivable cars.
 *
 * This is the pure-data half of the car feature, deliberately split from
 * `carModel.ts` the same way `pets.ts` is split from `petModel.ts`: the rig
 * module drags in three.js, the GLTFLoader and the KTX2 transcoder, and
 * `playerProfile.ts` must not pull any of that into its import graph just to
 * know which car is selected. So price / class / blurb / ownership live here,
 * keyed by the same car id as `CARS` in `carModel.ts`, and nothing in this file
 * imports three.
 *
 * The shop UI is the one place that needs both halves — it reads the driving
 * stats (top speed, accel…) from `CARS` and the price/class from here — and it
 * iterates the live `CAR_IDS` from `carModel`, so a new roster entry shows up in
 * the store automatically. An id with no entry here just falls back to
 * `FALLBACK_ENTRY` (a mid-priced "Vehicle"), which keeps a freshly-added car
 * buyable instead of crashing the grid.
 */

export type CarClass = "Muscle" | "Sport" | "Heavy" | "Monster" | "Vehicle";

export type CarStoreEntry = {
  /** shown as the class chip and drives the accent colour */
  klass: CarClass;
  /** one-line flavour for the preview panel */
  blurb: string;
  /** gold cost; 0 means it is a free starter */
  price: number;
  /** owned from the first boot — never charged, always equippable */
  free: boolean;
  /**
   * 600x600 card art for the garage tiles and the profile. Optional, because a car can be
   * added to the rig and sold here before anyone draws it — `FALLBACK_ENTRY` has none, and
   * BannerArt falls back to the class chip.
   */
  banner?: string;
};

export const CAR_STORE: Record<string, CarStoreEntry> = {
  corvette: {
    klass: "Muscle",
    blurb: "Free starter. Big American V8 with a low, mean stance.",
    price: 0,
    free: true,
    banner: "/banners/car-corvette.jpg",
  },
  gtr: {
    klass: "Sport",
    blurb: "Twin-turbo all-wheel-drive missile. The garage flagship.",
    price: 4500,
    free: false,
    banner: "/banners/car-gtr.jpg",
  },
  truck70: {
    klass: "Heavy",
    blurb: "A '70s workhorse pickup — slow, heavy and completely unbothered.",
    price: 3000,
    free: false,
    banner: "/banners/car-truck70.jpg",
  },
  monster: {
    klass: "Monster",
    blurb: "Lifted brute on 1.7 m tyres. It does not go around obstacles.",
    price: 8000,
    free: false,
    banner: "/banners/car-monster.jpg",
  },
};

/** Anything in the roster but not priced above is still sellable at this default. */
export const FALLBACK_ENTRY: CarStoreEntry = {
  klass: "Vehicle",
  blurb: "A drivable machine.",
  price: 3500,
  free: false,
};

/** Accent per class — mirrors the pet colour / skin-rarity colour convention (0xRRGGBB). */
export const CAR_CLASS_COLORS: Record<CarClass, number> = {
  Muscle: 0xff8a3d,
  Sport: 0x7dd3fc,
  Heavy: 0x9ca3af,
  Monster: 0xa855f7,
  Vehicle: 0x8ee36d,
};

export function carEntry(id: string): CarStoreEntry {
  return CAR_STORE[id] ?? FALLBACK_ENTRY;
}

/** The car every profile owns and drives on the first boot. */
export const defaultCar = (): string => "corvette";

/** Every car owned from the first boot (the free ones). */
export const starterCars = (): string[] =>
  Object.keys(CAR_STORE).filter((id) => CAR_STORE[id]?.free);

/** Free cars are always owned; the rest have to be in the profile's owned list. */
export function isCarOwned(owned: string[] | undefined, id: string): boolean {
  return carEntry(id).free || (owned ?? []).includes(id);
}

export function carPriceLabel(id: string): string {
  const e = carEntry(id);
  return e.free ? "Free" : `${e.price.toLocaleString()} Gold`;
}

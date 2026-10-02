/**
 * Weapon prop loader + hand socket.
 *
 * A fighter's shots leave from the EYE, never from the gun (see `shoot()` in LoneWolfArena) — the
 * weapon model is purely cosmetic. So this module's whole job is to hang the right GLB in the
 * character's RIGHT HAND, oriented so both hands land on it, and to swap it when the player
 * changes weapon. Nothing here reads or drives aim.
 *
 * The GLB is parsed once per URL and cached; every fighter holding the same gun gets a cheap
 * `clone(true)` that SHARES geometry and materials with the cached original. The model is not
 * skinned (it is a rigid prop bolted to a bone), so a plain clone is enough — no SkeletonUtils.
 *
 * SOCKET NUMBERS. The rig's bones carry a uniform world scale of 0.01 (Mixamo cm->m), so a child
 * of `RightHand` needs local scale 100 to render at its authored size and its local translation is
 * in bone units (metres x 100). The transforms below were SOLVED, not eyeballed: the operative's
 * rifle-idle pose holds the hands 0.4396 m apart and this M4's grip-to-handguard span is 0.440 m —
 * a 0.4 mm match — so "muzzle along the hand-to-hand axis" seats both hands on the weapon with the
 * gun inheriting the pose's natural cant. See tools/solve-weapon-socket.cjs.
 *
 * DO THESE NUMBERS SURVIVE A SECOND CHARACTER? Mostly yes, and the reason is worth writing down
 * because the intuition points the wrong way.
 *
 * Every transform here is expressed in RightHand's LOCAL space. It is not a world offset, so it
 * does not care where the hand is — a character 15 cm shorter holds the hand 15 cm lower and the
 * gun rides along, already correct. What a shorter character changes is the bone's world SCALE, and
 * that is where the catch is: `scale` below cancels a 0.01 bone scale specifically. Import a
 * character authored at 0.9 of the operative's size and its RightHand world scale is 0.009, so
 * every gun renders 10% smaller — proportionate to the hand holding it, which is arguably right for
 * a hand and definitely wrong for a rifle. A rifle is the same rifle in anyone's hands.
 *
 * So the expected outcome for new characters is:
 *   - same skeleton, same bone names, same 0.01 scale (a re-proportioned Mixamo rig, which is the
 *     normal case): these numbers carry over UNCHANGED, no re-tune.
 *   - same skeleton at a different unit scale: no re-tune either, but `scale` needs dividing by the
 *     ratio, once, globally — not per weapon.
 *   - a genuinely different rig with different bone names or a different hand-axis convention: that
 *     one needs its own table, and /weapon-lab is how it gets built.
 *
 * Nothing here needs changing until a second body actually lands; the point of the note is that the
 * fix, if one is needed, is one number and not nineteen.
 */


import * as THREE from "three";
import { makeGltfLoader } from "./ktx2";

/** How a weapon's prop sits inside the RightHand bone. */
export type WeaponProp = {
  url: string;
  /** local position on RightHand, in BONE units (metres x 100 — the bone's world scale is 0.01) */
  position: [number, number, number];
  /** local rotation on RightHand, quaternion [x, y, z, w] */
  quaternion: [number, number, number, number];
  /** cancels the bone's 0.01 world scale so the model renders at its true size */
  scale: number;
  /** muzzle tip in the gun's OWN model space (metres), reserved for a per-weapon muzzle marker */
  muzzle: [number, number, number];
  /**
   * Recentre and rescale the model's CONTENT to the roster convention (centred on the origin,
   * longest axis spanning 2.0) before the socket transform is applied.
   *
   * Needed for exports whose node hierarchy was never baked. The katana is the case that forced
   * this: its glTF nests the mesh under five nodes carrying translations up to 196 units and
   * scales from 0.022 to 89, so the mesh renders hundreds of metres from the scene root. Its raw
   * vertex data measures the same as its siblings (span 2.0, origin-centred), which is exactly why
   * the offset is invisible to a vertex-bounds check and the prop "loads" into nowhere.
   *
   * Leave it off for models whose mesh already sits at their scene root — recentring those would
   * invalidate the socket positions solved against their existing origin.
   */
  normalize?: boolean;
};

/**
 * The span every normalised weapon model occupies on its longest axis. `normalize` rescales content
 * to this so a `scale` number means the same thing across the roster.
 */
const NORMALISED_SPAN = 2.0;

/**
 * Wrap a freshly cloned weapon model so the socket transform acts on a predictable origin.
 *
 * Always returns an outer holder to hang on the bone: the socket writes position/quaternion/scale to
 * the HOLDER, while any recentring lives on the inner clone. Keeping those on separate objects means
 * a normalised prop is still tuned with the same slider numbers as every other one.
 *
 * `Box3.setFromObject` is safe here in a way it is not for characters — a weapon prop is rigid, not
 * skinned, so there is no bind-pose/bone mismatch to read the wrong matrices through.
 */
export function prepareProp(scene: THREE.Object3D, prop: WeaponProp): THREE.Object3D {
  const holder = new THREE.Group();
  holder.add(scene);
  if (!prop.normalize) return holder;
  scene.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return holder;
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  const k = longest > 1e-6 ? NORMALISED_SPAN / longest : 1;
  // Scale about the model's own centre: shrink first, then pull the (now scaled) centre to origin.
  scene.scale.multiplyScalar(k);
  scene.position.sub(centre.multiplyScalar(k));
  return holder;
}

/**
 * The weapons that have a real model. Everything not listed here keeps the placeholder rifle box
 * that `buildBot` bolts to the fighter — so adding a gun is: drop its GLB under
 * public/models/weapons/, solve its socket, add one entry.
 */
export const WEAPON_PROPS: Record<string, WeaponProp> = {
  // CARBINE-9 (weapon id "m4a1"). Sketchfab M4A1, muzzle down +X in its own space.
  // Tuned on /weapon-lab 2026-08-27.
  m4a1: {
    url: "/models/weapons/m4a1.glb",
    position: [3.153, 23, 5.982],
    quaternion: [-0.6474, -0.7399, -0.1488, 0.1066],
    scale: 78.6,
    muzzle: [0.475, 0.08, 0],
  },

  // The Tripo-authored roster below shares a normalisation (barrel along the model's own +Z, thin
  // along X, +Y up). The socket started from one shared solve; each was then fine-tuned by eye on
  // /weapon-lab (2026-08-27) — position in bone units, quaternion [x,y,z,w], scale cancels the
  // bone's 0.01 world scale. Muzzle tip sits at the +Z end.
  ak47:   { url: "/models/weapons/ak47.glb",   position: [0.967, 25, 3.796],       quaternion: [-0.3938, -0.4834, -0.5243, 0.5799], scale: 100,  muzzle: [0, 0, 0.5] },
  scar:   { url: "/models/weapons/scar.glb",   position: [5.339, 25, 6.111],       quaternion: [-0.3507, -0.5515, -0.5574, 0.5119], scale: 77.2, muzzle: [0, 0, 0.5] },
  mp40:   { url: "/models/weapons/mp40.glb",   position: [1.224, 23, 6.368],       quaternion: [-0.3165, -0.4732, -0.5759, 0.5867], scale: 73.8, muzzle: [0, 0, 0.5] },
  ump:    { url: "/models/weapons/ump.glb",    position: [2.767, 11.512, 2.767],   quaternion: [-0.3416, -0.4201, -0.6098, 0.5788], scale: 75.7, muzzle: [0, 0, 0.5] },
  m1014:  { url: "/models/weapons/m1014.glb",  position: [3.024, 25, 6.882],       quaternion: [-0.3451, -0.4303, -0.6199, 0.558],  scale: 70.9, muzzle: [0, 0, 0.5] },
  spas12: { url: "/models/weapons/spas12.glb", position: [3.796, 22, 8.683],       quaternion: [-0.3432, -0.4324, -0.6011, 0.5779], scale: 79.1, muzzle: [0, 0, 0.5] },
  awm:    { url: "/models/weapons/awm.glb",    position: [7.397, 27, 10.097],      quaternion: [-0.3971, -0.3835, -0.6334, 0.5423], scale: 76.7, muzzle: [0, 0, 0.5] },
  kar98k: { url: "/models/weapons/kar98k.glb", position: [4.182, 29, 9.84],        quaternion: [-0.3432, -0.4324, -0.6011, 0.5779], scale: 72.8, muzzle: [0, 0, 0.5] },
  m249:   { url: "/models/weapons/m249.glb",   position: [7.011, 20, 7.783],       quaternion: [-0.3758, -0.4035, -0.621, 0.5571],  scale: 84.4, muzzle: [0, 0, 0.5] },

  // .50 hand cannon. Its mesh spans z in [-1, 1] (length 2.0) where the rifles span 1.0, so it
  // needs a much smaller scale to read as a pistol. Tuned on /weapon-lab 2026-08-27.
  deagle: { url: "/models/weapons/deagle.glb", position: [2.253, 14.984, 7.011],   quaternion: [-0.3636, -0.4148, -0.595, 0.5845],  scale: 27,   muzzle: [0, 0, 1] },

  // MELEE. Raw Tripo scans, each normalised to span 2.0 on ITS long axis (knife +Z, katana +X,
  // axe +Y). All three hand-tuned on /weapon-lab: axe 2026-08-27, knife + katana 2026-08-28.
  // `normalize: true` on the katana is NOT a tuned value — it is a property of that export's
  // unbaked node hierarchy (see the flag's own comment above) and must survive any re-paste of
  // position/quaternion/scale from the lab, which does not serialise it.
  knife:  { url: "/models/weapons/knife.glb",  position: [6.013, 25, 10.458],  quaternion: [-0.4767, -0.2818, -0.5451, 0.6294], scale: 44.6, muzzle: [0, 0, 1] },
  katana: { url: "/models/weapons/katana.glb", position: [12.157, 48, 18.824], quaternion: [0.0179, 0.2162, -0.7527, 0.6216],   scale: 47.5, muzzle: [1, 0, 0], normalize: true },
  axe:    { url: "/models/weapons/axe.glb",    position: [56, 20, -4.049],         quaternion: [0.326, 0.092, -0.4356, 0.834],      scale: 44.9, muzzle: [0, 1, 0] },
};

type Loaded = { scene: THREE.Object3D };

const cache = new Map<string, Promise<Loaded>>();

/**
 * Weapons load through the page's ONE transcoder (`ktx2.ts`), not their own.
 *
 * This module used to keep a private `KTX2Loader`, which is what printed "Multiple active KTX2
 * loaders may cause performance issues" in the console: every instance downloads its own copy of
 * the basis transcoder and spawns its own pool of web workers, and each of those workers holds a
 * WASM heap that never shows up in `usedJSHeapSize`. Two pools instead of one is invisible in the
 * heap profiler and very visible in the tab's memory footprint — which matters most here, because
 * a battle-royale drop creates eighteen weapon pickups in a row.
 */
function makeLoader(renderer?: THREE.WebGLRenderer) {
  return makeGltfLoader(renderer);
}

/** Parse (once) and cache a weapon GLB. */
export function loadWeaponModel(url: string, renderer?: THREE.WebGLRenderer): Promise<Loaded> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = new Promise<Loaded>((resolve, reject) => {
    makeLoader(renderer).load(
      url,
      (gltf) => {
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          // Matches the fighters: lighting is baked and grounding is the blob sprite, so no gun
          // casts or receives shadows.
          m.castShadow = false;
          m.receiveShadow = false;
        });
        resolve({ scene: gltf.scene });
      },
      undefined,
      reject,
    );
  });
  cache.set(url, p);
  return p;
}

/** Warm the cache for a weapon id without building a socket. */
export function preloadWeapon(weaponId: string, renderer?: THREE.WebGLRenderer) {
  const prop = WEAPON_PROPS[weaponId];
  if (!prop) return Promise.resolve(null);
  return loadWeaponModel(prop.url, renderer).catch(() => null);
}

export type WeaponSocket = {
  /**
   * Show `weaponId`'s prop in the hand. A no-op if it is already showing. For an id with no model,
   * the hand is cleared and `onProp(false)` fires so the caller can put the placeholder box back.
   */
  set: (weaponId: string) => void;
  dispose: () => void;
};

/**
 * A weapon socket bolted to one fighter's RightHand bone.
 *
 * `onProp(hasRealProp)` is called every time the held model changes: true when a real gun is now
 * in the hand (hide the placeholder box), false when there is none (show it). It is the caller's
 * job to toggle the box — this module never touches the fighter's other meshes.
 */
export function createWeaponSocket(opts: {
  bone: THREE.Object3D;
  renderer?: THREE.WebGLRenderer;
  onProp: (hasRealProp: boolean) => void;
}): WeaponSocket {
  let currentId: string | null = null;
  let current: THREE.Object3D | null = null;
  // Bumped on every `set` so an earlier gun's async load can't land after a later swap and leave
  // two guns in the hand.
  let token = 0;

  const clear = () => {
    if (current) {
      current.removeFromParent();
      current = null;
    }
  };

  const set = (weaponId: string) => {
    if (weaponId === currentId) return;
    currentId = weaponId;
    const myToken = ++token;
    clear();
    const prop = WEAPON_PROPS[weaponId];
    if (!prop) {
      opts.onProp(false);
      return;
    }
    loadWeaponModel(prop.url, opts.renderer)
      .then(({ scene }) => {
        if (myToken !== token) return; // superseded by a later swap
        const g = prepareProp(scene.clone(true), prop); // shares geometry + materials with the cache
        g.position.set(prop.position[0], prop.position[1], prop.position[2]);
        g.quaternion.set(prop.quaternion[0], prop.quaternion[1], prop.quaternion[2], prop.quaternion[3]);
        g.scale.setScalar(prop.scale);
        opts.bone.add(g);
        current = g;
        opts.onProp(true);
      })
      .catch((err) => {
        if (myToken !== token) return;
        // Leave the placeholder box in place — an invisible gun is better than a missing one, and
        // the cause is almost always a missing public/models/weapons/*.glb.
        console.error("[weapon] prop failed to load", prop.url, err);
        opts.onProp(false);
      });
  };

  return {
    set,
    dispose: () => {
      token++;
      clear();
    },
  };
}

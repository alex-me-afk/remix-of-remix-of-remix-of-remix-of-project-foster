/**
 * Pet model loader + animation rig.
 *
 * Every pet GLB ships meshopt-compressed geometry and KTX2/ETC1S textures
 * (max 720x720), so a single loader with the transcoder + meshopt decoder is
 * shared and every parsed GLB is cached per URL. Instances are skeleton-cloned
 * from that cache, which keeps a second pet on screen essentially free.
 *
 * The rig always starts on the pet's idle clip — T-pose clips are stripped
 * from the GLBs, so the bind pose can never be shown. Flavour "acts" play
 * once, then cross-fade back to idle.
 */

import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import { makeGltfLoader } from "./ktx2";
import type { ClipRef, Pet } from "./pets";

type Loaded = { scene: THREE.Object3D; clips: THREE.AnimationClip[] };

const cache = new Map<string, Promise<Loaded>>();

/** Parse (once) and cache a pet GLB. */
export function loadPetModel(url: string, renderer?: THREE.WebGLRenderer): Promise<Loaded> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = new Promise<Loaded>((resolve, reject) => {
    makeGltfLoader(renderer).load(
      url,
      (gltf) => {
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = false;
          m.receiveShadow = false;
          m.frustumCulled = true;
        });
        resolve({ scene: gltf.scene, clips: gltf.animations ?? [] });
      },
      undefined,
      reject,
    );
  });
  cache.set(url, p);
  return p;
}

/** Warm the cache for a pet without building a rig. */
export function preloadPet(pet: Pet, renderer?: THREE.WebGLRenderer) {
  return loadPetModel(pet.model.url, renderer).catch(() => null);
}

function pickClip(clips: THREE.AnimationClip[], ref: ClipRef | null | undefined): THREE.AnimationClip | null {
  if (ref == null || clips.length === 0) return null;
  if (typeof ref === "number") return clips[ref] ?? null;
  const needle = ref.toLowerCase();
  return (
    clips.find((c) => c.name.toLowerCase().includes(needle)) ??
    null
  );
}

export type PetRig = {
  /** add this to your scene; the model sits inside, already scaled and offset */
  root: THREE.Group;
  /** advance the mixer */
  update: (dt: number) => void;
  /** pick locomotion from ground speed (m/s) */
  setSpeed: (speed: number) => void;
  /** play a random flavour act (no-op while one is already playing) */
  act: () => void;
  /** true while a one-shot act is playing */
  acting: () => boolean;
  /** names of the clips actually found in the GLB (debug/UI) */
  clipNames: string[];
  dispose: () => void;
};

/**
 * Build an animated instance of a pet. `renderer` is required the first time a
 * KTX2 pet is loaded in a given context so the transcoder can detect support.
 */
export async function createPetRig(pet: Pet, renderer?: THREE.WebGLRenderer): Promise<PetRig> {
  const loaded = await loadPetModel(pet.model.url, renderer);
  const model = cloneSkeleton(loaded.scene);
  model.scale.setScalar(pet.model.scale);
  model.position.y = pet.model.y;
  model.rotation.y = pet.model.yaw;

  const root = new THREE.Group();
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const idleClip = pickClip(loaded.clips, pet.clips.idle) ?? loaded.clips[0] ?? null;
  const walkClip = pickClip(loaded.clips, pet.clips.walk);
  const runClip = pickClip(loaded.clips, pet.clips.run);
  const actClips = pet.clips.acts
    .map((r) => pickClip(loaded.clips, r))
    .filter((c): c is THREE.AnimationClip => !!c);

  const action = (clip: THREE.AnimationClip | null) => {
    if (!clip) return null;
    const a = mixer.clipAction(clip);
    a.enabled = true;
    return a;
  };

  const idle = action(idleClip);
  const walk = action(walkClip);
  const run = action(runClip);

  // Start on idle immediately so the very first rendered frame is a real pose.
  let current: THREE.AnimationAction | null = idle;
  idle?.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  mixer.update(0);

  let actAction: THREE.AnimationAction | null = null;

  const fadeTo = (next: THREE.AnimationAction | null, dur = 0.28) => {
    if (!next || next === current) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (current) next.crossFadeFrom(current, dur, false);
    current = next;
  };

  const finished = (e: { action: THREE.AnimationAction }) => {
    if (e.action !== actAction) return;
    const done = actAction;
    actAction = null;
    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
      idle.crossFadeFrom(done, 0.3, false);
      current = idle;
    }
  };
  mixer.addEventListener("finished", finished as unknown as (e: THREE.Event) => void);

  const rig: PetRig = {
    root,
    clipNames: loaded.clips.map((c) => c.name),
    update: (dt) => mixer.update(dt),
    setSpeed: (speed) => {
      if (actAction) return; // let a one-shot finish
      if (speed > 3.2 && run) fadeTo(run, 0.2);
      else if (speed > 0.35 && walk) fadeTo(walk, 0.22);
      else fadeTo(idle);
    },
    acting: () => !!actAction,
    act: () => {
      if (actAction || actClips.length === 0) return;
      const clip = actClips[Math.floor(Math.random() * actClips.length)];
      if (!clip) return;
      const a = mixer.clipAction(clip);
      if (!a) return;
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.setEffectiveWeight(1).play();
      if (current) a.crossFadeFrom(current, 0.25, false);
      actAction = a;
      current = a;
    },
    dispose: () => {
      mixer.removeEventListener("finished", finished as unknown as (e: THREE.Event) => void);
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      root.removeFromParent();
      // Geometry/materials are shared with the cached original — only the
      // cloned scene graph is dropped here.
      root.clear();
    },
  };
  return rig;
}

/** Random-act scheduler: fires every 6–14 s so the pet feels alive without spamming. */
export function makeActTimer(min = 6, max = 14) {
  let next = min + Math.random() * (max - min);
  return (dt: number) => {
    next -= dt;
    if (next > 0) return false;
    next = min + Math.random() * (max - min);
    return true;
  };
}

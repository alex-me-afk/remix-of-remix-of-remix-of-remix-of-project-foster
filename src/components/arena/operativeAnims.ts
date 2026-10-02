/**
 * The shared operative clip library: load, measure, strip root motion, split into
 * upper/lower body layers.
 *
 * ARCHITECTURE. `public/models/operative-anims.glb` holds no mesh — just one
 * armature and one clip per animation. three.js binds animation tracks to nodes BY
 * NAME, so these clips drive ANY character whose bones match, and every operative is
 * a mesh-only GLB that reuses this one library. Baking the clips into each character
 * would ship the same 16 animations once per operative.
 *
 * Bone-name matching is therefore the entire contract, which is why the Blender step
 * (`tools/mixamo-to-glb.py`) strips Mixamo's `mixamorig9:` namespace off both bones
 * and fcurve paths. A prefix mismatch binds zero tracks and fails SILENTLY — the
 * character stands in its bind pose with no error in the console.
 *
 * WHY THE UPPER/LOWER SPLIT EXISTS. Reloading while running has to move the arms from
 * the reload clip and the legs from the run clip. The obvious approach — play both at
 * weight 1 — does not work: three.js's PropertyMixer computes a running weighted
 * AVERAGE, so two full-body actions both addressing `RightArm` produce 50% reload and
 * 50% arm-swing. So the locomotion clips get split too, and the layers are kept
 * disjoint: legs come only from `lower`, arms only from `upper`, and the upper weights
 * of a stance sum to 1 with whatever action is overriding them. Crouching comes free —
 * `Hips` lives in the lower layer and the upper body just hangs off it.
 *
 * WHAT IS NOT DONE HERE. Aim pitch is not a clip: rotate `Spine1`/`Spine2` in code
 * AFTER `mixer.update()` in the same frame, or the mixer overwrites it. Crouch camera
 * height is `walkPhysics.eyeHeight()`, which snaps and wants a tween.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export const OPERATIVE_ANIMS_URL = "/models/operative-anims.glb";

/**
 * Nyx's own unarmed idle, in its own bundle.
 *
 * Nyx alone plays this in place of the shared library's `breathing_idle` — it was authored on
 * her skeleton, so it carries her bone lengths and her stance; every other operative keeps the
 * shared clip. Separate bundle because it is a per-character override: folding it into the
 * shared library (which every operative loads) would give the rest a clip they never play.
 * Loaded once at startup for a body in `CUSTOM_IDLE_OPERATIVE_MODELS`, immediately after the
 * shared library, and merged via `addClips` exactly as dances are. Built by
 * `tools/idle-women-to-glb.py` from `assets-src/idle-women/Idle.fbx` — the `-women` naming is
 * just what the source pack was called.
 *
 * The url itself lives in `characters.ts` (which asset an operative wears is the roster's
 * business, and that file stays free of three.js so `preload.ts` can read it); re-exported
 * here so the loader side has it beside the other two bundle urls.
 */
export { OPERATIVE_IDLE_WOMEN_URL } from "./characters";
import { OPERATIVE_IDLE_WOMEN_URL } from "./characters";

/**
 * The emote/dance clips, in their own bundle.
 *
 * Split from the main library on purpose: operative-anims.glb loads at boot because the
 * lobby idle lives in it, and dances are opt-in — most sessions never open the wheel — so
 * they lazy-load on first use. Same mesh-less, bind-by-name contract, so these clips drive
 * whichever operative is on screen. Built by `tools/mixamo-dances-to-glb.py`.
 */
export const OPERATIVE_DANCES_URL = "/models/operative-dances.glb";

/**
 * The bone the upper layer starts at. `Hips` + `Spine` + legs stay lower; this bone
 * and everything under it is upper.
 *
 * This is the one dial worth touching. Cutting lower (`Spine`) gives a cleaner
 * reload pose but throws away the run's torso lean; cutting higher (`Spine2`)
 * keeps the lean but flattens the reload's shoulder work.
 */
export const UPPER_BODY_ROOT = "Spine1";

/**
 * The one bone whose translation is motion rather than skeleton.
 *
 * Every other bone's local translation is its length — see `retargetTracks`. The pelvis'
 * translation is where the body is, which is what root motion means.
 */
export const ROOT_BONE = "Hips";

/** Below this, a clip's travel is treated as noise rather than a stride. */
const IN_PLACE_SPEED = 0.05;

/**
 * Stride speed for clips that arrived with root motion already removed, m/s.
 *
 * Some Mixamo downloads come with the "In Place" toggle on, so their Hips never travel and
 * `measureStrideSpeed` correctly reports 0. That is a problem, not a curiosity: a stride
 * speed of 0 marks a clip `stationary`, playback rate stays pinned at 1 no matter how fast
 * the character moves, and the feet slide.
 *
 * Recovering the real number from the clip would mean forward-kinematics on the foot bones
 * — sampling the planted toe's backward travel per cycle — which needs a live skeleton at
 * load time. These values are borrowed from the travelling clip of the same motion family
 * instead (`walking` 0.89, `rifle_run` 2.76), which is not exact but is strictly better
 * than 1.0: rate now SCALES with speed instead of ignoring it, so the slide stays
 * proportional rather than growing without bound as the character speeds up.
 *
 * Re-downloading any of these without "In Place" is the real fix and drops its line here.
 */
const NOMINAL_STRIDE: Record<string, number> = {
  // batch 2 — unarmed / pistol / rifle walks (borrowed from `walking` / `walking_backwards`)
  walk_unarmed: 0.89,
  walk_backward_unarmed: 0.98,
  walk_forward_rifle: 0.89,
  pistol_walk: 0.89,
  // batch 3 — unarmed runs (borrowed from `rifle_run` 2.76 / `run_backwards` 2.37). The two
  // prone advances have no travelling twin in the library, so they are hand-set to a low
  // crawl: prone_forward is the faster leopard-crawl, prone_crawl the belly crawl.
  run_unarmed: 2.76,
  run_backward_unarmed: 2.37,
  prone_forward: 0.7,
  prone_crawl: 0.5,
};

// ---------------------------------------------------------------------------
// axis convention
// ---------------------------------------------------------------------------

/**
 * Which of a bone track's three channels points along world up.
 *
 * This is NOT the obvious answer, and assuming it is silently zeroes the wrong
 * channel. Blender's glTF exporter converts its Z-up world to glTF's Y-up by putting
 * a +90 degrees X rotation on the ROOT NODE rather than rewriting the animation data,
 * so bone tracks stay in Blender's convention underneath it. Rendering is unaffected
 * (three.js applies the root transform) but raw track numbers come out transposed:
 * measured on this export, track Y is world forward and track Z is world up.
 *
 * Derived from the root node's own rotation instead of hardcoded, so a re-export that
 * changes convention recomputes rather than lying. `tools/verify-anims.ts` prints the
 * result of the same derivation next to a real AnimationMixer's world-space readings.
 */
function verticalChannel(rootQuaternion: THREE.Quaternion): 0 | 1 | 2 {
  const v = new THREE.Vector3();
  let best: 0 | 1 | 2 = 1;
  let bestDot = -Infinity;
  for (const i of [0, 1, 2] as const) {
    v.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(rootQuaternion);
    // abs: a channel that maps to world DOWN is still the vertical channel.
    const dot = Math.abs(v.y);
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// root motion
// ---------------------------------------------------------------------------

function hipsPositionTrack(clip: THREE.AnimationClip) {
  return clip.tracks.find((t) => t.name === `${ROOT_BONE}.position`) as
    | THREE.VectorKeyframeTrack
    | undefined;
}

/**
 * Ground speed the clip was authored at, in m/s.
 *
 * This is the number that stops the feet sliding: set
 * `action.timeScale = actualSpeed / strideSpeed` and the footfalls travel as far as
 * the character does. It is also why root motion was deliberately NOT stripped at
 * download time — Mixamo's "In Place" toggle would have destroyed the measurement.
 *
 * `scale` is the armature node's scale (0.01 for a Mixamo import, which exports at
 * 100x). Track values live in the Hips' parent space and carry that factor.
 */
export function measureStrideSpeed(
  clip: THREE.AnimationClip,
  vertical: 0 | 1 | 2,
  scale: number,
): number {
  const t = hipsPositionTrack(clip);
  if (!t || clip.duration <= 0) return 0;
  const v = t.values;
  const last = v.length - 3;
  let sq = 0;
  for (const i of [0, 1, 2] as const) {
    if (i === vertical) continue; // vertical bob is not travel
    const d = (v[last + i]! - v[i]!) * scale;
    sq += d * d;
  }
  return Math.sqrt(sq) / clip.duration;
}

/**
 * A copy of the clip with horizontal root translation removed — Mixamo's "In Place",
 * reproduced.
 *
 * The horizontal channels are HELD AT THEIR FIRST VALUE rather than set to zero.
 * Zeroing would also discard the Hips' rest offset from the armature origin and snap
 * the character sideways; only the accumulating travel should go. Vertical is kept
 * untouched so the walk still has its bob and the jump still has its hop.
 */
export function stripRootMotion(
  clip: THREE.AnimationClip,
  vertical: 0 | 1 | 2,
): THREE.AnimationClip {
  const out = clip.clone();
  const t = hipsPositionTrack(out);
  if (!t) return out;
  const v = t.values;
  const n = v.length / 3;
  for (let k = 1; k < n; k++) {
    for (const i of [0, 1, 2] as const) {
      if (i === vertical) continue;
      v[k * 3 + i] = v[i]!;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// layer split
// ---------------------------------------------------------------------------

/** Names of every bone from `UPPER_BODY_ROOT` down, read off the real hierarchy. */
export function upperBodyBones(skeletonRoot: THREE.Object3D): Set<string> {
  const start = skeletonRoot.getObjectByName(UPPER_BODY_ROOT);
  const names = new Set<string>();
  if (!start) {
    console.warn(
      `[operativeAnims] no '${UPPER_BODY_ROOT}' bone — layer split disabled, ` +
        "upper-body actions will fight locomotion for the legs",
    );
    return names;
  }
  start.traverse((o) => {
    if (o.name) names.add(o.name);
  });
  return names;
}

/**
 * Split a clip into two clips whose track sets do not overlap.
 *
 * Disjoint is the point. If a bone appeared in both layers, the mixer would average
 * the two contributions and the layering would silently half-apply.
 */
export function splitClip(
  clip: THREE.AnimationClip,
  upperNames: Set<string>,
): { upper: THREE.AnimationClip; lower: THREE.AnimationClip } {
  const upper: THREE.KeyframeTrack[] = [];
  const lower: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const bone = track.name.split(".")[0]!;
    (upperNames.has(bone) ? upper : lower).push(track.clone());
  }
  return {
    upper: new THREE.AnimationClip(`${clip.name}__upper`, clip.duration, upper),
    lower: new THREE.AnimationClip(`${clip.name}__lower`, clip.duration, lower),
  };
}

// ---------------------------------------------------------------------------
// retargeting
// ---------------------------------------------------------------------------

/**
 * Drop the tracks that make a SHARED clip library skeleton-specific.
 *
 * This is the difference between "one clip library drives every operative" working and only
 * appearing to work. Blender's glTF exporter bakes translation AND scale for every bone, not
 * just the root, so each clip in `operative-anims.glb` carries 65 translation channels and 65
 * scale channels beside its 65 rotations. A glTF translation channel is an ABSOLUTE local
 * offset, and an absolute local offset IS the bone's length — it is the character's skeleton,
 * not the character's motion. Play it on a different body and the mixer overwrites every bone
 * offset with the LIBRARY character's, i.e. it silently retargets the mesh onto Howl's
 * proportions one joint at a time. Measured against the library's rest pose:
 *
 *   howl    every bone 0.00 cm off   (the library was authored from this body — it looks right)
 *   ember   worst LeftFoot 4.6 cm
 *   onyx    worst HeadTop_End 7.8, ForeArm 5.1   (shortens his forearms, moves his face)
 *   vireo   worst Head 5.6, Arm 5.6
 *   nyx     worst Neck 19.2, Shoulder 13.9, Arm 7.5   (her 9.1 cm upper arm becomes 16.6)
 *   lumen   worst Hips 18.5, Foot 17.4, Neck 6.0      (her 12.4 cm neck becomes 17.6 — +42%)
 *
 * That is the whole "the new characters look broken" bug: stretched necks, wrong arm lengths,
 * a head sitting off the shoulders. Nothing was wrong with the meshes.
 *
 * Dropping the channels is LOSSLESS, not a trade. Measured across all 46 clips: the worst
 * non-Hips translation drifts 0.0001 cm over an entire clip and the worst scale deviates
 * 0.00001 from 1.0 — they are constants, so removing them leaves each bone at exactly the
 * value the track was writing, for the library's own body, while every other body keeps its
 * own. It also deletes 6.2 MB of the 10.26 MB anims file's animation data and two thirds of
 * the mixer's per-frame interpolation work, which matters at 30 characters.
 *
 * `Hips.position` is KEPT: that one is real motion — the walk's travel (see
 * `measureStrideSpeed`) and the bob and hop that `stripRootMotion` deliberately preserves.
 * Its residual per-character rest offset is corrected in the rig, after the mixer, where the
 * character's own bind pose is known — see `createOperativeRig`.
 */
export function retargetTracks(clip: THREE.AnimationClip): THREE.AnimationClip {
  // REVERTED 2026-09-03: pass-through. The strip this used to do (drop every non-root
  // translation + all scale) together with the rest-pose rebase in `createOperativeRig` that
  // relied on it flung every body's limbs straight out — all characters "exploded". Playing the
  // full clips as authored is the behaviour that worked. The long comment above describes the
  // reverted experiment, NOT current behaviour.
  return clip;
}

// ---------------------------------------------------------------------------
// library
// ---------------------------------------------------------------------------

export type ClipEntry = {
  name: string;
  /** Root motion intact. Kept for anything that wants to drive movement FROM the clip. */
  raw: THREE.AnimationClip;
  /** Horizontal root translation removed. This is what gameplay plays. */
  inPlace: THREE.AnimationClip;
  /** Upper body only (`Spine1` and down), root motion already stripped. */
  upper: THREE.AnimationClip;
  /** Hips, spine base and legs, root motion already stripped. */
  lower: THREE.AnimationClip;
  duration: number;
  /** m/s the clip was authored at; 0 for an in-place clip. */
  strideSpeed: number;
  /** true when the clip never travels, so timeScale needs no calibration. */
  stationary: boolean;
};

export type ClipLibrary = {
  clips: Map<string, ClipEntry>;
  /** Bind-pose skeleton the clips were authored against. No mesh. */
  skeleton: THREE.Object3D;
  /** Armature node scale — 0.01 for a Mixamo import. */
  scale: number;
  /** Track channel that points along world up. */
  vertical: 0 | 1 | 2;
  /**
   * Yaw the character mesh needs so the clips' forward matches the engine's.
   *
   * Measured, not assumed: `walking` travels +Z in world space while three.js and
   * glTF treat -Z as forward, so the mesh is authored facing backwards relative to a
   * movement vector and needs turning around. Apply this to the model's parent
   * group, never to the bones.
   */
  meshYaw: number;
  get(name: string): ClipEntry | undefined;
};

/** Build the processed library from a loaded GLB. Pure — no network, no cache. */
export function buildClipLibrary(
  skeleton: THREE.Object3D,
  animations: THREE.AnimationClip[],
): ClipLibrary {
  const root = (skeleton.children[0] ?? skeleton) as THREE.Object3D;
  const scale = root.scale.x || 1;
  const vertical = verticalChannel(root.quaternion);
  const upperNames = upperBodyBones(skeleton);

  const clips = new Map<string, ClipEntry>();
  for (const source of animations) {
    // BEFORE anything else measures or splits it: every stage below inherits the track set,
    // and a per-bone translation or scale track left in here would be baked into `upper`,
    // `lower` and `inPlace` alike and then written to whichever body plays them.
    const raw = retargetTracks(source);
    const measured = measureStrideSpeed(raw, vertical, scale);
    // A nominal only applies when the clip really has no travel of its own; a re-export
    // WITH root motion must win over the fallback silently and automatically.
    const strideSpeed =
      measured >= IN_PLACE_SPEED ? measured : (NOMINAL_STRIDE[raw.name] ?? measured);
    const inPlace = stripRootMotion(raw, vertical);
    const { upper, lower } = splitClip(inPlace, upperNames);
    clips.set(raw.name, {
      name: raw.name,
      raw,
      inPlace,
      upper,
      lower,
      duration: raw.duration,
      strideSpeed,
      stationary: strideSpeed < IN_PLACE_SPEED,
    });
  }

  return {
    clips,
    skeleton,
    scale,
    vertical,
    // Derived from the clip data in tools/verify-anims.ts, which drives a real mixer
    // and reads the Hips' world matrix; +Z travel against -Z engine forward is 180.
    meshYaw: Math.PI,
    get: (name) => clips.get(name),
  };
}

let cached: Promise<ClipLibrary> | null = null;

/**
 * Fists-only extras + the basketball throw, in their own small bundle.
 *
 * Built by `scripts/fbx-to-anim-glb.ts` straight from Mixamo FBX (no Blender): it reuses the
 * shared library's own skeleton, so the clips bind and measure exactly like the main library's.
 * Merged into the shared library at load, so every rig sees them. A failed load is non-fatal —
 * `locomotionClip` / callers fall back to the older clips when a key is missing.
 */
export const OPERATIVE_UNARMED_EXTRA_URL = "/models/operative-unarmed-extra.glb";

/** Load and process the clip library. Parsed once per page. */
export function loadOperativeAnims(): Promise<ClipLibrary> {
  if (cached) return cached;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const load = (url: string) =>
    new Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>((resolve, reject) =>
      loader.load(url, (g) => resolve({ scene: g.scene, animations: g.animations ?? [] }), undefined, reject),
    );
  cached = Promise.all([
    load(OPERATIVE_ANIMS_URL),
    load(OPERATIVE_UNARMED_EXTRA_URL).catch((err) => {
      console.warn("[operativeAnims] unarmed extras failed to load", err);
      return null;
    }),
  ]).then(([main, extra]) => {
    const lib = buildClipLibrary(main.scene, main.animations);
    if (extra) {
      for (const e of buildClipLibrary(extra.scene, extra.animations).clips.values()) {
        if (!lib.clips.has(e.name)) lib.clips.set(e.name, e);
      }
    }
    return lib;
  });
  return cached;
}

let cachedIdleWomen: Promise<Map<string, ClipEntry>> | null = null;

/**
 * Load the authored-idle bundle and return its processed clip (just one: `breathing_idle_f`).
 *
 * Called by `createOperativeRig` for a body listed in `CUSTOM_IDLE_OPERATIVE_IDS` (keyed by
 * url — Nyx only, because the clip was authored on her skeleton), immediately after the shared
 * library loads and before the rig's initial `setMotion`. The returned map is merged into that
 * rig via `addClips`, so `locomotionClip` resolves the unarmed idle to this clip for her and to
 * the shared `breathing_idle` for everyone else.
 * Parsed once per page; the loader is cached identically to the shared library and the dances.
 *
 * TRACKS OFF THE CONTRACT ARE DROPPED. This idle was authored on a 73-bone rig — the 65-bone
 * skeleton every operative body agrees on, plus `Neck1` and `Cloak1`..`Cloak7`. No body in the
 * roster has those eight (verified against all six GLBs), so their tracks would bind to nothing
 * and three.js would warn once per track per rig — console noise that reads like a broken asset.
 * The shared library's own skeleton IS the bone-name contract, so it is what filters them, which
 * also means a future re-export that adds more off-contract bones cleans itself up.
 */
export function loadOperativeIdleWomen(): Promise<Map<string, ClipEntry>> {
  if (cachedIdleWomen) return cachedIdleWomen;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  cachedIdleWomen = new Promise<Map<string, ClipEntry>>((resolve, reject) => {
    loader.load(
      OPERATIVE_IDLE_WOMEN_URL,
      (gltf) => {
        loadOperativeAnims()
          .then((shared) => {
            const contract = new Set<string>();
            shared.skeleton.traverse((o) => {
              if (o.name) contract.add(o.name);
            });
            const clips = (gltf.animations ?? []).map((clip) => {
              const kept = clip.tracks.filter((t) => contract.has(t.name.split(".")[0]!));
              if (kept.length === clip.tracks.length) return clip;
              console.info(
                `[operativeAnims] ${clip.name}: dropped ${clip.tracks.length - kept.length} ` +
                  "track(s) for bones no operative body has",
              );
              return new THREE.AnimationClip(clip.name, clip.duration, kept);
            });
            resolve(buildClipLibrary(gltf.scene, clips).clips);
          })
          .catch(reject);
      },
      undefined,
      reject,
    );
  });
  return cachedIdleWomen;
}

let cachedDances: Promise<Map<string, ClipEntry>> | null = null;

/**
 * Lazy-load the dance bundle and return its processed clips, keyed by the ids in `DANCES`.
 *
 * Same processing as the main library — split at `UPPER_BODY_ROOT`, root motion removed —
 * so a travelling breakdance is pinned in place and a dance can be layered or claim both
 * channels exactly like any other clip. Parsed once per page; the emote wheel calls this
 * the first time it opens and merges the result into a rig with `rig.addClips`.
 */
export function loadOperativeDances(): Promise<Map<string, ClipEntry>> {
  if (cachedDances) return cachedDances;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  cachedDances = new Promise<Map<string, ClipEntry>>((resolve, reject) => {
    loader.load(
      OPERATIVE_DANCES_URL,
      (gltf) => resolve(buildClipLibrary(gltf.scene, gltf.animations ?? []).clips),
      undefined,
      reject,
    );
  });
  return cachedDances;
}

// ---------------------------------------------------------------------------
// semantic clip names
// ---------------------------------------------------------------------------

/**
 * Gameplay meaning -> clip name in the GLB.
 *
 * The indirection earns its keep on the strafes. Mixamo shipped four files named
 * `strafe left`, `strafe right`, `strafe` and `strafe (2)`, and the last two say
 * nothing about direction. Measuring them settled it (`tools/verify-anims.ts`):
 *
 *   strafe_left   +lateral  1.23 m/s  -> walk left
 *   strafe_right  -lateral  0.68 m/s  -> walk right
 *   strafe_2      +lateral  2.43 m/s  -> RUN left
 *   strafe        -lateral  2.88 m/s  -> RUN right
 *
 * The two Mixamo-named files establish which lateral sign is "left"; the unnamed pair
 * match on sign and are ~2x the speed, so they are the run pair. Renaming the source
 * files would have been the other fix, but then the mapping would live in a filename
 * nobody reads instead of next to the measurement that proves it.
 */
export const CLIP = {
  idle: "rifle_aiming_idle",
  walkForward: "walking",
  walkBackward: "walking_backwards",
  walkLeft: "strafe_left",
  walkRight: "strafe_right",
  runForward: "rifle_run",
  runBackward: "run_backwards",
  runLeft: "strafe_2",
  runRight: "strafe",
  jump: "rifle_jump",
  turnLeft: "turn_left",
  turnRight: "turning_right_45_degrees",
  // Upper-body actions. `fire` is on this list deliberately — playing a full-body
  // firing clip freezes the legs mid-stride.
  fire: "firing_rifle",
  reload: "reloading",
  grenade: "toss_grenade",
  hit: "hit_reaction",

  // --- second batch -------------------------------------------------------
  // Crouch. Closes the gap MISSING_CLIPS used to list: crouching was previously the
  // lower layer of a standing clip under a lowered camera, which reads as a normal
  // walk filmed from knee height.
  crouchIdle: "crouch_idle",
  crouchWalk: "crouch_walk",
  /**
   * Unarmed stance and locomotion, for the lobby, the character select and any state
   * where no weapon is in the character's hands. `idle` is wrong there: it holds a
   * rifle that isn't rendered, so the hands cup empty air.
   */
  idleUnarmed: "breathing_idle",
  /**
   * The women's unarmed idle — Nyx only — in place of `idleUnarmed`.
   *
   * Lives in `operative-idle-women.glb`, a separate bundle that loads only for a body listed
   * in `CUSTOM_IDLE_OPERATIVE_IDS`. The clip key is deliberately NOT `breathing_idle`: the
   * bundle is merged into a rig that already has the shared library loaded, and `addClips`'
   * guard (`if (!has)`) would silently skip it if the names collided. So it is uniquely
   * named, and that rig remaps `idleUnarmed` → this key via `useCustomIdle`. Everyone else
   * never loads the bundle and always hits `breathing_idle`.
   *
   * It was authored on Nyx and carries HER bone lengths and HER stance, which is why Vireo and
   * Lumen do not play it — see the note on CUSTOM_IDLE_OPERATIVE_IDS in characters.ts.
   */
  idleUnarmedCustom: "breathing_idle_f",
  walkForwardUnarmed: "walk_unarmed",
  walkBackwardUnarmed: "walk_backward_unarmed",
  /** Pistol carry, for a secondary weapon class. No pistol run in the library yet. */
  walkPistol: "pistol_walk",
  /**
   * Purpose-authored walk-and-fire, and the one clip here that overlaps something the
   * layer system already covers (`fire`'s upper over `walkForward`'s lower). Worth
   * having anyway: an authored clip has the weight shift and the recoil settling into
   * the stride, which averaging two independent clips cannot invent. Full-body, so it
   * is NOT in UPPER_ONLY — play it instead of a locomotion+fire pair, not on top.
   */
  fireWalking: "firing_rifle_walking",
  /**
   * A second rifle-carry walk, 30 frames against `walkForward`'s 41. Kept alongside
   * rather than replacing it — which one reads better in game is a call to make with
   * the camera on.
   */
  walkForwardAlt: "walk_forward_rifle",

  // --- third batch: melee ---------------------------------------------------
  /**
   * Blade stance and swing, for the katana and the axe ONLY.
   *
   * Neither the rifle nor the unarmed set works for a two-handed blade: `idle` cups an
   * invisible rifle and `idleUnarmed` drops the hands to the sides, so a katana held in
   * either reads as a gun or as nothing. These two come from `Standing Idle.fbx` and
   * `Standing Melee Attack Horizontal.fbx`, renamed on ingest (see BATCH2_CLIPS in
   * tools/mixamo-to-glb.py) so the keys don't collide with the existing idle/fire names.
   *
   * `meleeAttack` is a horizontal slash — a FULL-BODY swing with a hip rotation, so it is
   * deliberately NOT in UPPER_ONLY: layering it over a walk would keep the legs square
   * while the torso turns, which is exactly the disconnect the authored clip avoids.
   */
  meleeIdle: "melee_idle",
  meleeAttack: "melee_attack",

  // --- fourth batch: prone, skydive, revive, driving, unarmed jumps --------
  /**
   * Battle-royale skydive. `freefall` is the belly-down air loop the drop plane
   * releases into; `hardLanding` is the one-shot brace that plays as the ground comes
   * up and blends into `idleUnarmed` on its last frame. There is no parachute clip or
   * mesh — the whole fall reads from the body pose (see skydive.ts).
   */
  freefall: "freefall",
  hardLanding: "hard_landing",
  /**
   * Prone. A full stance set — idle, crawl forward, reload, and one turn clip that is
   * MIRRORED in code for the other side (only the legs move in a prone turn). All are
   * rifle-carry; prone is a rifle-only stance. `proneCrawl` doubles as the
   * downed-but-alive crawl in battle royale.
   */
  proneIdle: "prone_idle",
  proneForward: "prone_forward",
  proneCrawl: "prone_crawl",
  proneReload: "prone_reload",
  proneTurn: "prone_turn",
  /**
   * Death crumples, played for a beat before the loot bag replaces the body. Matched to
   * the stance the fighter died in; `deathBack` is the unarmed backward fall.
   */
  rifleDeath: "rifle_death",
  proneDeath: "prone_death",
  deathBack: "death_back",
  /**
   * Crouch transitions. `standToCrouch` is unarmed and reversible (played backwards for
   * crouch->stand); `crouchToProne` drops into the prone set; `crouchIdleUnarmed` is the
   * no-gun crouch hold, distinct from `crouchIdle` above which carries a rifle.
   */
  standToCrouch: "stand_to_crouch",
  crouchToProne: "crouch_to_prone",
  crouchIdleUnarmed: "crouch_idle_unarmed",
  /** Jumps for the non-rifle classes. `jumpUnarmed` also covers the katana/axe classes. */
  jumpUnarmed: "jump_unarmed",
  pistolJump: "pistol_jump",
  /** Unarmed run, forward and back. `runUnarmed` also drives the katana/axe run. */
  runUnarmed: "run_unarmed",
  runBackwardUnarmed: "run_backward_unarmed",
  /** Revive a downed teammate (Mixamo "Administering CPR"). */
  revive: "revive",
  /** Seated pose for the driver of a car. */
  sitCar: "sit_car",
  /** Full-body grenade throw; the alternate to the upper-body `grenade` toss. */
  throwGrenade: "throw_grenade",

  // --- fifth batch: fists only + basketball (operative-unarmed-extra.glb) ----
  /** Fists walk with real root motion (replaces the in-place `walk_unarmed` for bare hands). */
  walkForwardFists: "walk_unarmed_v2",
  /** Bare-hands sidestep, left / right. Fists only — not katana/axe, not guns. */
  strafeLeftFists: "strafe_left_unarmed",
  strafeRightFists: "strafe_right_unarmed",
  /** Punch combo for the fists "weapon". Upper body, so the legs keep walking. */
  punch: "punch_combo",
  /** Taking a punch to the face, while holding fists. Upper body. */
  hitFists: "hit_face_unarmed",
  /** Friend Island basketball shot (Mixamo "Goalie Throw"). Full body. */
  basketballThrow: "basketball_throw",
} as const;

/** Clips that must only ever be played on the upper layer. */
export const UPPER_ONLY: ReadonlySet<string> = new Set([
  CLIP.fire,
  CLIP.reload,
  CLIP.proneReload,
  CLIP.grenade,
  CLIP.hit,
  CLIP.punch,
  CLIP.hitFists,
]);

/**
 * The emote wheel, in ring order. `id` is the clip key in `operative-dances.glb`; `label`
 * is what the wheel prints. All unlocked for now — the dance shop is deferred, so nothing
 * here reads a purchase flag yet. Adding a dance is one line here plus one entry in
 * `DANCE_CLIPS` in the Blender converter.
 */
export const DANCES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "gangnam_style", label: "Gangnam" },
  { id: "hip_hop_dancing", label: "Hip Hop" },
  { id: "robot_hip_hop", label: "Robot" },
  { id: "bboy", label: "B-Boy" },
  { id: "breakdance_1", label: "Breaker I" },
  { id: "breakdance_3", label: "Breaker II" },
  { id: "thriller", label: "Thriller" },
] as const;

/**
 * Clips the library still needs, in rough order of how visible their absence is.
 * Every one is a Mixamo download away; they are listed here so the gap is legible in
 * code rather than living in a chat log.
 *
 * The fourth batch (see BATCH3_CLIPS in tools/mixamo-to-glb.py) closed the big three
 * this list used to open with — falling/air idle (`freefall`), death (`rifle_death` /
 * `prone_death` / `death_back`) and the prone set (`prone_idle` / `prone_crawl`). What
 * is left is one genuine gap plus one that is faked acceptably:
 */
export const MISSING_CLIPS = [
  "crouch strafe left / right (crouch_walk is forward only)",
  "prone turn right — faked by mirroring prone_turn in code; a real clip would be cleaner",
] as const;

/**
 * Operative (player character) model loader + animation rig.
 *
 * The character GLB is mesh-only; every clip comes from the shared library in
 * `operativeAnims.ts`. See that file for why: three.js binds tracks to nodes by NAME, so
 * one library of 24 clips drives all operatives instead of shipping the clips once per
 * character.
 *
 * TWO CHANNELS, NOT ONE MIXER-FULL-OF-ACTIONS. Every clip is entered as an (upper, lower)
 * pair and each half goes into its own channel, because three.js's PropertyMixer computes
 * a weighted AVERAGE rather than an override: two full-body actions at weight 1 both
 * writing `RightArm` give 50% of each, not the second one. Within a channel the track sets
 * are identical, so a cross-fade there is exactly the blend it looks like. Across channels
 * they are disjoint, so reload-while-running works. A full-body clip (jump, death,
 * fireWalking) is just a clip that claims both channels at once.
 *
 * AIM PITCH IS APPLIED INSIDE `update`, after `mixer.update`, deliberately. Anything the
 * clips key gets overwritten by the mixer, so a caller doing `rig.update(dt)` and then
 * rotating the spine itself would work while a caller doing it the other way round would
 * silently get nothing. Sequencing it here removes the trap.
 *
 * THIRTY CHARACTERS. BR runs 30 players on hardware that includes phones, and a skinned
 * mesh costs on both the CPU (mixer + bone matrices, ~65 bones each) and the GPU. So
 * `update` takes a distance and drops the mixer's tick rate with it, accumulating the
 * skipped dt so animation keeps real time. Textures and geometry are shared across
 * instances by `cloneSkeleton`, so VRAM is per-model, not per-player.
 */

import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import { makeGltfLoader } from "./ktx2";

import {
  CLIP,
  ROOT_BONE,
  UPPER_ONLY,
  type ClipEntry,
  type ClipLibrary,
  loadOperativeAnims,
  loadOperativeIdleWomen,
} from "./operativeAnims";
import { OPERATIVE_BODY_URL, hasCustomIdle, ownLengthBones } from "./characters";

// Re-exported so a caller that only wants to load a body doesn't have to reach into the
// roster. The roster owns the value: it is what decides which asset an operative wears.
export { OPERATIVE_BODY_URL };

/** Above this ground speed the locomotion set switches from walk to run. */
const RUN_SPEED = 3.2;
/** Extra playback speed for left/right sidestep clips. */
const STRAFE_RATE_BOOST = 1.5;
/** Below this, the character is standing still. */
const IDLE_SPEED = 0.35;
/**
 * Below this, a PRONE character is holding position rather than crawling.
 *
 * Much lower than `IDLE_SPEED` because a crawl is genuinely slow — the arena moves a prone
 * player at 3.4 (against 8 walking), and after the velocity low-pass a real crawl can sit
 * near 0.2 m/s. Reusing the standing cutoff would leave a crawling fighter in `prone_idle`
 * sliding across the floor, which is the exact artefact rate-matching exists to avoid.
 */
const PRONE_MOVE_SPEED = 0.12;

/**
 * How far playback rate may be pushed to match actual speed before it looks wrong.
 *
 * Rate-matching is what stops the feet sliding, but a clip authored at 1.2 m/s played at
 * 3x is a cartoon. Past these bounds the slide is the lesser artefact.
 */
const RATE_MIN = 0.6;
const RATE_MAX = 1.75;

const UP = new THREE.Vector3(0, 1, 0);

type Loaded = { scene: THREE.Object3D };

const cache = new Map<string, Promise<Loaded>>();

/**
 * Parse (once) and cache a character GLB.
 *
 * `renderer` is required the first time any KTX2 asset loads in a context, so the
 * transcoder can pick a target format the GPU actually supports. Without it the textures
 * fail to decode and the character renders untextured — pass it.
 */
export function loadOperativeBody(
  url: string = OPERATIVE_BODY_URL,
  renderer?: THREE.WebGLRenderer,
): Promise<Loaded> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = new Promise<Loaded>((resolve, reject) => {
    makeGltfLoader(renderer).load(
      url,
      (gltf) => {
        gltf.scene.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (!(m as THREE.Mesh).isMesh) return;
          m.castShadow = true;
          m.receiveShadow = false;
          m.frustumCulled = true;
          // three.js culls a skinned mesh against its BIND-POSE bounding sphere times the
          // mesh's world matrix, which knows nothing about where the bones have moved. A
          // clip that reaches (grenade toss, death) can push geometry outside it and the
          // whole character pops out mid-animation. Padding is cheap; the alternative is
          // recomputing the sphere per frame or disabling culling for 30 characters.
          const sphere = m.geometry?.boundingSphere;
          if (sphere) sphere.radius *= 1.6;
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

/** Warm both caches so the first spawn doesn't hitch. */
export function preloadOperative(url = OPERATIVE_BODY_URL, renderer?: THREE.WebGLRenderer) {
  return Promise.all([
    loadOperativeBody(url, renderer).catch(() => null),
    loadOperativeAnims().catch(() => null),
  ]);
}

// ---------------------------------------------------------------------------
// motion state
// ---------------------------------------------------------------------------

/**
 * What the rig needs to know to choose a pose, expressed as observable state rather than
 * as input.
 *
 * Velocity and yaw, NOT key presses: remote players in a networked match have no local
 * input, and a rig that reads input can only ever animate the local player. Everything
 * here is derivable from a position stream plus a couple of flag bits.
 */
export type OperativeMotion = {
  /** World-space velocity, m/s. Vertical component is ignored for clip choice. */
  velocity: THREE.Vector3;
  /** Facing, radians. The velocity is resolved against this to pick a strafe. */
  yaw: number;
  /**
   * Sprint key held. When given, the no-gun set picks run vs walk from this instead of the
   * speed threshold (normal on-foot speed sits above RUN_SPEED, so a plain walk read as a run).
   */
  sprinting?: boolean;
  crouched?: boolean;
  /**
   * Flat on the belly. Beats `crouched` (the arena already makes the two mutually exclusive)
   * but loses to `airborne` — a prone fighter who walks off a ledge is falling, not crawling
   * through the air. Every prone clip is rifle-carry: Mixamo has no unarmed prone, and prone
   * is a rifle stance here anyway, so `armed` is deliberately not consulted.
   */
  prone?: boolean;
  /**
   * Downed but not dead — the battle-royale bleed-out state, which crawls on its belly with
   * no weapon up instead of holding a firing position. Only meaningful with `prone`; ignored
   * otherwise. This is what `prone_crawl` (Mixamo "Crawling") exists for, as against
   * `prone_forward`, which is the aggressive rifle leopard-crawl.
   */
  downed?: boolean;
  /** Off the ground — jump or fall. */
  airborne?: boolean;
  /** Holding a weapon. False in the lobby and character select, where the rifle-carry
   *  clips read as cupping empty air. */
  armed?: boolean;
  /** Carrying a sidearm rather than a two-handed weapon. Selects the pistol-carry clip
   *  instead of the rifle stance; ignored unless `armed`. */
  pistol?: boolean;
  /** Holding a two-handed blade (katana or axe). Selects the melee stance instead of the
   *  rifle stance; ignored unless `armed`. Takes precedence over `pistol`. */
  blade?: boolean;
  /**
   * Battle-royale skydive pose, set while the drop director owns the body instead of the
   * walk controller. Overrides every other state: "freefall" is the belly-down air loop,
   * "flare" the brace-and-stand as the ground rushes up. Left undefined during normal play,
   * where locomotion picks the clip. The authored clip supplies the whole body pose, so the
   * director only has to face and move the container — see `faceRiggedBody` in skydive.ts.
   *
   * Explicitly `| undefined` rather than merely optional: `exactOptionalPropertyTypes` is on,
   * and the caller sets this from a ternary that yields undefined during normal play.
   */
  airPose?: "freefall" | "flare" | undefined;
};

/**
 * Pick the locomotion clip name for a motion state. Exported so tests can assert it.
 *
 * `useCustomIdle` remaps `breathing_idle` → `breathing_idle_f` for a body that ships its own
 * authored idle (Nyx, today); everyone else keeps the shared clip. Passed in by the rig, which
 * recognises such a body from its url (see createOperativeRig).
 */
export function locomotionClip(
  m: OperativeMotion,
  forward: number,
  side: number,
  useCustomIdle = false,
): string {
  const speed = Math.hypot(forward, side);
  const running = speed > RUN_SPEED;

  // Skydive overrides everything: the drop director owns the body, and the authored clip —
  // not a container tilt — supplies the belly-down dive and the brace-and-stand. Both loop
  // as locomotion (freefall for the whole fall, hard_landing across the short flare into the
  // touchdown), so no one-shot handoff is needed and the feet don't slide (both stationary).
  if (m.airPose === "freefall") return CLIP.freefall;
  if (m.airPose === "flare") return CLIP.hardLanding;

  if (m.airborne) {
    // Jump by weapon class. Unarmed and blade share the no-gun jump (a katana/axe jump reads
    // fine hands-down); a drawn sidearm gets the pistol jump; the rifle jump is the default
    // carry. All three are stationary full-body one-shots as far as the mixer is concerned.
    if (!m.armed || m.blade) return CLIP.jumpUnarmed;
    if (m.pistol) return CLIP.pistolJump;
    return CLIP.jump;
  }

  if (m.prone) {
    // Prone beats crouch (the arena makes them exclusive anyway) and is rifle-only — there is
    // no unarmed prone in the library, and a belly-down fighter with no gun is a rarity worth
    // trading for one less clip. Two advances, picked by intent rather than by speed: `downed`
    // is the bleed-out belly crawl, otherwise it's the rifle leopard-crawl. Both are slow, so
    // the speed threshold is IN-PLACE-ish rather than IDLE_SPEED: crawling barely registers as
    // movement, and using the standing idle cutoff would leave a crawler in the prone idle.
    if (speed < PRONE_MOVE_SPEED) return CLIP.proneIdle;
    return m.downed ? CLIP.proneCrawl : CLIP.proneForward;
  }

  if (m.crouched) {
    // Unarmed crouch uses the no-gun crouch idle; armed keeps the rifle crouch. There is no
    // unarmed crouch-WALK clip, so crouch_walk (rifle) drives every crouched move — it holds
    // a gun but stays low, which beats popping the character upright into a standing walk.
    if (speed < IDLE_SPEED) return m.armed ? CLIP.crouchIdle : CLIP.crouchIdleUnarmed;
    return CLIP.crouchWalk;
  }

  // Unarmed and two-handed blade share locomotion — the no-gun walks and runs, forward/back
  // only (Mixamo has no unarmed strafe) — and differ solely in the standing pose: a blade
  // holds its authored stance, bare hands breathe at the sides. Checked before pistol so a
  // melee weapon never picks the sidearm pose.
  if (!m.armed || m.blade) {
    if (speed < IDLE_SPEED) {
      if (m.blade) return CLIP.meleeIdle;
      return useCustomIdle ? CLIP.idleUnarmedCustom : CLIP.idleUnarmed;
    }
    // Fists only (not katana/axe): bare-hands sidesteps when sideways movement dominates,
    // and the root-motion walk forward.
    const fists = !m.armed && !m.blade;
    if (fists && Math.abs(side) > Math.abs(forward)) {
      return side >= 0 ? CLIP.strafeRightFists : CLIP.strafeLeftFists;
    }
    const run = m.sprinting ?? running;
    if (forward < 0) return run ? CLIP.runBackwardUnarmed : CLIP.walkBackwardUnarmed;
    if (run) return CLIP.runUnarmed;
    return fists ? CLIP.walkForwardFists : CLIP.walkForwardUnarmed;
  }

  // Sidearm carry. The library has a single pistol clip (a walk), so it drives every
  // moving state. Standing still, use the weapon-ready aim pose (hands up) — NOT the
  // unarmed breathing idle, whose hands hang at the sides: a drawn pistol fires from a
  // raised stance, and dropping the hands made shots read as leaving the chest.
  if (m.pistol) {
    return speed < IDLE_SPEED ? CLIP.idle : CLIP.walkPistol;
  }
  if (speed < IDLE_SPEED) return CLIP.idle;

  // Whichever axis dominates wins outright. Blending a forward and a strafe clip would
  // need both in the same channel, which averages them into a character walking at 45
  // degrees to both — worse than picking one.
  if (Math.abs(forward) >= Math.abs(side)) {
    if (forward >= 0) return running ? CLIP.runForward : CLIP.walkForward;
    return running ? CLIP.runBackward : CLIP.walkBackward;
  }
  if (side >= 0) return running ? CLIP.runRight : CLIP.walkRight;
  return running ? CLIP.runLeft : CLIP.walkLeft;
}

// ---------------------------------------------------------------------------
// rig
// ---------------------------------------------------------------------------

export type OperativeRig = {
  /** Add this to the scene. The model sits inside, already yaw-corrected. */
  root: THREE.Group;
  /** The cloned model itself, for parenting weapons to hand bones. */
  model: THREE.Object3D;
  /** A bone by name, e.g. `RightHand` for a weapon socket. */
  bone: (name: string) => THREE.Object3D | undefined;
  /**
   * Advance. `distance` is metres to the camera and controls the mixer's tick rate; pass
   * 0 for the local player. Skipped time is accumulated, not lost.
   */
  update: (dt: number, distance?: number) => void;
  /** Choose locomotion from observable state. Cheap — call every frame. */
  setMotion: (m: OperativeMotion) => void;
  /** Torso pitch for aiming, radians. Applied after the mixer, inside `update`. */
  setAimPitch: (radians: number) => void;
  /**
   * Play a one-shot. Upper-body clips (fire, reload, grenade, hit) leave the legs to
   * locomotion; a full-body clip claims both channels until it finishes.
   *
   * `reverse` plays the clip end-to-start, which is how one authored stance transition covers
   * both directions — `stand_to_crouch` reversed IS crouch-to-stand, and the library has no
   * separate clip for it.
   *
   * `hold` clamps the clip on its final frame and does NOT hand back to locomotion when it
   * finishes — for a terminal pose like a death crumple, which has to stay down rather than
   * pop back up into the standing idle the normal handoff would restore.
   */
  play: (
    clipName: string,
    opts?: { fade?: number; fullBody?: boolean; rate?: number; reverse?: boolean; hold?: boolean },
  ) => void;
  /**
   * Merge extra processed clips (e.g. the lazy-loaded dance bundle) into this rig's
   * library so `playDance`/`play` can find them. Idempotent — re-adding is a no-op.
   */
  addClips: (entries: Iterable<ClipEntry>) => void;
  /**
   * Start a looping full-body emote and hold it until `stopDance()` or the character
   * moves. Unlike `play`, a dance does not hand back on a `finished` event — it repeats.
   * The clip must already be in the library (see `addClips`).
   */
  playDance: (clipName: string) => void;
  /** Drop the current dance and fall back to locomotion. No-op if not dancing. */
  stopDance: () => void;
  /**
   * Drop any active one-shot — including a HELD death crumple whose `finished` event never
   * fired because the body was hidden before the clip ended — and let locomotion re-take both
   * channels. Called when a rig is reused (respawn); a full-body one-shot otherwise blocks
   * `setMotion`, so without this a respawned fighter would stay frozen in its death pose.
   */
  clearOneShot: () => void;
  /** The dance clip currently looping, or "" when not dancing. UI/debug. */
  currentDance: () => string;
  /** The clip currently driving the legs. Debug/UI. */
  currentClip: () => string;
  dispose: () => void;
};

type Channel = {
  action: THREE.AnimationAction | null;
  clip: string;
};

export async function createOperativeRig(opts?: {
  url?: string;
  renderer?: THREE.WebGLRenderer;
  lib?: ClipLibrary;
  castShadow?: boolean;
  /**
   * The uniform scale this rig will actually be drawn at, if its parent scales it. Nothing here
   * applies it — the caller owns the transform — it only feeds stride rate-matching, so the feet
   * keep up with the ground. See `rateFor`.
   */
  worldScale?: number;
}): Promise<OperativeRig> {
  const worldScale = opts?.worldScale && opts.worldScale > 0 ? opts.worldScale : 1;
  const url = opts?.url ?? OPERATIVE_BODY_URL;
  const customIdle = hasCustomIdle(url);
  const [loaded, lib] = await Promise.all([
    loadOperativeBody(url, opts?.renderer),
    opts?.lib ? Promise.resolve(opts.lib) : loadOperativeAnims(),
  ]);

  // Per-body idle override: a body whose own authored idle exists (Nyx, from
  // operative-idle-women.glb) plays it in place of the shared library's `breathing_idle`.
  // Loaded here before the rig's initial setMotion so the clip is already present when
  // locomotionClip first asks for it. Merged via addClips so such a rig has BOTH clips in its
  // library — the shared one and its own — and locomotionClip's `useCustomIdle` flag picks.
  //
  // This is per-BODY on purpose and must stay that way: a glTF clip carries absolute per-bone
  // translations, so it writes its authoring skeleton's bone lengths onto whoever plays it.
  // Handing this one to Vireo and Lumen arched Vireo's back and stretched Lumen's neck; see
  // CUSTOM_IDLE_OPERATIVE_IDS in characters.ts.
  if (customIdle) {
    try {
      const ownClips = await loadOperativeIdleWomen();
      for (const e of ownClips.values()) {
        if (!lib.clips.has(e.name)) lib.clips.set(e.name, e);
      }
    } catch (err) {
      console.error("[operativeModel] authored idle failed to load, falling back to shared idle", err);
    }
  }

  const model = cloneSkeleton(loaded.scene);
  if (opts?.castShadow === false) {
    model.traverse((o) => {
      (o as THREE.Mesh).castShadow = false;
    });
  }

  // Measured, not assumed: `walking` travels +Z while glTF forward is -Z, so the mesh is
  // authored facing away from its own movement. On the wrapper, never on the bones — the
  // clips address bones directly and a bone rotation here would be overwritten.
  const root = new THREE.Group();
  const yawFix = new THREE.Group();
  yawFix.rotation.y = lib.meshYaw;
  yawFix.add(model);
  root.add(yawFix);

  const mixer = new THREE.AnimationMixer(model);
  const bones = new Map<string, THREE.Object3D>();
  model.traverse((o) => {
    if (o.name && !bones.has(o.name)) bones.set(o.name, o);
  });

  // REVERTED 2026-09-03: the rest-pose rebase experiment was removed. It only made sense with
  // the STRIPPED clip library (rotation + root translation), which was also reverted — see
  // `retargetTracks`. With the full clips restored, rebasing the rest and then playing clips that
  // still carry every bone's full transform double-applied and flung every body's limbs straight
  // out. The bodies now play the clips directly, as before the experiment.

  const spine1 = bones.get("Spine1");
  const spine2 = bones.get("Spine2");
  /**
   * This body's OWN pelvis offset, captured from the clone's bind pose before any clip runs.
   *
   * `Hips.position` is the one translation track the library keeps (it is root motion, not bone
   * length — see `retargetTracks`), and its horizontal part is the library character's rest
   * offset from the armature origin, held constant by `stripRootMotion`. Written to a different
   * body it shifts the whole mesh away from the capsule the camera and hitboxes use: measured
   * 18.5 cm on Lumen and 4.7 cm on Vireo, 0.4 cm or less on everyone else. So the horizontal
   * channels are restored to this body's own value after the mixer, and only the vertical
   * channel — the walk's bob and the jump's hop, which is real motion — is left to the clip.
   */
  const hips = bones.get(ROOT_BONE);
  const hipsRest = hips?.position.clone();
  const vertical = lib.vertical;
  const pinHips = () => {
    if (!hips || !hipsRest) return;
    if (vertical !== 0) hips.position.x = hipsRest.x;
    if (vertical !== 1) hips.position.y = hipsRest.y;
    if (vertical !== 2) hips.position.z = hipsRest.z;
  };

  /**
   * Same idea as `pinHips`, aimed at a per-body list of bones: keep THIS body's own segment
   * lengths on the bones that read wrong when the shared library writes Howl's over them.
   *
   * Captured here, before the first `mixer.update`, so these are the GLB's true bind values.
   * Only translation and scale are restored — the rotation the clip keyed is left exactly as
   * the mixer wrote it, so the pose, the timing and the blends are unchanged; only the length
   * of the segment the pose is drawn on changes. `ownLengthBones` explains which bones qualify
   * and why the arms are not among them. Empty for four of the six bodies, and an empty list
   * makes this a no-op — the loop below does not run at all.
   */
  const ownRest = ownLengthBones(url)
    .map((name) => {
      const bone = bones.get(name);
      return bone ? { bone, position: bone.position.clone(), scale: bone.scale.clone() } : null;
    })
    .filter((v): v is { bone: THREE.Bone; position: THREE.Vector3; scale: THREE.Vector3 } => v !== null);

  const pinOwnLengths = () => {
    for (const r of ownRest) {
      r.bone.position.copy(r.position);
      r.bone.scale.copy(r.scale);
    }
  };
  // Pre-allocated: `update` runs per character per frame, and 30 of those allocating
  // quaternions is garbage-collector pressure for nothing.
  const pitchQ = new THREE.Quaternion();
  const PITCH_AXIS = new THREE.Vector3(1, 0, 0);

  const upper: Channel = { action: null, clip: "" };
  const lower: Channel = { action: null, clip: "" };

  /**
   * Cross-fade one channel to one half of a clip. Returns the action it started, or null
   * if it started nothing — which the caller needs, because "nothing" is a real outcome:
   * an upper-only clip has no lower half at all.
   */
  function enter(
    channel: Channel,
    entry: ClipEntry,
    half: "upper" | "lower",
    o: { loop: boolean; fade: number; rate: number; reverse?: boolean },
  ): THREE.AnimationAction | null {
    const clip = entry[half];
    if (clip.tracks.length === 0) return null; // e.g. an upper-only clip has no lower half
    if (channel.clip === entry.name && channel.action) {
      channel.action.setEffectiveTimeScale(o.rate);
      return channel.action;
    }
    const next = mixer.clipAction(clip);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1).setEffectiveTimeScale(o.reverse ? -o.rate : o.rate);
    if (o.loop) {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    } else {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    }
    // Playing backwards means STARTING at the end: `reset()` above put the playhead at 0, and a
    // negative timeScale from there is already past the clip, so the action would finish on its
    // first tick without ever posing the body. This is what makes one authored stand->crouch
    // double as the crouch->stand it has no clip for. Set after reset(), which zeroes `time`.
    if (o.reverse) next.time = clip.duration;
    next.play();
    if (channel.action && channel.action !== next) next.crossFadeFrom(channel.action, o.fade, false);
    channel.action = next;
    channel.clip = entry.name;
    return next;
  }

  /**
   * Playback rate that makes the footfalls travel as far as the character does.
   *
   * `strideSpeed` was measured off the clip at authored size. A rig rendered at a different scale
   * covers `worldScale` times as much ground per stride, so the rate has to come down by the same
   * factor or a scaled-up character skates — the classic "big model, feet spinning" tell.
   */
  function rateFor(entry: ClipEntry, speed: number) {
    if (entry.stationary || entry.strideSpeed <= 0) return 1;
    return THREE.MathUtils.clamp(speed / (entry.strideSpeed * worldScale), RATE_MIN, RATE_MAX);
  }

  let locomotion = "";
  /** Non-null while a one-shot owns the upper channel (and maybe the lower too). */
  let oneShot: { action: THREE.AnimationAction; fullBody: boolean; clip: string; hold: boolean } | null = null;
  /**
   * The dance clip name while an emote is looping, else "". A dance owns BOTH channels and,
   * unlike a one-shot, never ends on its own — it loops until `stopDance` or movement. It is
   * kept distinct from `oneShot` because the `finished` handoff must not touch it.
   */
  let dancing = "";
  const vel = new THREE.Vector3();
  // Remembered so `stopDance` can restore the exact locomotion state without the caller
  // having to re-send it (the lobby sets motion once, not per frame).
  let lastMotion: OperativeMotion = { velocity: new THREE.Vector3(), yaw: 0, armed: true };

  const setMotion = (m: OperativeMotion) => {
    lastMotion = m;

    // The blade swing is a long full-body one-shot. If the player switches OFF a blade while it
    // still owns the upper channel, that channel would otherwise stay frozen in the katana/axe
    // pose over a rifle or pistol — the "melee idle stuck on a gun" bug. Drop the swing the moment
    // the stance is no longer a blade so locomotion below re-claims both channels this same frame.
    if (oneShot && oneShot.clip === CLIP.meleeAttack && !m.blade) {
      oneShot = null;
      upper.clip = "";
      lower.clip = "";
    }

    vel.copy(m.velocity).setY(0).applyAxisAngle(UP, -m.yaw);
    // three.js forward is -Z, +X is right.
    const forward = -vel.z;
    const side = vel.x;
    const speed = Math.hypot(forward, side);

    // A dance holds while the character is still; any real movement (or leaving the ground)
    // breaks it and locomotion takes back over from this same call.
    if (dancing) {
      if (!m.airborne && speed < IDLE_SPEED) return;
      dancing = "";
    }

    const name = locomotionClip(m, forward, side, customIdle);
    const entry = lib.get(name) ?? lib.get(CLIP.idle);
    if (!entry) return;
    // Sidesteps read sluggish at stride-matched rate; play them faster.
    const sidestep = name === CLIP.walkLeft || name === CLIP.walkRight || name === CLIP.runLeft ||
      name === CLIP.runRight || name === CLIP.strafeLeftFists || name === CLIP.strafeRightFists;
    const rate = rateFor(entry, speed) * (sidestep ? STRAFE_RATE_BOOST : 1);
    // Longer fade into a stance than out of one: snapping to idle the frame movement
    // stops is the tell that gives away canned animation.
    const fade = entry.stationary ? 0.22 : 0.16;
    locomotion = entry.name;
    // A FULL-BODY one-shot owns the legs too, so locomotion must not re-enter the lower channel
    // underneath it. Without this guard the very next frame's setMotion cross-faded the legs
    // straight back to walking — which silently truncated every full-body clip to its upper half
    // (the blade swing kept square hips, a stance transition never left the ground, a death
    // crumple stayed standing). `locomotion` is still updated above so the `finished` handoff
    // knows what to return to.
    if (!oneShot?.fullBody) enter(lower, entry, "lower", { loop: true, fade, rate });
    if (!oneShot) enter(upper, entry, "upper", { loop: true, fade, rate });
  };

  const finished = (e: { action: THREE.AnimationAction }) => {
    if (!oneShot || e.action !== oneShot.action) return;
    const done = oneShot;
    oneShot = null;
    // A held one-shot (a death crumple) is terminal: leave the clamped final frame in place
    // rather than cross-fading back to the standing idle, which would stand a corpse up.
    if (done.hold) return;
    // Hand the upper body (and the legs, if it was full-body) back to locomotion. The
    // channel bookkeeping is cleared first so `enter` doesn't early-out on a stale name.
    const entry = lib.get(locomotion);
    if (!entry) return;
    upper.clip = "";
    if (done.fullBody) lower.clip = "";
    enter(upper, entry, "upper", { loop: true, fade: 0.24, rate: 1 });
    if (done.fullBody) enter(lower, entry, "lower", { loop: true, fade: 0.24, rate: 1 });
  };
  mixer.addEventListener("finished", finished as unknown as (e: THREE.Event) => void);

  // Start on a real pose. A skinned character's bind pose is a T-pose, and one rendered
  // frame of it is very visible.
  setMotion({ velocity: new THREE.Vector3(), yaw: 0, armed: true });
  mixer.update(0);
  pinHips();
  pinOwnLengths();

  let aimPitch = 0;
  let debt = 0;

  return {
    root,
    model,
    bone: (name) => bones.get(name),

    setMotion,
    setAimPitch: (radians) => {
      aimPitch = radians;
    },

    play: (clipName, o) => {
      const entry = lib.get(clipName);
      if (!entry) return;
      /**
       * Full-body unless the clip is on the UPPER_ONLY list.
       *
       * That list, not a track-count test: "has no lower tracks" is true of fire and
       * reload but ALSO false of death and jump, which do have legs and must claim them.
       * Defaulting to upper-only would play death from the waist up over a running lower
       * body. UPPER_ONLY is the deliberate declaration of which is which.
       */
      const fullBody = o?.fullBody ?? !UPPER_ONLY.has(clipName);
      const fade = o?.fade ?? 0.12;
      // Playback rate (>1 is faster). The blade swing is authored slow, so shoot() speeds it up.
      const rate = o?.rate ?? 1;
      // Backwards playback, so one authored transition covers both directions: the library has
      // `stand_to_crouch` but no crouch_to_stand, and the reverse of a stance change is exactly
      // the stance change undone.
      const reverse = o?.reverse ?? false;
      // A death crumple holds its final frame instead of handing back to the standing idle.
      const hold = o?.hold ?? false;
      // Clearing the channel name first makes a re-trigger restart the clip, which is what
      // a second press of fire or a second hit should do.
      upper.clip = "";
      const upperAction = enter(upper, entry, "upper", { loop: false, fade, rate, reverse });
      let lowerAction: THREE.AnimationAction | null = null;
      if (fullBody) {
        lower.clip = "";
        lowerAction = enter(lower, entry, "lower", { loop: false, fade, rate, reverse });
      }
      // Track the action that was actually STARTED. Reading `lower.action` instead would
      // pick up the still-looping locomotion action whenever a supposedly-full-body clip
      // turned out to have no lower tracks — and `finished` never fires for a LoopRepeat
      // action, so the rig would be stuck in the one-shot forever.
      const action = lowerAction ?? upperAction;
      oneShot = action ? { action, fullBody: lowerAction !== null, clip: clipName, hold } : null;
    },

    addClips: (entries) => {
      for (const e of entries) if (!lib.clips.has(e.name)) lib.clips.set(e.name, e);
    },

    playDance: (clipName) => {
      const entry = lib.get(clipName);
      if (!entry) return;
      // A dance supersedes any one-shot and claims both channels, looping. Clearing the
      // channel names first forces `enter` past its same-clip early-out so re-picking the
      // same dance restarts it.
      oneShot = null;
      dancing = clipName;
      upper.clip = "";
      lower.clip = "";
      enter(upper, entry, "upper", { loop: true, fade: 0.2, rate: 1 });
      enter(lower, entry, "lower", { loop: true, fade: 0.2, rate: 1 });
    },

    stopDance: () => {
      if (!dancing) return;
      dancing = "";
      // Re-establish locomotion from the last known state. In-match this is redundant with
      // the per-frame setMotion, but the lobby only sets motion once, so it must be active.
      upper.clip = "";
      lower.clip = "";
      setMotion(lastMotion);
    },

    clearOneShot: () => {
      // Nulling `oneShot` is the essential part: a held one-shot blocks setMotion from re-entering
      // either channel. Clearing the clip names too makes the next enter() cross-fade off the
      // clamped pose rather than early-out on a stale name.
      oneShot = null;
      upper.clip = "";
      lower.clip = "";
    },

    currentDance: () => dancing,

    update: (dt, distance = 0) => {
      // Tick-rate falloff. The near band is every frame; past 25 m nobody can read a
      // footfall, and past 60 m the character is a few pixels tall.
      const every = distance > 60 ? 4 : distance > 25 ? 2 : 1;
      debt += dt;
      if (every > 1) {
        // Frame parity from accumulated time rather than a counter, so a rig that goes
        // in and out of the far band doesn't stutter.
        if (debt < dt * every) return;
      }
      mixer.update(debt);
      debt = 0;

      // Put this body's own pelvis offset back. The mixer just overwrote it with the library
      // character's; only the vertical channel is the clip's to own. See `hipsRest`.
      pinHips();
      // And this body's own bone lengths, on the few bones that read wrong wearing Howl's.
      // Rotation is left alone, so the pose the mixer just wrote is untouched.
      pinOwnLengths();

      // AFTER the mixer, or it is overwritten in the same frame: the clips key the spine
      // and the mixer writes the whole quaternion, not a delta. Which also means this
      // MULTIPLIES the animated pose rather than replacing it, so the torso keeps the
      // run's lean and the reload's twist and just leans further up or down on top.
      //
      // Split across two bones so a steep angle bends rather than hinging at one joint.
      if (aimPitch !== 0) {
        pitchQ.setFromAxisAngle(PITCH_AXIS, aimPitch / 2);
        spine1?.quaternion.multiply(pitchQ);
        spine2?.quaternion.multiply(pitchQ);
      }
    },

    currentClip: () => lower.clip || locomotion,

    dispose: () => {
      mixer.removeEventListener("finished", finished as unknown as (e: THREE.Event) => void);
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      root.removeFromParent();
      // Geometry, materials and textures are shared with the cached original — only the
      // cloned scene graph is dropped here.
      root.clear();
    },
  };
}

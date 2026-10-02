/**
 * The operative roster, and which asset each one wears.
 *
 * The colours predate the models: every operative used to be a coloured capsule so the
 * lobby, picker and selection flow could be built end to end. They still earn their keep as
 * the HUD/minimap/killfeed tint, and the capsule itself survives as the invisible hitbox
 * proxy the animated model is rendered on top of.
 *
 * `model` lives here rather than in the loader because the roster is what decides which
 * asset an operative wears; the loader just loads what it is handed. This file imports
 * nothing heavy (no three.js), so the lobby and picker can read it without pulling the
 * renderer into their bundle.
 */

import type { PowerId } from "./powers";

/**
 * Howl's body, and the fallback every other consumer defaults to.
 *
 * Bots all render as this one whichever operative they stand in for, and operativeModel.ts
 * takes it as its default `url`, so it stays exported even though the roster below now
 * names a distinct GLB per operative.
 */
export const OPERATIVE_BODY_URL = "/models/operative-body.glb";

/**
 * Every body below is mesh-only: KTX2/ETC1S textures, meshopt geometry, no baked clips.
 * The motion comes from the shared library in operativeAnims.ts, which binds tracks by
 * bone NAME — so all six have to agree on one normalised Mixamo skeleton: bare `Hips` /
 * `Spine1` with no `mixamorig*:` prefix, 0.01 root scale, ~1.59 m foot-to-head rest pose.
 * tools/verify-character.ts is what enforces that agreement, and it is not optional: a
 * body whose bone names disagree binds zero tracks, throws nothing, and stands in bind
 * pose forever. Run it before adding anything here.
 *
 * The five non-Howl bodies are 8.5 MB shipped between them, 2.0-11.3 MB VRAM each, and
 * operativeModel.ts caches them by URL — so choosing an operative costs one fetch, once.
 */

export type ArenaCharacter = {
  id: string;
  name: string;
  tagline: string;
  /** body colour: HUD, minimap, killfeed, and the hitbox capsule underneath the model */
  color: number;
  /** trim / visor colour */
  accent: number;
  /** the operative's active ability */
  power: PowerId;
  /** unlocked from the start for new guests */
  unlockedByDefault: boolean;
  /** matches played with this character to unlock when not default */
  unlockCost: number;
  /** the GLB this operative renders as */
  model: string;
  /**
   * 600x600 card art for the roster tiles and the profile avatar. Referenced by URL out of
   * `public/banners/`, so an operative whose art has not been drawn yet still works — see
   * BannerArt.tsx for why this is not an `@/assets` import.
   */
  banner: string;
};

export const CHARACTERS: ArenaCharacter[] = [
  { id: "howl", name: "Howl", tagline: "Frostline vanguard", color: 0x4fa8ff, accent: 0xd8ecff, power: "coldsnap", unlockedByDefault: true, unlockCost: 0, model: OPERATIVE_BODY_URL, banner: "/banners/character-howl.jpg" },
  { id: "ember", name: "Ember", tagline: "Close-quarters rusher", color: 0xff6b3d, accent: 0xffd9a8, power: "overburn", unlockedByDefault: true, unlockCost: 0, model: "/models/operative-ember.glb", banner: "/banners/character-ember.jpg" },
  { id: "vireo", name: "Vireo", tagline: "Recon and flanks", color: 0x46d39a, accent: 0xdcfff0, power: "slipstream", unlockedByDefault: true, unlockCost: 0, model: "/models/operative-vireo.glb", banner: "/banners/character-vireo.jpg" },
  { id: "onyx", name: "Onyx", tagline: "Bubble breacher", color: 0x8b8fa3, accent: 0x2b2f36, power: "emberveil", unlockedByDefault: true, unlockCost: 0, model: "/models/operative-onyx.glb", banner: "/banners/character-onyx.jpg" },
  { id: "lumen", name: "Lumen", tagline: "Support and walls", color: 0xf2c94c, accent: 0x6b4f00, power: "lifespring", unlockedByDefault: true, unlockCost: 0, model: "/models/operative-lumen.glb", banner: "/banners/character-lumen.jpg" },
  { id: "nyx", name: "Nyx", tagline: "Silent marksman", color: 0xa06bff, accent: 0xe9dcff, power: "deadeye", unlockedByDefault: true, unlockCost: 0, model: "/models/operative-nyx.glb", banner: "/banners/character-nyx.jpg" },
];

/**
 * Which operatives play the women's unarmed idle instead of the shared library's.
 *
 * NYX ALONE, and that is a decision, not a stub. `operative-idle-women.glb` is a Mixamo idle
 * AUTHORED ON HER BODY, and a glTF clip carries absolute per-bone translations, so playing it
 * re-proportions whoever plays it into Nyx. Handed to all three women it fixed her and wrecked
 * the other two: Vireo's back arched up and forward (the clip makes her `Spine1` 44% longer than
 * her own) and Lumen's neck stretched (her `Head` bone more than doubles, +115%). Pinning their
 * own bone lengths fixed the stretch but not the pose — the clip is a chest-forward stance with
 * the neck counter-tipped back, which read wrong on both of them. Vireo and Lumen look right on
 * the shared `breathing_idle`, so that is where they stay.
 *
 * So this set is per-BODY, never per-gender: adding an operative here is only correct when the
 * clip was authored on that operative's own skeleton. Keyed by url, not id, because the url is
 * what `createOperativeRig` is handed — no call site has to know who is who.
 */
const CUSTOM_IDLE_OPERATIVE_IDS: ReadonlySet<string> = new Set(["nyx"]);

/**
 * Nyx's unarmed idle bundle, built by `tools/idle-women-to-glb.py`.
 *
 * Declared here beside the bodies rather than in operativeAnims.ts because it is an ASSET
 * MAPPING — which url a given operative wears — and because this file imports nothing heavy.
 * `preload.ts` needs the url for the boot bar and must not pull three.js in to get it;
 * operativeAnims.ts re-exports it as `OPERATIVE_IDLE_WOMEN_URL` for the loader side. The
 * filename keeps its `-women` suffix because that is the file on disk.
 */
export const OPERATIVE_IDLE_WOMEN_URL = "/models/operative-idle-women.glb";

export const CUSTOM_IDLE_OPERATIVE_MODELS: ReadonlySet<string> = new Set(
  CHARACTERS.filter((c) => CUSTOM_IDLE_OPERATIVE_IDS.has(c.id)).map((c) => c.model),
);

/** True when a body url has its own authored idle — see CUSTOM_IDLE_OPERATIVE_MODELS. */
export function hasCustomIdle(url: string): boolean {
  return CUSTOM_IDLE_OPERATIVE_MODELS.has(url);
}

/**
 * Bones whose OWN length a given body keeps, instead of the shared library's.
 *
 * Every clip in `operative-anims.glb` carries a translation AND a scale channel for all 65
 * bones, and a bone's local translation IS its length — so playing a shared clip silently
 * re-proportions whoever plays it into Howl, the body it was authored on. Measured in bind
 * pose: Lumen's `Neck` is 12.4 cm and the library writes Howl's 17.6 cm over it (+42%, the
 * long neck), and Onyx's `Head` is 4.4 cm against Howl's 5.4 (+23%), which slides his eyes,
 * brows and teeth — separate skinned meshes — forward off his skull.
 *
 * The fix is per bone and per body: after the mixer runs, put the listed bones' own
 * translation and scale back and leave every ROTATION alone. Rotation is what makes the pose,
 * length is what makes the proportions, so the animation is untouched — the same trick
 * `pinHips` already uses for the pelvis, just aimed at a named list. See `pinOwnLengths`.
 *
 * WHY THE HEAD CHAIN IS FREE. `Neck`'s subtree is exactly `Neck` → `Head` → `HeadTop_End` on
 * every body — no arms hang off it (verified against the GLBs) — so restoring it cannot move
 * a hand, and the weapon socket, which was solved on Howl's arm lengths, stays exact.
 *
 * THE SPINE IS ALSO FREE, for a different reason. Restoring `Spine`/`Spine1`/`Spine2` moves
 * BOTH shoulders by the same amount, so the two hands travel together and the hand-to-hand
 * distance the socket solve depends on (0.4396 m, matching the M4's 0.440 m grip-to-handguard
 * span) is preserved — the gun follows the right hand, which is its parent. Only the bones
 * that change the hands' SEPARATION break the grip: `LeftShoulder`/`RightShoulder` and the
 * arm/forearm/hand chain. Lumen's forearm is 6.4 cm longer than Howl's, so restoring that WOULD
 * slide her left hand off the handguard and cost a per-body re-solve in /weapon-lab. That is
 * why the arms are deliberately not listed here and the spine is.
 *
 * NO GAMEPLAY EFFECT, EITHER. Hit detection is a hidden capsule stack on the fighter group with
 * a 0.19 m head sphere at 1.62 m, and the player's camera and shot origin come from
 * `EYE_HEIGHT`, not from a bone — so none of this moves a hitbox or an eye. It is also only
 * ever the PLAYER's own body: every bot is attached with OPERATIVE_BODY_URL (LoneWolfArena's
 * `attachRig` call sites), so a bot is always Howl-proportioned and always matches its capsules.
 *
 * Bodies that already read correctly are left EMPTY on purpose, which is a true no-op: Nyx
 * plays her own authored idle and Brook signed off on her, Vireo and Ember stand right on the
 * shared clips, and Howl IS the library. Only add a bone here after seeing it look wrong.
 */
const OWN_LENGTH_BONES: Record<string, readonly string[]> = {
  howl: [],
  ember: [],
  // Left empty deliberately. She read correct on the shared clips with Howl's bone lengths, and
  // the spine/head chain that the women's idle would have needed came back out with it.
  vireo: [],
  // Signed off 2026-09-03 with the head chain alone — his eyes went back in his skull. His
  // spine is within 16% of Howl's and he read correct, so it is left out.
  onyx: ["Neck", "Head", "HeadTop_End"],
  // The stretched one: the library makes her torso ~43% longer than her own (Spine 8.2→11.8,
  // Spine1 9.6→13.7, Spine2 11.0→15.7 cm) and her neck 42% longer. Restoring the whole chain
  // drops her shoulders and head 12.4 cm, which is most of "the women should be shorter".
  lumen: ["Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End"],
  // Empty on purpose: the women's idle was authored on HER, so it already carries her own
  // lengths. Under the shared clips she wears Howl's, which is how Brook approved her.
  nyx: [],
};

const OWN_LENGTH_BONES_BY_MODEL: ReadonlyMap<string, readonly string[]> = new Map(
  CHARACTERS.map((c) => [c.model, OWN_LENGTH_BONES[c.id] ?? []]),
);

/** Bones this body keeps its own length on — empty for most. See OWN_LENGTH_BONES. */
export function ownLengthBones(url: string): readonly string[] {
  return OWN_LENGTH_BONES_BY_MODEL.get(url) ?? [];
}

const KEY = "lonewolf.character.v1";

export function defaultCharacter(): ArenaCharacter {
  return CHARACTERS[0]!;
}

export function loadCharacter(): ArenaCharacter {
  if (typeof window === "undefined") return defaultCharacter();
  try {
    const id = window.localStorage.getItem(KEY);
    return CHARACTERS.find((c) => c.id === id) ?? defaultCharacter();
  } catch {
    return defaultCharacter();
  }
}

export function saveCharacter(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* private mode — selection just won't persist */
  }
}

export const hexCss = (v: number) => `#${v.toString(16).padStart(6, "0")}`;

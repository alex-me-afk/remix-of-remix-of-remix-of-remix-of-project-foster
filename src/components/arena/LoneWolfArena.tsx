import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { acceleratedRaycast } from "three-mesh-bvh";
import { enableMeshoptWorkers, makeGltfLoader, sharedKtx2Loader } from "./ktx2";
import {
  buildMergedCollider,
  buildCollisionTiles,
  activeTileMeshes,
  nearbyTileMeshesReady,
  warmTiles,
  type CollisionTile,
} from "./collision";

import { MessageCircle, Send, X as XIcon, Skull, Volume2, VolumeX, Maximize, Minimize, Settings, PawPrint, Car, Wifi, Eye, Smile, Boxes, MousePointer2, Heart } from "lucide-react";
import { createSpawnFx, type SpawnFx } from "./spawnFx";
import { createPowerFx } from "./powerFx";
import { createBarrierDome } from "./barrierDome";
import {
  createBombSystem,
  predictBombPath,
  BOMB_DAMAGE,
  BOMB_RADIUS,
  THROW_SPEED,
  THROW_SPEED_JUMP,
  FLASH_RADIUS,
  DECOY_LIFE,
  DECOY_BARK_INTERVAL,
  GRENADE_DEFS,
  GRENADE_KINDS,
  type GrenadeKind,
  type BombSystem,
} from "./bomb";
import { createSmokeField } from "./smokeCloud";
import { createExplosionFx } from "./explosionFx";
import { bakeVertexLighting, makeBlobShadowTexture } from "./bakeLighting";
import { prepareSplatTerrain, applySplatMaterial } from "./splatTerrain";

import { loadCharacter } from "./characters";
import { CLIP, loadOperativeDances } from "./operativeAnims";
import { createOperativeRig, OPERATIVE_BODY_URL, type OperativeRig } from "./operativeModel";
import { createWeaponSocket, loadWeaponModel, WEAPON_PROPS, type WeaponSocket } from "./weaponModel";
import { attachHolsters, carriedOnBody, type Holsters, type HolsterSet } from "./holster";
import { attachWornPack } from "./wornPack";
// The four subsystems that used to live in this file. Brook: "the lonewolfarena file turns into a
// chunk of plus +9k line so ur job for this take is to spreat it into files ... so its easier to
// debug". Each is the same code behind a factory that takes what it used to read out of scope.
import {
  BOT_DAMAGE,
  MAX_HP,
  REVIVE_RADIUS,
  REVIVE_SECONDS,
  TEAM_COLORS,
  botCallsign,
  type Fighter,
  type HudFighter,
  type SpawnPoint,
  type Team,
} from "./fighter";
import { buildBot, createRigAttacher } from "./fighterBody";
import { joinOnlineHangout, type ChatMsg, type OnlineHangout } from "./onlineHangout";
import { createBombThrower } from "./bombThrow";
import { createBotTick } from "./botTick";
import { THIRD_DIST, solveViewCamera } from "./viewCamera";
import { applyMatchRewards, applyLikeBonus, type PlayerProfile } from "./playerProfile";
import { NO_EFFECT, POWERS } from "./powers";
import { combinePassives, type Loadout } from "./skills";
import { TACTICAL_BONUS, rollArmorLevel, TACTICALS } from "./tactical";
import {
  createTacticalState,
  applySpawnTactical,
  updateTacticals,
  callAirdrop,
  openAirdrop,
  scannerActive,
  disposeTacticals,
  type TacticalMatchState,
} from "./tacticalMatch";
import { PETS, type PetId } from "./pets";
import { createPetCompanion, type PetCompanion } from "./petCompanion";
import { createCarRig, CAR_SIZE, type CarRig } from "./carModel";
import { applySkinStats } from "./weaponSkins";
import { applyAttachmentStats } from "./attachments";
import { createArmorPiece, applyArmor, emptyArmor, equipArmor, shouldPickupArmor, armorIconLabel, type ArmorState } from "./armor";
import { createPingMarker, updatePings, nextPingKind, pingKindAtIndex, type PingKind, type Ping } from "./ping";
import { armorIcon, POWER_ICON, LOOT_ICON, GRENADE_ICON } from "./icons";
import { addDaySkybox, DAY_HORIZON, type Skybox } from "./skybox";
import { createImpactFx, type ImpactFx } from "./impactFx";
import { ARENA_MAPS, type MapId } from "./maps";
import { IslandMiniGames, type IslandGameMode, stopAllAudio as stopIslandAudio } from "./island/IslandMiniGames";
import { nearestStation, createStationMarkers, ISLAND_STRAY_NODES } from "./island/stations";
import { THROW_CLIP_RATE, createBasketball, onCourt, type Basketball } from "./island/basketball";
import { type GameMode, type MatchType, MODE_RULES, type ModeRules, lossPayout, modeForMap } from "./modes";
import { rankPointsForMatch, rankTierFromPoints } from "./ranks";
import { createSkydiveDirector, PLANE_SCALE, type SkydiveDirector, type SkydivePhase } from "./skydive";
import {
  createWeaponPickup,
  createMedkitPickup,
  createChestPickup,
  createDeathPack,
  createArmorPickup,
  createAmmoPickup,
  createWallChargePickup,
  createLootPlacer,
  createAirdropDirector,
  type LootPlacer,
} from "./worldLoot";
import {
  AMMO_FAMILIES,
  FAMILY_BOX,
  familyOf,
  startingPools,
  type AmmoFamily,
  type AmmoPools,
} from "./ammoFamily";
import {
  bagFill as bagFillOf,
  roomForAmmo,
  roomForItem,
  type BagLoad,
} from "./backpack";
import {
  rollAirdropStash,
  rollChestStash,
  rollDeathStash,
  type Stash,
  type StashEntry,
} from "./lootStash";
import LootPanel from "./LootPanel";
import { OUTPOST_BARRIER, clampInsideBarrier } from "./mapBarrier";
import { createNameplate, type Nameplate } from "./nameplate";
import {
  createWalkPhysics,
  PLAYER_RADIUS,
  EYE_HEIGHT,
  STEP_UP,
  GROUND_RAY_FAR,
} from "./walkPhysics";
import { saveMatchResult, getLeaderboard } from "@/lib/arena.functions";
import { initSfx, playSfx, playSfxStoppable, playSfxAt, playVictory, warmSfx, suspendSfx, resumeSfx, setSfxMuted, setSfxVolume, setWeatherAmbience, stopWeatherAmbience, playThunder, playPetVoice, speak, speakAnnouncer, startCarEngine, setCarEngine, stopCarEngine, playCarImpact } from "./sfx";
import { createWeather, type Weather } from "./weather";
import { createAnimatedWater, type AnimatedWater } from "./water";
import SettingsPanel from "./SettingsPanel";
import TeamPanel, { type Teammate } from "./TeamPanel";
import {
  AIM_ASSIST_STRENGTH,
  defaultSettings,
  keyLabel,
  loadSettings,
  saveSettings,
  type ArenaSettings,
  type BindAction,
  type Quality,
} from "./settings";
import WeaponShop from "./WeaponShop";
import WeaponSlots from "./WeaponSlots";
import Minimap, { type MapGrid, type RadarState } from "./Minimap";
import TouchControls, { type ThrowRequest } from "./TouchControls";
import EmoteWheel from "./EmoteWheel";
import {
  loadFrostTemplate,
  createFrostVisual,
  setGhostValid,
  FROST_WIDTH,
  FROST_HEIGHT,
  FROST_DEPTH,
  type FrostVisual,
} from "./frostWall";
import {
  WEAPONS,
  STARTING_CREDITS,
  isHeavy,
  getWeapon,
  getWeaponDamageAt,
  getWeaponRange,
  getWeaponFireInterval,
  getWeaponBehavior,
  getMagazine as getBaseMagazine,
  getReserveAmmo,
  getReloadTime as getBaseReloadTime,
  isDeflectionMelee,
  usesBladeStance,
  type Weapon,
} from "./weapons";
import { getAttachment } from "./attachments";
import { createSafeZone, updateSafeZone, damageOutsideZone, createSafeZoneVisual, type SafeZone } from "./safeZone";

type AttachmentProfile = {
  equippedSkins: Record<string, string>;
  equippedAttachments: Record<string, string>;
};

function getEffectiveWeapon(weaponId: string, profile: AttachmentProfile | null | undefined): Weapon | null {
  const base = getWeapon(weaponId);
  if (!base) return null;
  const skinned = applySkinStats(base, profile?.equippedSkins[weaponId]);
  return applyAttachmentStats(skinned ?? undefined, profile?.equippedAttachments[weaponId] ?? null) ?? base;
}

function getMagazine(weaponId: string, profile: AttachmentProfile | null | undefined) {
  return getEffectiveWeapon(weaponId, profile)?.magazine ?? getBaseMagazine(weaponId);
}

function getReloadTime(weaponId: string, profile: AttachmentProfile | null | undefined) {
  const base = getBaseReloadTime(weaponId);
  const attachment = getAttachment(profile?.equippedAttachments[weaponId] ?? null);
  if (!attachment || attachment.stats.reloadSpeed == null) return base;
  return Math.max(0.05, base * (1 + attachment.stats.reloadSpeed / 100));
}
import { defaultBackpack, scanFfCoinPickups, spawnFfCoins, disposeFfCoins, type Backpack, type BackpackLevel, type FfCoinPickup } from "./backpack";
import {
  BOT_PROFILES,
  createBotBrain,
  preferredRangeFor,
  rerollStrafe,
  rollBurst,
  rollPause,
  attractToDecoy,
  type BotBrain,
} from "./botAi";

// The outpost collision clone still contains hundreds of thousands of
// triangles. Three's default raycaster scans those triangles for every ground
// and wall probe; the BVH keeps the exact mesh but indexes it spatially.
THREE.Mesh.prototype.raycast = acceleratedRaycast;

type Mode = "orbit" | "walk";
/** Player speed multiplier when moving purely sideways. */
const STRAFE_SPEED_MUL = 0.65;

// PLAYER_RADIUS / EYE_HEIGHT / STEP_UP / gravity / jump / void-floor now live in
// ./walkPhysics — the first three are re-imported above because the shooting,
// camera, bot and pickup code needs them too.
/** cap of the Energy Point reserve */
const MAX_EP = 100;
/** EP converted into HP per second while the player is hurt */
const EP_TO_HP_RATE = 3;
const PLAYER_DAMAGE = 34;
const RESPAWN_SECONDS = 3;
/**
 * How long a killed body stays on screen playing its death crumple before it is hidden and
 * (in the loot modes) swapped for a supply crate. Deliberately shorter than RESPAWN_SECONDS so
 * the crumple always finishes before the fighter respawns.
 */
const DEATH_ANIM_SECONDS = 1.6;
/** Knocked (dbno) tuning — Free Fire style: a bleed-out window a teammate can beat. */
const BLEED_OUT_SECONDS = 20;
const REVIVE_HP = 50;
const KNOCK_CRAWL_SPEED = 1.7;

/** HP pool a knocked fighter crawls on (Free Fire's downed bar). Drained to 0 = finished. */
const DOWNED_HP = 100;

/**
 * Car wheel-contact offsets in body space (along, across), half-length 2.3 m by half-width 1.0 m.
 * Module-level because the driving branch samples all four every frame and rebuilding the nested
 * literal there allocated five arrays per frame for the whole time anyone was behind the wheel.
 */
const CAR_CORNERS: readonly (readonly [number, number])[] = [
  [2.3, 1.0],
  [2.3, -1.0],
  [-2.3, 1.0],
  [-2.3, -1.0],
];

/** Half the car body's length, metres — the bumper offset used by the collision probe. */
const CAR_HALF_LENGTH = 2.3;
/**
 * Heights the collision probe casts at, relative to the wheel contact plane. Bumper height plus
 * roof height: one ray at bumper level alone slid under low-hanging branches and shopfront
 * awnings, and one at roof level alone drove straight through kerb-height rubble.
 */
const CAR_PROBE_HEIGHTS = [0.45, 1.5];
/** Scratch vectors for the car collision probe — never allocate in the frame loop. */
const _carDir = new THREE.Vector3();
const _carOrigin = new THREE.Vector3();

const FIRE_COOLDOWN = 0.18;
const MUZZLE_FLASH_LIFE = 0.06;
const RECOIL_RECOVERY = 4.0;
const INTERMISSION_SECONDS = 5;
const MATCH_END_SECONDS = 5;
const COUNTDOWN_SECONDS = 10;
const SPAWN_BOX_HALF = 1.5; // 3m wide spawn cage

/** A sandbox (Hang Out): nothing to buy and nobody to fight — no cage, no buy countdown. */
function isSandbox(rules: ModeRules) {
  return rules.buySeconds <= 0 && !rules.opponents;
}
function openingCountdown(rules: ModeRules) {
  if (rules.buySeconds > 0) return rules.buySeconds;
  return isSandbox(rules) ? 0 : COUNTDOWN_SECONDS;
}
const SPAWN_BOX_HEIGHT = 5;

/**
 * The two round/match goals, pulled off a mode's rules. There is no standalone default: seeding
 * these from anything but `MODE_RULES` is how a match ends up running "first to 10 kills, best of
 * 3" — a format no mode has — if a refresh is ever missed.
 */
const matchGoalsOf = (rules: ModeRules) => ({
  killsToWinRound: rules.killsToWinRound,
  roundsToWinMatch: rules.roundsToWinMatch,
});

type MatchPhase = "warmup" | "skydive" | "countdown" | "round" | "intermission" | "matchEnd";

type KillFeedItem = {
  id: string;
  killer: string;
  killerTeam: Team;
  victim: string;
  victimTeam: Team;
  weapon: string;
  time: number;
};


type LeaderboardEntry = {
  winner: string;
  player_team: string;
  player_kills: number;
  player_deaths: number;
  blue_score: number;
  red_score: number;
};

type LeaderboardTotals = {
  recent: LeaderboardEntry[];
  totals: Record<string, { wins: number; losses: number; kills: number; deaths: number }>;
};

/**
 * Scratch for differentiating a fighter's velocity each frame. Never held across a call — the
 * per-frame loop reads it immediately and smooths the result into the fighter's own `vel`.
 */
const rigVelScratch = new THREE.Vector3();

/**
 * The origin, for the two effect systems that take a "where is the player" vector and are ticked
 * even when there is no player to give them (dead, spectating, pre-spawn). Both used to be handed a
 * freshly constructed `new THREE.Vector3()` on those frames, which is a garbage allocation every
 * frame of the entire time you are dead.
 *
 * Never written to. Both callees only read it — an effect that is not following anybody has no
 * reason to move the vector it was passed.
 */
const ORIGIN = new THREE.Vector3();

type ArenaProps = {
  /** called once the map + scene are fully built and the match has started */
  onReady?: () => void;
  /**
   * True while this arena is mounted but something else owns the screen — the Battle Royale waiting
   * island, or the deploy splash. The level still loads, uploads and compiles its shaders; it just
   * renders at a sixth of the rate, because a full-rate frame behind an opaque overlay costs the
   * same GPU and main-thread time as a visible one, and that time is exactly what the load it is
   * racing needs. Throttled rather than stopped so the shaders are still warm at match start.
   */
  hidden?: boolean;
  /** back to the lobby */
  onExit?: () => void;
  /** which map / mode to play */
  mapId?: MapId;
  /** selected game mode */
  gameMode?: GameMode;
  /** ranked or casual */
  matchType?: MatchType;
  /** per-side roster size chosen in the lobby (1v1, 2v2, solo/duo/squad). Overrides the map default. */
  teamSize?: number;
  /** persistent guest profile */
  profile?: PlayerProfile;
  /** called when match rewards update the profile */
  onProfileChange?: (p: PlayerProfile) => void;
};

export default function LoneWolfArena({ onReady, onExit, mapId = "frostline", gameMode = modeForMap(mapId), matchType = "casual", teamSize, profile, onProfileChange, hidden = false }: ArenaProps = {}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  /** Read by the frame loop, which is created once and must never re-run for a prop change. */
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const mapIdRef = useRef<MapId>(mapId);
  mapIdRef.current = mapId;
  const teamSizeRef = useRef<number | undefined>(teamSize);
  teamSizeRef.current = teamSize;
  const gameModeRef = useRef<GameMode>(gameMode);
  gameModeRef.current = gameMode;
  const [onlineCount, setOnlineCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const [chatUnread, setChatUnread] = useState(0);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  // Friend Island mini-games: arcade cabinets, game tables and the basketball hoops.
  const [miniGame, setMiniGame] = useState<IslandGameMode>(null);
  const miniGameOpenRef = useRef(false);
  miniGameOpenRef.current = miniGame !== null;
  const [islandPrompt, setIslandPrompt] = useState<string | null>(null);
  const [hoopHud, setHoopHud] = useState<{ holding: boolean; canShoot: boolean; charging: boolean; power: number; score: number; shots: number; msg: string } | null>(null);
  const islandInteractRef = useRef<() => boolean>(() => false);
  const hoopChargeRef = useRef<{ start: () => boolean; release: () => boolean }>({ start: () => false, release: () => false });
  const closeMiniGame = useCallback(() => {
    stopIslandAudio();
    setMiniGame(null);
    freeCursorRef.current = false;
    setCursorFree(false);
    mountRef.current?.querySelector("canvas")?.requestPointerLock?.();
  }, []);
  const chatSendRef = useRef<(text: string) => void>(() => {});
  /** BR drop-in director (plane flyover + freefall), created once the plane loads */
  const skydiveRef = useRef<SkydiveDirector | null>(null);
  /** set true by the LAUNCH button / Space to bail out of the plane */
  const ejectRequestedRef = useRef(false);
  /** last skydive phase pushed to React, so the loop only re-renders on change */
  const skydiveUiPhaseRef = useRef<SkydivePhase | null>(null);
  const [skydiveUi, setSkydiveUi] = useState<{ phase: SkydivePhase; altitude: number } | null>(null);
  const [mode, setMode] = useState<Mode>("walk");
  const [intro, setIntro] = useState(true);

  const [showDebug, setShowDebug] = useState(false);
  const [status, setStatus] = useState("Loading map…");
  const [mapLoadProgress, setMapLoadProgress] = useState(0);
  const [showRoof, setShowRoof] = useState(true);
  const [hud, setHud] = useState<HudFighter[]>([]);
  const [score, setScore] = useState<Record<Team, number>>({ blue: 0, red: 0 });
  const [playerHp, setPlayerHp] = useState(MAX_HP);
  const [playerRespawn, setPlayerRespawn] = useState(0);
  // Elimination spectating: true while the dead human is watching a teammate.
  // The frame loop tracks the spectated fighter in a ref (no re-render), and
  // flips the HUD flag only on change so the control buttons hide/show.
  const [spectating, setSpectating] = useState(false);
  const spectatingRef = useRef<string | null>(null);
  const spectatingHudRef = useRef(false);
  /** knocked HUD: the player's own bleed-out countdown, or a nearby teammate being revived */
  const [knockHud, setKnockHud] = useState<{ bleeding: number; revivingName: string | null } | null>(null);
  // Weapon draft (2v2): whose turn it is to pick the shared loadout this round.
  // humanDraftsRef gates the armory — the human only buys on their own turn (or
  // in a decider round). draftLock carries the drafter's name for the banner
  // shown while someone else is choosing.
  const humanDraftsRef = useRef(true);
  const [draftLock, setDraftLock] = useState<string | null>(null);
  const [match, setMatch] = useState({
    blue: 0,
    red: 0,
    phase: "warmup" as MatchPhase,
    round: 1,
    roundWinner: null as Team | null,
    matchWinner: null as Team | null,
    countdown: 0,
  });
  const [matchConfig, setMatchConfig] = useState(() => matchGoalsOf(MODE_RULES[gameMode]));
  const matchConfigRef = useRef(matchConfig);
  const safeZoneRef = useRef<SafeZone | null>(null);
  matchConfigRef.current = matchConfig;
  // Full per-mode pacing/zone rules for the active match, and the live
  // round countdown (seconds left in the current round).
  const modeRulesRef = useRef<ModeRules>(MODE_RULES[gameMode]);
  const roundTimerRef = useRef(0);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [weaponReady, setWeaponReady] = useState(true);
  const [hitMarker, setHitMarker] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardTotals | null>(null);
  const [orbitLeaderboard, setOrbitLeaderboard] = useState<LeaderboardTotals | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [credits, setCredits] = useState(STARTING_CREDITS);
  // TESTING UNLOCK: every weapon is owned from the start, in every mode, so any gun can be
  // pulled out of the buy menu and fired without earning credits first. The economy itself is
  // untouched — `buyWeapon`'s already-owned branch just equips, so nothing is ever charged —
  // which means putting the real progression back is this one line reverting to
  // `["deagle", "fists"]`, with no other change anywhere.
  const [owned, setOwned] = useState<string[]>(() => WEAPONS.map((w) => w.id));
  // Loadout: [heavy 1, heavy 2, sidearm (pistol or knife), fists]. Players now
  // start UNARMED — only fists. A pistol/knife is a choice in the armory, not a
  // freebie, so the sidearm slot begins empty and fists (slot 3) is active.
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, "fists"]);
  const slotsRef = useRef(slots);
  const [activeSlot, setActiveSlot] = useState(3);
  const activeSlotRef = useRef(activeSlot);
  // Ammo for every owned weapon, seeded the same way `buyWeapon` seeds a purchase — an owned
  // gun with no entry here would equip with an empty magazine and read as broken.
  //
  // MAGAZINES ONLY. The spare rounds used to live here too, one private stock per weapon id,
  // which is why a fresh AK and a fresh M4 each arrived with their own 90 rounds. Brook: "the
  // heavy wepeons should shre the same ammo the light guns cant use the heavy ammo and so on the
  // sniper has its own the shot guns both of them has the same and the pistol has its own" — so
  // the reserve moved to `ammoPool`, five shared pools keyed by calibre group (`ammoFamily.ts`).
  const [ammo, setAmmo] = useState<Record<string, { mag: number }>>(() =>
    Object.fromEntries(WEAPONS.map((w) => [w.id, { mag: getBaseMagazine(w.id) }])),
  );
  /**
   * The five shared reserves. Loot modes start these small on purpose: a battle royale where you
   * spawn with full pockets has no reason to enter a building, and a full pack has no room to
   * loot into. The buy-menu modes hand out arena-sized stocks because there is nothing to find.
   */
  const [ammoPool, setAmmoPool] = useState<AmmoPools>(() =>
    startingPools(MODE_RULES[gameMode].groundLoot),
  );
  const [isReloading, setIsReloading] = useState(false);
  const [reloadLeft, setReloadLeft] = useState(0);
  const [sfxReady, setSfxReady] = useState(false);
  const [playerStatsHud, setPlayerStatsHud] = useState({ kills: 0, deaths: 0, headshots: 0 });
  const [matchLiked, setMatchLiked] = useState(false);
  /** transient "double kill / rampage" callout — purely cosmetic */
  const [streakBanner, setStreakBanner] = useState<{ id: number; title: string; sub: string } | null>(null);
  const streakRef = useRef({ count: 0, lastAt: 0, multi: 0, timer: 0 });
  /**
   * Floating combat text. `kind` is what the number MEANS, and it is the reason the number is
   * worth drawing at all: white is clean damage to flesh, yellow means armour ate part of the
   * hit (so the small number is the armour working, not the gun being weak), red is a headshot,
   * green is a heal from a treatment gun. See `spawnDamagePopup`.
   */
  const [damagePopups, setDamagePopups] = useState<
    { id: number; x: number; y: number; amount: number; kind: "body" | "armor" | "head" | "heal" }[]
  >([]);
  /** true while the crosshair is over a living enemy — turns the reticle red */
  const [onTarget, setOnTarget] = useState(false);
  const onTargetRef = useRef(false);
  const targetProbeRef = useRef(0);
  const [scoped, setScoped] = useState(false);
  const [paused, setPaused] = useState(false);
  /** wireframe overlay of the real collision geometry (debug invisible walls) */
  const [collisionDebug, setCollisionDebug] = useState(false);
  const setCollisionDebugRef = useRef<(on: boolean) => void>(() => {});
  const toggleCollisionDebugRef = useRef(() => {});
  toggleCollisionDebugRef.current = () => setCollisionDebug((v) => !v);
  /** why movement got blocked this frame (debug only): bounds box, spawn cage, geometry */
  const blockReasonRef = useRef("");
  const [blockReason, setBlockReason] = useState("");
  /** cursor released on purpose — the game keeps running, no pause */
  const [cursorFree, setCursorFree] = useState(false);
  const freeCursorRef = useRef(false);
  const toggleCursorRef = useRef(() => {});
  const [fullscreen, setFullscreen] = useState(false);
  const [prone, setProne] = useState(false);
  const [crouch, setCrouch] = useState(false);
  const [kits, setKits] = useState(3);
  const [ffCoinCount, setFfCoinCount] = useState(0);
  const [backpackLevel, setBackpackLevel] = useState<BackpackLevel>(1);
  const ffCoinsRef = useRef<FfCoinPickup[]>([]);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const matchStartTimeRef = useRef<number>(0);
  /** fraction (0..1) left in the partially used medkit at the top of the stack */
  /** Energy Points: yellow reserve that trickles back into HP over time */
  const [ep, setEp] = useState(0);
  const epRef = useRef(0);
  epRef.current = ep;
  /** inhalers: instant small HP + EP, usable on the move */
  const [inhalers, setInhalers] = useState(2);
  const inhalersRef = useRef(2);
  inhalersRef.current = inhalers;
  const useInhalerRef = useRef(() => {});
  const [kitPartial, setKitPartial] = useState(1);
  const kitPartialRef = useRef(1);
  kitPartialRef.current = kitPartial;
  /** 0..1 progress of the medkit currently being applied */
  const [healProgress, setHealProgress] = useState(0);
  /** throwables per type; frag damages, flash blinds, smoke blocks sight, decoy fakes shots */
  const [grenades, setGrenades] = useState<Record<GrenadeKind, number>>({ frag: 3, flash: 2, smoke: 2, decoy: 2 });
  const [grenadeKind, setGrenadeKind] = useState<GrenadeKind>("frag");
  const grenadeKindRef = useRef<GrenadeKind>(grenadeKind);
  grenadeKindRef.current = grenadeKind;
  const bombs = grenades[grenadeKind];
  /** 0..1 flashbang blindness, decayed in the render loop */
  const flashRef = useRef(0);
  const flashElRef = useRef<HTMLDivElement | null>(null);
  /** true while a bomb is in hand, waiting for the fire button */
  const [bombArmed, setBombArmed] = useState(false);
  const throwBombRef = useRef(() => {});
  /** the scene tells us when the held bomb actually left the hand */
  const onBombThrownRef = useRef(() => {});
  /** called by the scene when a channelled heal ends: leftover 0..1 of the kit */
  const onHealEndRef = useRef<(leftover: number) => void>(() => {});
  onHealEndRef.current = (leftover) => {
    setHealProgress(0);
    if (leftover <= 0.02) {
      setKits((k) => Math.max(0, k - 1));
      setKitPartial(1);
    } else {
      setKitPartial(leftover);
    }
  };
  const [wallCharges, setWallCharges] = useState(3);
  /**
   * Everything the shared backpack pool counts, in one object, so `bagUnits`/`roomFor*` have a
   * single argument and the render loop has a single ref to read. There is no new source of truth
   * here — every field is an existing piece of state, which is why the capacity rule could be
   * bolted on without a migration.
   */
  const bagLoad: BagLoad = { kits, inhalers, grenades, walls: wallCharges, ammo: ammoPool };
  const bagLoadRef = useRef(bagLoad);
  bagLoadRef.current = bagLoad;
  const backpackLevelRef = useRef<BackpackLevel>(backpackLevel);
  backpackLevelRef.current = backpackLevel;
  /** 0..1, for the red ring around the backpack button and the loot panel's own bar. */
  const bagFillPct = bagFillOf(bagLoad, backpackLevel);
  /**
   * The container the player is standing on, mirrored into React so `LootPanel` can draw it.
   *
   * The authoritative list lives in the render loop (`groundLoot`); this is a copy whose identity
   * changes every time a line is taken, which is what re-renders the panel. Null closes it.
   */
  const [openStash, setOpenStash] = useState<Stash | null>(null);
  const takeStashRef = useRef<(index: number, swapWith?: string) => void>(() => {});
  const takeAllStashRef = useRef<() => void>(() => {});
  const closeStashRef = useRef<() => void>(() => {});
  const throwItemRef = useRef<(req: ThrowRequest) => void>(() => {});
  /** Set inside the render loop; lets the backpack's Throw button reach `addLoot`. */
  const dropToWorldRef = useRef<(id: string) => void>(() => {});
  const [armor, setArmor] = useState<ArmorState>(emptyArmor());
  const armorRef = useRef<ArmorState>(emptyArmor());
  /** true while the frost wall ghost preview is being positioned */
  const [placingWall, setPlacingWall] = useState(false);
  const consumeWallChargeRef = useRef(() => {});
  const throwShieldWallRef = useRef(() => {});
  const placePingRef = useRef<(kind?: PingKind) => void>(() => {});
  const callPetRef = useRef<() => void>(() => {});
  // call-your-car (BR): summon/dismiss your owned car, and enter/exit it on foot.
  const callCarRef = useRef<() => void>(() => {});
  const carEnterExitRef = useRef<() => boolean>(() => false);
  /** Seconds until another car-impact thud may fire — a scrape along a wall hits every frame. */
  const carImpactCooldownRef = useRef(0);
  // latest equipWeapon, so the render loop (BR loot pickups) can equip using
  // current slot/active-slot state rather than a stale mount-time closure.
  const equipWeaponRef = useRef<(w: Weapon) => void>(() => {});
  const [petCalled, setPetCalled] = useState(0);
  /** true while seated in the car (drives the HUD Exit prompt / hides combat UI) */
  const [driving, setDriving] = useState(false);
  /** true while a parked car is within reach on foot (drives the Drive prompt) */
  const [nearCar, setNearCar] = useState(false);
  const cyclePingKindRef = useRef(() => {});
  const currentPingKindRef = useRef<PingKind>("enemy");
  consumeWallChargeRef.current = () => setWallCharges((w) => Math.max(0, w - 1));
  const [touchUi, setTouchUi] = useState(false);
  const [settings, setSettings] = useState<ArenaSettings>(() => defaultSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<ArenaSettings>(settings);
  settingsRef.current = settings;

  /** load persisted settings after hydration, then keep audio + storage in sync */
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
  }, []);

  /** One-tap mute from the HUD. The `settings` effect below is what persists it and reaches sfx. */
  const toggleMute = useCallback(() => {
    setSettings((s) => ({ ...s, muted: !s.muted }));
  }, []);

  /**
   * Fullscreen toggle for the HUD strip.
   *
   * `documentElement`, not the canvas: the HUD is a sibling of the canvas in the React tree, so
   * fullscreening the canvas alone would hide every control. Must stay inside a click handler —
   * the browser only honours the request during a user gesture. The `fullscreenchange` listener
   * further down owns the `fullscreen` state, so F11 and Escape keep the icon honest, and it is
   * also what arms the reserved-key guard (Ctrl+W is only swallowed while fullscreen).
   */
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const req = el.requestFullscreen
      ? el.requestFullscreen({ navigationUI: "hide" })
      : el.webkitRequestFullscreen?.();
    // A refused request is not worth an error page — the player can still use F11.
    void Promise.resolve(req).catch(() => {});
  }, []);

  toggleCursorRef.current = () => {
    const canvas = mountRef.current?.querySelector("canvas");
    if (document.pointerLockElement === canvas) {
      freeCursorRef.current = true;
      setCursorFree(true);
      document.exitPointerLock?.();
    } else {
      freeCursorRef.current = false;
      setCursorFree(false);
      canvas?.requestPointerLock?.();
    }
  };

  useEffect(() => {
    setCollisionDebugRef.current(collisionDebug);
    if (!collisionDebug) {
      setBlockReason("");
      return;
    }
    const id = window.setInterval(() => setBlockReason(blockReasonRef.current), 150);
    return () => window.clearInterval(id);
  }, [collisionDebug]);

  useEffect(() => {
    saveSettings(settings);
    setSfxVolume(settings.masterVolume * settings.sfxVolume);
    setSfxMuted(settings.muted);
    applyFovRef.current(settings.fov);
    applyAtmosphereRef.current(settings.skyBrightness, settings.fogIntensity, settings.cloudMotion);
  }, [settings]);

  /** shrinks the HUD on small / short (phone landscape) screens so it stops overlapping */
  const [hudScale, setHudScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerHeight / 760, window.innerWidth / 1180, 1);
      setHudScale(Math.max(0.55, s) * settings.hudScale);
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
    };
  }, [settings.hudScale]);



  const showRoofRef = useRef(true);
  const clipRef = useRef<{ renderer: THREE.WebGLRenderer; plane: THREE.Plane } | null>(null);
  const modeRef = useRef<Mode>("walk");
  const settingsOpenRef = useRef(false);
  const collidersRef = useRef<THREE.Mesh[]>([]);
  const startMatchRef = useRef<(() => void) | null>(null);
  const laserRef = useRef<{
    line: THREE.Line;
    material: THREE.LineBasicMaterial;
    spark: THREE.PointLight;
    sparkMesh: THREE.Mesh;
    ttl: number;
  } | null>(null);
  const muzzleRef = useRef<{
    light: THREE.PointLight;
    mesh: THREE.Mesh;
    ttl: number;
  } | null>(null);
  const recoilRef = useRef(0);
  const recoilYawRef = useRef(0);
  const weaponCooldownRef = useRef(0);
  const hitMarkerRef = useRef(0);
  const weaponRef = useRef<string>("fists");
  const matchRef = useRef({
    blue: 0,
    red: 0,
    phase: "warmup" as MatchPhase,
    round: 1,
    roundWinner: null as Team | null,
    matchWinner: null as Team | null,
    countdown: 0,
  });
  const killFeedRef = useRef<KillFeedItem[]>([]);
  const intermissionRef = useRef(0);
  const countdownRef = useRef(0);
  const shakeRef = useRef(0);
  const applyFovRef = useRef<(fov: number) => void>(() => {});
  /** live sky exposure / fog strength / cloud drift on outdoor maps */
  const applyAtmosphereRef = useRef<(sky: number, fog: number, clouds: number) => void>(() => {});
  const sprintToggleRef = useRef(false);
  const useHealthKitRef = useRef<() => void>(() => {});
  /** the operative chosen in the lobby, plus their live ability state */
  const characterRef = useRef(loadCharacter());
  const profileRef = useRef<PlayerProfile | undefined>(profile);
  profileRef.current = profile;
  const power = POWERS[characterRef.current.power];
  const powerRef = useRef({ active: 0, cooldown: 0, shield: 0 });
  const [powerHud, setPowerHud] = useState({ active: 0, cooldown: 0, shield: 0 });
  const activatePowerRef = useRef<() => void>(() => {});
  const spawnCageRef = useRef<{
    mesh: THREE.Object3D;
    center: THREE.Vector3;
    halfX: number;
    halfZ: number;
  } | null>(null);

  const saveSentRef = useRef(false);
  const introRef = useRef(0);
  const ammoRef = useRef<Record<string, { mag: number }>>({
    deagle: { mag: 7 },
  });
  /** Mirror of `ammoPool` for the render loop, which cannot read state. */
  const ammoPoolRef = useRef<AmmoPools>(ammoPool);
  const isReloadingRef = useRef(false);
  const reloadTimerRef = useRef(0);
  const reloadLeftRef = useRef(0);
  const reloadingWeaponRef = useRef<string | null>(null);
  const startReloadRef = useRef<(id: string) => void>(() => {});
  const mouseHeldRef = useRef(false);
  const autoFireRef = useRef(settings.autoFire);
  autoFireRef.current = settings.autoFire;
  const burstQueueRef = useRef<{ shotsLeft: number; nextIn: number } | null>(null);
  const sfxInitializedRef = useRef(false);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const damageFlashRef = useRef(0);
  const tacticalRef = useRef<TacticalMatchState>(createTacticalState());
  const radarRef = useRef<RadarState>({ fighters: [], player: null, decoys: [], pings: [] });
  const mapGridRef = useRef<MapGrid | null>(null);
  const mapImageRef = useRef<string | null>(null);
  const adsRef = useRef(false);
  const adsProgressRef = useRef(0);
  const scopedRef = useRef(false);
  const scopeRef = useRef<HTMLDivElement>(null);
  const centerDotRef = useRef<HTMLDivElement>(null);
  const adsVignetteRef = useRef<HTMLDivElement>(null);
  const popupIdRef = useRef(0);
  const popupTimersRef = useRef<number[]>([]);
  /** live movement keys, shared between the desktop loop and the touch HUD */
  const keysRef = useRef<Set<string>>(new Set());
  const proneRef = useRef(false);
  const crouchRef = useRef(false);
  /** mirrors `human.downed` for the per-frame closures (eye height, speed, guards) */
  const downedRef = useRef(false);
  /** imperative hooks into the render loop, wired up once the scene exists */
  const actionsRef = useRef<{
    triggerDown: () => void;
    triggerUp: () => void;
    toggleAds: () => void;
    jump: () => void;
    reload: () => void;
    /** starts the channelled medkit; fraction is how much of the kit is left */
    startHeal: (fraction: number) => boolean;
    cancelHeal: () => void;
    /** take a bomb in hand / put it away; returns the new armed state */
    armBomb: () => boolean;
    /** returns true when a charge was consumed (a wall actually got placed) */
    wallButton: () => boolean;
    cancelWall: () => void;
  } | null>(null);

  // Emote / dance, in-match. `danceRef` is wired to the local player's rig once it loads;
  // the wheel (opened by the dance key or the touch emote button) drives it. Dancing is
  // cancelled automatically by the rig the moment the player moves.
  const danceRef = useRef<{ play: (id: string) => void; stop: () => void } | null>(null);
  /**
   * One-shot passthrough to the local player's rig, for animations triggered by INPUT rather
   * than by observable motion state — the stance transitions (stand<->crouch, crouch->prone),
   * the revive, the grenade throw. Wired alongside `danceRef` once the body's rig lands, and
   * a no-op until then: a stance key pressed in the first frames of a match must not throw.
   *
   * It exists because the keydown handler lives outside the scene effect and cannot see
   * `humanBody`; everything else that animates the player is driven from setMotion instead.
   */
  const bodyClipRef = useRef<
    ((clip: string, opts?: { fade?: number; fullBody?: boolean; rate?: number; reverse?: boolean }) => void) | null
  >(null);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [activeDance, setActiveDance] = useState<string | undefined>(undefined);
  const emoteOpenRef = useRef(false);
  emoteOpenRef.current = emoteOpen;
  // Held in a ref so the low-level keydown listener (registered once) can toggle the wheel
  // without being torn down and re-added whenever the callback identity changes.
  const toggleEmoteRef = useRef(() => {});




  modeRef.current = mode;
  settingsOpenRef.current = settingsOpen;

  // Toggle the in-match emote wheel. Opening it frees the cursor (and suppresses the
  // pointer-unlock pause the same way the ` cursor release does) so the ring is clickable
  // without leaving the round.
  const toggleEmote = useCallback(() => {
    setEmoteOpen((open) => {
      const next = !open;
      if (next) {
        freeCursorRef.current = true;
        if (typeof document !== "undefined" && document.pointerLockElement) document.exitPointerLock();
      }
      return next;
    });
  }, []);
  toggleEmoteRef.current = toggleEmote;

  useEffect(() => {
    const nextWeapon = (slots[activeSlot] ?? "fists") as string;
    if (weaponRef.current !== nextWeapon && isReloadingRef.current && reloadingWeaponRef.current !== nextWeapon) {
      // cancel reload when switching away from the weapon being reloaded
      isReloadingRef.current = false;
      reloadingWeaponRef.current = null;
      reloadTimerRef.current = 0;
      reloadLeftRef.current = 0;
      setIsReloading(false);
      setReloadLeft(0);
    }
    weaponRef.current = nextWeapon;
    if (sfxInitializedRef.current) playSfx("equip", 0.6);
    // dropping the scope when swapping to a weapon that has none
    const cls = getWeapon(nextWeapon)?.cls;
    if (cls === "Shotgun" || cls === "Melee") setScoped(false);
  }, [slots, activeSlot]);

  useEffect(() => {
    scopedRef.current = scoped;
  }, [scoped]);

  useEffect(() => {
    proneRef.current = prone;
  }, [prone]);

  useEffect(() => {
    crouchRef.current = crouch;
  }, [crouch]);

  useEffect(() => {
    // The HUD is designed as a mobile-style touch layout, so it is always shown.
    setTouchUi(true);
  }, []);


  useEffect(() => {
    ammoRef.current = ammo;
  }, [ammo]);

  useEffect(() => {
    ammoPoolRef.current = ammoPool;
  }, [ammoPool]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    isReloadingRef.current = isReloading;
  }, [isReloading]);




  useEffect(() => {
    // Defer leaderboard fetch so boot / map load isn't competing for bandwidth.
    const fetchLeaderboard = () => {
      getLeaderboard()
        .then((res) => setOrbitLeaderboard(res))
        .catch(() => {});
    };
    const leaderboardTimer = window.setTimeout(fetchLeaderboard, 2500);
    const onFirstInteraction = () => {
      window.clearTimeout(leaderboardTimer);
      fetchLeaderboard();
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true });

    const mount = mountRef.current;
    if (!mount) return;

    // read the persisted quality preset fresh so the renderer is configured
    // before the first frame, without waiting for the settings state effect.
    const bootSettings: Partial<ArenaSettings> = (() => {
      try {
        const raw = window.localStorage.getItem("lonewolf.settings.v1");
        return raw ? (JSON.parse(raw) as Partial<ArenaSettings>) : {};
      } catch {
        return {};
      }
    })();
    const q = bootSettings.quality;
    const initialQuality: Quality = q === "low" || q === "medium" || q === "high" ? q : "medium";
    // Baked lighting draws the level unlit, so a shadow map has nothing static
    // left to fall on — fighters get cheap blob shadows instead.
    const bakedLight = typeof bootSettings.bakedLight === "boolean" ? bootSettings.bakedLight : true;
    const initialShadows =
      (typeof bootSettings.shadows === "boolean" ? bootSettings.shadows : initialQuality !== "low") && !bakedLight;
    const initialRenderScale =
      typeof bootSettings.renderScale === "number" && Number.isFinite(bootSettings.renderScale)
        ? Math.max(0.5, Math.min(1, bootSettings.renderScale))
        : 1;
    const initialFov =
      typeof bootSettings.fov === "number" && Number.isFinite(bootSettings.fov)
        ? Math.max(55, Math.min(110, bootSettings.fov))
        : 70;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.fog = new THREE.Fog(0x0d1117, initialQuality === "low" ? 120 : 160, initialQuality === "low" ? 360 : 520);

    let BASE_FOV = initialFov;
    const camera = new THREE.PerspectiveCamera(BASE_FOV, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    applyFovRef.current = (fov: number) => {
      BASE_FOV = fov;
      if (!adsRef.current) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    };

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      /*
       * `preserveDrawingBuffer` is deliberately OFF. It forces the driver to keep a copy of the
       * drawing buffer every frame so `canvas.toBlob()` can read it back, and it costs real time
       * in the present path. The only thing that needed it is `capture.ts` (screenshot/recording),
       * and nothing in `src/` imports that module — it is unwired. Turn this back on the moment a
       * screenshot or clip button is actually wired to `captureScreenshot`/`startRecording`, or the
       * capture will silently produce black frames.
       */
    });
    // Always render at (close to) native density — a capped ratio was what made
    // the arena look soft/washed after the map optimisation pass.
    const pixelRatio = () =>
      Math.min(window.devicePixelRatio || 1, initialQuality === "low" ? 1.5 : initialQuality === "medium" ? 2 : 3) *
      initialRenderScale;
    renderer.setPixelRatio(pixelRatio());
    /*
     * DYNAMIC RESOLUTION, used by exactly one thing: the skydive.
     *
     * The dive is the only moment in the match that is fill-rate bound rather than draw-call bound.
     * From the plane the frustum holds the whole island, so every pixel of a native-density
     * framebuffer is shading distant terrain, and on a 2x display that is four times the work of the
     * 1x equivalent for detail nobody can resolve while falling at 40 m/s. Consoles solve this with
     * dynamic resolution and so does this: two thirds of the linear density is 44% of the pixels.
     *
     * It is a multiplier rather than a direct `setPixelRatio` call so a window resize mid-dive
     * cannot silently restore full density — `onResize` goes through the same helper.
     */
    let renderScaleMul = 1;
    const applyPixelRatio = () => renderer.setPixelRatio(pixelRatio() * renderScaleMul);
    const DIVE_PIXEL_SCALE = 0.66;
    const setDiveResolution = (on: boolean) => {
      const want = on ? DIVE_PIXEL_SCALE : 1;
      if (want === renderScaleMul) return;
      renderScaleMul = want;
      applyPixelRatio();
    };
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = initialShadows;
    renderer.shadowMap.type = initialQuality === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.26; // +20% brighter overall
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.userSelect = "none";
    mount.appendChild(renderer.domElement);

    // Warm the weapon-model cache the moment the renderer exists. Each gun GLB is 1–4 MB and used
    // to be fetched + parsed only when a fighter first equipped it — so selecting a weapon stalled
    // ~20 s while its model streamed in before it appeared in the hand. Preloading every registered
    // prop up front (fire-and-forget, deduped by URL in loadWeaponModel's cache) means `socket.set`
    // finds a cached scene and clones it instantly. A failed URL just leaves that one gun empty.
    for (const prop of Object.values(WEAPON_PROPS)) {
      loadWeaponModel(prop.url, renderer).catch(() => {});
    }

    const safeZoneVisual = createSafeZoneVisual(1);
    safeZoneVisual.mesh.visible = false;
    scene.add(safeZoneVisual.mesh);

    // ---- Lighting rig ----
    // With baked lighting on, the level is unlit: these lights only shade the
    // handful of dynamic objects (fighters, frost walls, props), so the extra
    // fill/bounce lights are pure per-fragment cost and get dropped.
    scene.add(new THREE.HemisphereLight(0x9fc6ff, 0x7a8a9a, bakedLight ? 1.0 : 1.62));

    const sun = new THREE.DirectionalLight(0xffd9a0, 2.52);
    sun.position.set(90, 120, 60);
    sun.castShadow = initialShadows;
    sun.shadow.mapSize.set(
      initialQuality === "high" ? 2048 : initialQuality === "medium" ? 1024 : 512,
      initialQuality === "high" ? 2048 : initialQuality === "medium" ? 1024 : 512,
    );
    // A 220-unit-wide shadow frustum spread the whole map over one map; a tight
    // box that travels with the player is both far cheaper and much sharper.
    const s = initialQuality === "low" ? 28 : initialQuality === "medium" ? 40 : 55;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    const sunTarget = new THREE.Object3D();
    scene.add(sunTarget);
    sun.target = sunTarget;
    const SUN_OFFSET = new THREE.Vector3(70, 110, 50);
    // Static level + a handful of fighters: re-rendering the shadow map at
    // 30 Hz instead of every frame is invisible and saves a full extra pass.
    renderer.shadowMap.autoUpdate = false;
    let shadowClock = 0;
    /**
     * Frame counter for the hidden-render throttle. While `hidden` is true this canvas is behind the
     * waiting island or the deploy splash, so it draws one frame in six — enough to keep textures
     * uploaded and the pipeline warm, cheap enough that the room in front of it stays smooth and the
     * level finishes building sooner. See `hiddenRef`.
     */
    let hiddenTick = 0;
    /**
     * True from mount until the level build has finished and its shaders are linked.
     *
     * Nothing draws this canvas while it is set, and that is not an optimisation. The first render
     * of a freshly added level is where the driver links every program in it — a couple of hundred
     * on the island — and that is a synchronous, multi-second stall. Letting it land in a rAF
     * callback behind a canvas nobody is looking at is how the tab ends up "Page Unresponsive"
     * while the player is still walking around the waiting room. `compileAsync` does that work off
     * the critical path instead (see the end of the level build), and this flag is what stops an
     * earlier throttled frame from beating it to it. It fail-opens: it clears when the build
     * settles either way, and a visible canvas ignores it outright.
     */
    let building = true;

    if (!bakedLight) {
      const fill = new THREE.DirectionalLight(0x7fa8ff, 0.78);
      fill.position.set(-80, 60, -70);
      scene.add(fill);

      const groundFill = new THREE.PointLight(0xffc48a, 2.64, 260, 1.5);
      groundFill.position.set(0, 8, 0);
      scene.add(groundFill);
    }

    scene.add(new THREE.AmbientLight(0xffffff, bakedLight ? 0.42 : 0.66));

    const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 20);
    renderer.localClippingEnabled = true;

    const root = new THREE.Group();
    scene.add(root);

    // ---- Friend Island basketball (in-world throw with landing preview) ----
    let hoopScore = 0;
    let hoopShots = 0;
    let hoopMsg = "";
    let hoopMsgT = 0;
    const hoops: Basketball | null =
      mapIdRef.current === "friend-island"
        ? createBasketball(scene, (ev) => {
            if (ev === "score") {
              hoopScore += 1;
              hoopMsg = "Swish! +1";
              playSfx("buy", 0.6);
            } else if (ev === "miss" && hoopMsg !== "Swish! +1") hoopMsg = "Missed — try again";
            else if (ev === "rim") hoopMsg = hoopMsg || "Off the rim…";
            hoopMsgT = 1.8;
          })
        : null;
    hoopChargeRef.current = {
      start: () => !!hoops?.startCharge(),
      release: () => {
        const ok = !!hoops?.release();
        if (ok) {
          hoopShots += 1;
          hoopMsg = "";
          // Full-body shot animation (authored long, so played faster).
          humanBody?.rig?.play(CLIP.basketballThrow, { rate: THROW_CLIP_RATE, fullBody: true });
        }
        return ok;
      },
    };
    // GTA-style "stand here" light pillars at every game station and on the court.
    const stationMarkers = mapIdRef.current === "friend-island" ? createStationMarkers(scene) : null;
    const hoopPrevPos = new THREE.Vector3();
    const hoopCamDir = new THREE.Vector3();
    let islandPromptCur: string | null = null;
    let hoopHudKey = "";

    // ---- Player laser ----
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const laserMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
    const laserLine = new THREE.Line(laserGeo, laserMat);
    laserLine.frustumCulled = false;
    root.add(laserLine);

    const sparkMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }),
    );
    sparkMesh.visible = false;
    root.add(sparkMesh);

    const sparkLight = new THREE.PointLight(0xffa040, 0, 12, 2);
    sparkLight.position.set(0, -1000, 0);
    root.add(sparkLight);

    laserRef.current = { line: laserLine, material: laserMat, spark: sparkLight, sparkMesh, ttl: 0 };

    // ---- Muzzle flash ----
    const muzzleGeo = new THREE.SphereGeometry(0.07, 12, 12);
    const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0 });
    const muzzleMesh = new THREE.Mesh(muzzleGeo, muzzleMat);
    muzzleMesh.visible = false;
    root.add(muzzleMesh);
    const muzzleLight = new THREE.PointLight(0xffa040, 0, 18, 2);
    muzzleLight.position.set(0, -1000, 0);
    root.add(muzzleLight);
    muzzleRef.current = { light: muzzleLight, mesh: muzzleMesh, ttl: 0 };

    // ---- impact spark pool ----
    const impactPool: ImpactFx[] = [];
    for (let i = 0; i < (initialQuality === "low" ? 2 : 4); i++) {
      const fx = createImpactFx(initialQuality);
      root.add(fx.group);
      impactPool.push(fx);
    }
    const spawnImpact = (at: THREE.Vector3, color?: THREE.Color) => {
      const fx = impactPool.find((f) => f.group.visible === false) ?? impactPool[0]!;
      fx.burst(at, color);
    };

    // ---- state ----

    let theta = Math.PI * 0.25;
    let phi = 0.85;
    let radius = 190;
    const target = new THREE.Vector3(0, 6, 0);

    const walkPos = new THREE.Vector3(-50, 0, -66); // FEET position
    // sampled once per frame so bots can tell a strafing player from a static one
    const prevWalkPos = walkPos.clone();
    const walkMovingRef = { current: false };
    let velY = 0;
    let grounded = false;
    // Last position where the player had solid footing. If they ever punch
    // through the terrain (a gap in the collision proxy, a bad skydive landing,
    // sinking on a steep slope) the physics step below restores them here instead
    // of letting gravity drag them through the world forever.
    const lastGroundPos = walkPos.clone();
    // movement-audio bookkeeping
    const lastStepPos = new THREE.Vector3(-50, 0, -66);
    let stepDist = 0;
    let stepIndex = 0;
    let runStepIndex = 0;
    const STEP_KINDS = ["step1", "step2", "step3", "step4"] as const;
    const RUN_KINDS = ["steprun", "steprun2"] as const;
    let yaw = Math.PI * 0.75;
    let pitch = 0;
    const keys = keysRef.current;
    keys.clear();
    /** stance lowers the camera and the muzzle; being knocked drops it lowest */
    const eyeHeight = () => (downedRef.current ? 0.6 : proneRef.current ? 0.85 : crouchRef.current ? 1.25 : EYE_HEIGHT);

    /**
     * Is the third-person camera driving right now?
     *
     * ADS always wins. Every sight in the game — the scope glass, the ADS vignette, the FOV
     * pull — is authored for a camera sitting in the player's eye, and none of it means anything
     * from three metres behind their shoulder, so aiming down sights drops to first person on
     * either setting. That also keeps the one situation where the crosshair has to be exact
     * (see the convergence note in the walk camera) on the view where it is exact by definition.
     */
    const thirdPersonActive = () =>
      settingsRef.current.cameraView === "third" && !adsRef.current;
    const companionRef: { current: PetCompanion | null } = { current: null };
    // Call-your-car: the single owned-car rig (lazy-loaded on first call), plus the
    // seated/near flags the render loop and HUD read. Refs (not state) so the frame
    // loop mutates them without re-rendering; the matching React state mirrors them
    // only for the HUD prompt.
    const carRef: { current: CarRig | null } = { current: null };
    let carLoading = false;
    const drivingRef = { current: false };
    const nearCarRef = { current: false };
    let fetchTimer = 0;

    const fighters: Fighter[] = [];
    const fxList: SpawnFx[] = [];
    let human: Fighter | null = null;
    /**
     * Squad nameplates, one per teammate, keyed by fighter id. Created on the first frame a
     * teammate is eligible rather than in `addFighter`, because eligibility needs `human` (whose
     * team decides who counts as a friend) and the roster is built before the sides are settled.
     * Enemies never get one on purpose — the plates ignore depth, so an enemy plate is a wallhack.
     */
    const nameplates = new Map<string, Nameplate>();
    /**
     * Show / move / hide one fighter's squad plate. Cheap enough to call for every fighter every
     * frame: an ineligible one costs a Map lookup and a boolean, an eligible one a distance, a dot
     * product, and — only when the range TEXT changes — one 320x96 canvas repaint.
     *
     * `f.group.visible` is part of eligibility because the arena hides fighter bodies during the
     * spawn intro and the skydive while their `pos` still reads the old ground spot; a plate over an
     * invisible teammate would be pointing at where they used to be.
     */
    const syncNameplate = (f: Fighter) => {
      const mine = human;
      const eligible =
        !!mine && f !== mine && !f.isHuman && f.team === mine.team && f.alive && !!f.group?.visible;
      let plate = nameplates.get(f.id);
      if (!eligible) {
        plate?.hide();
        return;
      }
      if (!plate) {
        plate = createNameplate(f.name);
        scene.add(plate.object);
        nameplates.set(f.id, plate);
      }
      plate.update(f.pos, camera, f.downed ? "downed" : "up");
    };
    /**
     * The player's own third-person body. On screen for the whole match now that third person is
     * the default camera — it comes off only during ADS, while dead, and in first person — plus
     * the spawn intro and the battle-royale skydive, which drive it themselves.
     */
    let humanBody: {
      group: THREE.Group;
      meshes: THREE.Mesh[];
      rig: OperativeRig | null;
      /** the player swaps weapons mid-match, so their prop socket has to be reachable to re-set */
      weaponSocket: WeaponSocket | null;
      /** and so does the back/hip set, which is the other half of the same swap */
      holsters: Holsters | null;
      lastPos: THREE.Vector3;
      vel: THREE.Vector3;
    } | null = null;

    const scoreState: Record<Team, number> = { blue: 0, red: 0 };
    const playerStats = { kills: 0, deaths: 0, headshots: 0 };
    let bountyBonus = 0;




    /*
     * Last pushed HUD state, as a string. See `syncHud`.
     *
     * Deliberately outside the function: it has to survive across calls, and it must NOT be a ref —
     * a ref would tempt a render to read it, and this is a value only the frame loop owns.
     */
    let hudSignature = "";

    /**
     * Push the fighter roster, score, health, armour and squad list into React.
     *
     * This is called from nineteen places. Eighteen are events — a kill, a pickup, a revive — and
     * those are cheap by nature. The other two are the EP→HP conversion and the regen power, and
     * both call it EVERY FRAME for as long as they are running: two fresh arrays of objects and six
     * setState calls per frame, re-rendering the whole HUD tree, to display numbers that change a
     * few times a second. That is the kind of cost that does not show up as a stutter you can point
     * at — it shows up as the whole game feeling heavy while you are hurt, which is the exact moment
     * it can least afford to.
     *
     * So the guard lives HERE rather than at the two call sites. Every caller gets it, nobody has to
     * remember it, and a future call site added inside the loop cannot reintroduce the problem.
     *
     * The signature is built from the values as DISPLAYED — health is rounded, timers are ceiled —
     * so regenerating at 3 HP/s changes it three times a second and the other fifty-seven frames
     * cost one string compare. Building the string still allocates, but a small string beats two
     * object arrays plus a React reconciliation by a wide margin.
     */
    const syncHud = () => {
      const currentHuman = human;
      let sig = `${scoreState.blue}:${scoreState.red}`;
      for (const f of fighters) {
        sig += `|${f.id}${Math.max(0, Math.round(f.hp))}${f.alive ? 1 : 0}${f.downed ? 1 : 0}`;
      }
      if (currentHuman) {
        const a = currentHuman.armor;
        sig += `#${Math.max(0, Math.round(currentHuman.hp))}`;
        sig += `/${currentHuman.alive ? 0 : Math.ceil(currentHuman.respawnIn)}`;
        // Armour is two nullable objects; the level and durability are what the HUD draws.
        sig += `/${a.vest ? `${a.vest.level}.${Math.round(a.vest.durability)}` : "-"}`;
        sig += `/${a.helmet ? `${a.helmet.level}.${Math.round(a.helmet.durability)}` : "-"}`;
      }
      // Outside the guard on purpose. This is a ref write, so it costs nothing and skipping it is
      // not a saving — and it must not be skipped: the signature compares armour by level and
      // durability, so swapping a vest for an identical one leaves the ref pointing at the OLD
      // object, and the next hit would mutate a vest nothing is reading.
      if (currentHuman) armorRef.current = currentHuman.armor;
      if (sig === hudSignature) return;
      hudSignature = sig;

      setHud(
        fighters.map((f) => ({
          id: f.id,
          team: f.team,
          hp: Math.max(0, Math.round(f.hp)),
          alive: f.alive,
          isHuman: f.isHuman,
          downed: f.downed,
        })),
      );
      setScore({ ...scoreState });
      if (currentHuman) {
        setPlayerHp(Math.max(0, Math.round(currentHuman.hp)));
        setPlayerRespawn(currentHuman.alive ? 0 : Math.ceil(currentHuman.respawnIn));
        setArmor(currentHuman.armor);
        setTeammates(
          fighters
            .filter((f) => f.team === currentHuman.team)
            .map((f) => ({
              id: f.id,
              name: f.name,
              hp: Math.max(0, f.hp),
              maxHp: MAX_HP,
              alive: f.alive,
              isHuman: f.isHuman,
              downed: f.downed,
            })),
        );
      }
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== "orbit") return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = () => (dragging = false);

    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const scratch = new THREE.Vector3();

    /**
     * Closest hit only. With a BVH-indexed collider this lets the tree prune
     * everything behind the first surface instead of collecting every triangle
     * along the ray — the cheapest probe we can do, and all we ever need for
     * wall checks, line of sight and bullets.
     */
    const castFirst = (
      origin: THREE.Vector3,
      dir: THREE.Vector3,
      far: number,
      objects: THREE.Object3D[] = collidersRef.current,
    ): THREE.Intersection | null => {
      if (objects.length === 0) return null;
      raycaster.set(origin, dir);
      raycaster.far = far;
      (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
      const hit = raycaster.intersectObjects(objects, false)[0] ?? null;
      (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = false;
      return hit;
    };

    /**
     * Movement probes only ever need geometry a step away, so instead of
     * handing them the whole level we hand them the collision tiles around the
     * player (plus any frost walls, which are always few and always close).
     * The selection is cached until the player leaves the tile neighbourhood.
     */
    let collisionTiles: CollisionTile[] = [];
    let cancelWarm: (() => void) | null = null;
    /*
     * ALTITUDE CULL — the skydive's frame-rate fix.
     *
     * Nothing in the level culls itself, so looking down from the aircraft is the one moment in the
     * game whose frustum contains the entire island — every prop on the map, drawn at once. That is
     * exactly what Brook reports: "when i get dropped into the map eveything is soo smooth but the
     * plan and the lobby is totally laggy ass".
     *
     * The rule is angular, not a single on/off height, and that is the whole trick. A prop is hidden
     * while its apparent size is under `CULL_ANGULAR` radians — so it reappears at a FIXED size on
     * screen no matter how big it is. The pop-in is therefore spread across the entire descent, a
     * size band at a time, instead of the whole map's scatter snapping on at one altitude. High up,
     * where the frustum holds everything and the cull is worth the most, it takes out the small
     * scatter wholesale; by touchdown it takes out nothing.
     *
     * THE CONSTANT IS SET BY THE PLANE'S ALTITUDE, WHICH IS 96 M — not the 400 m a battle royale
     * sounds like it should be (`PLANE_ALTITUDE` in skydive.ts). That number decides everything: the
     * cutoff radius is `altitude * CULL_ANGULAR / 2`, so an angle chosen for a 400 m drop culls
     * almost nothing at 96 m — a 0.024 rad threshold hides only what is under ~1.15 m across, which
     * is gravel. Since the plane is the phase Brook actually complained about, the angle is sized for
     * 96 m instead: see `CULL_ANGULAR`.
     *
     * The list is sorted by radius, so "hidden" is always a PREFIX of it and a frame only touches
     * the props that actually crossed the line — usually none, a handful during the fall.
     *
     * Only meshes visible when the list was built are in it, so a restore can never reveal something
     * the level meant to keep hidden. Collision is untouched: colliders are separate invisible
     * proxies, so this cannot drop a diver through a roof.
     */
    let cullProps: { m: THREE.Mesh; r: number }[] = [];
    let cullHidden = 0;
    /**
     * THE CULL MUST NOT RUN BEFORE THE SHADERS ARE LINKED. This is a bug I shipped and Brook found:
     * "now ne oneshowup is after landing its fraze for like 4/5s now and the plan also fraze for
     * like 4/5s" — two freezes, at the two moments this cull changes its mind.
     *
     * `WebGLRenderer.compile` walks the scene with `traverseVisible`. Anything sitting at
     * `visible = false` when the warm-up runs is SKIPPED, and WebGL then compiles and links its
     * shader program lazily and SYNCHRONOUSLY the first frame it is actually drawn. The same trap
     * `prewarmVisuals` was written to dodge for the frost wall and the power effects — and hiding a
     * few thousand props before the compile walked straight into it. Boarding the plane hid them, so
     * the compile missed them; the descent revealed them a size band at a time, so the driver linked
     * the backlog mid-frame. Both freezes are one cause seen twice.
     *
     * So the cull is a no-op until `cullArmed` is set, which happens after the build's `compileAsync`
     * has resolved (or timed out). The cost of waiting is the first seconds of a dive drawing every
     * prop — which is what the game did before this feature existed — and the payoff is that when it
     * does start hiding things, revealing them again is free.
     */
    let cullArmed = false;
    /**
     * Apparent diameter (radians) under which a prop is not worth a draw call.
     *
     * 0.055 rad is about 2.5% of the vertical field of view — roughly 39 px tall on a 900 px window,
     * for a prop drawn as a couple of dozen pixels of texture at the bottom of the screen. At the
     * plane's 96 m that hides everything under ~2.6 m across: bins, crates, bushes, fence posts,
     * rocks, the small scatter that makes up most of the map's mesh count and none of its silhouette.
     *
     * Held to the same rule everything else in this block follows — it hides what you cannot resolve,
     * not what is merely far away. Landmarks are unaffected at any altitude (`CULL_PROP_MAX`), so the
     * map you are choosing a drop spot on is the map you land in.
     */
    const CULL_ANGULAR = 0.055;
    /**
     * Nothing with a world bounding-sphere radius above this is ever hidden, at any altitude.
     *
     * 6 m, down from 8: at 96 m the cutoff only reaches 2.6 m, so the cap is no longer what limits
     * the cull — it is a floor under the pop-in. It exists so that a building, a silo or a bridge can
     * never blink, however the angle is retuned later.
     */
    const CULL_PROP_MAX = 6;
    /** Mean spawn-point ground height, published by the skydive setup so the tick can use it. */
    let groundRefY = 0;
    const cullScaleScratch = new THREE.Vector3();
    const setAltitudeCull = (altitude: number) => {
      if (!cullArmed) return;
      const cutoff = Math.max(0, altitude) * CULL_ANGULAR * 0.5;
      let want = cullHidden;
      while (want < cullProps.length && cullProps[want]!.r < cutoff) want += 1;
      while (want > 0 && cullProps[want - 1]!.r >= cutoff) want -= 1;
      if (want === cullHidden) return;
      if (want > cullHidden) for (let i = cullHidden; i < want; i += 1) cullProps[i]!.m.visible = false;
      else for (let i = want; i < cullHidden; i += 1) cullProps[i]!.m.visible = true;
      cullHidden = want;
    };
    let nearCache: THREE.Mesh[] = [];
    let nearX = Infinity;
    let nearZ = Infinity;
    let nearFx = 0;
    let nearFz = 0;
    const NEAR_RADIUS = 48;
    const VIEW_RADIUS = 140;
    const VIEW_COS_HALF = Math.cos(Math.PI / 3);
    const camFwd = new THREE.Vector3();
    const localColliders = (pos: THREE.Vector3): THREE.Mesh[] => {
      if (collisionTiles.length === 0) return collidersRef.current;
      camera.getWorldDirection(camFwd);
      const dx = pos.x - nearX;
      const dz = pos.z - nearZ;
      // re-select on a step of movement or a meaningful turn
      if (dx * dx + dz * dz > 100 || camFwd.x * nearFx + camFwd.z * nearFz < 0.98) {
        nearX = pos.x;
        nearZ = pos.z;
        nearFx = camFwd.x;
        nearFz = camFwd.z;
        nearCache = activeTileMeshes(
          collisionTiles,
          { x: pos.x, z: pos.z },
          { x: camFwd.x, z: camFwd.z },
          {
            nearRadius: NEAR_RADIUS,
            viewRadius: VIEW_RADIUS,
            viewCosHalfAngle: VIEW_COS_HALF,
            // never index more than one distant tile inside a frame
            maxBuilds: 1,
          },
        );
      }
      const dynamic = collidersRef.current.filter((m) => m.userData["shieldWall"]);
      return dynamic.length ? [...nearCache, ...dynamic] : nearCache;
    };



    /* ---- collision debug overlay ------------------------------------------
     * Draws the *actual* collision geometry (the merged/tiled proxy the movement
     * probes hit) as a wireframe, so invisible walls become visible. Built once
     * on enable, torn down on disable — zero cost while it's off. Geometry is
     * shared with the colliders, so nothing extra is uploaded to the GPU. */
    const collisionDebugGroup = new THREE.Group();
    collisionDebugGroup.visible = false;
    scene.add(collisionDebugGroup);
    const collisionDebugMat = new THREE.MeshBasicMaterial({
      color: 0x39ff9c,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    let collisionDebugBuilt = false;
    const clearCollisionDebug = () => {
      for (const c of collisionDebugGroup.children) {
        const m = c as THREE.Mesh;
        if (m.userData?.["debugOwned"]) {
          m.geometry?.dispose();
          (m.material as THREE.Material)?.dispose();
        }
      }
      collisionDebugGroup.clear();
      collisionDebugBuilt = false;
    };
    const buildCollisionDebug = () => {
      clearCollisionDebug();
      const seen = new Set<THREE.Mesh>();
      for (const t of collisionTiles) seen.add(t.mesh);
      for (const m of collidersRef.current) seen.add(m);
      for (const m of seen) {
        if (!m.geometry) continue;
        m.updateWorldMatrix(true, false);
        const wire = new THREE.Mesh(m.geometry, collisionDebugMat);
        wire.matrixAutoUpdate = false;
        wire.matrix.copy(m.matrixWorld);
        wire.matrixWorldNeedsUpdate = true;
        collisionDebugGroup.add(wire);
      }
      // The hard map-bounds box and the buy-phase spawn cage are pure maths —
      // no geometry — so they are the classic "invisible wall in the middle of
      // nowhere". Draw them too, in different colours.
      const boundsBox = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(0.1, boundsMaxX - boundsMinX),
          14,
          Math.max(0.1, boundsMaxZ - boundsMinZ),
        ),
        new THREE.MeshBasicMaterial({
          color: 0xff3d81,
          wireframe: true,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      boundsBox.position.set((boundsMinX + boundsMaxX) / 2, 6, (boundsMinZ + boundsMaxZ) / 2);
      boundsBox.userData["debugOwned"] = true;
      collisionDebugGroup.add(boundsBox);

      const cage = spawnCageRef.current;
      if (cage) {
        const cageBox = new THREE.Mesh(
          new THREE.BoxGeometry(cage.halfX * 2, SPAWN_BOX_HEIGHT, cage.halfZ * 2),
          new THREE.MeshBasicMaterial({
            color: 0xffd23d,
            wireframe: true,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        cageBox.position.set(cage.center.x, cage.center.y + SPAWN_BOX_HEIGHT / 2, cage.center.z);
        cageBox.userData["debugOwned"] = true;
        collisionDebugGroup.add(cageBox);
      }

      collisionDebugBuilt = true;
    };
    setCollisionDebugRef.current = (on: boolean) => {
      if (on) buildCollisionDebug();
      if (!on) clearCollisionDebug();
      collisionDebugGroup.visible = on;
    };

    const enemyMeshes = (team: Team) =>
      fighters.filter((f) => f.team !== team && f.alive && f.group).flatMap((f) => f.meshes);

    const friendlyMeshes = (team: Team) =>
      fighters.filter((f) => f.team === team && f.alive && f.group).flatMap((f) => f.meshes);

    const fighterByMesh = (mesh: THREE.Object3D) => {
      for (const f of fighters) if (f.meshes.includes(mesh as THREE.Mesh)) return f;
      return null;
    };

    /**
     * Walk physics (ground probing, horizontal collision, jump/gravity/snap).
     * Lives in ./walkPhysics so it can be driven by a headless harness against
     * a real map GLB — see that file's header.
     *
     * `getBounds` is a getter, not a snapshot: boundsMin/Max below are `let` and
     * get reassigned once the level GLB has loaded, so capturing them here by
     * value would pin the resolver to the default ±200 box forever.
     */
    const { groundAt, moveHorizontal, stepVertical } = createWalkPhysics({
      castFirst,
      getBounds: () => ({
        minX: boundsMinX,
        maxX: boundsMaxX,
        minZ: boundsMinZ,
        maxZ: boundsMaxZ,
      }),
      playSfx,
    });


    const pushKillFeed = (killer: Fighter, victim: Fighter, weaponName = "Rifle") => {
      const item: KillFeedItem = {
        id: Math.random().toString(36).slice(2),
        killer: killer.isHuman ? "YOU" : killer.id,
        killerTeam: killer.team,
        victim: victim.isHuman ? "YOU" : victim.id,
        victimTeam: victim.team,
        weapon: weaponName,
        time: 5,
      };
      killFeedRef.current = [item, ...killFeedRef.current].slice(0, 6);
      setKillFeed(killFeedRef.current);
    };

    // Clash Squad loss streak (human's team). Drives the escalating loss payout.
    let csLossStreak = 0;

    const endRound = (winner: Team) => {
      const m = matchRef.current;
      const cfg = matchConfigRef.current;
      m[winner] += 1;
      m.phase = m[winner] >= cfg.roundsToWinMatch ? "matchEnd" : "intermission";
      m.roundWinner = winner;
      m.matchWinner = m[winner] >= cfg.roundsToWinMatch ? winner : null;
      m.countdown = m.matchWinner ? MATCH_END_SECONDS : INTERMISSION_SECONDS;
      intermissionRef.current = m.countdown;
      setMatch({ ...m });
      syncHud();
      const playerTeam = human?.team ?? "blue";
      // Clash Squad economy: pay the human's round result into their buy budget for the
      // next round (a win, or an escalating loss streak), capped. Skipped once the match
      // is decided — there is no round left to spend it on. Driven by `rules.economy` being
      // present rather than by the mode's name, so a second buy mode needs no code here.
      const cash = modeRulesRef.current.economy;
      if (cash && !m.matchWinner) {
        if (winner === playerTeam) {
          csLossStreak = 0;
          setCredits((c) => Math.min(cash.cap, c + cash.winReward));
        } else {
          csLossStreak += 1;
          setCredits((c) => Math.min(cash.cap, c + lossPayout(cash, csLossStreak)));
        }
      }
      if (m.matchWinner === playerTeam) {
        resumeSfx();
        // let the final kill/death one-shots clear before the stinger lands
        window.setTimeout(() => playVictory(0.95), 260);
        window.setTimeout(() => speak("Victory!", { pitch: 0.85 }), 1000);
      } else if (m.matchWinner) {
        window.setTimeout(() => speak("Defeat", { pitch: 0.7, rate: 0.85 }), 700);
      }
      if (m.matchWinner) {

        if (!saveSentRef.current) {
          saveSentRef.current = true;
          saveMatchResult({
            data: {
              blue_score: m.blue,
              red_score: m.red,
              winner: m.matchWinner,
              player_team: human?.team ?? "blue",
              player_kills: playerStats.kills,
              player_deaths: playerStats.deaths,
            },
          }).catch(() => {});
          getLeaderboard()
            .then((res) => setLeaderboard(res))
            .catch(() => {});
          if (profile && onProfileChange) {
            const won = m.matchWinner === human?.team;
            const survivalSeconds = (performance.now() - matchStartTimeRef.current) / 1000;
            const rankPoints = matchType === "ranked" ? rankPointsForMatch(won, playerStats.kills, playerStats.deaths, survivalSeconds) : 0;
            const newPoints = Math.max(0, (profile.rankPoints ?? 0) + rankPoints);
            const updated = applyMatchRewards(profile, {
              won,
              kills: playerStats.kills,
              deaths: playerStats.deaths,
              headshots: playerStats.headshots,
              characterId: characterRef.current.id,
              bountyBonus,
              rankPoints,
              rankTier: rankTierFromPoints(newPoints).name,
            });
            onProfileChange(updated);
          }

        }
        setTimeout(() => {
          saveSentRef.current = false;
          startMatch();
        }, MATCH_END_SECONDS * 1000);
      } else {
        setTimeout(() => startNewRound(), INTERMISSION_SECONDS * 1000);
      }
    };

    // Build the danger zone for the current mode. Pacing, damage and how far in it closes are ALL
    // the mode's phase schedule — this only turns it into world-space radii. Called fresh at the
    // start of every round.
    const resetSafeZone = () => {
      const mapW = boundsMaxX - boundsMinX;
      const mapD = boundsMaxZ - boundsMinZ;
      const rules = modeRulesRef.current;
      const center = new THREE.Vector3(
        (boundsMinX + boundsMaxX) / 2,
        0,
        (boundsMinZ + boundsMaxZ) / 2,
      );
      const startRadius = Math.max(mapW, mapD) * rules.zone.startFactor;
      safeZoneRef.current = createSafeZone(
        center,
        startRadius,
        startRadius * rules.zone.finalFactor,
        rules.zone.phases,
      );
    };

    // --- 2v2 weapon draft -------------------------------------------------
    // One player drafts the loadout that EVERYONE (both teams) uses that round;
    // the drafter rotates every 2 rounds through all four players. A decider
    // round (both teams one win from the match) lets each player pick their own.
    let draftPending: { heavies: string[]; sidearm: string | null } | "human" | null = null;
    const randomOf = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
    const rollLoadout = (): { heavies: string[]; sidearm: string | null } => {
      const heavies = WEAPONS.filter((w) => isHeavy(w)).map((w) => w.id);
      const sidearms = ["deagle", "knife"];
      const h1 = randomOf(heavies);
      if (Math.random() < 0.3) return { heavies: [h1], sidearm: randomOf(sidearms) };
      const h2 = randomOf(heavies);
      return { heavies: h1 === h2 ? [h1] : [h1, h2], sidearm: randomOf(sidearms) };
    };
    const draftOrder = (): Fighter[] => {
      const blue = fighters.filter((f) => f.team === "blue");
      const red = fighters.filter((f) => f.team === "red");
      const order: Fighter[] = [];
      for (let i = 0; i < Math.max(blue.length, red.length); i++) {
        if (blue[i]) order.push(blue[i]!);
        if (red[i]) order.push(red[i]!);
      }
      return order;
    };
    const applyLoadoutToHuman = (heavies: string[], sidearm: string | null) => {
      const ids = [...heavies, ...(sidearm ? [sidearm] : [])];
      setOwned((o) => Array.from(new Set([...o, ...ids])));
      setAmmo((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = { mag: getMagazine(id, profileRef.current) };
        return next;
      });
      const nextSlots = [heavies[0] ?? null, heavies[1] ?? null, sidearm ?? null, "fists"];
      setSlots(nextSlots);
      setActiveSlot(nextSlots[0] ? 0 : nextSlots[2] ? 2 : 3);
      // Buy/draft modes have no ground loot, so a fresh loadout is also the resupply: one crate of
      // every calibre, as far as the pack allows. Loot modes skip it — there, rounds are found.
      if (modeRulesRef.current.resupplyOnLoadout) topUpAmmo();
    };
    const applyLoadoutToBot = (f: Fighter, heavies: string[], sidearm: string | null) => {
      f.weapon = heavies[0] ?? sidearm ?? "fists";
      f.sidearm = sidearm ?? "fists";
      // A draft re-arms everyone without rebuilding a single rig, so the props have to be told:
      // the new gun into the hand, the spare onto the hip. Without this a bot spent the next round
      // holding the previous round's rifle.
      f.weaponSocket?.set(f.weapon);
      f.holsters?.set(carriedOnBody([f.weapon, null, f.sidearm, null], f.weapon));
    };

    // Buy phase begins: choose the drafter. When a bot drafts, roll + apply the
    // shared loadout right away (human is locked out and simply receives it).
    const setupDraft = () => {
      if (!modeRulesRef.current.weaponDraft) {
        humanDraftsRef.current = true;
        setDraftLock(null);
        return;
      }
      const m = matchRef.current;
      const cfg = matchConfigRef.current;
      const decider = m.blue === cfg.roundsToWinMatch - 1 && m.red === cfg.roundsToWinMatch - 1;
      if (decider) {
        humanDraftsRef.current = true;
        setDraftLock(null);
        draftPending = "human";
        for (const f of fighters) if (!f.isHuman) { const l = rollLoadout(); applyLoadoutToBot(f, l.heavies, l.sidearm); }
        return;
      }
      const order = draftOrder();
      const drafter = order[Math.floor((m.round - 1) / 2) % Math.max(1, order.length)];
      if (!drafter || drafter.isHuman) {
        humanDraftsRef.current = true;
        setDraftLock(null);
        draftPending = "human";
      } else {
        humanDraftsRef.current = false;
        setDraftLock(drafter.name);
        const l = rollLoadout();
        draftPending = l;
        applyLoadoutToHuman(l.heavies, l.sidearm);
        for (const f of fighters) if (!f.isHuman) applyLoadoutToBot(f, l.heavies, l.sidearm);
      }
    };

    // Countdown→round flip: lock in the loadout. If the human drafted, their
    // armory picks become everyone's guns now.
    const finalizeDraft = () => {
      if (!modeRulesRef.current.weaponDraft) return;
      if (draftPending === "human") {
        const s = slotsRef.current;
        const heavies = [s[0], s[1]].filter((x): x is string => !!x);
        const sidearm = s[2] ?? null;
        for (const f of fighters) if (!f.isHuman) applyLoadoutToBot(f, heavies, sidearm);
      }
      draftPending = null;
      humanDraftsRef.current = true;
      setDraftLock(null);
    };

    const startNewRound = () => {
      scoreState.blue = 0;
      scoreState.red = 0;
      const buy = openingCountdown(modeRulesRef.current);
      matchRef.current.phase = "countdown";
      matchRef.current.roundWinner = null;
      matchRef.current.countdown = buy;
      matchRef.current.round += 1;
      countdownRef.current = buy;
      clearShieldWalls();
      resetSafeZone();
      setMatch({ ...matchRef.current });
      for (const f of fighters) respawn(f, true);
      setupDraft();
      syncHud();
    };

    const announceStreak = (title: string, sub: string) => {
      const id = performance.now();
      setStreakBanner({ id, title, sub });
      window.clearTimeout(streakRef.current.timer);
      streakRef.current.timer = window.setTimeout(() => setStreakBanner(null), 1900);
      if (title === "Double kill") speakAnnouncer("doubleKill");
      else if (title === "Triple kill" || title === "Quad kill" || title === "Wolfpack" || title === "Unstoppable") speakAnnouncer("tripleKill");
    };

    const trackStreak = (victim: Fighter, killer: Fighter) => {
      const s = streakRef.current;
      if (victim.isHuman) {
        s.count = 0;
        s.multi = 0;
        return;
      }
      if (!killer.isHuman) return;
      const now = performance.now();
      s.multi = now - s.lastAt < 4000 ? s.multi + 1 : 1;
      s.lastAt = now;
      s.count += 1;
      const multiLabel =
        s.multi >= 5 ? "Wolfpack" : s.multi === 4 ? "Quad kill" : s.multi === 3 ? "Triple kill" : s.multi === 2 ? "Double kill" : null;
      if (multiLabel) {
        announceStreak(multiLabel, `${s.multi} in a row, fast`);
        return;
      }
      if (s.count === 3) announceStreak("On a roll", "3 kill streak");
      else if (s.count === 5) announceStreak("Rampage", "5 kill streak");
      else if (s.count === 8) announceStreak("Unstoppable", "8 kill streak");
      else if (s.count > 8 && s.count % 5 === 0) announceStreak("Lone wolf", `${s.count} kill streak`);
    };

    /**
     * Which death crumple matches the stance the fighter died in. Bots are always armed and
     * never prone, so they fall with the rifle; only the human can die prone (belly death) or
     * bare-handed (backward fall).
     */
    const deathClipFor = (v: Fighter): string => {
      if (v.isHuman) {
        if (proneRef.current) return CLIP.proneDeath;
        if (weaponRef.current === "fists") return CLIP.deathBack;
      }
      return CLIP.rifleDeath;
    };

    /**
     * Clear a dead body away: hide it and, in the loot modes, drop the fighter's pack where they
     * fell. Runs after the death-crumple beat (see DEATH_ANIM_SECONDS), or immediately at death
     * for a fighter whose rig GLB hasn't parsed yet and so has no crumple to play.
     *
     * This used to add `lootbox.glb` to the scene and stop there: a prop you walked straight
     * through, which is why killing someone and going to loot them did nothing at all. The drop is
     * now a real container with an explicit LIST of what that fighter was carrying — Brook: "when a
     * person the player should find bhind him the lootbox we have rn u r using it as an airdop
     * anyway we place this after he dieas insted of his backpack ... he will see the icons on the
     * side of the scren of what that player had before". Hence BEHIND the body, facing the way the
     * body faced, and holding their real guns rather than a rolled table.
     */
    const finishDeath = (f: Fighter) => {
      if (f.group) f.group.visible = false;
      // Lone Wolf leaves nothing behind — free drafted weapons in a 90-second duel give a corpse
      // nothing worth looting, and Brook's spec says so outright. One flag, not a list of modes,
      // so a mode added tomorrow does not inherit crates by accident.
      if (!modeRulesRef.current.deathCrate) return;
      const at = f.pos.clone();
      // A metre behind the corpse's own facing — where a backpack would have come off. Forward is
      // (-sin, -cos) everywhere in this file, so behind is the plain +sin/+cos pair.
      const back = f.group?.rotation.y ?? 0;
      at.x += Math.sin(back) * 1.0;
      at.z += Math.cos(back) * 1.0;
      at.y = groundAt(at.x, at.z, f.pos.y + 2, 4) ?? f.pos.y;
      const pack = createDeathPack(renderer);
      pack.rotation.y = back; // faces the way they were running, not a random yaw
      addLoot("pack", pack, at, {
        radius: 1.9,
        animate: false,
        stash: rollDeathStash([f.weapon, f.sidearm]),
      });
    };

    const kill = (victim: Fighter, killer: Fighter) => {
      victim.alive = false;
      victim.downed = false;
      victim.bleedOut = 0;
      victim.beingRevived = 0;
      victim.hp = 0;
      victim.respawnIn = RESPAWN_SECONDS;
      scoreState[killer.team] += 1;
      if (killer.isHuman) {
        playerStats.kills += 1;
        const hasBounty = profileRef.current?.loadout.tactical === "bounty";
        if (hasBounty && bountyBonus === 0) {
          bountyBonus = TACTICAL_BONUS;
          playSfx("equip", 0.8, 0.9);
        }
      }
      if (victim.isHuman) playerStats.deaths += 1;
      setPlayerStatsHud({ kills: playerStats.kills, deaths: playerStats.deaths, headshots: playerStats.headshots });
      if (killer.isHuman || victim.isHuman) playSfx("kill", killer.isHuman ? 0.9 : 0.55);
      if (victim.isHuman) playSfx("death", 0.85);
      else playSfxAt("death", victim.pos.distanceTo(walkPos), 0.6, (Math.random() - 0.5) * 0.08);
      pushKillFeed(killer, victim);
      trackStreak(victim, killer);
      // Drop FF coins from eliminated fighters.
      const bounds = activeMap.bounds;
      if (bounds) {
        const coins = spawnFfCoins(root, victim.isHuman ? 5 : 2, bounds, (x, z) => groundAt(x, z, victim.pos.y, 3));
        ffCoinsRef.current.push(...coins);
      }
      // Death crumple: instead of vanishing, the body stays on screen for a beat playing a held
      // death clip, then `finishDeath` hides it and (in the loot modes) drops their pack. A
      // fighter can be killed before its rig GLB has parsed — nothing to animate — so that case
      // tears down at once. The player's body is the separate `humanBody`, not `victim.rig`.
      // Dying at the wheel: eject onto foot first so the death cam / respawn path runs
      // exactly as it does on foot. The car is left parked where it rolled to a stop.
      if (victim.isHuman && drivingRef.current) {
        drivingRef.current = false;
        setDriving(false);
        stopCarEngine();
      }
      const deathRig = victim.isHuman ? humanBody?.rig ?? null : victim.rig;
      if (deathRig) {
        deathRig.play(deathClipFor(victim), { fullBody: true, hold: true });
        victim.dying = DEATH_ANIM_SECONDS;
      } else {
        victim.dying = 0;
        finishDeath(victim);
      }
      // Clash Squad kill bounty: cash to the human for each enemy they put down.
      const bounty = modeRulesRef.current.economy;
      if (bounty && killer.isHuman && killer !== victim) {
        setCredits((c) => Math.min(bounty.cap, c + bounty.killBonus));
      }
      if (!modeRulesRef.current.respawn) {
        // Elimination — every mode now, Battle Royale included. No respawns. The round
        // ends the instant a whole team is wiped.
        // team is wiped — the surviving team takes it. Knocked teammates are still
        // `alive` but cannot fight, so only a fighter who is up-and-not-down counts.
        const loser = victim.team;
        const stillUp = fighters.some((f) => f.team === loser && f.alive && !f.downed);
        if (!stillUp) endRound(loser === "blue" ? "red" : "blue");
        else syncHud();
      } else if (
        matchConfigRef.current.killsToWinRound !== null &&
        scoreState[killer.team] >= matchConfigRef.current.killsToWinRound
      ) {
        endRound(killer.team);
      } else {
        syncHud();
      }
    };

    /**
     * Knocked-but-alive (Free Fire dbno) — needs `knockdown` and a teammate still up. The teammate
     * test is what makes a SOLO battle-royale drop one life: with nobody to revive you a knock would
     * only be a slower death animation, so the hit kills outright instead. That is Free Fire's own
     * solo behaviour, not a shortcut. A knocked fighter crawls on the belly
     * (`prone_crawl` clip via `downed` in OperativeMotion), bleeds out on a timer, and is
     * finished by ANY further damage; a teammate standing close for REVIVE_SECONDS stands
     * them back up at REVIVE_HP.
     */
    const canKnock = (victim: Fighter, killer: Fighter) =>
      victim.alive &&
      !victim.downed &&
      killer !== victim &&
      modeRulesRef.current.knockdown &&
      fighters.some((f) => f.team === victim.team && f !== victim && f.alive && !f.downed);

    const knock = (victim: Fighter, killer: Fighter) => {
      victim.downed = true;
      victim.hp = DOWNED_HP;
      victim.bleedOut = modeRulesRef.current.downedSeconds ?? BLEED_OUT_SECONDS;
      victim.beingRevived = 0;
      // no driving from the floor
      if (victim.isHuman && drivingRef.current) {
        drivingRef.current = false;
        setDriving(false);
        stopCarEngine();
      }
      if (victim.isHuman) {
        proneRef.current = false;
        crouchRef.current = false;
        setProne(false);
        setCrouch(false);
        playSfx("death", 0.85);
      } else {
        playSfxAt("death", victim.pos.distanceTo(walkPos), 0.6, (Math.random() - 0.5) * 0.08);
      }
      pushKillFeed(killer, victim);
      // The knock plays the death crumple UNHELD: it hands back to locomotion on its
      // `finished` event, and the frame loop's `prone: downed` then drives prone_crawl.
      const rig = victim.isHuman ? humanBody?.rig ?? null : victim.rig;
      rig?.play(deathClipFor(victim), { fullBody: true });
      syncHud();
      // If the whole team is now down or dead, nobody can revive anybody — round over.
      const loser = victim.team;
      const stillUp = fighters.some((f) => f.team === loser && f.alive && !f.downed);
      if (!stillUp) endRound(loser === "blue" ? "red" : "blue");
    };

    /** Stand a knocked fighter back up at partial HP. */
    const reviveFighter = (f: Fighter) => {
      f.downed = false;
      f.bleedOut = 0;
      f.beingRevived = 0;
      f.hp = REVIVE_HP;
      f.rig?.clearOneShot();
      if (f.isHuman) humanBody?.rig?.clearOneShot();
      playSfxAt("equip", f.pos.distanceTo(walkPos), 0.8);
      syncHud();
    };

    /** where the player had to stand still to keep a revive going */
    const lastReviveProbe = new THREE.Vector3();
    let knockHudSig = "";
    /**
     * Per-frame bleed-out / revive tick. Runs only while the round is live. A downed fighter's
     * clock runs out to a real death; the PLAYER revives a downed teammate by standing inside
     * REVIVE_RADIUS and holding still (moving cancels the progress, Free Fire style), and BOTS
     * do the same walk-over-and-hold behaviour in botTick.
     */
    const tickKnocks = (dt: number) => {
      downedRef.current = !!(human && human.alive && human.downed);
      for (const f of fighters) {
        if (!f.downed) continue;
        f.bleedOut -= dt;
        if (f.bleedOut <= 0) {
          f.downed = false;
          kill(f, f); // bled out — the storm convention: credited as a self-death
        }
      }
      let sig = "";
      let hud: { bleeding: number; revivingName: string | null } | null = null;
      if (human?.downed) {
        hud = { bleeding: Math.ceil(human.bleedOut), revivingName: null };
        sig = `k${Math.ceil(human.bleedOut)}`;
      } else if (human && human.alive) {
        const me = human;
        const mate = fighters.find(
          (f) => f.team === me.team && f.downed && f.pos.distanceTo(walkPos) <= REVIVE_RADIUS,
        );
        if (mate) {
          const stoodStill = walkPos.distanceTo(lastReviveProbe) < 0.05;
          if (stoodStill) {
            mate.beingRevived += dt;
            if (mate.beingRevived >= REVIVE_SECONDS) reviveFighter(mate);
          } else {
            mate.beingRevived = 0;
          }
          hud = { bleeding: Math.ceil(mate.bleedOut), revivingName: mate.beingRevived > 0 ? mate.name : null };
          sig = `r${mate.id}:${mate.beingRevived > 0 ? 1 : 0}`;
        }
      }
      lastReviveProbe.copy(walkPos);
      if (sig !== knockHudSig) {
        knockHudSig = sig;
        setKnockHud(hud);
      }
    };

    /** effects of the equipped power + skill slots + pet companion */
    const activeEffects = () => {
      const powerFx = powerRef.current.active > 0
        ? { ...NO_EFFECT, ...POWERS[characterRef.current.power].effects }
        : NO_EFFECT;
      const passiveFx = combinePassives(profileRef.current?.loadout?.passives ?? []);
      const petFx = PETS[profileRef.current?.pet as keyof typeof PETS]?.effect ?? {};
      const get = (obj: Record<string, unknown>, key: string, fallback: number) => {
        const v = obj[key];
        return typeof v === "number" ? v : fallback;
      };
      return {
        speed: get(powerFx, "speed", 1) * passiveFx.speed * get(petFx, "speed", 1),
        damageTaken: get(powerFx, "damageTaken", 1) * passiveFx.damageTaken * get(petFx, "damageTaken", 1),
        damageDealt: get(powerFx, "damageDealt", 1) * passiveFx.damageDealt * get(petFx, "damageDealt", 1),
        recoil: get(powerFx, "recoil", 1) * passiveFx.recoil * get(petFx, "recoil", 1),
        reload: get(powerFx, "reload", 1) * passiveFx.reload * get(petFx, "reload", 1),
        fireRate: get(powerFx, "fireRate", 1),
        regen: get(powerFx, "regen", 0) + passiveFx.regen + get(petFx, "regen", 0),
      };
    };

    /**
     * Apply damage to a fighter and report what actually landed.
     *
     * The return value is for the floating combat text. The caller only knows the raw weapon
     * roll; everything that can eat a bullet lives in here — melee back-deflection, the Emberveil
     * shell, armour, the shield pool — so a caller printing its own number was printing damage the
     * victim never took: a level-3 vest halves it, a deflection cancels it outright, and the popup
     * still said 35. `absorbed` is what armour swallowed, which is what turns the number yellow.
     */
    const damage = (
      victim: Fighter,
      amount: number,
      killer: Fighter,
      headshot = false,
    ): { dealt: number; absorbed: number; blocked: boolean } => {
      const blocked = { dealt: 0, absorbed: 0, blocked: true };
      if (!victim.alive) return blocked;
      let incoming = amount;
      // Melee deflection: pan/bat/katana on the back can block shots from behind
      if (isDeflectionMelee(victim.sidearm)) {
        const toKiller = killer.pos.clone().sub(victim.pos);
        toKiller.y = 0;
        const victimYaw = victim.isHuman ? camera.rotation.y : (victim.group?.rotation.y ?? 0);
        const facing = new THREE.Vector3(Math.sin(victimYaw), 0, Math.cos(victimYaw));
        const behind = toKiller.normalize().dot(facing) > 0.35;
        if (behind && Math.random() < 0.35) {
          playSfxAt("hit", victim.pos.distanceTo(walkPos), 0.6, (Math.random() - 0.5) * 0.1);
          spawnImpact(victim.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), new THREE.Color(0xc0c0c0));
          return blocked;
        }
      }
      if (victim.isHuman) {
        // Emberveil: the round dies on the shell, never reaching the player
        if (barrierUp()) {
          const from = killer.pos.clone().setY(killer.pos.y + 1.2);
          const to = victim.pos.clone().setY(victim.pos.y + 1.1);
          const dir = from.sub(to).normalize().multiplyScalar(barrierDome.radius);
          barrierDome.impact(to.add(dir));
          playSfx("hit", 0.35, -0.35);
          return blocked;
        }
      }
      // Physical armor soaks body/head damage before skills or shields.
      const armor = applyArmor(victim.armor, incoming, headshot);
      incoming = armor.damage;
      if (victim.isHuman) {
        incoming *= activeEffects().damageTaken;
        const st = powerRef.current;
        if (st.shield > 0) {
          const absorbed = Math.min(st.shield, incoming);
          st.shield -= absorbed;
          incoming -= absorbed;
        }
      }
      incoming = Math.max(0, Math.round(incoming));
      victim.hp -= incoming;
      if (victim.isHuman) {
        damageFlashRef.current = 0.7;
        playSfx(Math.random() < 0.5 ? "hurt" : "hurt2", 0.8, (Math.random() - 0.5) * 0.06);
      }
      // Fists out and still standing: flinch from the hit (upper body only).
      if (incoming > 0 && victim.hp > 0 && !victim.downed) {
        const holdingFists = victim.isHuman ? weaponRef.current === "fists" : victim.weapon === "fists";
        if (holdingFists) (victim.isHuman ? humanBody?.rig : victim.rig)?.play(CLIP.hitFists, { rate: 1.4 });
      }
      if (victim.hp <= 0 || victim.downed) {
        if (killer.isHuman && headshot && victim.hp <= 0) {
          playerStats.headshots += 1;
          speakAnnouncer("headshot");
        }
        /*
         * A knocked fighter has their own downed HP pool (DOWNED_HP), Free Fire style — the
         * hit that drains it finishes them. It used to be `hp = 1` + "any hit while downed
         * kills", which meant the same burst that knocked you killed you a tenth of a second
         * later: the knock, the crawl and the revive window were real in code but invisible in
         * play, reading as an instant death straight to the loot crate. The pool is what gives
         * a teammate time to actually reach you.
         */
        if (victim.downed ? victim.hp <= 0 : !canKnock(victim, killer)) kill(victim, killer);
        else if (!victim.downed) knock(victim, killer);
      } else {
        if (!victim.isHuman) {
          playSfxAt(Math.random() < 0.5 ? "hurt" : "hurt2", victim.pos.distanceTo(walkPos), 0.5, (Math.random() - 0.5) * 0.1);
        }
        if (killer.isHuman) {
          if (settingsRef.current.showHitMarkers) {
            hitMarkerRef.current = 0.18;
            setHitMarker(0.18);
          }
          if (settingsRef.current.hitSounds) playSfx("hit", 0.85, (Math.random() - 0.5) * 0.08);
        }
        syncHud();
      }
      return { dealt: incoming, absorbed: armor.absorbed, blocked: false };
    };

    /** Restore HP to a teammate. */
    const heal = (target: Fighter, amount: number) => {
      if (!target.alive) return;
      target.hp = Math.min(MAX_HP, target.hp + Math.round(amount));
      if (target.isHuman) syncHud();
    };

    /**
     * Floating combat text at the world-space hit point.
     *
     * `amount` must be what the target ACTUALLY took, not the weapon's roll — see `damage()`,
     * which returns it. Zero is dropped rather than drawn: a shot the Emberveil shell or a back
     * deflection swallowed used to print a full-strength number over a victim who took nothing.
     */
    const spawnDamagePopup = (
      point: THREE.Vector3,
      amount: number,
      kind: "body" | "armor" | "head" | "heal",
    ) => {
      if (!settingsRef.current.showDamageNumbers) return;
      if (amount <= 0) return;
      const el = renderer.domElement;
      const p = point.clone().project(camera);
      if (p.z > 1) return;
      const x = (p.x * 0.5 + 0.5) * el.clientWidth;
      const y = (-p.y * 0.5 + 0.5) * el.clientHeight;
      const id = ++popupIdRef.current;
      setDamagePopups((list) => [...list.slice(-11), { id, x, y, amount, kind }]);
      const t = window.setTimeout(() => {
        setDamagePopups((list) => list.filter((d) => d.id !== id));
        popupTimersRef.current = popupTimersRef.current.filter((h) => h !== t);
      }, 900);
      popupTimersRef.current.push(t);
    };


    // the spawn animation is a one-time show at the start of the match
    let spawnFxPlayed = false;
    let introTime = 0;

    /**
     * Which way a fighter should be looking the moment it spawns: at the enemy team's pads.
     *
     * The old formula was `atan2(pos.x, pos.z)`, which aims at the WORLD ORIGIN. That is only
     * the right direction to look on a map whose middle happens to sit there — true enough on
     * Frostline, off by about 25 degrees on Whiteout, and meaningless on any map authored
     * off-centre. The enemy spawn pads are the thing actually worth facing, they are authored
     * per map, and they need no hand-tuned per-mode offset.
     *
     * On the yaw convention, which is the only part of this that is easy to get backwards:
     * the look/aim/travel axis in this file is `(-sin yaw, 0, -cos yaw)` — the camera's `lookAt`
     * negates it, `shoot()` negates it, and the W key subtracts `forward` — so pointing that
     * axis down a delta means `atan2(-dx, -dz)`, not `atan2(dx, dz)`.
     */
    const spawnYawScratch = new THREE.Vector3();
    const spawnYaw = (f: Fighter) => {
      spawnYawScratch.set(0, 0, 0);
      let n = 0;
      for (const other of fighters) {
        if (other.team === f.team) continue;
        spawnYawScratch.add(other.home.top);
        n++;
      }
      // Fall back to the old origin-facing behaviour rather than a fixed yaw if a fighter
      // somehow spawns before the opposing team exists — a wrong-looking spawn beats a spawn
      // that always stares down +Z.
      const dx = n > 0 ? spawnYawScratch.x / n - f.pos.x : -f.pos.x;
      const dz = n > 0 ? spawnYawScratch.z / n - f.pos.z : -f.pos.z;
      if (dx === 0 && dz === 0) return 0;
      return Math.atan2(-dx, -dz);
    };

    const respawn = (f: Fighter, withFx = false) => {
      f.alive = true;
      f.hp = MAX_HP;
      f.respawnIn = 0;
      f.dying = 0;
      f.downed = false;
      f.bleedOut = 0;
      f.beingRevived = 0;
      // A rig reused from a body that froze mid-death-crumple still owns both channels with a
      // held one-shot; drop it so locomotion re-takes the body rather than respawning a corpse.
      f.rig?.clearOneShot();
      if (f.isHuman) humanBody?.rig?.clearOneShot();
      f.cooldown = 0.8 + Math.random() * 1.2;
      f.backpack.items = [];
      if (f.ai) {
        // fresh brain on respawn, and pick up any difficulty change mid-match
        const prof = settingsRef.current.botDifficulty;
        f.ai = createBotBrain(prof, f.ai.preferredRange);
      }
      f.pos.copy(f.home.top);
      const gy = groundAt(f.pos.x, f.pos.z, f.pos.y + 0.5, 1.0);
      if (gy !== null) f.pos.y = gy;
      // each fighter gets its own effect, played exactly where it lands
      if (withFx) {
        f.fx?.burst(f.pos);
        // The spawn flash's light. This replaces the permanent PointLight each SpawnFx used to
        // own: one light per fighter meant eight always-on lights that every fragment of every
        // material in the arena had to iterate, for the whole match, to serve a 1.6 s flash.
        pulseFxLight(
          f.team === "blue" ? 0x8fd4f2 : 0xff7a20,
          f.pos.clone().setY(f.pos.y + 1.6),
          11,
          18,
          2,
          1.6,
        );
        if (f.isHuman) playSfx("spawn", 0.8);
      }
      if (f.group) {
        f.group.visible = true;
        f.group.position.copy(f.pos);
      }
      if (f.isHuman) {
        // the cage is a fixed team-wide box, so it stays where it was built

        walkPos.copy(f.pos);
        velY = 0;
        grounded = true;
        yaw = spawnYaw(f);
        pitch = 0;
        setBackpackLevel(f.backpack.level);
      }
      syncHud();
    };

    const startMatch = () => {
      scoreState.blue = 0;
      scoreState.red = 0;
      const buy = openingCountdown(modeRulesRef.current);
      matchRef.current = {
        blue: 0,
        red: 0,
        phase: "countdown",
        round: 1,
        roundWinner: null,
        matchWinner: null,
        countdown: buy,
      };
      countdownRef.current = buy;
      clearShieldWalls();
      killFeedRef.current = [];
      streakRef.current.count = 0;
      streakRef.current.multi = 0;
      window.clearTimeout(streakRef.current.timer);
      // Buy modes: every match starts on the base pistol-round budget, streak cleared.
      const openingCash = modeRulesRef.current.economy;
      if (openingCash) {
        csLossStreak = 0;
        setCredits(openingCash.baseCash);
      }
      setStreakBanner(null);
      playerStats.kills = 0;
      playerStats.deaths = 0;
      playerStats.headshots = 0;
      setPlayerStatsHud({ kills: 0, deaths: 0, headshots: 0 });
      setMatch(matchRef.current);
      setKillFeed([]);
      saveSentRef.current = false;
      matchStartTimeRef.current = performance.now();
      // clear lingering decoys and FF coins between matches
      for (const d of decoys) {
        decoyGroup.remove(d.root);
        releaseFxLight(d.light);
      }
      decoys.length = 0;
      disposeFfCoins(ffCoinsRef.current);
      setFfCoinCount(0);
      setBackpackLevel(1);
      // reset and re-apply match-start tacticals each match
      disposeTacticals(tacticalRef.current, root);
      // NOTE: the pet companion is spawned once at level load and persists across
      // rounds/matches — disposing it here left the "call pet" button a no-op.
      tacticalRef.current = createTacticalState();
      if (human) {
        applySpawnTactical(
          tacticalRef.current,
          profileRef.current?.loadout.tactical,
          root,
          human.pos,
          (x, z, fromY, maxRise) => groundAt(x, z, fromY, maxRise ?? 2.5),
        );
        if (profileRef.current?.loadout.tactical === "airdrop") {
          callAirdrop(tacticalRef.current, root, human.pos, (x, z, fromY, maxRise) =>
            groundAt(x, z, fromY, maxRise ?? 2.5),
          );
        }
      }
      // safe zone: sized + paced per mode (see resetSafeZone)
      resetSafeZone();
      const firstTime = !spawnFxPlayed;
      for (const f of fighters) respawn(f, true);
      setupDraft();
      if (firstTime) {
        spawnFxPlayed = true;
        introTime = 5;
        introRef.current = 5;
        setIntro(true);
      }

      // Plane entry: skip the cinematic intro + buy phase and drop in from the
      // plane instead. Falls back to the normal ground spawn (the respawn above)
      // if the plane hasn't finished loading yet.
      if (modeRulesRef.current.entry === "skydive" && skydiveRef.current) {
        matchRef.current.phase = "skydive";
        matchRef.current.countdown = 0;
        introTime = 0;
        introRef.current = 0;
        setIntro(false);
        setMatch({ ...matchRef.current });
        ejectRequestedRef.current = false;
        skydiveUiPhaseRef.current = null;
        skydiveRef.current.begin();
      }

      syncHud();
    };
    startMatchRef.current = startMatch;

    const startReload = (weaponId: string) => {
      if (isReloadingRef.current) return;
      const cur = ammoRef.current[weaponId];
      if (!cur || cur.mag >= getMagazine(weaponId, profileRef.current)) return;
      // Spare rounds are now the family's, not this gun's: an empty rifle pool means the M4 and
      // the AK are both dry, which is the point of shared calibres.
      const fam = familyOf(weaponId);
      if (!fam || ammoPoolRef.current[fam] <= 0) return;
      isReloadingRef.current = true;
      reloadingWeaponRef.current = weaponId;
      setIsReloading(true);
      reloadTimerRef.current = getReloadTime(weaponId, profileRef.current);
      reloadLeftRef.current = reloadTimerRef.current;
      setReloadLeft(reloadTimerRef.current);
      const mode = getWeaponBehavior(weaponId).mode;
      playSfx(mode === "pump" || mode === "bolt" ? "pump" : "reload", 0.75);
      if (proneRef.current) {
        bodyClipRef.current?.(CLIP.proneReload);
      } else {
        bodyClipRef.current?.(CLIP.reload);
      }
    };
    startReloadRef.current = startReload;


    const finishReload = (weaponId: string) => {
      if (!isReloadingRef.current) return;
      const weaponBeingReloaded = reloadingWeaponRef.current ?? weaponId;
      const cur = ammoRef.current[weaponBeingReloaded];
      if (!cur) {
        isReloadingRef.current = false;
        reloadingWeaponRef.current = null;
        reloadLeftRef.current = 0;
        setIsReloading(false);
        setReloadLeft(0);
        return;
      }
      const mag = getMagazine(weaponBeingReloaded, profileRef.current);
      const need = mag - cur.mag;
      const fam = familyOf(weaponBeingReloaded);
      const have = fam ? ammoPoolRef.current[fam] : 0;
      const take = Math.max(0, Math.min(need, have));
      ammoRef.current = { ...ammoRef.current, [weaponBeingReloaded]: { mag: cur.mag + take } };
      setAmmo(ammoRef.current);
      if (fam && take > 0) {
        ammoPoolRef.current = { ...ammoPoolRef.current, [fam]: have - take };
        setAmmoPool(ammoPoolRef.current);
      }
      isReloadingRef.current = false;
      reloadingWeaponRef.current = null;
      reloadLeftRef.current = 0;
      setIsReloading(false);
      setReloadLeft(0);
    };


    const RECOIL_PITCH = 0.045;


    // Proper cone spread: build an orthonormal basis around `dir` and offset
    // inside a disc, so the deviation is symmetric and never biased downward.
    const applySpread = (dir: THREE.Vector3, spread: number) => {
      if (spread <= 0) return dir.normalize();
      const ref = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(dir, ref).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      dir.add(right.multiplyScalar(Math.cos(theta) * r));
      dir.add(up.multiplyScalar(Math.sin(theta) * r));
      return dir.normalize();
    };


    /* ------------------------------------------------------------------
     * Breakable shield walls: thrown in front of the player, added to the
     * collider set with their own HP so bullets chip them down.
     * ---------------------------------------------------------------- */
    const WALL_HP = 350;
    const WALL_RANGE = 14;
    const shieldWalls: { mesh: THREE.Mesh; hp: number; visual: FrostVisual; bornAt: number }[] = [];
    let frostTemplate: THREE.Object3D | null = null;
    // Kept as a promise, not just a fire-and-forget assignment, so the prewarm pass below can
    // wait for the template before compiling a throwaway wall. See prewarmVisuals().
    const frostTemplateReady = loadFrostTemplate().then((t) => {
      frostTemplate = t;
      return t;
    });

    const removeWall = (mesh: THREE.Mesh) => {
      const i = shieldWalls.findIndex((w) => w.mesh === mesh);
      if (i !== -1) {
        shieldWalls[i]!.visual.dispose();
        shieldWalls.splice(i, 1);
      }
      collidersRef.current = collidersRef.current.filter((m) => m !== mesh);
      root.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };

    /**
     * Wipe every placed frost wall — used to reset the map brand-new between
     * rounds so nothing carries over. Iterates a copy since removeWall mutates
     * the array.
     */
    const clearShieldWalls = () => {
      for (const w of [...shieldWalls]) removeWall(w.mesh);
    };

    const damageWall = (mesh: THREE.Mesh, amount: number, at: THREE.Vector3) => {
      const entry = shieldWalls.find((w) => w.mesh === mesh);
      if (!entry) return;
      entry.hp -= amount;
      // brighter, chunkier ice shatter: a hot white core plus icy cyan shards
      spawnImpact(at, new THREE.Color(0xffffff));
      spawnImpact(at.clone().addScaledVector(new THREE.Vector3(
        (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5),
      ), 0.18), new THREE.Color(0x7fe8ff));
      playSfx("hit", 0.85, 0.25);
      shakeRef.current = Math.max(shakeRef.current, 0.05);
      entry.visual.flash();
      entry.visual.setHealth(entry.hp / WALL_HP);
      if (entry.hp <= 0) {
        // shatter burst on break
        for (let i = 0; i < 5; i++) {
          spawnImpact(
            at.clone().add(new THREE.Vector3(
              (Math.random() - 0.5) * 1.6,
              Math.random() * 1.4,
              (Math.random() - 0.5) * 1.6,
            )),
            new THREE.Color(i % 2 ? 0xffffff : 0x9fe4ff),
          );
        }
        playSfx("land", 1, -0.3);
        playSfx("knife", 0.7, 0.3);
        shakeRef.current = Math.max(shakeRef.current, 0.22);
        removeWall(mesh);
      }
    };

    /** invisible box collider carrying the animated frost visual */
    const placeWallAt = (center: THREE.Vector3, angle: number) => {
      const collider = new THREE.Mesh(
        new THREE.BoxGeometry(FROST_WIDTH, FROST_HEIGHT, FROST_DEPTH),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      );
      collider.position.set(center.x, center.y + FROST_HEIGHT / 2, center.z);
      collider.rotation.y = angle;
      collider.userData["shieldWall"] = true;
      const visual = createFrostVisual(frostTemplate);
      visual.object.position.y = -FROST_HEIGHT / 2;
      collider.add(visual.object);
      root.add(collider);
      collidersRef.current = [...collidersRef.current, collider];
      shieldWalls.push({ mesh: collider, hp: WALL_HP, visual, bornAt: performance.now() / 1000 });

      // --- summon punch: layered whoosh + slam + icy crackle -------------
      playSfx("equip", 0.9, 0.1);
      playSfx("land", 1, -0.35);
      playSfx("spawn", 0.6, 0.35);
      window.setTimeout(() => playSfx("knife", 0.5, -0.25), 70);
      shakeRef.current = Math.max(shakeRef.current, 0.38);

      // bright frost burst along the base of the wall
      const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
      for (let i = 0; i < 7; i++) {
        const t = (i / 6 - 0.5) * FROST_WIDTH;
        spawnImpact(
          new THREE.Vector3(center.x, center.y + 0.15 + Math.random() * 0.5, center.z).addScaledVector(right, t),
          new THREE.Color(i % 2 ? 0xffffff : 0x8fe9ff),
        );
      }
      return true;
    };


    /* ---- placement preview ("aim & place" mode) ---- */
    let ghost: FrostVisual | null = null;
    let ghostValid = false;
    const ghostSpot = new THREE.Vector3();
    let ghostAngle = 0;

    /** where the player is currently looking, clamped to a walkable spot */
    const resolveAimSpot = () => {
      const dirv = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(-pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      ).normalize();
      const eye = walkPos.clone().setY(walkPos.y + EYE_HEIGHT);
      const hits = [castFirst(eye, dirv, WALL_RANGE)].filter(Boolean) as THREE.Intersection[];

      const target = hits[0]
        ? hits[0].point.clone().addScaledVector(dirv, -0.6)
        : eye.clone().addScaledVector(dirv, WALL_RANGE);
      const gy = groundAt(target.x, target.z, Math.max(target.y, walkPos.y) + 0.5, 2.5);
      const flat = walkPos.distanceTo(new THREE.Vector3(target.x, walkPos.y, target.z));
      ghostValid = gy !== null && flat <= WALL_RANGE && Math.abs((gy ?? 0) - walkPos.y) < 4;
      ghostSpot.set(target.x, gy ?? walkPos.y, target.z);
      ghostAngle = yaw + Math.PI;
    };

    const startPlacement = () => {
      if (ghost) return;
      ghost = createFrostVisual(frostTemplate, { ghost: true });
      root.add(ghost.object);
      resolveAimSpot();
      ghost.object.position.copy(ghostSpot);
      setPlacingWall(true);
      playSfx("ads", 0.4);
    };

    const cancelPlacement = () => {
      if (!ghost) return;
      root.remove(ghost.object);
      ghost.dispose();
      ghost = null;
      setPlacingWall(false);
    };

    const confirmPlacement = () => {
      if (!ghost) return false;
      if (!ghostValid) {
        playSfx("ads", 0.3, -0.4);
        return false;
      }
      const spot = ghostSpot.clone();
      const angle = ghostAngle;
      cancelPlacement();
      return placeWallAt(spot, angle);
    };

    /** instant mode — slam it down on the nearest ground right in front */
    const instantDrop = () => {
      const dirv = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      for (const dist of [3.2, 2.4, 1.8, 4.2]) {
        const c = walkPos.clone().addScaledVector(dirv, dist);
        const gy = groundAt(c.x, c.z, walkPos.y + 0.5, 1.5);
        if (gy !== null && Math.abs(gy - walkPos.y) < 2.5) {
          return placeWallAt(new THREE.Vector3(c.x, gy, c.z), yaw + Math.PI);
        }
      }
      return placeWallAt(walkPos.clone().addScaledVector(dirv, 3.2).setY(walkPos.y), yaw + Math.PI);
    };

    const wallButton = () => {
      if (!human || !human.alive || modeRef.current !== "walk") return false;
      if (settingsRef.current.wallPlacement === "instant") return instantDrop();
      if (ghost) return confirmPlacement();
      startPlacement();
      return false;
    };

    const updateWalls = (dt: number) => {
      for (const w of shieldWalls) w.visual.update(dt);
      // Walls dissolve on their own after their lifetime, even if never shot.
      const life = modeRulesRef.current.wallLifetimeSeconds;
      if (life > 0) {
        const now = performance.now() / 1000;
        for (const w of [...shieldWalls]) {
          if (now - w.bornAt >= life) removeWall(w.mesh);
        }
      }
      if (ghost) {
        if (!human || !human.alive) {
          cancelPlacement();
        } else {
          resolveAimSpot();
          ghost.object.position.lerp(ghostSpot, Math.min(1, dt * 18));
          ghost.object.rotation.y = ghostAngle;
          setGhostValid(ghost, ghostValid);
          ghost.update(dt);
        }
      }
    };

    const isPlacingWall = () => ghost !== null;

    const shoot = (fromAuto = false) => {
      const colliders = collidersRef.current;
      if (isPlacingWall()) return false;
      if (!laserRef.current || !human || !human.alive) return false;
      // knocked: no shooting from the floor — crawl to cover and wait for the revive
      if (human.downed) return false;
      if (matchRef.current.phase === "countdown") return false;
      // No shooting while still dropping in — the guns are holstered during the
      // plane fly-over / freefall. This is the real block (hiding the HUD buttons
      // was not enough: a raw left-click still reached the semi-auto path here).
      if (matchRef.current.phase === "skydive") return false;
      if (isReloadingRef.current) return false;
      if (weaponCooldownRef.current > 0) return false;

      const weaponId = weaponRef.current;
      const skinned = applySkinStats(getWeapon(weaponId) ?? undefined, profileRef.current?.equippedSkins[weaponId]);
      const w = applyAttachmentStats(skinned ?? undefined, profileRef.current?.equippedAttachments[weaponId] ?? null);
      if (!w) return false;
      const behavior = getWeaponBehavior(weaponId);
      const weaponName = w.name;
      const weaponRange = getWeaponRange(w);

      const currentAmmo = ammoRef.current[weaponId];
      // Melee weapons (fists / knife) have no magazine — they must never dry-fire.
      // Previously the knife carried a mag:0 ammo entry and hit this branch, so it
      // just clicked empty instead of swinging.
      if (behavior.mode !== "melee" && currentAmmo && currentAmmo.mag <= 0) {
        // dry click, then auto-reload when empty
        playSfx("dryfire", 0.7);
        if (settingsRef.current.autoReload) startReload(weaponId);
        return false;
      }

      // Third-person swing. Only the two-handed blades (katana/axe) have an authored swing
      // clip; a punch/knife/pan has no matching animation, so it keeps its locomotion pose.
      // meleeAttack is full-body (not UPPER_ONLY), so play() claims both channels and the
      // `finished` event hands them back to locomotion.
      if (behavior.mode === "melee" && usesBladeStance(weaponId)) {
        // The authored swing is slow (~2.4 s); play it at 2x so a katana/axe hit reads snappy.
        humanBody?.rig?.play(CLIP.meleeAttack, { rate: 2 });
      } else if (weaponId === "fists") {
        // Bare hands: the punch combo on the upper body, sped up so each click reads as a jab.
        humanBody?.rig?.play(CLIP.punch, { rate: 1.8 });
      }
      const isMelee = behavior.mode === "melee";

      // sound
      if (sfxInitializedRef.current) {
        if (behavior.mode === "melee") {
          // The knife gets the metallic slash; bare fists get a dull body thud
          // (a punch), not the knife sound.
          playSfx(weaponId === "fists" ? "land" : "knife", 0.9, (Math.random() - 0.5) * 0.1);
        } else {
          playSfx(behavior.sound, 1, (Math.random() - 0.5) * 0.04);
        }
        // pump / bolt weapons rack the action right after the shot
        if (behavior.mode === "pump" || behavior.mode === "bolt") {
          window.setTimeout(() => playSfx("pump", 0.65), behavior.cycle * 420);
        }
      }


      weaponCooldownRef.current = getWeaponFireInterval(w) * activeEffects().fireRate;
      setWeaponReady(false);

      // The ray is built from the player's own state, never from the camera:
      // the camera carries screen shake and is repositioned later in the frame.
      // IMPORTANT: the ray uses the aim the player currently sees (the recoil
      // already accumulated and rendered), and the *new* kick from this shot is
      // applied afterwards — so the bullet always leaves through the crosshair.
      const aimYaw = yaw + recoilYawRef.current;
      const aimPitch = pitch - recoilRef.current;
      const origin = new THREE.Vector3(walkPos.x, walkPos.y + eyeHeight(), walkPos.z);
      const dir = new THREE.Vector3(
        Math.sin(aimYaw) * Math.cos(aimPitch),
        Math.sin(aimPitch),
        Math.cos(aimYaw) * Math.cos(aimPitch),
      ).multiplyScalar(-1).normalize();
      const stanceSpread = proneRef.current ? 0.55 : crouchRef.current ? 0.75 : 1;
      applySpread(dir, behavior.spread * (adsRef.current ? 0.35 : 1) * stanceSpread);

      // now kick the view up for the *next* shot — guns only. A melee swing throws no bullet,
      // so it must not kick the aim, flash a muzzle or draw a tracer (the "shot from a katana" bug).
      if (!isMelee) {
        const attachmentRecoil = 1 + (getAttachment(profileRef.current?.equippedAttachments[weaponId] ?? null)?.stats.recoil ?? 0) / 100;
        const recoilScale = Math.max(0.3, 1.1 - w.fireRate / 200) * behavior.recoil * activeEffects().recoil * attachmentRecoil;
        recoilRef.current = Math.min(recoilRef.current + RECOIL_PITCH * recoilScale, 0.32);
        recoilYawRef.current += (Math.random() - 0.5) * 0.035 * recoilScale;
        shakeRef.current = 0.12;
      }


      // tracers leave the gun, which sits down-right of the eye
      const rightVec = new THREE.Vector3(Math.cos(aimYaw), 0, -Math.sin(aimYaw));
      const muzzlePos = origin
        .clone()
        .add(rightVec.clone().multiplyScalar(0.3))
        .add(new THREE.Vector3(0, -0.25, 0))
        .add(dir.clone().multiplyScalar(0.6));

      const muzzle = muzzleRef.current;
      if (muzzle && !isMelee) {
        muzzle.mesh.position.copy(muzzlePos);
        muzzle.light.position.copy(muzzle.mesh.position);
        muzzle.mesh.visible = true;
        muzzle.light.intensity = 18;
        muzzle.ttl = 0.06;
      }

      const pellets = Math.max(1, behavior.shots);
      let anyHit = false;

      for (let p = 0; p < pellets; p++) {
        let pelletDir = dir.clone();
        if (pellets > 1) {
          // shotgun pellet spread
          pelletDir.add(new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08));
          pelletDir.normalize();
        }
        const worldHits = [castFirst(origin, pelletDir, weaponRange, colliders)].filter(
          Boolean,
        ) as THREE.Intersection[];
        raycaster.set(origin, pelletDir);
        raycaster.far = weaponRange;
        const botHits = raycaster.intersectObjects(enemyMeshes(human.team), false);
        const friendlyHits = behavior.healsTeammates
          ? raycaster.intersectObjects(friendlyMeshes(human.team), false)
          : [];

        const worldDist = worldHits[0]?.distance ?? Infinity;
        const botDist = botHits[0]?.distance ?? Infinity;
        const friendDist = friendlyHits[0]?.distance ?? Infinity;


        const laser = laserRef.current;
        const posAttr = laser.line.geometry.attributes["position"];
        if (!posAttr) continue;
        const positions = posAttr.array as Float32Array;
        positions[0] = muzzlePos.x;
        positions[1] = muzzlePos.y;
        positions[2] = muzzlePos.z;

        let end: THREE.Vector3;
        let hitBot = false;
        let healBeam = false;
        const botHit = botHits[0];
        const friendHit = friendlyHits[0];
        if (behavior.healsTeammates && friendDist < worldDist && friendDist < botDist && friendHit) {
          end = friendHit.point.clone();
          const target = fighterByMesh(friendHit.object);
          if (target) {
            const amt = Math.round(getWeaponDamageAt(w, friendHit.distance, false) * 1.6);
            heal(target, amt);
            spawnDamagePopup(end, amt, "heal");
            healBeam = true;
            anyHit = true;
          }
        } else if (botDist < worldDist && botHit) {
          end = botHit.point.clone();
          const victim = fighterByMesh(botHit.object);
          if (victim) {
            const headshot = botHit.object.userData["hitZone"] === "head";
            const dmg = Math.round(getWeaponDamageAt(w, botHit.distance, headshot) * activeEffects().damageDealt);
            const res = damage(victim, dmg, human, headshot);
            spawnDamagePopup(end, res.dealt, headshot ? "head" : res.absorbed > 0 ? "armor" : "body");
            hitBot = true;
            anyHit = true;
          }
        } else if (worldHits[0]) {
          end = worldHits[0].point.clone();
          const obj = worldHits[0].object as THREE.Mesh;
          if (obj.userData["shieldWall"]) {
            damageWall(obj, getWeaponDamageAt(w, worldHits[0].distance, false), end);
          }
        } else {
          end = origin.clone().add(pelletDir.multiplyScalar(weaponRange));
        }

        // Bullet tracer — guns only. A melee hit still lands damage above, but must not draw the
        // beam/spark that reads as a fired shot.
        if (!isMelee) {
          positions[3] = end.x;
          positions[4] = end.y;
          positions[5] = end.z;
          posAttr.needsUpdate = true;

          laser.material.color.setHex(healBeam ? 0x4ade80 : 0xffe08a);
          (laser.sparkMesh.material as THREE.MeshBasicMaterial).color.setHex(healBeam ? 0x4ade80 : 0xffe08a);
          laser.spark.color.setHex(healBeam ? 0x4ade80 : 0xffa040);
          laser.sparkMesh.position.copy(end);
          laser.sparkMesh.visible = true;
          laser.spark.position.copy(end);
          laser.spark.intensity = 5;
          laser.material.opacity = 1;
          laser.ttl = 0.12;
        }

        if (hitBot || healBeam) {
          spawnImpact(end, hitBot ? new THREE.Color(human.team === "blue" ? 0x3f8fff : 0xff3b1f) : new THREE.Color(0x4ade80));
        } else if (!isMelee) {
          spawnImpact(end);
        }
        // Kill feed is already pushed by damage()/kill(); don't duplicate it here.
      }


      // decrement ammo
      if (currentAmmo) {
        currentAmmo.mag = Math.max(0, currentAmmo.mag - 1);
        ammoRef.current = { ...ammoRef.current, [weaponId]: currentAmmo };
        setAmmo(ammoRef.current);
      }

      return anyHit;
    };



    /* ------------------------------------------------------------------
     * Scope aim assist
     * Right-clicking snaps the aim onto the closest visible enemy's nearest
     * body part. The head is only ever chosen when the crosshair is already
     * sitting near it, and even then only ~25% of the time — otherwise the
     * lock lands on the torso. Once locked, the aim keeps tracking the target
     * every frame, so it follows the enemy (and the player) while moving.
     * ---------------------------------------------------------------- */
    const HEAD_Y = 1.62;
    const BODY_Y = 1.15;
    const ASSIST_ACQUIRE_ANGLE = 0.22; // ~12.5° cone around the crosshair
    const ASSIST_HEAD_WINDOW = 0.022; // "near the head" tolerance
    const ASSIST_HEAD_CHANCE = 0.25;
    const ASSIST_BREAK_ANGLE = 0.45; // looking this far away drops the lock
    const ASSIST_MAX_RANGE = 160;
    let aimLock: { target: Fighter; zone: "head" | "body" } | null = null;
    /** 0..1 — how hard the player is currently dragging against the lock */
    let manualAim = 0;

    const eyePos = () => new THREE.Vector3(walkPos.x, walkPos.y + eyeHeight(), walkPos.z);
    const aimPointOf = (f: Fighter, zone: "head" | "body") =>
      f.pos.clone().setY(f.pos.y + (zone === "head" ? HEAD_Y : BODY_Y));
    const currentAimDir = () =>
      new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
        .multiplyScalar(-1)
        .normalize();
    const visible = (from: THREE.Vector3, to: THREE.Vector3) => {
      const delta = to.clone().sub(from);
      const dist = delta.length();
      if (dist < 0.001) return true;
      return castFirst(from, delta.normalize(), dist - 0.35) === null;

    };

    const acquireAimLock = () => {
      aimLock = null;
      if (settingsRef.current.aimAssist === "off") return;
      if (!human || !human.alive) return;
      const eye = eyePos();
      const aimDir = currentAimDir();
      const strength = AIM_ASSIST_STRENGTH[settingsRef.current.aimAssist];
      let best: { target: Fighter; zone: "head" | "body"; ang: number } | null = null;
      for (const f of fighters) {
        if (f.team === human.team || !f.alive || !f.group) continue;
        const head = aimPointOf(f, "head");
        const body = aimPointOf(f, "body");
        if (eye.distanceTo(body) > ASSIST_MAX_RANGE) continue;
        const headSeen = visible(eye, head);
        const bodySeen = visible(eye, body);
        if (!headSeen && !bodySeen) continue;
        const aHead = headSeen ? aimDir.angleTo(head.clone().sub(eye).normalize()) : Infinity;
        const aBody = bodySeen ? aimDir.angleTo(body.clone().sub(eye).normalize()) : Infinity;
        const ang = Math.min(aHead, aBody);
        if (ang > ASSIST_ACQUIRE_ANGLE * strength) continue;
        if (best && ang >= best.ang) continue;
        const nearHead = aHead <= aBody + ASSIST_HEAD_WINDOW;
        const zone: "head" | "body" =
          nearHead && headSeen && Math.random() < ASSIST_HEAD_CHANCE ? "head" : bodySeen ? "body" : "head";
        best = { target: f, zone, ang };
      }
      if (best) aimLock = { target: best.target, zone: best.zone };
    };

    const updateAimLock = (dt: number) => {
      if (!adsRef.current || !human || !human.alive || settingsRef.current.aimAssist === "off") {
        aimLock = null;
        manualAim = 0;
        return;
      }
      // dragging bleeds off as soon as the player stops fighting the magnet
      manualAim = Math.max(0, manualAim - dt * 0.9);
      const lock = aimLock;
      if (!lock) return;
      if (!lock.target.alive || !lock.target.group) {
        aimLock = null;
        return;
      }
      const eye = eyePos();
      const point = aimPointOf(lock.target, lock.zone);
      const delta = point.clone().sub(eye);
      if (delta.length() > ASSIST_MAX_RANGE) {
        aimLock = null;
        return;
      }
      const v = delta.clone().normalize();
      if (currentAimDir().angleTo(v) > ASSIST_BREAK_ANGLE) {
        aimLock = null;
        return;
      }
      // sustained manual drag rips the aim off the body entirely
      if (manualAim >= 0.999) {
        aimLock = null;
        manualAim = 0;
        return;
      }
      const desiredPitch = Math.asin(THREE.MathUtils.clamp(-v.y, -1, 1));
      const desiredYaw = Math.atan2(-v.x, -v.z);
      let dYaw = desiredYaw - yaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      // the magnet weakens the more the player pulls; vertical is looser than
      // horizontal so walking the shots up a body always stays possible
      const give = 1 - manualAim * 0.95;
      const k = (1 - Math.exp(-dt * 10)) * give;
      yaw += dYaw * k;
      pitch += (desiredPitch - pitch) * k * 0.5;
    };

    /**
     * Aim "weight": scoped aiming is slower, firing while scoped is slower
     * still, and a locked-on target adds real resistance — you can drag the
     * muzzle up or off the enemy, it just takes a deliberate pull.
     */
    const aimHeaviness = () => {
      let m = 1;
      if (adsRef.current) m *= 0.85;
      if (adsRef.current && mouseHeldRef.current) m *= 0.78;
      if (aimLock) m *= 0.5;
      return m;
    };
    const noteManualAim = (dx: number, dy: number) => {
      if (!aimLock) return;
      manualAim = Math.min(1, manualAim + (Math.abs(dx) + Math.abs(dy) * 1.6) * 0.012);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onMouseDown = (e: MouseEvent) => {
      if (miniGameOpenRef.current) return;
      if (e.button === 0 && hoops?.holding && document.pointerLockElement === renderer.domElement) {
        hoopChargeRef.current.start();
        return;
      }
      if (gameModeRef.current === "hangout") return; // no combat in the hangout
      // while a frost wall ghost is up, the mouse places / cancels it instead of firing
      if (isPlacingWall() && modeRef.current === "walk") {
        e.preventDefault();
        if (e.button === 2) {
          cancelPlacement();
          return;
        }
        if (e.button === 0) {
          if (document.pointerLockElement !== renderer.domElement) {
            renderer.domElement.requestPointerLock?.();
            return;
          }
          if (confirmPlacement()) consumeWallChargeRef.current();
          return;
        }
        return;
      }
      if (e.button === 2) {
        if (modeRef.current === "walk" && document.pointerLockElement === renderer.domElement) {
          if (settingsRef.current.adsMode === "toggle") {
            actionsRef.current?.toggleAds();
          } else if (!adsRef.current) {
            adsRef.current = true;
            const cls = getWeapon(weaponRef.current)?.cls;
            // every weapon aims down sights except shotguns and melee
            if (cls !== "Shotgun" && cls !== "Melee") setScoped(true);
            playSfx("ads", 0.5);
            acquireAimLock();
          }
        }
        return;
      }
      if (e.button !== 0) return;
      if (!sfxInitializedRef.current) {
        initSfx();
        sfxInitializedRef.current = true;
        setSfxReady(true);
      }
      if (modeRef.current !== "walk") return;
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock?.();
        return;
      }
      // Guns are holstered during the plane ride / freefall. shoot() already
      // refuses to fire then, but bail before we arm a bomb or latch the trigger,
      // so a click held through touchdown can't leak a shot the moment we land.
      if (matchRef.current.phase === "skydive") return;
      if (bomb.armed()) {
        bomb.beginAim();
        return;
      }
      mouseHeldRef.current = true;
      const behavior = getWeaponBehavior(weaponRef.current);
      if (behavior.mode === "auto" || behavior.mode === "burst") {
        if (behavior.mode === "burst" && !burstQueueRef.current) {
          burstQueueRef.current = { shotsLeft: behavior.shots, nextIn: 0 };
        }
      } else {
        shoot();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0 && hoops?.charging) {
        hoopChargeRef.current.release();
        return;
      }
      if (e.button === 2) {
        if (settingsRef.current.adsMode !== "toggle" && adsRef.current) {
          adsRef.current = false;
          setScoped(false);
          playSfx("ads", 0.35, -0.08);
        }
        return;
      }
      if (e.button !== 0) return;
      if (bomb.armed()) {
        bomb.release();
        return;
      }
      mouseHeldRef.current = false;
      // cancelling a burst mid-burst is intentional
    };


    /* ---- imperative actions used by the touch HUD ---- */
    const triggerDown = () => {
      if (gameModeRef.current === "hangout") return;
      if (matchRef.current.phase === "skydive") return;
      if (drivingRef.current) return;
      if (bomb.armed()) {
        bomb.beginAim();
        return;
      }
      if (isPlacingWall()) {
        if (confirmPlacement()) consumeWallChargeRef.current();
        return;
      }
      if (!sfxInitializedRef.current) {
        initSfx();
        sfxInitializedRef.current = true;
        setSfxReady(true);
      }
      mouseHeldRef.current = true;
      const behavior = getWeaponBehavior(weaponRef.current);
      if (behavior.mode === "auto") return;
      if (behavior.mode === "burst") {
        if (!burstQueueRef.current) burstQueueRef.current = { shotsLeft: behavior.shots, nextIn: 0 };
        return;
      }
      shoot();
    };
    const triggerUp = () => {
      if (bomb.armed()) {
        bomb.release();
        return;
      }
      mouseHeldRef.current = false;
    };
    const toggleAds = () => {
      if (gameModeRef.current === "hangout") return;
      if (drivingRef.current) return;
      if (adsRef.current) {
        adsRef.current = false;
        setScoped(false);
        playSfx("ads", 0.35, -0.08);
        return;
      }
      adsRef.current = true;
      const cls = getWeapon(weaponRef.current)?.cls;
      if (cls !== "Shotgun" && cls !== "Melee") setScoped(true);
      playSfx("ads", 0.5);
      acquireAimLock();
    };
    const jump = () => {
      keys.add("Space");
      window.setTimeout(() => keys.delete("Space"), 120);
    };
    /* ---- channelled medkit ---- */
    const HEAL_TIME = 2;
    const HEAL_AMOUNT = 75;
    const healState = { active: false, remain: 0, total: HEAL_TIME, stop: null as (() => void) | null };

    const endHeal = () => {
      if (!healState.active) return;
      healState.active = false;
      healState.stop?.();
      healState.stop = null;
      const leftover = Math.max(0, healState.remain) / HEAL_TIME;
      healState.remain = 0;
      onHealEndRef.current(leftover);
    };

    const startHeal = (fraction: number) => {
      if (!human || !human.alive || human.hp >= MAX_HP) return false;
      if (healState.active) return false;
      if (modeRef.current !== "walk") return false;
      healState.active = true;
      const healSpeed = PETS[(profileRef.current?.pet ?? "nibbles") as PetId]?.effect.healSpeed ?? 1;
      healState.remain = (HEAL_TIME / Math.max(0.25, healSpeed)) * Math.max(0.05, Math.min(1, fraction));
      healState.total = Math.max(0.01, healState.remain);
      healState.stop = playSfxStoppable("medkit", 0.9);
      return true;
    };

    /** ticked every frame; any movement aborts the kit and banks the rest */
    const tickHeal = (dt: number, moving: boolean) => {
      if (!healState.active) return;
      if (!human || !human.alive || moving) {
        endHeal();
        return;
      }
      const healSpeed = PETS[(profileRef.current?.pet ?? "nibbles") as PetId]?.effect.healSpeed ?? 1;
      const heal = ((HEAL_AMOUNT / HEAL_TIME) * Math.max(0.25, healSpeed)) * dt;
      human.hp = Math.min(MAX_HP, human.hp + heal);
      healState.remain -= dt;
      setHealProgress(1 - Math.max(0, healState.remain) / healState.total);
      syncHud();
      if (healState.remain <= 0 || human.hp >= MAX_HP) {
        healState.remain = Math.max(0, healState.remain);
        endHeal();
      }
    };

    /* ---- inhaler: instant top-up, works while sprinting ---- */
    const useInhaler = () => {
      if (!human || !human.alive) return;
      if (inhalersRef.current <= 0) return;
      if (human.hp >= MAX_HP && epRef.current >= MAX_EP) return;
      human.hp = Math.min(MAX_HP, human.hp + 25);
      setInhalers((n) => Math.max(0, n - 1));
      setEp((e) => Math.min(MAX_EP, e + 50));
      playSfx("medkit", 0.7, 0.4);
      syncHud();
    };
    useInhalerRef.current = useInhaler;

    /* ---- mushrooms: ground pickups that grant EP ---- */
    const mushroomGroup = new THREE.Group();
    scene.add(mushroomGroup);
    type Mushroom = { mesh: THREE.Object3D; cooldown: number; base: THREE.Vector3 };
    const mushrooms: Mushroom[] = [];
    const capMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.7 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9 });
    const spawnMushroom = (at: THREE.Vector3) => {
      const g = new THREE.Group();
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.position.y = 0.26;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.26, 8), stemMat);
      stem.position.y = 0.13;
      g.add(cap, stem);
      g.position.copy(at);
      mushroomGroup.add(g);
      mushrooms.push({ mesh: g, cooldown: 0, base: at.clone() });
    };
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random();
      const r = 12 + Math.random() * 22;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const gy = groundAt(x, z, 12, 24);
      if (gy === null) continue;
      spawnMushroom(new THREE.Vector3(x, gy + 0.02, z));
    }
    /** walk over a mushroom to eat it: +30 EP, regrows after 25 s */
    const tickMushrooms = (dt: number) => {
      const t = performance.now() * 0.002;
      for (const m of mushrooms) {
        if (m.cooldown > 0) {
          m.cooldown -= dt;
          if (m.cooldown <= 0) m.mesh.visible = true;
          continue;
        }
        m.mesh.position.y = m.base.y + Math.sin(t + m.base.x) * 0.03;
        if (!human || !human.alive) continue;
        if (walkPos.distanceTo(m.base) > 1.1) continue;
        m.cooldown = 25;
        m.mesh.visible = false;
        setEp((e) => Math.min(MAX_EP, e + 30));
        playSfx("buy", 0.5, 0.6);
      }
    };

    /* ---- armor pickups: vests and helmets on the ground ---- */
    const armorGroup = new THREE.Group();
    scene.add(armorGroup);
    type ArmorPickup = { mesh: THREE.Group; slot: "vest" | "helmet"; level: 1 | 2 | 3; base: THREE.Vector3 };
    const armorPickups: ArmorPickup[] = [];
    const spawnArmor = (slot: "vest" | "helmet", level: 1 | 2 | 3, at: THREE.Vector3, beaconH = 4) => {
      const g = createArmorPickup(slot, level, renderer, beaconH);
      g.position.copy(at);
      armorGroup.add(g);
      armorPickups.push({ mesh: g, slot, level, base: at.clone() });
    };
    // Where they go is decided inside loadLevel, by the same open-ground placer the rest of the BR
    // loot uses — see the `lastHowl` block there. It cannot happen here: this runs before the level
    // has parsed, so there is nothing to raycast against yet.
    const tickArmorPickups = (dt: number) => {
      const t = performance.now() * 0.002;
      for (const p of armorPickups) {
        p.mesh.position.y = p.base.y + Math.sin(t + p.base.x) * 0.03;
        p.mesh.rotation.y += dt * 0.5;
      }
      if (!human || !human.alive) return;
      for (let i = armorPickups.length - 1; i >= 0; i--) {
        const p = armorPickups[i]!;
        if (walkPos.distanceTo(p.base) > 1.2) continue;
        if (!shouldPickupArmor(human.armor[p.slot], p.level)) continue;
        equipArmor(human.armor, p.slot, p.level);
        p.mesh.removeFromParent();
        armorPickups.splice(i, 1);
        playSfx("buy", 0.55, 0.7);
        syncHud();
      }
    };
    /* ---- battle-royale world loot ----
       One array with a `kind` tag instead of five near-identical arrays and five near-identical
       pickup loops. Everything here is an authored GLB (see `worldLoot.ts`); the procedural
       box-and-lid crates are gone. Placed inside loadLevel — which is where the collision mesh
       exists, and therefore where "is this spot outdoors, level and dry?" can be answered — and
       ticked here. BR has no buy phase: guns, heals and armour all come off the map. */
    const lootGroup = new THREE.Group();
    scene.add(lootGroup);
    type LootKind = "weapon" | "medkit" | "chest" | "pack" | "crate" | "ammo" | "wall";
    type GroundLoot = {
      mesh: THREE.Group;
      base: THREE.Vector3;
      kind: LootKind;
      /** weapon pickups and containers that roll a gun */
      weaponId?: string | undefined;
      /** which calibre an `ammo` crate holds */
      family?: AmmoFamily | undefined;
      /**
       * Contents, for anything the player has to CHOOSE from. Present ⇒ standing on it opens the
       * side panel instead of granting anything, which is Brook's "nothing should reaplce directly
       * what the player has its should be a player choice". Absent ⇒ a loose prop that is taken on
       * contact when it fits, and left lying there when it does not.
       */
      stash?: Stash | undefined;
      /** bob + spin. Off for the chest and the airdrop: a 1.1 m crate spinning in mid-air reads
       *  as a bug, and both are landmarks the player navigates to rather than trinkets. */
      animate: boolean;
      /** pickup range in metres — bigger for the big props so you don't have to stand on them */
      radius: number;
    };
    const groundLoot: GroundLoot[] = [];
    const addLoot = (
      kind: LootKind,
      mesh: THREE.Group,
      at: THREE.Vector3,
      opts: {
        weaponId?: string | undefined;
        family?: AmmoFamily | undefined;
        stash?: Stash | undefined;
        animate?: boolean;
        radius?: number;
      } = {},
    ) => {
      mesh.position.copy(at);
      lootGroup.add(mesh);
      const entry: GroundLoot = {
        mesh,
        base: at.clone(),
        kind,
        weaponId: opts.weaponId,
        family: opts.family,
        stash: opts.stash,
        animate: opts.animate ?? true,
        radius: opts.radius ?? 1.5,
      };
      groundLoot.push(entry);
      return entry;
    };
    /**
     * A mutable snapshot of the pack.
     *
     * Every `add*` below both mutates this and fires the matching setter. The copy exists because
     * "Take all that fits" grants ten lines inside ONE click: `bagLoadRef` will not have been
     * re-rendered between them, so without a local running total the second line would be sized
     * against the pack as it was before the first, and ten small items could overrun a full pack.
     */
    const workingLoad = (): BagLoad => ({
      kits: bagLoadRef.current.kits,
      inhalers: bagLoadRef.current.inhalers,
      walls: bagLoadRef.current.walls,
      grenades: { ...bagLoadRef.current.grenades },
      ammo: { ...bagLoadRef.current.ammo },
    });
    /**
     * Put `rounds` of one calibre in the pack, capped by what still fits, and return how many
     * actually went in. Returning the count is what lets a loot line show "x12" when only twelve
     * of a sixty-round crate will fit, instead of swallowing the other forty-eight silently.
     */
    const addAmmo = (family: AmmoFamily, rounds: number, load: BagLoad): number => {
      const take = roomForAmmo(load, backpackLevelRef.current, family, rounds);
      if (take <= 0) return 0;
      load.ammo[family] += take;
      ammoPoolRef.current = { ...ammoPoolRef.current, [family]: ammoPoolRef.current[family] + take };
      setAmmoPool(ammoPoolRef.current);
      return take;
    };
    const addItem = (kind: "kit" | "inhaler" | "wall", want: number, load: BagLoad): number => {
      const n = roomForItem(load, backpackLevelRef.current, kind, want);
      if (n <= 0) return 0;
      if (kind === "kit") {
        load.kits += n;
        setKits((k) => k + n);
      } else if (kind === "inhaler") {
        load.inhalers += n;
        setInhalers((v) => v + n);
      } else {
        load.walls += n;
        setWallCharges((v) => v + n);
      }
      return n;
    };
    const addGrenade = (g: GrenadeKind, want: number, load: BagLoad): number => {
      const n = roomForItem(load, backpackLevelRef.current, "grenade", want);
      if (n <= 0) return 0;
      load.grenades[g] += n;
      setGrenades((prev) => ({ ...prev, [g]: prev[g] + n }));
      return n;
    };
    /** Every calibre up by one crate, as far as the pack allows — the old ammo-box effect. */
    const topUpAmmo = () => {
      const load = workingLoad();
      for (const f of AMMO_FAMILIES) addAmmo(f, FAMILY_BOX[f], load);
    };
    /**
     * Built inside loadLevel, used by the render loop. The placer needs the collision mesh and
     * the measured map footprint, neither of which exists until the level has parsed.
     */
    let lootPlacer: LootPlacer | null = null;
    let airdropDirector: ReturnType<typeof createAirdropDirector> | null = null;
    /** Airdrop guns: the tier you cannot find lying in the grass. */
    const AIRDROP_GUNS = ["awm", "m249", "scar", "spas12"];

    /**
     * Put something down at the player's feet as real, pickable world loot.
     *
     * Brook: "if the player decidde to throw a gun or ammo or whatever will it show in the grond so
     * his teamet can pick it if not make it happens". It did not: `dropWeapon` only nulled the slot
     * and the gun ceased to exist. A metre in front, so it does not spawn inside the player and get
     * re-collected on the same frame.
     */
    const dropAtPlayer = (kind: LootKind, mesh: THREE.Group, opts: Parameters<typeof addLoot>[3] = {}) => {
      const at = walkPos.clone();
      at.x += Math.sin(yaw) * -1.1;
      at.z += Math.cos(yaw) * -1.1;
      at.y = groundAt(at.x, at.z, walkPos.y + 2, 4) ?? walkPos.y;
      addLoot(kind, mesh, at, opts);
    };
    const dropWeaponToWorld = (id: string) => {
      const w = getWeapon(id);
      if (!w || w.id === "fists") return;
      dropAtPlayer("weapon", createWeaponPickup(w.id, w.cls, renderer, 2.5), { weaponId: w.id, radius: 1.5 });
    };
    dropToWorldRef.current = dropWeaponToWorld;
    /**
     * Take a gun into the loadout. Returns false when it CANNOT be taken without giving something
     * up, and takes nothing in that case — the caller opens the swap choice instead. This is the
     * fix for the old `equipWeapon` fallback (`target = ... : activeSlot < 2 ? activeSlot : 0`),
     * which silently binned whichever heavy you were holding.
     */
    const takeWeapon = (id: string, swapWith?: string): boolean => {
      const w = getWeapon(id);
      if (!w) return false;
      const cur = [...slotsRef.current];
      let target: number;
      if (!isHeavy(w)) {
        target = 2; // one sidearm slot, so replacing it needs no question
      } else {
        if (cur.indexOf(id) !== -1) return false; // already carrying this exact gun
        const empty = cur[0] === null ? 0 : cur[1] === null ? 1 : -1;
        if (empty !== -1) {
          target = empty;
        } else {
          if (!swapWith) return false; // both heavies full: ask first
          const at = cur.indexOf(swapWith);
          if (at !== 0 && at !== 1) return false;
          target = at;
        }
      }
      const giving = cur[target];
      if (giving && giving !== id) dropWeaponToWorld(giving);
      setOwned((o) => (o.includes(w.id) ? o : [...o, w.id]));
      setAmmo((prev) => (prev[w.id] ? prev : { ...prev, [w.id]: { mag: getMagazine(w.id, profileRef.current) } }));
      cur[target] = w.id;
      slotsRef.current = cur;
      setSlots(cur);
      setActiveSlot(target);
      return true;
    };
    /** Hand over a gun and swap to it. Buy-menu semantics: replacing is expected here. */
    const grantWeapon = (id: string) => {
      const w = getWeapon(id);
      if (!w) return;
      setOwned((o) => (o.includes(w.id) ? o : [...o, w.id]));
      setAmmo((prev) => (prev[w.id] ? prev : { ...prev, [w.id]: { mag: getMagazine(w.id, profileRef.current) } }));
      equipWeaponRef.current(w);
    };
    /** Plates from a container, honouring the same "never downgrade" rule as ground armour. */
    const grantArmor = (level: 1 | 2 | 3) => {
      if (!human) return;
      for (const slot of ["vest", "helmet"] as const) {
        if (shouldPickupArmor(human.armor[slot], level)) equipArmor(human.armor, slot, level);
      }
    };
    void grantArmor; // kept for the buy-menu armour path; container plates go through `takeEntry`
    /**
     * The container whose panel is open. Held here rather than in React because the render loop is
     * what decides you are standing on it, and what decides you have walked away from it.
     */
    let openContainer: GroundLoot | null = null;
    const removeLoot = (d: GroundLoot) => {
      const i = groundLoot.indexOf(d);
      if (i !== -1) groundLoot.splice(i, 1);
      d.mesh.removeFromParent();
    };
    const closeStash = () => {
      openContainer = null;
      setOpenStash(null);
    };
    closeStashRef.current = closeStash;
    const openContainerPanel = (d: GroundLoot) => {
      if (openContainer === d) return;
      openContainer = d;
      setOpenStash(d.stash ? { ...d.stash, entries: d.stash.entries.map((e) => ({ ...e })) } : null);
      playSfx("equip", 0.5, 0.8);
    };
    /** Push the live contents back into React after a take, or drop the crate once it is empty. */
    const syncStash = (d: GroundLoot) => {
      if (!d.stash) return;
      d.stash.entries = d.stash.entries.filter((e) => e.qty > 0);
      if (d.stash.entries.length === 0) {
        removeLoot(d);
        closeStash();
        return;
      }
      setOpenStash({ ...d.stash, entries: d.stash.entries.map((e) => ({ ...e })) });
    };
    /**
     * Take one line. `load` is the running total (see `workingLoad`) so a "take all" cannot
     * overrun the cap; `swapWith` is the gun the player agreed to give up, and a weapon line with
     * no free slot and no `swapWith` takes NOTHING rather than replacing anything.
     */
    const takeEntry = (d: GroundLoot, index: number, load: BagLoad, swapWith?: string) => {
      const e = d.stash?.entries[index];
      if (!e) return;
      switch (e.kind) {
        case "weapon":
          if (takeWeapon(e.weaponId, swapWith)) {
            e.qty -= 1;
            playSfx("equip", 0.8, 1);
          }
          break;
        case "ammo":
          e.qty -= addAmmo(e.family, e.qty, load);
          break;
        case "kit":
          e.qty -= addItem("kit", e.qty, load);
          break;
        case "inhaler":
          e.qty -= addItem("inhaler", e.qty, load);
          break;
        case "wall":
          e.qty -= addItem("wall", e.qty, load);
          break;
        case "grenade":
          e.qty -= addGrenade(e.grenade, e.qty, load);
          break;
        case "armor":
          // Armour is worn, not carried, so it never competes for pack space — but it still
          // refuses to downgrade what you already have, same as a plate off the ground.
          if (human && shouldPickupArmor(human.armor[e.slot], e.level)) {
            equipArmor(human.armor, e.slot, e.level);
            e.qty = 0;
            playSfx("buy", 0.6, 0.9);
          }
          break;
      }
      syncStash(d);
      syncHud();
    };
    takeStashRef.current = (index, swapWith) => {
      if (openContainer) takeEntry(openContainer, index, workingLoad(), swapWith);
    };
    takeAllStashRef.current = () => {
      const d = openContainer;
      if (!d?.stash) return;
      const load = workingLoad();
      // Back to front: taking a line can empty and remove it, and indices behind it stay put.
      // Weapons are skipped — "take all" must never make the swap choice on the player's behalf.
      for (let i = d.stash.entries.length - 1; i >= 0; i--) {
        if (d.stash.entries[i]!.kind === "weapon") continue;
        takeEntry(d, i, load);
      }
    };
    /** Everything the player throws out of the pack, as ground loot a teammate can collect. */
    throwItemRef.current = (req) => {
      const load = bagLoadRef.current;
      switch (req.kind) {
        case "kit":
          if (load.kits <= 0) return;
          setKits((k) => Math.max(0, k - 1));
          dropAtPlayer("medkit", createMedkitPickup(renderer, 2.2), { radius: 1.5 });
          break;
        case "inhaler":
          if (load.inhalers <= 0) return;
          setInhalers((n) => Math.max(0, n - 1));
          // No inhaler prop exists, so it goes down as a one-line crate — which also means the
          // teammate who finds it sees exactly what is in it before picking it up.
          dropAtPlayer("pack", createDeathPack(renderer), {
            animate: false,
            radius: 1.6,
            stash: { source: "pack", entries: [{ kind: "inhaler", qty: 1 }] },
          });
          break;
        case "wall":
          if (load.walls <= 0) return;
          setWallCharges((w) => Math.max(0, w - 1));
          dropAtPlayer("wall", createWallChargePickup(renderer, 2.2), { radius: 1.5 });
          break;
        case "ammo": {
          const have = load.ammo[req.family];
          if (have <= 0) return;
          // A thrown box is a whole crate where there is one, otherwise everything left.
          const give = Math.min(have, FAMILY_BOX[req.family]);
          ammoPoolRef.current = { ...ammoPoolRef.current, [req.family]: have - give };
          setAmmoPool(ammoPoolRef.current);
          dropAtPlayer("ammo", createAmmoPickup(req.family, renderer, 2.2), {
            family: req.family,
            radius: 1.5,
          });
          break;
        }
        case "grenade": {
          if ((load.grenades[req.grenade] ?? 0) <= 0) return;
          setGrenades((prev) => ({ ...prev, [req.grenade]: Math.max(0, prev[req.grenade] - 1) }));
          dropAtPlayer("pack", createDeathPack(renderer), {
            animate: false,
            radius: 1.6,
            stash: { source: "pack", entries: [{ kind: "grenade", grenade: req.grenade, qty: 1 }] },
          });
          break;
        }
      }
      playSfx("equip", 0.45, 0.7);
      syncHud();
    };
    const tickWorldLoot = (dt: number) => {
      const t = performance.now() * 0.002;
      for (const d of groundLoot) {
        if (!d.animate) continue;
        d.mesh.position.y = d.base.y + 0.12 + Math.sin(t + d.base.x) * 0.06;
        d.mesh.rotation.y += dt * 0.8;
      }
      if (!human || !human.alive) {
        if (openContainer) closeStash();
        return;
      }
      // Walking away closes the panel. Slightly beyond the pickup radius so standing on the edge
      // of a crate does not strobe it open and shut.
      if (openContainer && walkPos.distanceTo(openContainer.base) > openContainer.radius + 1.2) {
        closeStash();
      }
      for (let i = groundLoot.length - 1; i >= 0; i--) {
        const d = groundLoot[i]!;
        if (walkPos.distanceTo(d.base) > d.radius) continue;
        // A container ASKS. It stays in the world until its last line has been taken.
        if (d.stash) {
          openContainerPanel(d);
          continue;
        }
        // A loose prop is taken on contact — but only if it fits. One that does not stays exactly
        // where it is, so "my pack is full" never costs the player the item.
        const load = workingLoad();
        let taken = true;
        switch (d.kind) {
          case "weapon":
            if (!d.weaponId) break;
            if (!takeWeapon(d.weaponId)) {
              // Both heavy slots full: turn the prop into a one-line container and let the player
              // pick which gun to give up, instead of eating whichever one they were holding.
              d.stash = { source: "pack", entries: [{ kind: "weapon", weaponId: d.weaponId, qty: 1 }] };
              openContainerPanel(d);
              taken = false;
              break;
            }
            playSfx("buy", 0.7, 1.0);
            break;
          case "ammo":
            taken = d.family ? addAmmo(d.family, FAMILY_BOX[d.family], load) > 0 : true;
            if (taken) playSfx("buy", 0.55, 1.15);
            break;
          case "medkit":
            taken = addItem("kit", 1, load) > 0;
            if (taken) playSfx("medkit", 0.55, 0.6);
            break;
          case "wall":
            taken = addItem("wall", 1, load) > 0;
            if (taken) playSfx("buy", 0.5, 1.25);
            break;
          default:
            break;
        }
        if (taken) removeLoot(d);
        syncHud();
      }
    };

    const explosionFx = createExplosionFx(BOMB_RADIUS);
    scene.add(explosionFx.group);
    const smokeField = createSmokeField(initialQuality === "low" ? 0.5 : 1);
    scene.add(smokeField.group);
    /** active decoys: fake gunshot sources that draw bot attention and minimap dots */
    type Decoy = { root: THREE.Group; ttl: number; nextBark: number; team: Team; light: FxLight };
    const decoys: Decoy[] = [];
    /** active pings: player-placed markers in the world */
    let currentPingKind: PingKind = "enemy";
    const pings: Ping[] = [];
    const pingGroup = new THREE.Group();
    scene.add(pingGroup);
    const decoyMat = new THREE.MeshStandardMaterial({ color: 0x8ee36d, emissive: 0x4aa02c, emissiveIntensity: 0.6 });
    const decoyGroup = new THREE.Group();
    scene.add(decoyGroup);
    /*
     * Transient effect lights live in ONE fixed pool, added to the arena root at build time and
     * never added or removed again. Adding/removing a light changes the scene's active light count,
     * and `three` answers that by relinking every lit material in the scene — a one-frame
     * main-thread stall on every grenade, flashbang, decoy bark and decoy glow. Pooling keeps the
     * count constant; only colour, position and intensity change. Same reasoning as `impactFx.ts`.
     */
    type FxLight = {
      light: THREE.PointLight;
      /** seconds left while pulsing, -1 while held by an owner, 0 when free */
      life: number;
      total: number;
      peak: number;
    };
    const fxLights: FxLight[] = [];
    // Three, not more: each light is iterated by every fragment of every lit material for the whole
    // match, so this budget is real per-frame cost. Three covers two live decoy glows plus one
    // flash; past that a pulse recycles the oldest slot (cosmetic only).
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 2);
      l.position.set(0, -1000, 0);
      root.add(l);
      fxLights.push({ light: l, life: 0, total: 1, peak: 0 });
    }
    const takeFxLight = (): FxLight => {
      const free = fxLights.find((s) => s.life === 0);
      if (free) return free;
      // nothing free: steal the pulse closest to expiring, never a held light if one is pulsing
      let best: FxLight | null = null;
      for (const s of fxLights) {
        if (s.life <= 0) continue;
        if (!best || s.life < best.life) best = s;
      }
      return best ?? fxLights[0]!;
    };
    /** one-shot light: full brightness at `at`, fading to nothing over `life` seconds */
    const pulseFxLight = (
      color: number,
      at: THREE.Vector3,
      peak: number,
      distance: number,
      decay: number,
      life: number,
    ) => {
      const slot = takeFxLight();
      const l = slot.light;
      l.color.setHex(color);
      l.distance = distance;
      l.decay = decay;
      l.position.copy(at);
      slot.peak = peak;
      slot.total = Math.max(0.001, life);
      slot.life = slot.total;
      l.intensity = peak;
    };
    /** a light an owner keeps while it lives; the owner drives the position and releases it */
    const holdFxLight = (color: number, peak: number, distance: number, decay: number): FxLight => {
      const slot = takeFxLight();
      const l = slot.light;
      l.color.setHex(color);
      l.distance = distance;
      l.decay = decay;
      l.intensity = peak;
      slot.peak = peak;
      slot.total = 1;
      slot.life = -1;
      return slot;
    };
    const releaseFxLight = (slot: FxLight) => {
      slot.life = 0;
      slot.light.intensity = 0;
      slot.light.position.set(0, -1000, 0);
    };
    const updateFxLights = (dt: number) => {
      for (const s of fxLights) {
        if (s.life <= 0) continue; // free or held — a held light is driven by its owner
        s.life = Math.max(0, s.life - dt);
        s.light.intensity = s.peak * (s.life / s.total);
      }
    };
    const spawnDecoy = (at: THREE.Vector3, team: Team) => {
      const root = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.35, 8), decoyMat);
      body.position.y = 0.18;
      const dish = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.12, 12), decoyMat);
      dish.position.y = 0.42;
      root.add(body, dish);
      root.position.copy(at);
      decoyGroup.add(root);
      const fxLight = holdFxLight(0x8ee36d, 2.5, 7, 2);
      decoys.push({ root, ttl: DECOY_LIFE, nextBark: 0.2 + Math.random() * 0.4, team, light: fxLight });
    };
    const bombSystem: BombSystem = createBombSystem({
      groundAt: (x, z, fromY, maxRise) => groundAt(x, z, fromY, maxRise ?? 4),
      onExplode: (at, kind) => {
        if (kind === "smoke") {
          smokeField.spawn(at);
          playSfx("equip", 0.8, -0.5);
          return;
        }
        if (kind === "flash") {
          playSfx("land", 1, 0.6);
          pulseFxLight(0xffffff, at.clone().setY(at.y + 1), 90, 40, 2, 0.11);
          shakeRef.current = Math.max(shakeRef.current, 0.35);
          // player blindness scales with distance and whether they were looking at it
          if (human && human.alive) {
            const eye = walkPos.clone().setY(walkPos.y + EYE_HEIGHT);
            const d = eye.distanceTo(at);
            if (d < FLASH_RADIUS && castFirst(eye, at.clone().sub(eye).normalize(), Math.max(0.1, d - 0.4)) === null) {
              const look = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
              const toBang = at.clone().sub(eye).setY(0).normalize();
              const facing = Math.max(0, look.dot(toBang));
              flashRef.current = Math.max(flashRef.current, (1 - d / FLASH_RADIUS) * (0.35 + 0.65 * facing));
            }
          }
          for (const f of fighters) {
            if (!f.alive || f.isHuman || !f.ai) continue;
            const d = f.pos.distanceTo(at);
            if (d > FLASH_RADIUS) continue;
            f.ai.blindLeft = Math.max(f.ai.blindLeft, 3.2 * (1 - d / FLASH_RADIUS));
          }
          return;
        }
        if (kind === "decoy") {
          spawnDecoy(at, human?.team ?? "blue");
          playSfx("equip", 0.7, 0.2);
          return;
        }
        playSfx("land", 1, -0.55);
        playSfx("kill", 0.7, -0.4);
        playSfx("shotgun", 0.9, -0.5);
        shakeRef.current = Math.max(shakeRef.current, 0.7);
        explosionFx.burst(at);
        for (let i = 0; i < 10; i++) {
          spawnImpact(
            at.clone().add(new THREE.Vector3(
              (Math.random() - 0.5) * 3.4,
              Math.random() * 2.4,
              (Math.random() - 0.5) * 3.4,
            )),
            new THREE.Color(i % 3 === 0 ? 0xfff2c0 : i % 3 === 1 ? 0xff9b3d : 0xff3b12),
          );
        }
        pulseFxLight(0xff8a3c, at.clone().setY(at.y + 1), 40, 26, 2, 0.14);
        if (!human) return;
        for (const f of fighters) {
          if (!f.alive) continue;
          // your own blast hurts you and the enemy team, never your squad
          if (f !== human && f.team === human.team) continue;
          const d = f.pos.distanceTo(at);
          if (d > BOMB_RADIUS) continue;
          const falloff = 1 - d / BOMB_RADIUS;
          damage(f, BOMB_DAMAGE * falloff, human);
        }
      },
    });
    scene.add(bombSystem.group);

    /**
     * The player's end of a throw — the arc, the landing ring, and the two flags that say a bomb is
     * in hand. Lives in `bombThrow.ts` now; everything it needs about the player changes every frame,
     * so it reads all of it through these getters rather than capturing values.
     */
    const bomb = createBombThrower({
      scene,
      human: () => human,
      walkPos,
      yaw: () => yaw,
      pitch: () => pitch,
      grounded: () => grounded,
      walking: () => modeRef.current === "walk",
      groundAt,
      throwBomb: (from, dir, speed, kind) => bombSystem.throwBomb(from, dir, speed, kind),
      grenadeKind: () => grenadeKindRef.current,
      onThrown: () => onBombThrownRef.current(),
    });

    /* ---- character power ---- */
    const powerDef = POWERS[characterRef.current.power];
    const powerFx = createPowerFx(initialQuality === "low" ? 24 : 56);
    scene.add(powerFx.group);
    // projected bubble (Emberveil): stops incoming rounds, follows the player
    const barrierDome = createBarrierDome(initialQuality === "low" ? 2 : 3);
    scene.add(barrierDome.group);

    /*
     * SHADER PREWARM + CAR PRELOAD.
     *
     * The multi-second freeze on the first car summon, the first character power and the first
     * frost wall was not the game "not being ready" in the loading sense — every one of those
     * objects is already built and in the scene graph by this point. It was the GPU driver
     * compiling and linking their shader programs, which WebGL does lazily and SYNCHRONOUSLY the
     * first frame a material is actually drawn. `WebGLRenderer.compile` walks the scene with
     * `traverseVisible`, so anything parked at `visible = false` — which is exactly how every one
     * of these effects waits its turn — is skipped by the normal warm-up and pays the bill later,
     * mid-fight, on the main thread.
     *
     * So: make them briefly visible somewhere harmless, hand the whole scene to `compileAsync`
     * (which uses KHR_parallel_shader_compile where the driver has it, keeping the work off the
     * critical path), then put them back. Plus fetch the player's car GLB now instead of on the
     * keypress — a cold network fetch and glTF parse is the other half of that particular stall.
     *
     * Everything here is best-effort: a failure leaves the game exactly as it is today, with a
     * hitch, rather than breaking the match.
     */
    const prewarmVisuals = async () => {
      let warmWall: ReturnType<typeof createFrostVisual> | null = null;
      try {
        const template = await frostTemplateReady;
        if (disposed) return;

        // One throwaway wall, parked far under the map so it cannot be seen for the frame or two
        // it is on screen. This compiles the frost material, which is otherwise first drawn at
        // the moment the player throws one.
        warmWall = createFrostVisual(template);
        warmWall.object.position.set(0, -500, 0);
        warmWall.object.visible = true;
        root.add(warmWall.object);

        const powerWasVisible = powerFx.group.visible;
        const domeWasVisible = barrierDome.group.visible;
        powerFx.group.visible = true;
        barrierDome.group.visible = true;

        await renderer.compileAsync(scene, camera);

        powerFx.group.visible = powerWasVisible;
        barrierDome.group.visible = domeWasVisible;
      } catch {
        /* prewarm is an optimisation — never let it break the match */
      } finally {
        // The throwaway wall is owned by nothing else, so it has to go back whether the compile
        // resolved, threw, or was still pending when the player quit the match.
        if (warmWall) {
          root.remove(warmWall.object);
          warmWall.dispose();
        }
      }
    };

    /** Fetch and rig the player's car up front so pressing the summon key is instant. */
    const preloadCar = () => {
      if (carRef.current || carLoading) return;
      carLoading = true;
      const carId = profileRef.current?.car ?? "corvette";
      createCarRig({ carId, renderer })
        .then(async (rig) => {
          carLoading = false;
          if (disposed) {
            rig.dispose();
            return;
          }
          // Parked and hidden until summoned — but compiled NOW, while nothing is happening.
          rig.root.visible = true;
          rig.root.position.set(0, -500, 0);
          root.add(rig.root);
          carRef.current = rig;
          try {
            // Compile the car subtree, NOT the whole scene. `compileAsync(scene, ...)` re-walks
            // and re-validates every material in the arena, which is a visible stall when the rig
            // lands mid-match — and this preload lands during the first seconds of play, right
            // when the player is most likely to press the summon key. The car is the only thing
            // that needs linking here.
            await renderer.compileAsync(rig.root, camera);
          } catch {
            /* compile is best-effort */
          }
          if (!disposed) rig.root.visible = false;
        })
        .catch(() => {
          carLoading = false;
        });
    };
    /** true while the player's bubble is up */
    const barrierUp = () => powerRef.current.active > 0 && powerDef.effects.barrier === true;
    const activatePower = () => {
      const st = powerRef.current;
      if (st.cooldown > 0 || st.active > 0) return;
      if (!human || !human.alive) return;
      if (matchRef.current.phase === "countdown") return;
      st.active = powerDef.duration;
      st.cooldown = powerDef.cooldown;
      st.shield = powerDef.effects.shield ?? 0;
      if (powerDef.effects.instantReload) {
        const id = weaponRef.current;
        const cur = ammoRef.current[id];
        const fam = familyOf(id);
        if (cur && fam) {
          const mag = getMagazine(id, profileRef.current);
          const need = Math.max(0, Math.min(mag - cur.mag, ammoPoolRef.current[fam]));
          if (need > 0) {
            ammoRef.current = { ...ammoRef.current, [id]: { mag: cur.mag + need } };
            setAmmo(ammoRef.current);
            ammoPoolRef.current = { ...ammoPoolRef.current, [fam]: ammoPoolRef.current[fam] - need };
            setAmmoPool(ammoPoolRef.current);
          }
        }
        isReloadingRef.current = false;
        reloadingWeaponRef.current = null;
        reloadTimerRef.current = 0;
        setIsReloading(false);
      }
      powerFx.activate(powerDef.color, powerDef.duration);
      if (powerDef.effects.barrier) barrierDome.activate(powerDef.duration);
      shakeRef.current = Math.max(shakeRef.current, 0.16);
      playSfx("equip", 1, 0.25);
      setPowerHud({ active: st.active, cooldown: st.cooldown, shield: st.shield });
    };
    activatePowerRef.current = () => {
      if (gameModeRef.current === "hangout") return;
      activatePower();
    };

    const placePing = (kind?: PingKind) => {
      if (!human || !human.alive) return;
      const k = kind ?? currentPingKind;
      camera.getWorldDirection(camFwd);
      const far = 120;
      const hit = castFirst(camera.position, camFwd, far);
      const pos = new THREE.Vector3();
      if (hit) {
        pos.copy(hit.point);
      } else {
        pos.copy(camera.position).add(camFwd.clone().multiplyScalar(far));
      }
      const ground = castFirst(new THREE.Vector3(pos.x, pos.y + 3, pos.z), down, 8);
      if (ground) pos.y = ground.point.y;
      const ping = createPingMarker(k, pos, human.team);
      pingGroup.add(ping.mesh);
      pings.push(ping);
      playSfx("equip", 0.55, 0.75);
      if (!kind) {
        currentPingKind = nextPingKind(currentPingKind);
      }
      currentPingKindRef.current = currentPingKind;
    };
    placePingRef.current = placePing;
    callPetRef.current = () => {
      const c = companionRef.current;
      if (!c || !human) return;
      // Toggle: if the pet is already out, dismiss (hide) it; otherwise summon it
      // back to the owner's side. This only flips visibility and — via the update
      // gate below — pauses its follow logic while hidden. The pet model and
      // behaviour are left exactly as-is.
      if (c.root.visible) {
        c.root.visible = false;
        playSfx("equip", 0.4, 0.75);
        setPetCalled((n) => n + 1);
        return;
      }
      c.root.visible = true;
      c.call(human.pos, yaw);
      playSfx("equip", 0.5, 1.2);
      // give the pet a voice: dog barks, puppy yips, the sprites chirp softly
      const petId = profileRef.current?.pet ?? "nibbles";
      playPetVoice(petId === "sable" ? "dog" : petId === "biscuit" ? "pup" : "soft");
      setPetCalled((n) => n + 1);
    };
    // ---- Call your car (Battle Royale only) ----------------------------------------
    // Mirrors the pet-call pattern: a rig lives on `carRef` (fetched up front by preloadCar),
    // and this action summons it in front of the player (or dismisses it when it's already out
    // and empty). Entering/leaving is a separate action bound to E and the HUD prompt.
    //
    // Drop the car ~5 m in front of where the player faces, planted on the ground, nose turned
    // back toward them so they can just walk up and get in. Hoisted out of the handler so the
    // summon-on-arrival path below can reuse it.
    const summonCar = (rig: CarRig) => {
      rig.reset();
      const ox = walkPos.x - Math.sin(yaw) * 5;
      const oz = walkPos.z - Math.cos(yaw) * 5;
      const gy = groundAt(ox, oz, walkPos.y + 3, 8) ?? walkPos.y;
      rig.root.position.set(ox, gy, oz);
      rig.yaw = yaw;
      rig.root.rotation.y = yaw;
      rig.root.visible = true;
      playSfx("equip", 0.5, 1.1);
    };
    /** true when the player asked for the car before the rig had finished loading. */
    let pendingCarSummon = false;
    callCarRef.current = () => {
      if (!modeRulesRef.current.vehicles) return;
      if (!human || !human.alive || drivingRef.current) return;
      const existing = carRef.current;
      // Already parked and empty → dismiss it.
      if (existing && existing.root.visible) {
        existing.root.visible = false;
        nearCarRef.current = false;
        setNearCar(false);
        playSfx("equip", 0.4, 0.75);
        return;
      }
      if (existing) {
        summonCar(existing);
        return;
      }
      /*
       * Not loaded yet. `preloadCar` normally has the rig built and its shaders compiled a couple
       * of seconds into the match, so this path is only reached if the player mashes the key
       * during the very first moments, or the fetch is slow. Rather than kicking off a SECOND
       * fetch (which is what the old inline loader did, and why the first press froze the frame),
       * just note the request and let the frame loop summon it the moment it lands.
       */
      pendingCarSummon = true;
      preloadCar();
    };
    /** Summon-on-arrival, polled once per frame while a request is outstanding. */
    const flushPendingCarSummon = () => {
      const rig = carRef.current;
      if (!pendingCarSummon || !rig) return;
      pendingCarSummon = false;
      if (!human || !human.alive || drivingRef.current) return;
      summonCar(rig);
    };
    carEnterExitRef.current = () => {
      const car = carRef.current;
      if (!car || !human) return false;
      if (drivingRef.current) {
        // Step out onto the driver's side.
        drivingRef.current = false;
        setDriving(false);
        const cyaw = car.yaw;
        const ex = car.root.position.x + Math.cos(cyaw) * 2.4 * CAR_SIZE;
        const ez = car.root.position.z - Math.sin(cyaw) * 2.4 * CAR_SIZE;
        const gy = groundAt(ex, ez, car.root.position.y + 3, 8) ?? car.root.position.y;
        walkPos.set(ex, gy, ez);
        // Hand the walk controller a clean vertical state. Riding the car skips the walk
        // branch entirely, so whatever velY/grounded held when the player got in was still
        // sitting there on step-out — a stale downward velocity ate the first jump.
        velY = 0;
        grounded = true;
        human.pos.copy(walkPos);
        stopCarEngine();
        playSfx("equip", 0.45, 0.9);
        return true;
      }
      // Get in — only from arm's reach of a car that's actually out.
      if (!car.root.visible || !human.alive) return false;
      if (walkPos.distanceTo(car.root.position) > 3.6 * CAR_SIZE) return false;
      // Clear any sighting state so the chase cam isn't left zoomed / vignetted.
      adsRef.current = false;
      setScoped(false);
      adsProgressRef.current = 0;
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
      if (scopeRef.current) scopeRef.current.style.opacity = "0";
      if (adsVignetteRef.current) adsVignetteRef.current.style.opacity = "0";
      if (crosshairRef.current) crosshairRef.current.style.opacity = "0";
      if (centerDotRef.current) centerDotRef.current.style.opacity = "0";
      drivingRef.current = true;
      setDriving(true);
      nearCarRef.current = false;
      setNearCar(false);
      startCarEngine(0.3); // held open for the whole drive; setCarEngine steers it per frame
      playSfx("equip", 0.5, 1.15);
      return true;
    };
    cyclePingKindRef.current = () => {
      currentPingKind = nextPingKind(currentPingKind);
      currentPingKindRef.current = currentPingKind;
    };

    const reload = () => {
      const id = slotsRef.current[activeSlotRef.current];
      if (id) startReloadRef.current(id);
    };

    actionsRef.current = { triggerDown, triggerUp, toggleAds, jump, reload, startHeal, cancelHeal: endHeal, armBomb: bomb.arm, wallButton, cancelWall: cancelPlacement };

    /* ---- touch look-drag: aiming without a mouse ---- */
    let touchLookId: number | null = null;
    let touchLastX = 0;
    let touchLastY = 0;
    /** every pointer currently down anywhere in the page */
    const activePointers = new Set<number>();
    const trackDown = (e: PointerEvent) => activePointers.add(e.pointerId);
    const trackUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      // if the finger that owned look-around is gone, release the slot
      if (touchLookId !== null && !activePointers.has(touchLookId)) touchLookId = null;
    };
    const onTouchLookStart = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || modeRef.current !== "walk") return;
      // a stale id (its pointerup was swallowed by an overlay or a frame hitch)
      // must never block aiming — reclaim it
      if (touchLookId !== null && !activePointers.has(touchLookId)) touchLookId = null;
      if (touchLookId !== null) return;
      touchLookId = e.pointerId;
      // keep receiving moves even if the finger slides over HUD overlays
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      touchLastX = e.clientX;
      touchLastY = e.clientY;
      if (!sfxInitializedRef.current) {
        initSfx();
        sfxInitializedRef.current = true;
        setSfxReady(true);
      }
    };
    const onTouchLookEnd = (e: PointerEvent) => {
      if (touchLookId === e.pointerId) touchLookId = null;
    };
    // Safety net: if a touch is swallowed (capture lost during a frame hitch,
    // gesture cancel, overlay churn) the look pointer could stay latched and
    // aiming would die until reload. Clear it whenever no fingers remain.
    const onLostLookCapture = (e: PointerEvent) => {
      if (touchLookId === e.pointerId) touchLookId = null;
    };
    const onAnyTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        touchLookId = null;
        activePointers.clear();
        // no fingers left: the trigger can never legitimately still be held
        mouseHeldRef.current = false;
      }
    };
    // If a drag on the canvas has no look owner (its pointerdown was swallowed,
    // or the browser cancelled the gesture mid-drag), adopt it so aiming
    // recovers instantly instead of dying until the next reload.
    const onCanvasPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || modeRef.current !== "walk") return;
      if (touchLookId !== null) return;
      touchLookId = e.pointerId;
      activePointers.add(e.pointerId);
      touchLastX = e.clientX;
      touchLastY = e.clientY;
    };




    const onPointerMove = (e: PointerEvent) => {
      if (touchLookId === e.pointerId) {
        const cfg = settingsRef.current;
        const dx = e.clientX - touchLastX;
        const dy = e.clientY - touchLastY;
        const sens = cfg.touchSensitivity * (adsRef.current ? cfg.adsMultiplier : 1) * aimHeaviness();
        const inv = cfg.invertY ? -1 : 1;
        noteManualAim(dx, dy);
        yaw -= dx * sens;
        // camera forward is the negated dir vector, so dragging down (+clientY)
        // must increase pitch for the view to actually tilt down
        pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * sens * inv));
        touchLastX = e.clientX;
        touchLastY = e.clientY;
        return;
      }
      if (modeRef.current === "walk") {
        if (document.pointerLockElement !== renderer.domElement) return;
        const cfg = settingsRef.current;
        const sens = cfg.mouseSensitivity * (adsRef.current ? cfg.adsMultiplier : 1) * aimHeaviness();
        const inv = cfg.invertY ? -1 : 1;
        noteManualAim(e.movementX, e.movementY);
        yaw -= e.movementX * sens;
        pitch = Math.max(-1.2, Math.min(1.2, pitch + e.movementY * sens * inv));
        return;
      }
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.005;
      phi = Math.max(0.15, Math.min(1.45, phi - (e.clientY - lastY) * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== "orbit") return;
      e.preventDefault();
      radius = Math.max(20, Math.min(420, radius + e.deltaY * 0.25));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (miniGameOpenRef.current) return; // the mini-game owns the keyboard while open
      if (e.code === "Space" && modeRef.current === "walk") e.preventDefault();
      // ` releases / re-grabs the mouse without pausing, F9 toggles collision wireframes
      if (e.code === "Backquote") {
        e.preventDefault();
        toggleCursorRef.current();
        return;
      }
      if (e.code === "F9") {
        e.preventDefault();
        toggleCollisionDebugRef.current();
        return;
      }
      // Emote wheel. Edge-triggered (a toggle), so it lives here rather than in the polled
      // key set. Ignored while typing in a field would matter if the game had any, but it
      // doesn't; the bind is read live so a rebind takes effect without re-registering.
      if (e.code === settingsRef.current.keybinds.dance) {
        e.preventDefault();
        toggleEmoteRef.current();
        return;
      }
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);

    renderer.domElement.addEventListener("pointerdown", onTouchLookStart);
    renderer.domElement.addEventListener("pointermove", onCanvasPointerMove);

    window.addEventListener("pointerdown", trackDown, true);
    window.addEventListener("pointerup", trackUp, true);
    window.addEventListener("pointercancel", trackUp, true);
    window.addEventListener("pointerup", onTouchLookEnd);
    window.addEventListener("pointercancel", onTouchLookEnd);
    renderer.domElement.addEventListener("lostpointercapture", onLostLookCapture);
    window.addEventListener("touchend", onAnyTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onAnyTouchEnd, { passive: true });

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      if (locked && freeCursorRef.current) {
        freeCursorRef.current = false;
        setCursorFree(false);
      }
      // a deliberate cursor release keeps the match running — don't pause
      if (freeCursorRef.current) return;
      if (modeRef.current === "walk" && !locked && matchRef.current.phase === "round" && !settingsOpenRef.current) {
        setPaused(true);
        suspendSfx();
      }
    };
    document.addEventListener("pointerlockchange", onPointerLockChange);

    const onFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    // Only while fullscreen may we swallow browser-reserved combos; outside of
    // it the player must keep normal tab control (CrazyGames restricted keys).
    const onReservedKey = (e: KeyboardEvent) => {
      if (!document.fullscreenElement) return;
      if ((e.ctrlKey || e.metaKey) && (e.code === "KeyW" || e.code === "KeyT" || e.code === "KeyN")) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onReservedKey, { capture: true });



    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      applyPixelRatio();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const activeMap = ARENA_MAPS[mapIdRef.current];

    /**
     * Daytime sky dome. The 4v4 outpost is an open outdoor map with baked
     * lighting, so a painted sky + matching haze makes it read much brighter
     * without touching the light rig (one extra unlit draw call).
     */
    const bootNum = (v: unknown, fallback: number) =>
      typeof v === "number" && Number.isFinite(v) ? v : fallback;
    const skyBrightness = bootNum(bootSettings.skyBrightness, 1.12);
    const fogIntensity = bootNum(bootSettings.fogIntensity, 0.85);
    const cloudMotion = bootNum(bootSettings.cloudMotion, 1);
    const groundBrightness = bootNum(bootSettings.groundBrightness, 1.25);

    const skyBrightnessRef = { current: skyBrightness };
    const fogIntensityRef = { current: fogIntensity };
    const WET_HORIZON = new THREE.Color(0x8f9aa6);
    let weatherWet = 0;

    let skybox: Skybox | null = null;
    let weather: Weather | null = null;
    let weatherApply: ((flash: number, wet: number) => void) | null = null;
    /** GPU wave animation on the level's sea mesh; null on maps without water */
    let animatedWater: AnimatedWater | null = null;
    if (activeMap.outdoor) {
      skybox = addDaySkybox(scene, {
        radius: 900,
        textureSize: initialQuality === "low" ? 1024 : 2048,
        brightness: skyBrightness,
        cloudMotion: cloudMotion,
      });
      scene.background = null;
      renderer.setClearColor(DAY_HORIZON, 1);
      const fogNear = initialQuality === "low" ? 150 : 200;
      const fogFar = initialQuality === "low" ? 480 : 700;
      const dayFog = new THREE.Fog(DAY_HORIZON, fogNear, fogFar);
      scene.fog = dayFog;

      /**
       * Live atmosphere tuning from the settings panel — sky exposure, haze
       * strength and cloud drift all apply instantly, no reload needed.
       */
      applyAtmosphereRef.current = (sky, fog, clouds) => {
        skyBrightnessRef.current = sky;
        fogIntensityRef.current = fog;
        skybox?.setBrightness(sky);
        skybox?.setCloudMotion(clouds);
        if (fog <= 0.02) {
          scene.fog = null;
          return;
        }
        scene.fog = dayFog;
        // more intensity = haze starts sooner and closes in faster
        dayFog.near = fogNear / Math.max(0.35, fog);
        dayFog.far = fogFar / Math.max(0.35, fog);
      };
      applyAtmosphereRef.current(skyBrightness, fogIntensity, cloudMotion);

      /**
       * Weather. Rain/snow are GPU-only (see weather.ts) and roll in on their
       * own timer, so most of a match is clear and costs nothing. Lightning
       * reuses the existing sky/fog uniforms for the flash — no extra lights,
       * no material recompiles.
       */
      weather = createWeather(scene, initialQuality, {
        onKind: (k) => {
          if (k === "clear") stopWeatherAmbience();
          else setWeatherAmbience(k, k === "rain" ? 0.32 : 0.16);
        },
        onThunder: (delay) => playThunder(delay, 0.65),
      });
      weatherApply = (flash, wet) => {
        // darker, hazier sky while it pours; lightning briefly blows it out
        const sky = skyBrightnessRef.current * (1 - wet * 0.32) + flash * 0.9;
        skybox?.setBrightness(sky);
        const fogMul = 1 + wet * 0.45;
        const f = Math.max(0.35, fogIntensityRef.current) * fogMul;
        if (scene.fog === dayFog) {
          dayFog.near = fogNear / f;
          dayFog.far = fogFar / f;
          dayFog.color.setHex(DAY_HORIZON).lerp(WET_HORIZON, wet * 0.7).addScalar(flash * 0.25);
        }
      };
    }

    let boundsMinX = activeMap.bounds?.minX ?? -200;
    let boundsMaxX = activeMap.bounds?.maxX ?? 200;
    let boundsMinZ = activeMap.bounds?.minZ ?? -200;
    let boundsMaxZ = activeMap.bounds?.maxZ ?? 200;
    // Extra hand-authored hard limit (4v4 Timber Outpost only). It sits on top
    // of the bounds box above and can never be crossed at any speed or height.
    const hardBarrier = activeMap.id === "outpost" ? OUTPOST_BARRIER : null;
    let disposed = false;

    // The arena GLB ships meshopt-compressed geometry and KTX2/ETC1S textures, so both decoders
    // have to be attached before loading. Both come from the page-wide singleton in ktx2.ts: a
    // KTX2Loader owns a basis transcoder and a worker pool, and this used to build a fresh one on
    // every arena mount alongside the three the model modules already had.
    const ktx2Loader = sharedKtx2Loader(renderer);
    const loader = makeGltfLoader(renderer);
    /**
     * Optional collision proxy: a simplified, texture-free clone of the level.
     * It is never added to the scene (so nothing extra is drawn) but it is
     * transformed exactly like the visual model, so raycasts against it line
     * up with what the player sees — at a fraction of the triangle count.
     */
    let collisionRoot: THREE.Object3D | null = null;
    let collisionReady: Promise<void> = Promise.resolve();
    const loadCollision = () =>
      new Promise<void>((resolve) => {
        if (!activeMap.collisionUrl) return resolve();
        enableMeshoptWorkers();
        const cl = new GLTFLoader();
        cl.setMeshoptDecoder(MeshoptDecoder);
        cl.load(
          activeMap.collisionUrl,
          (g) => {
            const proxy = g.scene;
            if (activeMap.scale !== 1) proxy.scale.setScalar(activeMap.scale);
            proxy.position.set(activeMap.offsetX, activeMap.yOffset, activeMap.offsetZ);
            proxy.updateMatrixWorld(true);
            collisionRoot = proxy;
            resolve();
          },
          undefined,
          () => resolve(),
        );
      });

    /**
     * Hand the main thread back to the browser for one frame.
     *
     * Everything in the level build below used to run as ONE task: the anisotropy pass, the light
     * bake, the splat rebuild, collision tiling, two sweeps over ~880k vertices, the fighters, the
     * loot scatter, the plane, and then a full-scene render read back into a PNG. Chrome does not
     * care that the work is useful — a task that does not return is a task it reports as "Page
     * Unresponsive", and while it runs the waiting room in front of it is frozen too. That is why
     * the room's own stall detector could never rescue this: counting slow frames needs frames.
     *
     * rAF and then a macrotask, in that order, on purpose. The frame lets the waiting room draw;
     * the timeout lets what that frame queued behind it — pointer events, the countdown interval,
     * React's own work — actually run before we take the thread back.
     *
     * `label` turns each boundary into a dev-only console line: elapsed build time and JS heap. The
     * point is to stop guessing. A tab that climbs to 2.2 GB is not a compile problem or a draw-call
     * problem, it is one allocation nobody has measured, and these lines say which phase it is in
     * and — crucially — whether the growth is even on the JS heap (if the tab is at 2 GB while
     * `usedJSHeapSize` reads 300 MB, the memory is in textures, GPU buffers or WASM, and no amount
     * of JS restructuring will touch it).
     */
    let buildT0 = 0;
    const breathe = (label?: string) => {
      if (label && import.meta.env.DEV) {
        const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory;
        const heap = mem ? ` · JS heap ${Math.round(mem.usedJSHeapSize / 1048576)} MB` : "";
        console.info(`[build] ${label} @ ${Math.round(performance.now() - buildT0)} ms${heap}`);
      }
      /*
       * Yield a real frame AND the browser's idle slack before the next build slice.
       *
       * `setTimeout(0)` is a task, not a break: a chain of them still runs back-to-back ahead of
       * anything the browser considers interruptible, which is why the waiting room in front of
       * this build could paint and count its clock down yet not hear a tap on Deploy. Giving the
       * frame back first, then waiting for idle, lets input and painting claim the main thread
       * first. The `timeout` matters: on a machine that never reports idle the build still gets a
       * slice every 120 ms, so the warm-up still lands before the room releases.
       */
      return new Promise<void>((res) => {
        requestAnimationFrame(() => {
          const idle = (
            window as Window & {
              requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            }
          ).requestIdleCallback;
          // Hang Out sits behind a static splash: one painted frame is enough, no idle wait.
          if (isSandbox(modeRulesRef.current)) window.setTimeout(res, 0);
          else if (idle) idle(() => res(), { timeout: 120 });
          else window.setTimeout(res, 0);
        });
      });
    };

    const loadLevel = () => loader.load(
      activeMap.url,
      async (gltf) => {
        await collisionReady;
        if (disposed) return;
        buildT0 = performance.now();
        const model = gltf.scene;
        if (activeMap.scale !== 1) model.scale.setScalar(activeMap.scale);
        model.position.set(activeMap.offsetX, activeMap.yOffset, activeMap.offsetZ);
        model.updateMatrixWorld(true);
        const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if ((m as THREE.InstancedMesh).isInstancedMesh) {
            // Meshopt-optimised instanced foliage/props ship with a bounding
            // sphere derived from the base geometry alone — it ignores where the
            // per-instance matrices actually scatter each copy across the map.
            // three.js then frustum-culls the whole batch the instant that
            // too-small sphere leaves view, so clumps of grass/rock/props blink
            // out as the camera turns and read as ~gaps in the terrain. Recompute
            // the real instance bounds so culling stays ON but stops firing early.
            const im = m as THREE.InstancedMesh;
            im.computeBoundingSphere();
            im.computeBoundingBox();
          }
          if (m.isMesh) {
            // The level is static: it only receives shadows. Letting every one
            // of its ~880k verts cast into the shadow map every frame was the
            // single biggest source of stutter.
            m.castShadow = false;
            m.receiveShadow = true;
            // Compressed (KTX2) textures ship without anisotropic filtering, so
            // floors/walls smear at grazing angles — restore crisp sampling.
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) {
              const std = mat as THREE.MeshStandardMaterial;
              for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"] as const) {

                const tex = std?.[key] as THREE.Texture | null | undefined;
                if (tex) {
                  tex.anisotropy = maxAniso;
                  tex.magFilter = THREE.LinearFilter;
                  tex.minFilter = THREE.LinearMipmapLinearFilter;
                  tex.needsUpdate = true;
                }
              }
            }
          }
        });

        /**
         * Where the sea surface is, read off the level's own water mesh.
         *
         * Needed because loot was landing in the water and there is no other honest way to know.
         * `ArenaMap` has no water field, and the waterline cannot be found by raycasting: water is
         * not solid, so the collision glb has no water in it (`verdant-isle-collision.glb` is 279
         * meshes of terrain and buildings and nothing else). Probes fired over the sea therefore
         * pass through the surface and land on the SEABED — a smooth slope with open sky above it
         * and nothing underneath, which is indistinguishable from a meadow by every geometric test
         * there is. The visual glb, though, has the answer authored right into it: one mesh called
         * `Water`, a flat plane, and its world-space top is the waterline. Largest footprint wins so
         * a decorative pond or a fountain cannot outvote the ocean.
         */
        let waterPlaneY: number | null = null;
        let waterMesh: THREE.Mesh | null = null;
        {
          let bestArea = 0;
          const wbox = new THREE.Box3();
          model.traverse((o) => {
            if (!(o as THREE.Mesh).isMesh) return;
            if (!/water|ocean|\bsea\b/i.test(o.name)) return;
            wbox.setFromObject(o);
            if (!wbox.isEmpty()) {
              const area = (wbox.max.x - wbox.min.x) * (wbox.max.z - wbox.min.z);
              if (area > bestArea) {
                bestArea = area;
                waterPlaneY = wbox.max.y;
                waterMesh = o as THREE.Mesh;
              }
            }
          });
        }

        /**
         * Terrain painted with a splat map renders black: either the weights
         * sit in vertex colours with no base texture, or (authored exports)
         * the RGBA weight mask itself is wired up as the base-colour map.
         * Grab those meshes *before* the light bake overwrites the colour
         * attribute.
         */
        // The Verdant Isle editor baked its terrain albedo (beaches, grass,
        // roads) into a 1280² atlas. We ship a GPU-compressed KTX2 re-encode
        // of it (~1 MB VRAM) and sample it with the same UVs as the splat
        // mask, so the ground shows the authored paint without a 31 MB 4K
        // atlas or the procedural splat shader.
        let bakedAtlas: THREE.Texture | null = null;
        if (activeMap.terrainAtlasUrl && ktx2Loader) {
          bakedAtlas = await ktx2Loader.loadAsync(activeMap.terrainAtlasUrl);
          // Quitting mid-transcode: the texture exists now and nothing else has a handle on it, so
          // this is the only place it can ever be freed.
          if (disposed) {
            bakedAtlas.dispose();
            return;
          }
          bakedAtlas.flipY = false;
          bakedAtlas.colorSpace = THREE.SRGBColorSpace;
          bakedAtlas.anisotropy = maxAniso;
        }
        const splatMeshes = prepareSplatTerrain(model, { bakedAtlas });
        await breathe("materials + terrain atlas");
        if (disposed) return;

        // Fold sky, sun and ambient occlusion into vertex colours once, then
        // draw the whole level unlit. Runs behind the deploy splash.
        if (bakedLight) {
          // `groundBrightness` folds extra bounce/ambient light into the bake so
          // the floor of the outdoor map stops reading as dark under the new sky.
          //
          // Kept deliberately UNDER 1.0 total on an upward-facing vertex. The old numbers summed
          // sun 1.125 + ambient 0.825 ≈ 1.95, which clips: every channel of a lit vertex pins to
          // white, and clipping does not just brighten a colour, it desaturates it. Verdant Isle's
          // grass came out pale sand — Brook's "the gress start reading like deserte" — because the
          // green channel saturated first and the warm amber sun (0xffd9a0) plus a tan bounce
          // (0x6f6255, itself scaled up 1.47x) filled in the rest. The sun is near-white now and
          // the bounce is a neutral olive, so the terrain atlas keeps its own colour instead of
          // being tinted toward sand, and the headroom means shading still reads as shading.
          const gb = groundBrightness;
          bakeVertexLighting(model, {
            sunDirection: sun.position.clone().negate(),
            sunColor: 0xfff4e6,
            sunIntensity: 0.62 * Math.min(1.15, gb),
            skyColor: 0x9fc6ff,
            // neutral bounce: a warm one reads as sand on green ground
            groundColor: new THREE.Color(0x5d6154).multiplyScalar(Math.min(1.15, 0.82 * gb)),
            ambient: Math.min(0.8, 0.5 * gb),
            // a little more contact darkening than before — with less flat fill light there is
            // contrast to spend, and it is what stops the ground reading as a flat poster
            aoFloor: Math.min(0.5, 0.3 * gb),
          });
        }

        // Rebuild the splat material from small repeating tiles (a few MB of
        // VRAM instead of a huge baked atlas). Mask-painted maps tile at the
        // editor's density (~128 repeats across the island ≈ 12 m).
        if (splatMeshes.length > 0) {
          applySplatMaterial(splatMeshes, {
            tileSize: 6,
            maskTileSize: 12,
            lit: !bakedLight,
            sunDirection: sun.position.clone().negate(),
            anisotropy: maxAniso,
          });
        }
        await breathe("light bake + splat material");
        if (disposed) return;

        // The authored map GLB ships a leftover humanoid placeholder — a node named
        // "Character": a low-poly body + head stack with no rig, no animation and no
        // weapon, parked alone in the blue spawn corner. It is not a fighter, so
        // nothing ever moves, kills or respawns it; it just idles at the player's
        // spawn forever. Every code-driven capsule is hidden at birth now (see
        // buildBot / setBodyProxyVisible), but this one is baked into the level and
        // slipped through the cull. Strip any such placeholder node before the level
        // is indexed for collision (below) and added to the scene.
        {
          const strays: THREE.Object3D[] = [];
          model.traverse((o) => {
            if (/^(?:character|mannequin|dummy)(?:[._-]\d+)?$/i.test(o.name)) strays.push(o);
            // Friend Island ships a forgotten placeholder cube — never show it.
            else if (activeMap.id === "friend-island" && ISLAND_STRAY_NODES.has(o.name)) strays.push(o);
          });
          for (const stray of strays) {
            stray.parent?.remove(stray);
            stray.traverse((o) => {
              const m = o as THREE.Mesh;
              if (m.geometry) m.geometry.dispose();
            });
            console.info("[arena] removed leftover map placeholder node:", stray.name);
          }
        }

        // Rolling waves on the sea mesh. Done after the light bake so the
        // cloned material carries the final baked state; the shader only moves
        // vertices on the GPU, so `waterPlaneY` above stays the static
        // waterline gameplay (loot, swimming checks) keeps using.
        if (waterMesh) animatedWater = createAnimatedWater(waterMesh);

        root.add(model);
        // Index the props for the altitude cull (see `cullProps`). Done here, once, because a
        // traversal of the whole level is far too expensive to repeat per frame — and only meshes
        // that are visible RIGHT NOW are listed, so the restore can never reveal something the level
        // meant to keep hidden. Sorted ascending so the hidden set is always a prefix.
        cullProps = [];
        cullHidden = 0;
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.visible || !m.geometry) return;
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const bs = m.geometry.boundingSphere;
          if (!bs) return;
          m.updateWorldMatrix(true, false);
          const s = cullScaleScratch.setFromMatrixScale(m.matrixWorld);
          const r = bs.radius * Math.max(s.x, s.y, s.z);
          if (r <= CULL_PROP_MAX) cullProps.push({ m, r });
        });
        cullProps.sort((a, b) => a.r - b.r);
        await breathe(`model in scene (${cullProps.length} cullable props)`);
        if (disposed) return;


        // Collide against the simplified proxy when the map ships one, else
        // fall back to the rendered geometry. Everything static is baked into a
        // single BVH-indexed mesh so a probe only touches the triangles along
        // its own ray instead of every collider in the level.
        const colliders: THREE.Mesh[] = [];
        (collisionRoot ?? model).traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.geometry) colliders.push(m);
        });
        collisionTiles = buildCollisionTiles(collisionRoot ?? model, {
          tileSize: 32,
          // pad the authored box so edge geometry (now reachable) still collides
          bounds: activeMap.bounds
            ? {
                minX: activeMap.bounds.minX - 40,
                maxX: activeMap.bounds.maxX + 40,
                minZ: activeMap.bounds.minZ - 40,
                maxZ: activeMap.bounds.maxZ + 40,
              }
            : null,
          regions: 2,
        });

        nearX = Infinity;
        nearZ = Infinity;
        nearFx = 0;
        nearFz = 0;

        if (collisionTiles.length > 0) {
          collidersRef.current = collisionTiles.map((t) => t.mesh);
          // Index the rest of the level during idle time so no frame — and no
          // queued mouse/key event behind it — ever waits on a BVH build.
          //
          // ONE tile per slice, not the default two. `requestIdleCallback` does not preempt: once
          // `ensureTileReady` starts a BVH it owns the main thread until that tile is done, and the
          // deadline it was handed is advisory. Two per callback just doubles the worst-case hitch,
          // and this runs while the waiting room in front of it is trying to hold a frame rate.
          cancelWarm?.();
          cancelWarm = warmTiles(collisionTiles, 1);
        } else {
          const staticCollider = buildMergedCollider(collisionRoot ?? model);
          collidersRef.current = staticCollider ? [staticCollider] : colliders;
        }
        await breathe(`collision tiles (${collisionTiles.length})`);
        if (disposed) return;


        // Real walkable footprint: the authored bounds box was hand-tuned and
        // sits well inside the actual ground, which fenced off ~10% of the map
        // on every side. Measure the ground/geometry extent from the level
        // itself (vertices near play height) and use that as the hard barrier.
        let fpMinX = Infinity;
        let fpMaxX = -Infinity;
        let fpMinZ = Infinity;
        let fpMaxZ = -Infinity;
        {
          const v = new THREE.Vector3();
          for (const m of colliders) {
            const pos = m.geometry.getAttribute("position");
            if (!pos) continue;
            m.updateWorldMatrix(true, false);
            const step = pos.count > 60000 ? 3 : 1;
            for (let i = 0; i < pos.count; i += step) {
              v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.matrixWorld);
              if (v.y < -5 || v.y > 12) continue; // ignore skybox / roofs / pits
              if (v.x < fpMinX) fpMinX = v.x;
              if (v.x > fpMaxX) fpMaxX = v.x;
              if (v.z < fpMinZ) fpMinZ = v.z;
              if (v.z > fpMaxZ) fpMaxZ = v.z;
            }
          }
        }
        const footprintOk =
          Number.isFinite(fpMinX) && fpMaxX - fpMinX > 10 && fpMaxZ - fpMinZ > 10;
        if (footprintOk) {
          const INSET = 1.5; // stop just short of the ground edge
          boundsMinX = fpMinX + INSET;
          boundsMaxX = fpMaxX - INSET;
          boundsMinZ = fpMinZ + INSET;
          boundsMaxZ = fpMaxZ - INSET;
        }
        // Two sweeps over the same ~880k vertices, and they cannot be merged: the radar grid's
        // extent is derived from the footprint this one just measured. So breathe between them.
        await breathe(`footprint sweep (${colliders.length} meshes)`);
        if (disposed) return;

        // Radar footprint: sample every vertex of the level between knee and
        // roof height into a top-down occupancy grid. The GLB batches whole
        // areas into single meshes, so per-mesh bounds are useless here.
        // In Hang Out it is deferred until after the player is in (nothing needs it to spawn).
        const buildRadarGrid = () => {
          const RES = 128;
          const EXT = footprintOk
            ? Math.max(Math.abs(boundsMinX), Math.abs(boundsMaxX), Math.abs(boundsMinZ), Math.abs(boundsMaxZ))
            : activeMap.bounds
              ? Math.max(
                  Math.abs(activeMap.bounds.minX),
                  Math.abs(activeMap.bounds.maxX),
                  Math.abs(activeMap.bounds.minZ),
                  Math.abs(activeMap.bounds.maxZ),
                )
              : 78;
          const cells = new Uint8Array(RES * RES);
          const v = new THREE.Vector3();
          for (const m of colliders) {
            const pos = m.geometry.getAttribute("position");
            if (!pos) continue;
            m.updateWorldMatrix(true, false);
            const step = pos.count > 60000 ? 3 : 1;
            for (let i = 0; i < pos.count; i += step) {
              v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.matrixWorld);
              if (v.y < 0.5 || v.y > 9) continue; // skip floors, roofs, sky
              const gx = Math.floor(((v.x + EXT) / (EXT * 2)) * RES);
              const gz = Math.floor(((v.z + EXT) / (EXT * 2)) * RES);
              if (gx < 0 || gz < 0 || gx >= RES || gz >= RES) continue;
              const idx = gz * RES + gx;
              const cur = cells[idx] ?? 0;
              if (cur < 255) cells[idx] = cur + 1;
            }
          }
          mapGridRef.current = { cells, res: RES, extent: EXT };
        };
        if (isSandbox(modeRulesRef.current)) {
          window.setTimeout(() => {
            if (!disposed) buildRadarGrid();
          }, 1500);
        } else buildRadarGrid();
        await breathe("radar grid");
        if (disposed) return;


        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (!activeMap.bounds && !footprintOk) {
          const lim = Math.max(size.x, size.z) / 2 - 2;
          boundsMinX = -lim;
          boundsMaxX = lim;
          boundsMinZ = -lim;
          boundsMaxZ = lim;
        }
        if (activeMap.bounds || footprintOk) {

          radius = Math.max(boundsMaxX - boundsMinX, boundsMaxZ - boundsMinZ) * 0.8;
          target.set((boundsMinX + boundsMaxX) / 2, 6, (boundsMinZ + boundsMaxZ) / 2);
        } else {
          radius = Math.max(size.x, size.z) * 1.15;
          target.set(0, size.y * 0.15, 0);
        }

        // ---- spawn spots come from the active map definition ----
        // one fighter per spot, standing in the middle of its own pad
        const points: SpawnPoint[] = activeMap.spawns.map((s) => {
          const top = new THREE.Vector3(s.x, s.y, s.z);
          if (activeMap.snapToGround) {
            const gy = groundAt(s.x, s.z, s.y + 0.5, 1.0);
            if (gy != null) top.y = gy;
          }
          return { name: s.name, team: s.team as Team, top };
        });

        const bluePads = points.filter((p) => p.team === "blue");
        const redPads = points.filter((p) => p.team === "red");

        // Bullet-trail lines and the animated character both hang off the arena root, and both are
        // built after a body has already been standing there as capsules — that whole subsystem is
        // `fighterBody.ts` now. `disposed` goes in as a getter because the model promise can land
        // after the effect has been torn down.
        const { makeTracer, attachRig } = createRigAttacher({
          root,
          renderer,
          disposed: () => disposed,
        });

        const addFighter = (team: Team, index: number, isHuman: boolean) => {
          const pads = team === "blue" ? bluePads : redPads;
          // one fighter per pad; if a team has fewer pads than fighters, stand
          // side by side around the shared pad instead of inside each other
          const pad = pads[index % pads.length]!;
          const overflow = Math.floor(index / pads.length);
          const home: SpawnPoint =
            overflow === 0
              ? pad
              : {
                  ...pad,
                  top: pad.top
                    .clone()
                    .add(
                      new THREE.Vector3(
                        Math.cos(overflow * 2.2) * 2.6,
                        0,
                        Math.sin(overflow * 2.2) * 2.6,
                      ),
                    ),
                };
          const id = `${team.toUpperCase()}_${index + 1}`;
          // A squadmate's plate renders this string, so it stopped being able to say "BOT BLUE2" —
          // see `botCallsign`. `id` still carries BLUE_2 for anything that needs to identify them.
          const name = isHuman ? profileRef.current?.name || "YOU" : botCallsign(team, index);
          const weapon = isHuman ? "fists" : team === "blue" ? "ak47" : index === 0 ? "m4a1" : "ump";
          const rawSidearm = slots[2];
          const sidearm: string = (isHuman
            ? (typeof rawSidearm === "string" && ["pan", "bat", "katana", "axe", "knife", "fists"].includes(rawSidearm)
                ? rawSidearm
                : "fists")
            : Math.random() < 0.25
              ? (["pan", "bat", "katana", "axe"] as const)[Math.floor(Math.random() * 4)]
              : "knife") as string;
          const f: Fighter = {
            id,
            name,
            team,
            isHuman,
            group: null,
            meshes: [],
            rig: null,
            weaponSocket: null,
            holsters: null,
            lastPos: home.top.clone(),
            vel: new THREE.Vector3(),
            hp: MAX_HP,
            alive: true,
            respawnIn: 0,
            dying: 0,
            downed: false,
            bleedOut: 0,
            beingRevived: 0,
            home,
            pos: home.top.clone(),
            cooldown: 0.8 + Math.random() * 1.2,
            tracer: null,
            fx: null,
            weapon,
            sidearm,
            ai: isHuman
              ? null
              : createBotBrain(
                  settingsRef.current.botDifficulty,
                  preferredRangeFor((() => {
                    const w = getWeapon(weapon);
                    return w ? getWeaponRange(w) : 120;
                  })()),
                ),
            armor: emptyArmor(),
            backpack: defaultBackpack(isHuman && profileRef.current?.loadout.tactical === "legPockets" ? 2 : 1),
          };
          // personal spawn effect, sitting on this fighter's own spot
          const fx = createSpawnFx(team === "blue" ? "water" : "fire", home.top, initialQuality);
          root.add(fx.group);
          fxList.push(fx);
          f.fx = fx;
          if (!isHuman) {
            const built = buildBot(team, id);
            built.group.position.copy(f.pos);
            root.add(built.group);
            f.group = built.group;
            f.meshes = built.meshes;
            f.tracer = makeTracer();
            f.lastPos.copy(f.pos);
            // All six roster characters point at the same body GLB today, so the bots use the
            // canonical URL directly rather than rolling a character they don't otherwise own.
            // A bot holds one gun and wears the other, so its sidearm is the thing on the hip.
            attachRig(
              built.group,
              built.meshes,
              OPERATIVE_BODY_URL,
              f.weapon,
              carriedOnBody([f.weapon, null, f.sidearm, null], f.weapon),
              (r, socket, holsters) => {
                f.rig = r;
                f.weaponSocket = socket;
                f.holsters = holsters;
              },
            );
          }
          fighters.push(f);
          return f;
        };

        // you + (your chosen squad - 1) friendly bots; the rest of the world roster is the enemy
        human = addFighter("blue", 0, true);
        if (profileRef.current?.loadout.tactical === "armorCrate") {
          const vestLevel = rollArmorLevel();
          const helmetLevel = rollArmorLevel();
          equipArmor(human.armor, "vest", vestLevel);
          equipArmor(human.armor, "helmet", helmetLevel);
          setArmor(human.armor);
          armorRef.current = human.armor;
          playSfx("equip", 0.75, 0.85);
        }
        const builtYou = buildBot("blue", "YOU");
        humanBody = {
          group: builtYou.group,
          meshes: builtYou.meshes,
          rig: null,
          weaponSocket: null,
          holsters: null,
          lastPos: human.pos.clone(),
          vel: new THREE.Vector3(),
        };
        humanBody.group.position.copy(human.pos);
        humanBody.group.visible = false;
        root.add(humanBody.group);
        {
          // The player gets the character they actually picked in the lobby, not the default.
          // Captured in a local so the assign callback isn't reading a mutable outer `let`.
          const body = humanBody;
          // The socket is kept: unlike a bot, the player swaps weapons mid-match, and the frame
          // loop re-sets it from `weaponRef` (see below). Seed both with whatever is active now.
          const carried = carriedOnBody(slotsRef.current, weaponRef.current);
          attachRig(body.group, body.meshes, characterRef.current.model, weaponRef.current, carried, (r, socket, holsters) => {
            body.rig = r;
            body.weaponSocket = socket;
            body.holsters = holsters;
            // Wire the emote wheel to this rig. The dance bundle lazy-loads on the first pick,
            // then plays as a looping full-body clip; the per-frame setMotion drops it the
            // instant the player moves.
            danceRef.current = {
              play: (id) => {
                loadOperativeDances()
                  .then((clips) => {
                    if (disposed || body.rig !== r) return;
                    r.addClips(clips.values());
                    r.playDance(id);
                  })
                  .catch((e) => console.error("[arena] dances failed to load", e));
              },
              stop: () => r.stopDance(),
            };
            // Stance transitions and other input-driven one-shots go through here (see
            // `bodyClipRef`). Bound to this rig instance, so a mid-match character swap can't
            // leave the key handler talking to a disposed rig.
            bodyClipRef.current = (clip, o) => {
              if (disposed || body.rig !== r) return;
              r.play(clip, o);
            };
          });
        }

        // ---- pet companion: the equipped pet trots along with the player ----
        {
          const equipped = PETS[(profileRef.current?.pet ?? "nibbles") as PetId];
          if (equipped) {
            createPetCompanion(equipped, root, human.pos.clone(), renderer)
              .then((c) => {
                if (disposed) {
                  c.dispose();
                  return;
                }
                companionRef.current = c;
              })
              .catch(() => null);
          }
        }

        /*
         * WHO IS ON WHOSE SIDE.
         *
         * Brook: "when the player choose a team we should creat a team for him in that number as if
         * somone choosed 2 the he should only have one firend the rest are all enmies".
         *
         * So the lobby chip sizes YOUR SQUAD, always. What it must not do is size the MATCH: the
         * number of bodies on the island is a frame-rate budget (eight mixers, eight AI brains,
         * eight capsule stacks), and Brook is complaining about lag, so the total is held at whatever
         * the map asks for and only the SPLIT moves. Solo on the island is 1 blue vs 7 red; Duo is
         * 2 vs 6; Squad is the even 4 vs 4 it always was. That is what `fullRoster` means now — hold
         * the world, not ignore the chip.
         *
         * Symmetric modes (Clash Squad, Lone Wolf) keep sizing both sides together, because a 2v2
         * genuinely is a smaller match than a 4v4 there.
         *
         * `-1` on the blue clamp is the human, who is fighter 0 and already exists; leaving at least
         * one enemy standing is what stops a "Solo" pick from being a walk-over.
         */
        const padsPerTeam = Math.min(bluePads.length, redPads.length);
        const chosenSquad = Math.max(1, teamSizeRef.current ?? activeMap.teamSize);
        const worldRoster = activeMap.teamSize * 2;
        /*
         * `opponents: false` is the sandbox switch (Hang Out): field the human and nobody else.
         * Checked HERE, at the single place the world roster is sized, so no other system has to
         * know a mode can be non-combat — the red loop below simply never runs.
         */
        const hasOpponents = modeRulesRef.current.opponents;
        const blueCount = !hasOpponents
          ? 1
          : modeRulesRef.current.fullRoster
            ? Math.min(chosenSquad, worldRoster - 1)
            : Math.min(chosenSquad, padsPerTeam);
        const redCount = !hasOpponents
          ? 0
          : modeRulesRef.current.fullRoster
            ? worldRoster - blueCount
            : blueCount;
        // One fighter per breath. Each one builds a spawn effect and a capsule stack, then kicks
        // off a skeleton clone, a mixer and a weapon prop. Red indices past `redPads.length` are
        // fine: `addFighter` wraps them onto the pad ring with a 2.6 m overflow offset.
        for (let i = 1; i < blueCount; i += 1) {
          addFighter("blue", i, false);
          await breathe();
          if (disposed) return;
        }
        for (let i = 0; i < redCount; i += 1) {
          addFighter("red", i, false);
          await breathe();
          if (disposed) return;
        }
        await breathe(`roster (${fighters.length} fighters: ${blueCount}v${redCount})`);
        if (disposed) return;

        // Battle royale: scatter authored loot across the WHOLE map — the fields AND the houses.
        //
        // What this replaces: the old scatter anchored on the SPAWN PADS, and on Verdant Isle all
        // eight pads sit within 80 m of the origin of a 600 x 600 island — so every crate piled
        // into the middle of the map, which is what read as "all the airdrops go to one place".
        // It also trusted whatever `groundAt` handed back, and `groundAt` returns a building's
        // interior floor or the seabed just as happily as a field, so drops landed jammed in walls
        // and under the sea.
        if (modeRulesRef.current.groundLoot) {
          /**
           * Standing height at (x, z), and whether the sky is open above it.
           *
           * The first cast, from well above the level, finds the topmost surface. Everything after
           * it is looking for a FLOOR underneath that surface, because that is what separates a
           * roof from a hillside — and it takes a short loop rather than one probe, since the first
           * thing under a roof is often the roof's own underside (a slab is thicker than the 0.4 m
           * the probe starts down) or a mezzanine. Three descents is enough for any building on
           * these maps; a gap of 1.7 m or more is a room a fighter could stand in.
           *
           * Probes are restricted to the collision tiles over this column — four to nine meshes
           * instead of the level's 281. That is not a micro-optimisation: `groundAt` casts against
           * every collider on the map, this runs up to four times per candidate spot, and the
           * placer tries many spots per drop across eighty-four drops. Unrestricted, that is
           * millions of raycasts and the array-per-cast garbage that comes with them, which is what
           * made the waiting room unplayable while the island was being stocked. Restricting it is
           * exact, not approximate: a tile whose footprint does not cover (x, z) cannot own the
           * surface under (x, z).
           */
          const columnDown = new THREE.Vector3(0, -1, 0);
          const columnAt = new THREE.Vector3();
          const probeGround = (x: number, z: number): { y: number; open: boolean } | null => {
            const near = collisionTiles.length
              ? nearbyTileMeshesReady(collisionTiles, x, z, 40)
              : collidersRef.current;
            const castDown = (fromY: number, far: number) =>
              castFirst(columnAt.set(x, fromY, z), columnDown, far, near)?.point.y ?? null;
            const top = castDown(202, 520);
            if (top == null) return null;
            let ceiling = top;
            for (let i = 0; i < 3; i += 1) {
              const below = castDown(ceiling - 0.4, 16);
              if (below == null) return { y: top, open: true }; // nothing under it: open sky
              if (ceiling - below >= 1.7) return { y: below, open: false }; // a room
              ceiling = below; // that was the far face of a slab; keep going down
            }
            return { y: top, open: true };
          };
          const placer = createLootPlacer({
            bounds: { minX: boundsMinX, maxX: boundsMaxX, minZ: boundsMinZ, maxZ: boundsMaxZ },
            probeGround,
            waterY: waterPlaneY,
          });
          lootPlacer = placer;

          // You drop in with pockets, not a loadout. The shared-pool cap only means anything if
          // there is room to loot INTO it: the arena start (3 kits, 9 throwables, 3 walls, five
          // calibres) is 30 of 30 units, i.e. a full pack before the plane door opens. So BR
          // clears the consumables and keeps only the small `FAMILY_START_LOOT` reserves.
          setKits(0);
          setInhalers(0);
          setWallCharges(0);
          setGrenades({ frag: 0, flash: 0, smoke: 0, decoy: 0 });
          ammoPoolRef.current = startingPools(true);
          setAmmoPool(ammoPoolRef.current);

          // How the map is stocked. Roughly half the guns and half the medkits go INSIDE the
          // buildings, which is the whole reason to break a door down in a battle royale — Brook's
          // "the houses are empty" was the placer only ever being asked for open ground. Indoor
          // spots take a much smaller `minGap` (a room is not 22 m across) and a shorter beacon, so
          // the marker lights the room instead of firing a column up through the roof.
          const INDOOR_BEACON = 2.2;

          // Guns. Every id here has a real GLB in /models/weapons, so each drop is that weapon.
          const lootTable = [
            "ak47", "m4a1", "scar", "mp40", "ump", "m1014", "spas12", "kar98k", "awm", "m249",
            "ak47", "mp40", "m1014", "m4a1", "ump", "scar", "deagle", "kar98k",
          ];
          // Yielded per drop, exactly like the roster. Every `placer.pick` runs `probeGround`,
          // which is up to four raycasts against the tile BVHs (and forces those BVHs to be built
          // the first time a probe reaches a tile), and every `create*Pickup` builds geometry plus
          // a beacon texture on the GPU. Eighty-four of those back to back is one task long enough
          // to trip Chrome's unresponsive-page watchdog — which is precisely what it was doing:
          // the build log reached `roster (8 fighters)` and then went silent for the rest of the
          // countdown, because the next yield was on the far side of this whole block.
          for (let i = 0; i < lootTable.length; i += 1) {
            const w = getWeapon(lootTable[i]!);
            if (w) {
              const inside = i % 2 === 0;
              const at = inside
                ? placer.pick({ where: "indoor", minGap: 7 }) ?? placer.pick({ minGap: 22 })
                : placer.pick({ minGap: 22 });
              if (at)
                addLoot(
                  "weapon",
                  createWeaponPickup(w.id, w.cls, renderer, inside ? INDOOR_BEACON : 6),
                  at,
                  { weaponId: w.id },
                );
            }
            await breathe();
            if (disposed) return;
          }
          await breathe(`loot: weapons (${lootTable.length})`);
          if (disposed) return;
          // Medkits, spread wider than the guns so topping up is a detour rather than a freebie.
          for (let i = 0; i < 14; i += 1) {
            const inside = i % 2 === 0;
            const at = inside
              ? placer.pick({ where: "indoor", minGap: 6 }) ?? placer.pick({ minGap: 26 })
              : placer.pick({ minGap: 26 });
            if (at)
              addLoot("medkit", createMedkitPickup(renderer, inside ? INDOOR_BEACON : 5), at, {
                radius: 1.6,
              });
            await breathe();
            if (disposed) return;
          }
          await breathe("loot: medkits (14)");
          if (disposed) return;
          // Gold chests: fixed, high-value caches, and the reason to leave open ground. Two in
          // three tucked against a building; the rest out in the nowhere, where taking one means
          // being seen taking it. Outdoors on purpose — a chest is a landmark, and its tall beacon
          // is the thing that pulls two squads to the same place.
          for (let i = 0; i < 10; i += 1) {
            const at = placer.pick({ minGap: 40, nearCover: i % 3 !== 2 });
            if (!at) break;
            const chestGun = lootTable[(Math.random() * lootTable.length) | 0];
            addLoot("chest", createChestPickup(renderer), at, {
              weaponId: chestGun,
              animate: false,
              radius: 2.1,
              stash: rollChestStash(chestGun),
            });
            await breathe();
            if (disposed) return;
          }
          await breathe("loot: chests (10)");
          if (disposed) return;
          // Ammo. The five calibre crates (`ammoFamily.ts`), heavily indoors: a rifle box in a
          // bedroom is the reason to clear the bedroom. Brook: "the heavy wepeons should shre the
          // same ammo ... the sniper has its own the shot guns both of them has the same" — so a
          // crate is a FAMILY's crate, and the wrong one is worth nothing to the gun you hold.
          for (let i = 0; i < 26; i += 1) {
            const family = AMMO_FAMILIES[i % AMMO_FAMILIES.length]!;
            const inside = i % 3 !== 2;
            const at = inside
              ? placer.pick({ where: "indoor", minGap: 5 }) ?? placer.pick({ minGap: 18 })
              : placer.pick({ minGap: 18 });
            if (at)
              addLoot("ammo", createAmmoPickup(family, renderer, inside ? INDOOR_BEACON : 4), at, {
                family,
                radius: 1.6,
              });
            await breathe();
            if (disposed) return;
          }
          await breathe("loot: ammo crates (26)");
          if (disposed) return;
          // Frost wall charges. Brook: the new props "should be thrown in the ground so the player
          // can catch them" — so the wall is loot now, not a free three-per-spawn.
          for (let i = 0; i < 10; i += 1) {
            const inside = i % 2 === 0;
            const at = inside
              ? placer.pick({ where: "indoor", minGap: 6 }) ?? placer.pick({ minGap: 24 })
              : placer.pick({ minGap: 24 });
            if (at)
              addLoot("wall", createWallChargePickup(renderer, inside ? INDOOR_BEACON : 4), at, {
                radius: 1.6,
              });
            await breathe();
            if (disposed) return;
          }
          await breathe("loot: wall charges (10)");
          if (disposed) return;
          // Armour. This is where the vests and helmets are actually created now, and it is a bug
          // fix as much as a move: the old scatter ran at effect setup, BEFORE loadLevel, so it
          // raycast against an empty collider list, `groundAt` returned null for all four, and the
          // `continue` swallowed it — every mode has been shipping with zero armour on the ground.
          // Half indoors, like the guns: a vest is loot-room loot.
          const armorSpawns: ["vest" | "helmet", 1 | 2 | 3][] = [
            ["vest", 1],
            ["helmet", 1],
            ["vest", 2],
            ["helmet", 2],
            ["vest", 2],
            ["helmet", 3],
          ];
          for (let i = 0; i < armorSpawns.length; i += 1) {
            const [slot, level] = armorSpawns[i]!;
            const inside = i % 2 === 0;
            const at = inside
              ? placer.pick({ where: "indoor", minGap: 6 }) ?? placer.pick({ minGap: 20 })
              : placer.pick({ minGap: 20 });
            if (at) spawnArmor(slot, level, at, inside ? INDOOR_BEACON : 4);
            await breathe();
            if (disposed) return;
          }
          await breathe(`loot: armour (${armorSpawns.length})`);
          if (disposed) return;

          // One supply drop every three minutes, each somewhere new, announced as it comes in.
          airdropDirector = createAirdropDirector({
            parent: lootGroup,
            placer,
            renderer,
            interval: 180,
            firstAt: 75,
            onInbound: () => speakAnnouncer("airdrop"),
            listener: () => human?.pos ?? walkPos,
          });
        }

        spawnCageRef.current = null;
        if (!isSandbox(modeRulesRef.current)) {
          // one shared cage covering the whole friendly spawn pad, not one box per player
          const blueHomes = fighters.filter((f) => f.team === "blue").map((f) => f.home.top);
          const bb = new THREE.Box3();
          for (const p of blueHomes) bb.expandByPoint(p);
          bb.expandByScalar(SPAWN_BOX_HALF);
          const center = bb.getCenter(new THREE.Vector3());
          center.y = human.home.top.y;
          const halfX = Math.max(SPAWN_BOX_HALF, (bb.max.x - bb.min.x) / 2);
          const halfZ = Math.max(SPAWN_BOX_HALF, (bb.max.z - bb.min.z) / 2);

          const cage = new THREE.Group();
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(halfX * 2, SPAWN_BOX_HEIGHT, halfZ * 2),
            new THREE.MeshBasicMaterial({
              color: 0x3f8fff,
              transparent: true,
              opacity: 0.08,
              side: THREE.BackSide,
              depthWrite: false,
            }),
          );
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(box.geometry),
            new THREE.LineBasicMaterial({ color: 0x9ecbff, transparent: true, opacity: 0.6 }),
          );
          cage.add(box, edges);
          cage.position.copy(center).add(new THREE.Vector3(0, SPAWN_BOX_HEIGHT / 2, 0));
          cage.visible = false;
          root.add(cage);
          spawnCageRef.current = { mesh: cage, center, halfX, halfZ };
        }

        // ---- plane drop-in: preload the plane and build the director ----
        // Only for `entry: "skydive"` modes; the rest spawn straight onto their pads. The load is
        // async, so startMatch falls back to a ground spawn if it hasn't landed
        // yet — the plane is small (~2 MB) and normally ready before deploy.
        let buildCompiled = false;
        /** the plane scene once it lands, so the final compile pass below can include it */
        let planeObjRef: THREE.Object3D | null = null;
        if (modeRulesRef.current.entry === "skydive" && humanBody) {
          const humanBodyGroup = humanBody.group;
          const refGroundY = points.reduce((s, p) => s + p.top.y, 0) / Math.max(1, points.length);
          groundRefY = refGroundY;
          loader.load(
            "/models/plane.glb",
            (g) => {
              if (disposed) return;
              const planeObj = g.scene;
              planeObj.scale.setScalar(PLANE_SCALE);
              planeObj.visible = false;
              planeObj.traverse((o) => {
                const m = o as THREE.Mesh;
                if (m.isMesh) {
                  m.castShadow = false;
                  m.receiveShadow = false;
                  m.frustumCulled = false;
                }
              });
              root.add(planeObj);
              planeObjRef = planeObj;
              /*
               * The plane is parked at `visible = false`, and `compileAsync` walks the graph with
               * `traverseVisible` — so the build's own compile skips it and its programs would
               * first link synchronously on the launch frame, stalling the moment the player is
               * thrown into the dive. If the compile already ran before this GLB landed, link it
               * here instead. Guarded so it never fights `begin()`, which owns the flag once the
               * dive has started.
               */
              if (buildCompiled) {
                planeObj.visible = true;
                void renderer
                  .compileAsync(scene, camera)
                  .catch(() => undefined)
                  .finally(() => {
                    if (!disposed && matchRef.current.phase !== "skydive") planeObj.visible = false;
                  });
              }
              let mixer: THREE.AnimationMixer | null = null;
              if (g.animations.length) {
                mixer = new THREE.AnimationMixer(planeObj);
                const act = mixer.clipAction(g.animations[0]!);
                act.setLoop(THREE.LoopRepeat, Infinity);
                act.play();
              }
              skydiveRef.current = createSkydiveDirector({
                scene: root,
                camera,
                plane: planeObj,
                planeMixer: mixer,
                humanBody: humanBodyGroup,
                // Same restriction as the loot scatter, for the same reason and with more at
                // stake: the director probes the ground every frame of a ~15 s dive, and at
                // altitude the unrestricted probe casts against all 281 level colliders while the
                // GPU is already drawing the entire island (nothing culls from 400 m up). This is
                // why the dive was the worst-performing moment in the game and the landing was
                // instantly smooth — on the ground the same probe only ever reached nearby tiles.
                groundAt: (x, z, fromY, maxRise) =>
                  collisionTiles.length
                    ? castFirst(
                        new THREE.Vector3(x, fromY + (maxRise ?? 0) + 0.01, z),
                        new THREE.Vector3(0, -1, 0),
                        GROUND_RAY_FAR,
                        nearbyTileMeshesReady(collisionTiles, x, z, 40),
                      )?.point.y ?? null
                    : groundAt(x, z, fromY, maxRise),
                bounds: { minX: boundsMinX, maxX: boundsMaxX, minZ: boundsMinZ, maxZ: boundsMaxZ },
                refGroundY,
                // Cosmetic only — nobody can shoot these. The dive used to last ~3 s; it now runs
                // ~15 s, so every diver is on screen five times as long, at an altitude where the
                // frustum holds the whole island and almost nothing culls. Halved to buy that
                // airtime back on the 2 GB-VRAM target.
                crowdSize: initialQuality === "low" ? 4 : initialQuality === "high" ? 12 : 8,
              });
            },
            undefined,
            () => {
              /* plane failed to load — BR just uses ground spawns */
            },
          );
        }

        // the match waits for the player to dismiss the onboarding overlay;
        // enterWalk (the "Enter arena" button) kicks off startMatch.

        // pad key light — only when the map is lit in real time. On a baked
        // (unlit) map these tint nothing on the level and would just add up to
        // one forward-render light per spawn to every actor's shader, so we
        // drop them entirely; the pads are already coloured by the bake.
        if (!bakedLight) {
          for (const p of points) {
            const spot = new THREE.PointLight(TEAM_COLORS[p.team], 12, 20, 2);
            spot.position.copy(p.top).add(new THREE.Vector3(0, 6, 0));
            root.add(spot);
          }
        }

        clipPlane.constant = box.min.y + size.y * 0.78;
        renderer.clippingPlanes = showRoofRef.current ? [] : [clipPlane];
        clipRef.current = { renderer, plane: clipPlane };

        /*
         * Link the level's shaders BEFORE reporting ready — and it costs nothing to do so.
         *
         * The tempting version of this is to report ready immediately and let the room's 900 ms
         * "MATCH STARTING" beat hide the compile. That does not work: `KHR_parallel_shader_compile`
         * is not free, a couple of hundred programs on a weak mobile GPU is 1.5-3 s, and when the
         * beat expires the first visible frame falls back to synchronous linking — a full-second
         * freeze landing exactly on the camera cut into the match, which is the worst possible
         * place to put it.
         *
         * Gating readiness on it is safe here because the room does not release the instant
         * `mapReady` flips. It releases when the roster fills, and the roster fills over ~18 s by
         * design (see `WaitingRoom`'s `fill`). So on any device that finishes the build before then
         * — which is all of them, that is the whole point of the room — this compile is spent
         * inside slack the room was going to spend anyway, and the player waits zero extra ms. On a
         * device slow enough to still be linking after the roster is full, the wait is real, and it
         * is the right trade: a few seconds of "PREPARING ISLAND" instead of a frozen first frame.
         *
         * Capped, because a driver that never reports completion must not be able to hold the room
         * past its ceiling — `releasing` needs `mapReady`, so a readiness signal that never arrives
         * is a room that never releases. Three seconds, then we take the hitch instead.
         */
        await breathe("loot + plane, before shader link");
        if (disposed) return;
        /*
         * SHOW EVERY BODY FOR THE COMPILE. Same `traverseVisible` trap as the props above, and this
         * is the half that produced "no oneshowup is after landing its fraze for like 4/5s": the
         * player's own body is parked at `visible = false` from the moment it is built until the
         * walk camera reveals it, so the compile below never saw it — and a SKINNED mesh is the most
         * expensive shader variant in the game to link. It first drew on touchdown, and linked there,
         * on the main thread, in one frame.
         *
         * Restored immediately after, so nothing is on screen that should not be: the compile does
         * not render to the canvas, it only walks the graph and links programs.
         */
        const warmVisibility: { o: THREE.Object3D; was: boolean }[] = [];
        const showForCompile = (o: THREE.Object3D | null | undefined) => {
          if (!o) return;
          warmVisibility.push({ o, was: o.visible });
          o.visible = true;
        };
        showForCompile(humanBody?.group);
        for (const f of fighters) showForCompile(f.group);
        // The plane sits at `visible = false` until launch, so without this line it is skipped by
        // `traverseVisible` and its programs link on the first frame of the dive. The restore
        // below hides it again immediately; the compile never renders to the canvas.
        if (planeObjRef) showForCompile(planeObjRef);
        try {
          await Promise.race([
            renderer.compileAsync(scene, camera),
            new Promise<void>((res) => window.setTimeout(res, 3000)),
          ]);
        } catch {
          /* compile is best-effort — never let it be the reason a match cannot start */
        } finally {
          // `finally`, so a compile that throws or a `disposed` bail cannot leave a body on screen
          // that the match meant to keep hidden.
          for (const v of warmVisibility) v.o.visible = v.was;
        }
        if (disposed) return;
        buildCompiled = true;
        // Every prop was visible for the compile above, so their programs are linked and hiding one
        // now costs nothing to undo. Before this line the cull is a no-op — see `cullArmed`.
        cullArmed = true;
        // Programs are linked (or we gave up waiting) — the throttled hidden render can start.
        building = false;

        syncHud();
        setStatus("");

        /*
         * ---- real minimap: one orthographic top-down render with the roof clipped ----
         *
         * After readiness, and behind another yield, because this is a full-scene render read back
         * to the CPU: `readRenderTargetPixels` blocks the main thread until the GPU has drained the
         * queue, and `toDataURL` then encodes a 512² PNG on top. Inline at the end of the build,
         * that was seconds of stall bolted onto an already long task — the other half of what took
         * the tab from "loading" to "Page Unresponsive" with the player still in the waiting room.
         *
         * Nothing waits on the picture. Until it lands — or if this throws, same as before — the
         * HUD draws the occupancy-grid minimap built above, so there is never a hole in the UI.
         */
        void (async () => {
          try {
            await breathe();
            if (disposed) return;
            const RT = 512;
            const EXT = 80; // must match ARENA_EXTENT in Minimap
            const topCam = new THREE.OrthographicCamera(-EXT, EXT, EXT, -EXT, 0.1, 600);
            topCam.up.set(0, 0, -1);
            topCam.position.set(0, 300, 0);
            topCam.lookAt(0, 0, 0);
            const rt = new THREE.WebGLRenderTarget(RT, RT);
            const prevPlanes = renderer.clippingPlanes;
            renderer.clippingPlanes = [clipPlane];
            renderer.setRenderTarget(rt);
            renderer.render(scene, topCam);
            renderer.setRenderTarget(null);
            renderer.clippingPlanes = prevPlanes;

            const buf = new Uint8Array(RT * RT * 4);
            renderer.readRenderTargetPixels(rt, 0, 0, RT, RT, buf);
            const cv = document.createElement("canvas");
            cv.width = cv.height = RT;
            const cx = cv.getContext("2d");
            if (cx) {
              const img = cx.createImageData(RT, RT);
              for (let y = 0; y < RT; y++) {
                const srcRow = (RT - 1 - y) * RT * 4; // GL reads bottom-up
                const dstRow = y * RT * 4;
                img.data.set(buf.subarray(srcRow, srcRow + RT * 4), dstRow);
              }
              cx.putImageData(img, 0, 0);
              mapImageRef.current = cv.toDataURL("image/png");
            }
            rt.dispose();
          } catch {
            // fall back to the occupancy grid minimap
          }
        })();
      },
      (e) => {
        if (e.total) {
          const pct = e.loaded / e.total;
          setMapLoadProgress(pct);
          setStatus(`Loading map… ${Math.round(pct * 100)}%`);
        }
      },
      (err) => {
        console.error("[arena] map load failed", err);
        setStatus("Failed to load the map file.");
        setMapLoadProgress(0);
        building = false;
      },
    );

    // Download + decode the collision proxy and the level IN PARALLEL (they used to run back to
    // back, so the 18 MB level only started fetching after the proxy had fully parsed). The build
    // itself still waits for the proxy, so collision is set up exactly as before.
    collisionReady = loadCollision();
    loadLevel();

    let raf = 0;
    let online: OnlineHangout | null = null;
    let last = performance.now();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    /** The WASD sum, and the third of this trio that was being rebuilt every frame. */
    const moveScratch = new THREE.Vector3();
    /** Eye point for the spawn intro's camera swing. Read, aimed at, dropped. */
    const headScratch = new THREE.Vector3();
    /** View axis for the third-person boom solve, and its negation. */
    const dirScratch = new THREE.Vector3();
    const lookScratch = new THREE.Vector3();

    /**
     * The bot brain's driver — target selection, line of sight, the movement state machine and the
     * firing ladder — now in `botTick.ts`. It reads exactly two things about the player (`walkPos`
     * and whether they are moving) and otherwise touches only fighters, geometry and its own brain,
     * which is what let ~300 lines leave this file without a single behaviour change.
     */
    const { moveBot, botTick } = createBotTick({
      fighters,
      decoys,
      walkPos,
      camera,
      groundAt,
      castFirst,
      respawn,
      reviveFighter,
      damage,
      pushKillFeed,
      inRound: () => matchRef.current.phase === "round",
      respawnEnabled: () => modeRulesRef.current.respawn,
      humanMoving: () => walkMovingRef.current,
      barrierUp,
      barrierRadius: barrierDome.radius,
      smokeBlocks: (from, to) => smokeField.blocks(from, to),
    });


    /**
     * Prewarm/preload runs a couple of seconds into the first frames rather than during setup:
     * by then the level GLB is in the scene, so one `compileAsync` pass covers the map, the
     * effects and the car together, and the player is still in the intro/spawn cage where a
     * background fetch cannot cost them a fight. One-shot — see prewarmVisuals().
     *
     * That "by then" no longer holds for the modes with a waiting room: the arena is not mounted
     * until the room says so, so this two-second timer can now fire while the level is still being
     * parsed. Harmless — but it is why the build does its own `compileAsync` at the end instead of
     * trusting this one to have covered the map.
     */
    let prewarmDelay = 2;
    let prewarmDone = false;

    /*
     * SECOND SHADER PASS, FOR THE BODIES.
     *
     * The build's `compileAsync` cannot cover the characters, and not because of visibility: look at
     * `attachRig` in fighterBody.ts, which is "async and deliberately never awaited" so a fighter is
     * playable on its capsules while its GLB is still loading. The skinned meshes therefore land a
     * frame or two AFTER the build finished compiling, so no amount of showing them beforehand can
     * get them into that pass — they simply do not exist yet.
     *
     * A skinned mesh is the most expensive program in the game to link. Left alone, the first frame
     * one is drawn does that work synchronously on the main thread — which is exactly the freeze
     * Brook reported: "no oneshowup is after landing its fraze for like 4/5s". Landing is where the
     * walk camera first reveals the player's own body, so eight bodies' worth of linking all landed
     * on that one frame.
     *
     * So: watch for the rigs to arrive, then compile once more. Conditions are deliberately loose —
     * every fighter that HAS a rig, once the count stops growing — because a body whose GLB failed
     * must not be able to hold this off forever. Cheap to be wrong: `compileAsync` on already-linked
     * programs is close to free, and this runs at most once.
     */
    let bodyWarmDone = false;
    let bodyWarmSettle = 0;
    let bodyWarmSeen = -1;
    const tickBodyWarm = (dt: number) => {
      if (bodyWarmDone) return;
      let rigs = humanBody?.rig ? 1 : 0;
      for (const f of fighters) if (f.rig) rigs += 1;
      if (rigs === 0) return;
      // Still arriving — wait for the count to hold steady rather than compiling once per body.
      if (rigs !== bodyWarmSeen) {
        bodyWarmSeen = rigs;
        bodyWarmSettle = 0.5;
        return;
      }
      bodyWarmSettle -= dt;
      if (bodyWarmSettle > 0) return;
      bodyWarmDone = true;
      // Same `traverseVisible` trap as everywhere else in this file: the player's body sits hidden
      // until the walk camera reveals it, so it has to be shown for the walk or it is skipped again.
      const restore: { o: THREE.Object3D; was: boolean }[] = [];
      const show = (o: THREE.Object3D | null | undefined) => {
        if (!o) return;
        restore.push({ o, was: o.visible });
        o.visible = true;
      };
      show(humanBody?.group);
      for (const f of fighters) show(f.group);
      // Not awaited: this is the frame loop. The restore is chained so it cannot be skipped, and a
      // failure leaves the game exactly as it was — with a hitch, rather than broken.
      renderer
        .compileAsync(scene, camera)
        .catch(() => {})
        .finally(() => {
          for (const r of restore) r.o.visible = r.was;
        });
    };

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!prewarmDone) {
        prewarmDelay -= dt;
        if (prewarmDelay <= 0) {
          prewarmDone = true;
          void prewarmVisuals();
          preloadCar();
        }
      }
      tickBodyWarm(dt);
      flushPendingCarSummon();

      let pendingFire = false;

      for (const fx of fxList) fx.update(dt);
      updateWalls(dt);
      bombSystem.update(dt);
      explosionFx.update(dt);
      bomb.updatePreview();
      const nowSec = now / 1000;
      if (safeZoneRef.current && matchRef.current.phase === "round") {
        updateSafeZone(safeZoneRef.current, nowSec, dt);
        // Damage is no longer set here: `updateSafeZone` writes it from the live phase, so the rate
        // outside the ring and the ring itself are read off one clock and cannot disagree.
        safeZoneVisual.mesh.visible = true;
        // Scale x/z by the live radius only — the wall's height is fixed. A
        // uniform setScalar would squash the curtain into the floor as it
        // shrinks; the storm is sides-only, so height must not track radius.
        const zc = safeZoneRef.current.center;
        const r = safeZoneRef.current.currentRadius;
        safeZoneVisual.mesh.position.set(zc.x, safeZoneVisual.mesh.position.y, zc.z);
        safeZoneVisual.mesh.scale.set(r, 1, r);
        for (const f of fighters) {
          if (!f.alive) continue;
          const zoneDmg = damageOutsideZone(safeZoneRef.current, f.pos, dt);
          if (zoneDmg > 0) {
            damage(f, zoneDmg, f); // self-damage from the storm
            if (f.isHuman && f.hp > 0) {
              // brief red vignette handled by damage() already
            }
          }
        }
      } else {
        safeZoneVisual.mesh.visible = false;
      }
      tickKnocks(dt);
      /*
       * The three ground-pickup scans, skipped for the whole descent.
       *
       * Each one walks every item of its kind on the map and measures the player's distance to it,
       * and `tickWorldLoot` also bobs and spins every animated prop. That is the right thing to do
       * while somebody is walking around. During the dive it is pure waste twice over: the player is
       * hundreds of metres up and cannot be in pickup range of anything, and `lootGroup` is hidden
       * for the whole phase anyway (see the beacon hide below), so the bobbing is animating meshes
       * that are not being drawn.
       *
       * This is the same phase gate as the prop cull and the render scale, and it matters for the
       * same reason: the dive is where the frame budget is tightest, because the frustum holds the
       * entire island. Nothing here has state that a skipped frame would corrupt — the scans are
       * pure reads of positions that only change when the player moves, and on touchdown the very
       * next frame runs all three normally.
       *
       * One near-miss worth naming: `tickMushrooms` counts a 25 s regrow timer down by `dt`, so
       * skipping it does pause that timer. It cannot matter here — the dive is the first thing that
       * happens in a battle royale, so no mushroom has been eaten yet and every cooldown is 0. If a
       * mid-match dive is ever added (a redeploy tower, a second drop) this gate has to move to a
       * "not airborne AND nothing on cooldown" test, or a diver would freeze the whole map's regrow.
       */
      if (matchRef.current.phase !== "skydive") {
        tickMushrooms(dt);
        tickArmorPickups(dt);
        tickWorldLoot(dt);
      }
      // Airdrops: descend on their own clock, then become ordinary lootable containers so the
      // one pickup loop above handles them too. Ticked only while a round is live — the render
      // loop runs from the moment the level loads, and a plane flying over the deploy screen
      // (announcer line included) would put the first crate down before anyone is in the map.
      if (matchRef.current.phase === "round") airdropDirector?.tick(dt);
      const landedCrates = airdropDirector?.crates;
      if (landedCrates && landedCrates.length > 0) {
        for (const c of landedCrates) {
          const gun = AIRDROP_GUNS[(Math.random() * AIRDROP_GUNS.length) | 0];
          groundLoot.push({
            mesh: c.root,
            base: c.pos.clone(),
            kind: "crate",
            weaponId: gun,
            animate: false,
            radius: 2.4,
            stash: rollAirdropStash(gun),
          });
        }
        landedCrates.length = 0;
      }
      updateTacticals(tacticalRef.current, dt, root, human, syncHud);
      if (companionRef.current && human && companionRef.current.root.visible) {
        companionRef.current.update(dt, human.alive ? human.pos : walkPos, yaw);
        // Fetch: some pets dig up an inhaler on a timer
        const fetchEvery = PETS[(profileRef.current?.pet ?? "nibbles") as PetId]?.effect.fetchEvery ?? 0;
        if (fetchEvery > 0 && human.alive) {
          fetchTimer += dt;
          if (fetchTimer >= fetchEvery) {
            fetchTimer = 0;
            setInhalers((n) => Math.min(5, n + 1));
          }
        }
      }
      if (human) {
        const airdropWeapon = openAirdrop(tacticalRef.current, human.pos);
        if (airdropWeapon) {
          // This used to inline the same silent overwrite `equipWeapon` had: both heavy slots full
          // meant the gun you were holding was binned for you. Now it goes into a free slot, and
          // if there is no free slot it lands at your feet — stepping on it opens the swap choice.
          if (!takeWeapon(airdropWeapon.id)) dropWeaponToWorld(airdropWeapon.id);
        }
      }
      // FF coins: auto-pickup near the player
      if (human && human.alive && ffCoinsRef.current.length > 0) {
        const collected = scanFfCoinPickups(ffCoinsRef.current, human.pos, human.backpack, now);
        if (collected > 0) {
          setFfCoinCount(human.backpack.coins);
          playSfx("equip", 0.5, 1.1);
        }
      }
      // pings: fade and animate
      updatePings(pings, dt);
      // decoys: spin, bark fake shots, expire
      for (let i = decoys.length - 1; i >= 0; i--) {
        const d = decoys[i]!;
        d.ttl -= dt;
        d.nextBark -= dt;
        d.root.rotation.y += dt * 4;
        // the decoy's glow is a pooled light, so it must be carried by hand
        d.light.light.position.set(d.root.position.x, d.root.position.y + 0.6, d.root.position.z);
        if (d.nextBark <= 0) {
          d.nextBark = DECOY_BARK_INTERVAL * (0.8 + Math.random() * 0.6);
          playSfxAt("rifle", d.root.position.distanceTo(camera.position), 0.55, (Math.random() - 0.5) * 0.15);
          // small muzzle flash
          pulseFxLight(0xffaa55, d.root.position.clone().setY(d.root.position.y + 0.5), 6, 5, 1, 0.06);
        }
        if (d.ttl <= 0) {
          decoyGroup.remove(d.root);
          releaseFxLight(d.light);
          decoys.splice(i, 1);
        }
      }
      // EP slowly converts into HP whenever the player is hurt
      if (human && human.alive && epRef.current > 0 && human.hp < MAX_HP) {
        const amount = Math.min(epRef.current, EP_TO_HP_RATE * dt);
        human.hp = Math.min(MAX_HP, human.hp + amount);
        epRef.current -= amount;
        setEp(epRef.current);
        syncHud();
      }
      for (const fx of impactPool) fx.update(dt);
      updateFxLights(dt);

      // character power: tick timers, apply regen, keep the aura on the player
      {
        const st = powerRef.current;
        const wasActive = st.active > 0;
        if (st.active > 0) {
          st.active = Math.max(0, st.active - dt);
          const regen = POWERS[characterRef.current.power].effects.regen ?? 0;
          if (regen > 0 && human && human.alive && human.hp < MAX_HP) {
            human.hp = Math.min(MAX_HP, human.hp + regen * dt);
            syncHud();
          }
          if (st.active === 0) {
            st.shield = 0;
            powerFx.stop();
            barrierDome.stop();
          }
        }
        if (st.cooldown > 0) st.cooldown = Math.max(0, st.cooldown - dt);
        if (human && !human.alive && wasActive) {
          st.active = 0;
          st.shield = 0;
          powerFx.stop();
          barrierDome.stop();
        }
        // ORIGIN, not a fresh vector: both of these only read the position, and there is no player
        // to read while you are dead or spectating — which is exactly when this used to allocate two
        // throwaway vectors on every single frame.
        powerFx.update(dt, human ? human.pos : ORIGIN);
        barrierDome.update(dt, human ? human.pos : ORIGIN);
        const nextHud = {
          active: Math.ceil(st.active),
          cooldown: Math.ceil(st.cooldown),
          shield: Math.round(st.shield),
        };
        setPowerHud((prev) =>
          prev.active === nextHud.active && prev.cooldown === nextHud.cooldown && prev.shield === nextHud.shield
            ? prev
            : nextHud,
        );
      }

      // ---- battle-royale drop-in: plane flyover → freefall → landing ----
      if (matchRef.current.phase === "skydive" && skydiveRef.current) {
        const binds = settingsRef.current.keybinds;
        const moveF =
          (keys.has(binds.forward) || keys.has("ArrowUp") ? 1 : 0) -
          (keys.has(binds.back) || keys.has("ArrowDown") ? 1 : 0);
        const moveR =
          (keys.has(binds.right) || keys.has("ArrowRight") ? 1 : 0) -
          (keys.has(binds.left) || keys.has("ArrowLeft") ? 1 : 0);
        const eject = ejectRequestedRef.current || keys.has(binds.eject);
        const frame = skydiveRef.current.update({ dt, yaw, moveF, moveR, eject });
        ejectRequestedRef.current = false;
        walkPos.copy(frame.feet);
        if (human) human.pos.copy(walkPos);
        if (skydiveUiPhaseRef.current !== frame.phase) {
          skydiveUiPhaseRef.current = frame.phase;
          setSkydiveUi({ phase: frame.phase, altitude: Math.round(frame.altitude) });
        }
        if (frame.landed) {
          matchRef.current.phase = "round";
          matchRef.current.countdown = 0;
          roundTimerRef.current = modeRulesRef.current.roundSeconds;
          setMatch({ ...matchRef.current });
          setSkydiveUi(null);
          skydiveUiPhaseRef.current = null;
          velY = 0;
          grounded = true;
          skydiveRef.current.dispose();
          // No "spawn" cue on touchdown — the diver is *landing*, not respawning;
          // the spawn effect here read as a wrong re-spawn animation on the ground.
        }
      }

      // Loot is hidden for the whole dive, and this is a frame-rate fix, not a design choice.
      // Every pickup carries a translucent beacon column. On the ground you see two or three of
      // them and they cost nothing; from 400 m up the frustum holds the entire island, so all
      // eighty-four are on screen at once, stacked, and translucent geometry cannot reject by
      // depth — each column pays full fill rate over the others. Nothing here is reachable in
      // mid-air anyway, so the only thing hiding it costs is a view of markers you cannot use.
      lootGroup.visible = matchRef.current.phase !== "skydive";

      // Props fade in by apparent size all the way down the dive (see `cullProps`), and the dive
      // renders at two thirds density. Both are gated on the phase, so nothing survives the landing:
      // altitude 0 restores every prop and the framebuffer goes back to native.
      const diving = matchRef.current.phase === "skydive";
      setAltitudeCull(diving ? camera.position.y - groundRefY : 0);
      setDiveResolution(diving);

      // pre-round countdown
      if (spawnCageRef.current) {
        spawnCageRef.current.mesh.visible =
          matchRef.current.phase === "countdown" && modeRef.current === "walk";
      }

      if (introTime > 0) {
        introTime = Math.max(0, introTime - dt);
        introRef.current = introTime;
        if (introTime <= 0) setIntro(false);
      }

      if (matchRef.current.phase === "countdown" && introTime <= 0) {
        countdownRef.current = Math.max(0, countdownRef.current - dt);
        const rounded = Math.ceil(countdownRef.current);
        if (matchRef.current.countdown !== rounded) {
          matchRef.current.countdown = rounded;
          setMatch({ ...matchRef.current });
        }
        if (countdownRef.current <= 0) {
          matchRef.current.phase = "round";
          matchRef.current.countdown = 0;
          roundTimerRef.current = modeRulesRef.current.roundSeconds;
          finalizeDraft();
          setMatch({ ...matchRef.current });
        }
      }

      // round clock: every mode caps the round at modeRules.roundSeconds. When it
      // runs out the round is scored on kills (ties go to the human's team). This
      // is the only thing that ends a battle-royale round (its kill goal is
      // effectively infinite), and it drives the MM:SS HUD during the fight.
      if (matchRef.current.phase === "round" && roundTimerRef.current > 0) {
        roundTimerRef.current = Math.max(0, roundTimerRef.current - dt);
        const roundedRound = Math.ceil(roundTimerRef.current);
        if (matchRef.current.countdown !== roundedRound) {
          matchRef.current.countdown = roundedRound;
          setMatch({ ...matchRef.current });
        }
        if (roundTimerRef.current <= 0) {
          const b = scoreState.blue;
          const r = scoreState.red;
          const winner: Team = b > r ? "blue" : r > b ? "red" : human?.team ?? "blue";
          endRound(winner);
        }
      }

      // Reload always ticks, even while dead / between rounds / in orbit view.
      // Otherwise a reload interrupted by death stayed "in progress" forever and
      // silently blocked every future shot.
      // Fire cooldown must drain every frame too — if it froze while dead the
      // trigger looked pressed but nothing came out.
      weaponCooldownRef.current = Math.max(0, weaponCooldownRef.current - dt);

      if (isReloadingRef.current) {
        if (reloadTimerRef.current > 0) {
          reloadTimerRef.current = Math.max(0, reloadTimerRef.current - dt);
          const rounded = Math.ceil(reloadTimerRef.current * 10) / 10;
          // The animation loop closes over the initial React state. Comparing
          // against that stale value caused setState on every rendered frame
          // throughout reload, overwhelming phone touch/pointer processing.
          if (rounded !== reloadLeftRef.current) {
            reloadLeftRef.current = rounded;
            setReloadLeft(rounded);
          }
        }
        if (reloadTimerRef.current <= 0) finishReload(reloadingWeaponRef.current ?? weaponRef.current);
      }

      // automatic fire & burst handling
      if (human && human.alive && matchRef.current.phase === "round" && modeRef.current === "walk") {
        // firing itself happens after the camera update, further down the frame
        pendingFire = true;
      }

      /*
       * The player's own body is on screen for the whole match now, not just the intro — that is
       * the whole point of a third-person camera. It comes off during ADS (the camera snaps to
       * the eye, and a character's head drawn across the sight picture is worse than no body at
       * all) and while dead, so a corpse isn't left standing at the spawn.
       */
      if (humanBody && matchRef.current.phase !== "skydive")
        humanBody.group.visible =
          modeRef.current === "walk" &&
          !drivingRef.current &&
          (introTime > 0 ||
            (thirdPersonActive() && ((human?.alive ?? false) || (human?.dying ?? 0) > 0)));

      // Keep the player's held prop in step with the weapon they've selected. `set` no-ops when
      // the id is unchanged, so this is a cheap string compare almost every frame and a real swap
      // only when they actually change guns.
      humanBody?.weaponSocket?.set(weaponRef.current);
      // The other half of that swap: every gun they are NOT holding hangs off the back or the hip,
      // so a weapon change is two props trading places instead of one appearing from nowhere. Also
      // covers a gun looted mid-round, which changes `slots` without touching the active one.
      humanBody?.holsters?.set(carriedOnBody(slotsRef.current, weaponRef.current));


      if (introTime > 0 && human && modeRef.current === "walk") {
        /*
         * Cinematic spawn intro.
         *
         * It used to park the camera at `head + (-sin yaw, 0, -cos yaw) * dist`, which is the
         * player's own LOOK axis — so the camera sat in front of the face looking back down it,
         * and the instant control started the view swung a full 180 degrees. That snap is what
         * "I'm facing the wrong direction" was: the spawn yaw itself was fine, the shot that
         * introduced it was reversed. The body was reversed too (`yaw + PI`), which is why the
         * hero shot showed the back of his head.
         *
         * Now it sweeps: `swing` starts at PI (camera in front, face on) and eases to 0 (camera
         * dead behind, over the shoulder), so the last frame of the intro already IS the
         * third-person camera and the handoff is invisible. `dist` lands on THIRD_DIST for the
         * same reason.
         */
        const p = human.pos;
        if (humanBody) {
          humanBody.group.position.copy(p);
          // A group's forward is local -Z, so rotating -Z by `yaw` gives (-sin, 0, -cos) — the
          // same look axis the camera and the W key use. The old `+ Math.PI` faced him backwards.
          humanBody.group.rotation.y = yaw;
        }
        const t = 1 - introTime / 5;
        const ease = t * t * (3 - 2 * t); // smoothstep, so it settles rather than arrives
        const swing = (1 - ease) * Math.PI;
        const camYaw = yaw + swing;
        const dist = THIRD_DIST + (4.6 - THIRD_DIST) * (1 - ease);
        const head = headScratch.set(p.x, p.y + EYE_HEIGHT, p.z);
        camera.position.set(
          head.x + Math.sin(camYaw) * dist,
          head.y + 0.45 + (1 - ease) * 0.8,
          head.z + Math.cos(camYaw) * dist,
        );
        camera.lookAt(head);
      } else if (modeRef.current === "orbit") {
        theta += dt * 0.03;
        camera.position.set(
          target.x + radius * Math.sin(phi) * Math.cos(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * Math.sin(phi) * Math.sin(theta),
        );
        camera.lookAt(target);
      } else if (drivingRef.current && carRef.current && human) {
        // ---- seated in the car: WASD drives it, a chase cam follows, the player rides along ----
        const car = carRef.current;
        const binds = settingsRef.current.keybinds;
        const throttle =
          (keys.has(binds.forward) || keys.has("ArrowUp") ? 1 : 0) -
          (keys.has(binds.back) || keys.has("ArrowDown") ? 1 : 0);
        const steer =
          (keys.has(binds.left) || keys.has("ArrowLeft") ? 1 : 0) -
          (keys.has(binds.right) || keys.has("ArrowRight") ? 1 : 0);
        const prevCarX = car.root.position.x;
        const prevCarZ = car.root.position.z;
        car.update(dt, { throttle, steer, handbrake: keys.has("Space") });

        /*
         * SOLID BODY. The rig integrates on an open plane and nothing ever told it about walls,
         * so the only thing that stopped a car was the ground-follow snapping it onto whatever it
         * had just driven into — which is why hitting a rock, a tree or a house launched the car
         * up the obstacle instead of stopping it.
         *
         * Probe along the direction actually travelled this frame, from the previous position, at
         * bumper and roof height. `moveHorizontal`'s per-slice trick is unnecessary here: the
         * probe reaches the full frame distance plus the body's half-length, so at 26 m/s the
         * whole swept volume is covered in one cast. On a real hit the car is put back where it
         * started and the speed is killed rather than reflected — a bounce off scenery reads worse
         * than a dead stop, and there is no damage model to justify one.
         */
        const cpNow = car.root.position;
        const travelX = cpNow.x - prevCarX;
        const travelZ = cpNow.z - prevCarZ;
        const travelLen = Math.hypot(travelX, travelZ);
        if (travelLen > 1e-4) {
          const tdir = _carDir.set(travelX / travelLen, 0, travelZ / travelLen);
          const reach = travelLen + CAR_HALF_LENGTH;
          const carColliders = localColliders(cpNow);
          let hitDist = Infinity;
          for (const h of CAR_PROBE_HEIGHTS) {
            const hit = castFirst(
              _carOrigin.set(prevCarX, cpNow.y + h, prevCarZ),
              tdir,
              reach,
              carColliders,
            );
            if (hit && hit.distance < hitDist) hitDist = hit.distance;
          }
          if (hitDist < reach) {
            // Leave a sliver of clearance so the very next frame's probe isn't already touching,
            // which would pin the car against the obstacle and block reversing out of it.
            const allowed = Math.max(0, hitDist - CAR_HALF_LENGTH - 0.1);
            cpNow.x = prevCarX + tdir.x * allowed;
            cpNow.z = prevCarZ + tdir.z * allowed;
            const impact = Math.abs(car.speed);
            car.speed = 0;
            if (impact > 4 && carImpactCooldownRef.current <= 0) {
              playCarImpact(Math.min(1, impact / 26));
              carImpactCooldownRef.current = 0.35;
            }
          }
        }
        if (carImpactCooldownRef.current > 0) carImpactCooldownRef.current -= dt;

        // Keep the car inside the same play area / ring the player is clamped to — no
        // driving off the map edge or out through the barrier.
        const cp = car.root.position;
        cp.x = Math.max(boundsMinX, Math.min(boundsMaxX, cp.x));
        cp.z = Math.max(boundsMinZ, Math.min(boundsMaxZ, cp.z));
        if (hardBarrier) {
          const inside = clampInsideBarrier(hardBarrier, cp.x, cp.z, 2);
          if (inside.clamped) {
            cp.x = inside.x;
            cp.z = inside.z;
          }
        }
        /*
         * Plant the car on the terrain. Sampling ONLY the centre (the original) is what buried
         * the nose or the tail on every slope and kerb: the rig integrates on a flat plane, so a
         * 4.5 m body pinned by its middle digs whichever end is uphill straight into the ground.
         * Sample the four corners instead and ride the HIGHEST of them, so no part of the car is
         * ever below the surface — it may float a few centimetres cresting a ridge, which reads
         * as suspension travel, where sinking reads as a broken game.
         */
        const cyawNow = car.yaw;
        const fx = -Math.sin(cyawNow);
        const fz = -Math.cos(cyawNow);
        const rx = Math.cos(cyawNow);
        const rz = -Math.sin(cyawNow);
        let carY = -Infinity;
        for (const [along, across] of CAR_CORNERS) {
          const sx = cp.x + fx * along + rx * across;
          const sz = cp.z + fz * along + rz * across;
          /*
           * `maxRise` of 8 was the other half of "it goes up instead of stopping": maxRise only
           * positions the ray ORIGIN, so 8 (plus the +3 on fromY) started the cast 11 m over the
           * wheels and happily reported the top of a boulder, a tree canopy or a roof as this
           * corner's ground — then the snap below teleported the car up onto it. 0.9 m still
           * climbs kerbs, ramps and stairs, and refuses anything a car should crash into instead.
           */
          const g = groundAt(sx, sz, cp.y, 0.9);
          if (g != null && g > carY) carY = g;
        }
        if (carY > -Infinity) cp.y = carY;

        // Engine note tracks road speed; the loop itself is opened/closed on enter/exit.
        setCarEngine(Math.min(1, Math.abs(car.speed) / 26), throttle);

        // The player rides with the car: everything downstream that reads walkPos (audio
        // panning, bot targeting, the minimap dot) now tracks the vehicle.
        walkPos.set(cp.x, cp.y, cp.z);
        human.pos.copy(walkPos);

        // Chase cam locked behind the car's heading. Forward is (-sin,-cos), so the camera
        // sits at (+sin,+cos) — squarely behind — looking just past the nose.
        const cyaw = car.yaw;
        camera.position.set(cp.x + Math.sin(cyaw) * 8, cp.y + 3.4, cp.z + Math.cos(cyaw) * 8);
        camera.lookAt(cp.x - Math.sin(cyaw) * 4, cp.y + 1.4, cp.z - Math.cos(cyaw) * 4);
      } else if (human && matchRef.current.phase !== "skydive") {

        if (!human.alive) {
          // drop out of ADS/scope while dead so nothing lingers on respawn
          if (adsRef.current) {
            adsRef.current = false;
            setScoped(false);
          }
          if (adsProgressRef.current > 0) {
            adsProgressRef.current = Math.max(0, adsProgressRef.current - dt * 6);
            if (scopeRef.current) scopeRef.current.style.opacity = "0";
            if (adsVignetteRef.current) adsVignetteRef.current.style.opacity = "0";
            if (crosshairRef.current) crosshairRef.current.style.opacity = "1";
            if (centerDotRef.current) centerDotRef.current.style.opacity = "1";
            camera.fov = BASE_FOV;
            camera.updateProjectionMatrix();
          }
          human.respawnIn -= dt;
          setPlayerRespawn(Math.max(0, Math.ceil(human.respawnIn)));
          if (modeRulesRef.current.respawn) {
            if (human.respawnIn <= 0) respawn(human);
          } else {
            // Elimination (every mode): no respawn. Spectate a living teammate — put the
            // camera exactly at their eyes looking where they look, so the dead
            // player sees precisely what the teammate sees. If nobody is left the
            // round is already ending (see `kill`).
            const me = human;
            const mate = fighters.find((f) => f.team === me.team && f.alive && f !== me);
            spectatingRef.current = mate ? mate.id : null;
            if (spectatingHudRef.current !== !!mate) {
              spectatingHudRef.current = !!mate;
              setSpectating(!!mate);
            }
            if (mate && mate.group) {
              const mp = mate.pos;
              const myaw = mate.group.rotation.y;
              // Third-person chase: sit behind and above the teammate looking over their
              // shoulder, not first-person inside their skull. Forward is (-sin,-cos), so
              // behind is (+sin,+cos).
              const back = 3.2;
              const up = 1.9;
              camera.position.set(
                mp.x + Math.sin(myaw) * back,
                mp.y + EYE_HEIGHT + up,
                mp.z + Math.cos(myaw) * back,
              );
              camera.lookAt(mp.x - Math.sin(myaw) * 1.5, mp.y + EYE_HEIGHT * 0.8, mp.z - Math.cos(myaw) * 1.5);
            }
          }
        } else {
          if (spectatingHudRef.current) {
            spectatingHudRef.current = false;
            spectatingRef.current = null;
            setSpectating(false);
          }
          const binds = settingsRef.current.keybinds;
          const sprintHeld =
            settingsRef.current.sprintMode === "toggle" ? sprintToggleRef.current : keys.has(binds.sprint);
          // knocked fighters crawl — the slowest gait, and jumping is out while down
          const speed =
            (downedRef.current
              ? KNOCK_CRAWL_SPEED
              : proneRef.current
                ? 3.4
                : crouchRef.current
                  ? 5
                  : sprintHeld
                    ? 16
                    : 8) *
            activeEffects().speed *
            dt;
          forward.set(Math.sin(yaw), 0, Math.cos(yaw));
          right.set(Math.cos(yaw), 0, -Math.sin(yaw));
          // Reused, like `forward` and `right` beside it — this vector never outlives the block, it
          // is read by tickHeal and moveHorizontal and then dropped.
          const move = moveScratch.set(0, 0, 0);
          if (keys.has(binds.forward) || keys.has("ArrowUp")) move.sub(forward);
          if (keys.has(binds.back) || keys.has("ArrowDown")) move.add(forward);
          if (keys.has(binds.left) || keys.has("ArrowLeft")) move.sub(right);
          if (keys.has(binds.right) || keys.has("ArrowRight")) move.add(right);

          // a channelled medkit is cancelled the moment the player moves
          tickHeal(dt, move.lengthSq() > 0 || !grounded);

          const colliders = localColliders(walkPos);

          if (move.lengthSq() > 0) {
            // Sideways movement is slower than forward/back: pure strafe 65%, diagonals 85%.
            const fIn = (keys.has(binds.forward) || keys.has("ArrowUp") ? 1 : 0) - (keys.has(binds.back) || keys.has("ArrowDown") ? 1 : 0);
            const sIn = (keys.has(binds.right) || keys.has("ArrowRight") ? 1 : 0) - (keys.has(binds.left) || keys.has("ArrowLeft") ? 1 : 0);
            const sideMul = sIn === 0 ? 1 : fIn === 0 ? STRAFE_SPEED_MUL : 0.85;
            move.normalize().multiplyScalar(speed * sideMul);
            moveHorizontal(walkPos, move, colliders, grounded);
          }

          // jump, gravity, ground snap, sunk-through-terrain rescue, void net
          ({ velY, grounded } = stepVertical({
            walkPos,
            lastGroundPos,
            velY,
            grounded,
            dt,
            jump: !downedRef.current && (keys.has("Space") || keys.has(binds.jump)),
          }));


          const preClampX = walkPos.x;
          const preClampZ = walkPos.z;
          walkPos.x = Math.max(boundsMinX, Math.min(boundsMaxX, walkPos.x));
          walkPos.z = Math.max(boundsMinZ, Math.min(boundsMaxZ, walkPos.z));
          // absolute authored edge of the map — projected every frame, so it
          // holds regardless of speed, jump height or geometry glitches
          if (hardBarrier) {
            // 2 m inset (1 m authored + 1 m safety) so the compressed ground
            // rim can never open a gap the player falls through
            const inside = clampInsideBarrier(hardBarrier, walkPos.x, walkPos.z, 2);
            if (inside.clamped) {
              walkPos.x = inside.x;
              walkPos.z = inside.z;
            }
          }
          blockReasonRef.current =
            Math.abs(preClampX - walkPos.x) > 1e-4 || Math.abs(preClampZ - walkPos.z) > 1e-4
              ? "map bounds box"
              : "";

          // during the buy phase you are locked inside your spawn cage
          const cage = spawnCageRef.current;
          if (matchRef.current.phase === "countdown" && cage) {
            const cageX = walkPos.x;
            const cageZ = walkPos.z;
            walkPos.x = Math.max(cage.center.x - cage.halfX, Math.min(cage.center.x + cage.halfX, walkPos.x));
            walkPos.z = Math.max(cage.center.z - cage.halfZ, Math.min(cage.center.z + cage.halfZ, walkPos.z));
            if (Math.abs(cageX - walkPos.x) > 1e-4 || Math.abs(cageZ - walkPos.z) > 1e-4)
              blockReasonRef.current = "spawn cage (buy phase)";

            const ceil = cage.center.y + SPAWN_BOX_HEIGHT - eyeHeight();
            if (walkPos.y > ceil) {
              walkPos.y = ceil;
              velY = Math.min(velY, 0);
            }
          }
          human.pos.copy(walkPos);

          camera.position.set(walkPos.x, walkPos.y + eyeHeight(), walkPos.z);

          // screen shake decay
          if (shakeRef.current > 0) {
            const s = shakeRef.current * settingsRef.current.screenShake;
            camera.position.x += (Math.random() - 0.5) * s;
            camera.position.y += (Math.random() - 0.5) * s;
            camera.position.z += (Math.random() - 0.5) * s;
            shakeRef.current = Math.max(0, shakeRef.current - dt * 2.8);
          }

          // recoil recovery
          recoilRef.current = Math.max(0, recoilRef.current - dt * 0.45);
          recoilYawRef.current *= Math.max(0, 1 - dt * 5);

          // keep the scoped aim glued to the locked body part
          updateAimLock(dt);

          const effectiveYaw = yaw + recoilYawRef.current;
          const effectivePitch = pitch - recoilRef.current;
          // NOTE the sign: this vector is negated to get the view axis, exactly as `shoot()`
          // negates its own copy. Everything in this file that means "forward" is -1 times this.
          const dir = dirScratch.set(
            Math.sin(effectiveYaw) * Math.cos(effectivePitch),
            Math.sin(effectivePitch),
            Math.cos(effectiveYaw) * Math.cos(effectivePitch),
          );
          // Scratch rather than dir.clone(): solveViewCamera reads this axis and copies it into its
          // own scratch before touching anything, so it does not outlive the call.
          const lookAxis = lookScratch.copy(dir).multiplyScalar(-1);

          // Pull the camera back off the eye and aim it. `camera.position` is the eye right now,
          // screen shake included, which is exactly what the boom solve wants — see viewCamera.ts.
          solveViewCamera({
            camera,
            lookAxis,
            yaw: effectiveYaw,
            thirdPerson: thirdPersonActive(),
            colliders,
            groundAt,
          });

          /*
           * Drive the visible body. It is the same rig every other fighter wears, so it only
           * needs a position and a yaw here — the per-frame rig loop further down differentiates
           * this position into a velocity and picks the locomotion clip from it, which is also
           * how a networked remote player will be animated.
           *
           * `rotation.y = yaw`, not `yaw + PI`: a group's forward is local -Z, and rotating -Z
           * by `yaw` yields (-sin yaw, 0, -cos yaw) — the view axis above.
           *
           * Driven even while hidden (during ADS), so that coming out of sights doesn't hand the
           * rig a one-frame teleport and make it play a sprint clip standing still.
           */
          if (humanBody) {
            humanBody.group.position.set(walkPos.x, walkPos.y, walkPos.z);
            humanBody.group.rotation.y = yaw;
          }

          // ADS: ease a 0..1 progress value, then drive the FOV, an edge
          // vignette and the scope glass from it so aiming reads clearly and
          // nothing ever snaps. A touch slower going in than coming out.
          const adsTarget = adsRef.current ? 1 : 0;
          const rate = adsTarget > adsProgressRef.current ? 6.5 : 10;
          adsProgressRef.current += (adsTarget - adsProgressRef.current) * (1 - Math.exp(-dt * rate));
          if (Math.abs(adsTarget - adsProgressRef.current) < 0.002) adsProgressRef.current = adsTarget;
          const raw = adsProgressRef.current;
          const ease = raw * raw * (3 - 2 * raw); // smoothstep
          const zoom = Math.max(1, getWeaponBehavior(weaponRef.current).zoom);
          const nextFov = BASE_FOV + (BASE_FOV / zoom - BASE_FOV) * ease;
          if (Math.abs(camera.fov - nextFov) > 0.01) {
            camera.fov = nextFov;
            camera.updateProjectionMatrix();
          }
          // edge darkening fades in on every weapon so hip-fire vs aimed is
          // obvious even on iron sights with no scope lens; scoped weapons keep
          // it light because the glass already darkens the periphery.
          if (adsVignetteRef.current)
            adsVignetteRef.current.style.opacity = String(ease * (scopedRef.current ? 0.35 : 0.8));
          // the glass only slides in over the last part of the transition
          const scopeAlpha = scopedRef.current ? Math.max(0, (ease - 0.45) / 0.55) : 0;
          if (scopeRef.current) scopeRef.current.style.opacity = String(scopeAlpha);
          if (crosshairRef.current) crosshairRef.current.style.opacity = String(1 - scopeAlpha);
          if (centerDotRef.current) centerDotRef.current.style.opacity = String(1 - scopeAlpha);

          // footsteps: distance-driven so the cadence matches the actual speed
          const moved = Math.hypot(walkPos.x - lastStepPos.x, walkPos.z - lastStepPos.z);
          const sprinting = sprintHeld;
          if (grounded && move.lengthSq() > 0) {
            stepDist += moved;
            const stride = sprinting ? 1.75 : 1.5;
            if (stepDist >= stride) {
              stepDist = 0;
              const stealth = proneRef.current ? 0.25 : crouchRef.current ? 0.5 : 1;
              if (sprinting) {
                runStepIndex = (runStepIndex + 1) % RUN_KINDS.length;
                playSfx(RUN_KINDS[runStepIndex] ?? "steprun", 0.6 * stealth, (Math.random() - 0.5) * 0.14);
              } else {
                // shuffle-free rotation: never repeat the same heel sample twice
                stepIndex = (stepIndex + 1 + (Math.random() < 0.35 ? 1 : 0)) % STEP_KINDS.length;
                playSfx(STEP_KINDS[stepIndex] ?? "step1", 0.5 * stealth, (Math.random() - 0.5) * 0.14);
              }
            }
          } else {
            stepDist = Math.min(stepDist, 1.2);
          }
          lastStepPos.set(walkPos.x, 0, walkPos.z);
        }
      }

      // Parked-car prompt: flag when the player is on foot within reach of their own car,
      // so the HUD can offer "Drive (E)". Change-detected to avoid re-rendering every frame.
      {
        const car = carRef.current;
        const near = !!(
          car &&
          car.root.visible &&
          !drivingRef.current &&
          (human?.alive ?? false) &&
          walkPos.distanceTo(car.root.position) < 3.6 * CAR_SIZE
        );
        if (near !== nearCarRef.current) {
          nearCarRef.current = near;
          setNearCar(near);
        }
      }

      // Friend Island mini-games: proximity prompts + the in-world basketball.
      if (hoops && human) {
        const onFoot = !drivingRef.current && human.alive;
        const station = onFoot && !miniGameOpenRef.current ? nearestStation(walkPos.x, walkPos.z) : null;
        const court = onFoot && onCourt(walkPos.x, walkPos.z);
        if (!court && hoops.holding) hoops.setHolding(false);
        const moving = walkPos.distanceTo(hoopPrevPos) > 0.02 * Math.max(1, dt * 60);
        hoopPrevPos.copy(walkPos);
        camera.getWorldDirection(hoopCamDir);
        hoops.update(dt, walkPos, hoopCamDir, moving, humanBody?.rig?.bone("RightHand") ?? null);
        const prompt = station
          ? station.kind === "arcade"
            ? "Play arcade (E)"
            : "Play table games (E)"
          : court && !hoops.holding && !hoops.inFlight
            ? "Pick up basketball (E)"
            : null;
        if (prompt !== islandPromptCur) {
          islandPromptCur = prompt;
          setIslandPrompt(prompt);
        }
        if (hoopMsgT > 0) {
          hoopMsgT -= dt;
          if (hoopMsgT <= 0) hoopMsg = "";
        }
        const showHud = court && (hoops.holding || hoops.inFlight);
        const p = Math.round(hoops.power * 20) / 20;
        const key = showHud ? `${hoops.holding}|${hoops.canShoot}|${hoops.charging}|${p}|${hoopScore}|${hoopShots}|${hoopMsg}` : "";
        if (key !== hoopHudKey) {
          hoopHudKey = key;
          setHoopHud(
            showHud
              ? { holding: hoops.holding, canShoot: hoops.canShoot, charging: hoops.charging, power: p, score: hoopScore, shots: hoopShots, msg: hoopMsg }
              : null,
          );
        }
        islandInteractRef.current = () => {
          if (station) {
            hoops.setHolding(false);
            keys.clear();
            freeCursorRef.current = true;
            setCursorFree(true);
            document.exitPointerLock?.();
            setMiniGame(station.kind);
            return true;
          }
          if (court && !hoops.inFlight) {
            hoops.setHolding(!hoops.holding);
            return true;
          }
          return false;
        };
      }

      // automatic / burst fire, run only once the camera is in its final pose. Holstered
      // while driving — no drive-by shooting for now.
      if (pendingFire && !drivingRef.current) {
        const behavior = getWeaponBehavior(weaponRef.current);
        if (burstQueueRef.current) {
          burstQueueRef.current.nextIn -= dt;
          if (burstQueueRef.current.nextIn <= 0) {
            const q = burstQueueRef.current;
            shoot(true);
            q.shotsLeft -= 1;
            if (q.shotsLeft <= 0) {
              burstQueueRef.current = null;
            } else {
              q.nextIn = behavior.interval;
            }
          }
        }
        const canAutoFire =
          mouseHeldRef.current &&
          (behavior.mode === "auto" || (autoFireRef.current && behavior.mode === "single")) &&
          weaponCooldownRef.current <= 0 &&
          !isReloadingRef.current;
        if (canAutoFire) {
          shoot(true);
        }
      }

      if (weaponCooldownRef.current <= 0 && !weaponReady) {
        setWeaponReady(true);
      }


      walkMovingRef.current = prevWalkPos.distanceToSquared(walkPos) > 0.0025;
      prevWalkPos.copy(walkPos);

      for (const f of fighters) {
        syncNameplate(f);
        if (!f.isHuman) botTick(f, dt);
        if (f.tracer && f.tracer.ttl > 0) {
          f.tracer.ttl -= dt;
          f.tracer.mat.opacity = Math.max(0, f.tracer.ttl / 0.1);
        }

        /*
         * Animation.
         *
         * Velocity is DIFFERENTIATED from the feet position rather than read off the fighter,
         * because there is no velocity field on one — and that is the right input regardless:
         * the rig is built to run from a position stream, so a networked remote player will
         * animate through this exact path instead of a second, input-driven one.
         */
        const rig = f.rig;
        const g = f.group;
        if (!rig || !g) continue;
        const step = f.pos.distanceTo(f.lastPos);
        if (step > 1.5) {
          // A respawn or a skydive drop teleports the fighter. Differentiating that reads as a
          // 300 m/s sprint and would pin the clip to a full run for a frame.
          rigVelScratch.set(0, 0, 0);
          f.vel.set(0, 0, 0);
        } else {
          rigVelScratch.subVectors(f.pos, f.lastPos).divideScalar(Math.max(dt, 1e-4));
        }
        f.lastPos.copy(f.pos);
        // Low-pass. A single frame's delta crosses the walk/idle threshold on its own noise,
        // which shows up as the clip flickering while a bot holds its pocket.
        f.vel.lerp(rigVelScratch, Math.min(1, dt * 12));
        // Death crumple: a just-killed fighter is `alive:false` but still on screen for a beat.
        // Tick the mixer so the held death clip animates the fall — but never setMotion, it is
        // dead, not walking — then hide it and drop the crate when the beat runs out.
        if (f.dying > 0) {
          f.dying -= dt;
          rig.update(dt, camera.position.distanceTo(f.pos));
          if (f.dying <= 0) finishDeath(f);
          continue;
        }
        if (!f.alive || !g.visible) continue; // dead or hidden — don't spend a mixer tick
        rig.setMotion({
          velocity: f.vel,
          yaw: g.rotation.y,
          armed: !!f.weapon && f.weapon !== "fists",
          pistol: f.weapon ? getWeapon(f.weapon)?.cls === "Pistol" : false,
          blade: usesBladeStance(f.weapon),
          // knocked fighters lie flat: prone idle standing still, prone_crawl if pushed — and
          // `downed` selects the belly crawl rather than the rifle leopard-crawl.
          prone: f.downed,
          ...(f.downed ? { downed: true } : {}),
        });
        // Real metres to the camera. The rig drops its mixer to every 2nd frame past 25 m and
        // every 4th past 60 m, which is what makes thirty skinned characters affordable in BR;
        // passing a constant here would quietly throw that away.
        rig.update(dt, camera.position.distanceTo(f.pos));
      }

      /*
       * The player's own body. Three different things write its transform — the spawn intro, the
       * walk camera and the BR skydive director — so the velocity is differentiated off the group
       * here rather than duplicating any of their position logic. Same input a networked remote
       * player would arrive on.
       */
      const body = humanBody;
      // Pulled out and null-checked before the alias, not after: narrowing `humanBody?.rig` does
      // not narrow `body.rig` through a fresh alias, and reading it again re-widens to nullable.
      const bodyRig = body?.rig ?? null;
      if (body && bodyRig) {
        const bg = body.group;
        if (bg.visible) {
          if (human && human.dying > 0) {
            // Death crumple for the player's own body: hold the death clip, no locomotion. The
            // held one-shot means setMotion would be inert here anyway, but skipping it keeps the
            // dead body from spending a velocity differentiation it can't use.
            human.dying -= dt;
            bodyRig.update(dt, 3);
            if (human.dying <= 0) finishDeath(human);
          } else {
            const step = bg.position.distanceTo(body.lastPos);
            if (step > 1.5) {
              rigVelScratch.set(0, 0, 0);
              body.vel.set(0, 0, 0);
            } else {
              rigVelScratch.subVectors(bg.position, body.lastPos).divideScalar(Math.max(dt, 1e-4));
            }
            body.vel.lerp(rigVelScratch, Math.min(1, dt * 12));
            bodyRig.setMotion({
              velocity: body.vel,
              yaw: bg.rotation.y,
              armed: weaponRef.current !== "fists",
              pistol: getWeapon(weaponRef.current)?.cls === "Pistol",
              blade: usesBladeStance(weaponRef.current),
              crouched: crouchRef.current,
              sprinting:
                settingsRef.current.sprintMode === "toggle"
                  ? sprintToggleRef.current
                  : keys.has(settingsRef.current.keybinds.sprint),
              // Knocked overrides the stance: the belly-down crawl is the downed state —
              // prone beats crouch in the rig, and `downed` swaps prone_forward for prone_crawl.
              prone: proneRef.current || !!human?.downed,
              ...(human?.downed ? { downed: true } : {}),
              // `!grounded` matters now that the body is on screen for the whole match rather than
              // just the intro: without it a jump reads as a stiff slide across the ground.
              airborne: matchRef.current.phase === "skydive" || !grounded,
              // During the BR drop the director owns the body: feed its phase so the rig plays the
              // freefall belly loop, then the hard_landing brace-and-stand, rather than a walk or a
              // jump. Cleared the instant the phase leaves skydive, so touchdown falls back to the
              // normal idle. `boarding` never reaches here — the body is hidden on the plane.
              //
              // The brace is gated on `landingAnim`, NOT on `phase === "flare"`. Flare begins 16 m
              // up (that is where braking starts) and hard_landing loops as locomotion, so keying
              // the clip off it played the whole brace two or three times over while the player
              // was still clearly airborne. `landingAnim` latches ~3 m from the ground instead.
              airPose:
                matchRef.current.phase === "skydive"
                  ? skydiveRef.current?.landingAnim
                    ? "flare"
                    : "freefall"
                  : undefined,
            });
            // Distance 3: it is only ever on screen a few metres from the camera, so it never
            // wants the far-distance tick gating.
            bodyRig.update(dt, 3);
          }
        }
        body.lastPos.copy(bg.position);
      }

      const laser = laserRef.current;
      if (laser && laser.ttl > 0) {
        laser.ttl -= dt;
        const t = Math.max(0, laser.ttl / 0.12);
        laser.material.opacity = t;
        laser.spark.intensity = t * 5;
        (laser.sparkMesh.material as THREE.MeshBasicMaterial).opacity = t;
        if (laser.ttl <= 0) {
          laser.sparkMesh.visible = false;
          laser.spark.intensity = 0;
        }
      }

      const muzzle = muzzleRef.current;
      if (muzzle && muzzle.ttl > 0) {
        muzzle.ttl -= dt;
        const t = Math.max(0, muzzle.ttl / 0.06);
        (muzzle.mesh.material as THREE.MeshBasicMaterial).opacity = t;
        muzzle.light.intensity = t * 18;
        muzzle.mesh.scale.setScalar(1 + (1 - t) * 2.5);
        if (muzzle.ttl <= 0) {
          muzzle.mesh.visible = false;
          muzzle.light.intensity = 0;
        }
      }

      if (hitMarkerRef.current > 0) {
        hitMarkerRef.current = Math.max(0, hitMarkerRef.current - dt);
        if (hitMarkerRef.current <= 0) setHitMarker(0);
      }

      if (killFeedRef.current.length > 0) {
        let changed = false;
        for (const item of killFeedRef.current) {
          item.time -= dt;
          if (item.time <= 0) changed = true;
        }
        if (changed) {
          killFeedRef.current = killFeedRef.current.filter((i) => i.time > 0);
          setKillFeed([...killFeedRef.current]);
        }
      }

      if (intermissionRef.current > 0) {
        intermissionRef.current = Math.max(0, intermissionRef.current - dt);
        const rounded = Math.ceil(intermissionRef.current);
        if (matchRef.current.countdown !== rounded) {
          matchRef.current.countdown = rounded;
          setMatch({ ...matchRef.current });
        }
      }



      const scanned = scannerActive(tacticalRef.current);
      const senseRadius = PETS[(profileRef.current?.pet ?? "nibbles") as PetId]?.effect.senseRadius ?? 0;
      radarRef.current = {
        fighters: fighters.map((f) => ({
          x: f.pos.x,
          z: f.pos.z,
          team: f.team,
          alive: f.alive,
          isHuman: f.isHuman,
          scanned:
            !f.isHuman &&
            f.team !== human?.team &&
            (scanned ||
              (senseRadius > 0 && !!human && f.pos.distanceTo(human.pos) <= senseRadius)),
        })),
        player: human ? { x: walkPos.x, z: walkPos.z, yaw } : null,
        decoys: decoys.map((d) => ({ x: d.root.position.x, z: d.root.position.z, team: d.team, ttl: d.ttl })),
        pings: pings.map((p) => ({ x: p.pos.x, z: p.pos.z, kind: p.kind, ttl: p.life })),
      };

      if (damageFlashRef.current > 0) {
        damageFlashRef.current = Math.max(0, damageFlashRef.current - dt * 1.8);
        const v = vignetteRef.current;
        if (v) v.style.opacity = settingsRef.current.damageFlash ? String(damageFlashRef.current) : "0";
      }

      // --- enemy-under-crosshair probe (throttled to ~12 Hz, cheap raycast) ---
      targetProbeRef.current -= dt;
      if (targetProbeRef.current <= 0) {
        targetProbeRef.current = 0.08;
        let hot = false;
        if (human && human.alive && modeRef.current === "walk" && matchRef.current.phase === "round") {
          const targets = enemyMeshes(human.team);
          if (targets.length) {
            const dir = camera.getWorldDirection(scratch.set(0, 0, 0)).clone();
            raycaster.set(camera.position, dir);
            raycaster.far = 220;
            const enemyHit = raycaster.intersectObjects(targets, false)[0];
            if (enemyHit) {
              const wallHit = castFirst(camera.position, dir, enemyHit.distance);
              hot = !wallHit || wallHit.distance > enemyHit.distance;
            }

          }
        }
        if (hot !== onTargetRef.current) {
          onTargetRef.current = hot;
          setOnTarget(hot);
        }
      }

      const ch = crosshairRef.current;
      if (ch) {
        const cfg = settingsRef.current;
        const b = getWeaponBehavior(weaponRef.current);
        const dynamic = cfg.crosshairDynamic ? b.spread * 900 + Math.min(0.32, recoilRef.current) * 190 : 0;
        const size = (14 + dynamic) * cfg.crosshairSize;
        ch.style.width = `${size}px`;
        ch.style.height = `${size}px`;
      }


      // keep the tight shadow box centred on the camera, refreshed at ~30 Hz
      if (renderer.shadowMap.enabled) {
        shadowClock -= dt;
        if (shadowClock <= 0) {
          shadowClock = 1 / 30;
          sunTarget.position.set(camera.position.x, 0, camera.position.z);
          sun.position.copy(sunTarget.position).add(SUN_OFFSET);
          sunTarget.updateMatrixWorld();
          renderer.shadowMap.needsUpdate = true;
        }
      }

      if (weather) {
        weather.update(camera.position, dt);
        const wet = weather.kind() === "clear" ? 0 : 1;
        weatherWet += (wet - weatherWet) * Math.min(1, dt * 0.35);
        weatherApply?.(weather.flash(), weatherWet);
      }
      skybox?.update(camera.position, dt);
      animatedWater?.update(dt);
      smokeField.update(dt);
      if (flashRef.current > 0) {
        flashRef.current = Math.max(0, flashRef.current - dt * 0.42);
        if (flashElRef.current) flashElRef.current.style.opacity = String(Math.min(1, flashRef.current));
      } else if (flashElRef.current && flashElRef.current.style.opacity !== "0") {
        flashElRef.current.style.opacity = "0";
      }
      hiddenTick = (hiddenTick + 1) % 6;
      // Visible → always draw, `building` or not: a blank canvas in front of the player is worse
      // than one stall. Hidden → one frame in six, and nothing at all until the build settles.
      if (gameModeRef.current === "hangout" && human && !online) {
        const p = profileRef.current;
        online = joinOnlineHangout(
          scene,
          mapIdRef.current,
          { id: p?.id ?? `guest-${Math.random().toString(36).slice(2, 10)}`, name: p?.name ?? "Guest" },
          setOnlineCount,
          (m) => {
            setChatLog((log) => [...log.slice(-49), m]);
            if (!chatOpenRef.current) setChatUnread((n) => n + 1);
          },
        );
        const o = online;
        chatSendRef.current = (text) => o.chat(text);
        setOnlineCount(1);
      }
      if (online && human) online.update(dt, { x: human.pos.x, y: human.pos.y, z: human.pos.z, yaw }, camera);
      if (!hiddenRef.current) renderer.render(scene, camera);
      else if (!building && hiddenTick === 0) renderer.render(scene, camera);

    };
    animate();

    // warm the sample bytes into the HTTP cache so the first shot is instant
    warmSfx();
    const onVisibility = () => (document.hidden ? suspendSfx() : resumeSfx());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      carRef.current?.dispose();
      scene.remove(mushroomGroup);
      scene.remove(armorGroup);
      scene.remove(decoyGroup);
      for (const d of decoys) decoyGroup.remove(d.root);
      decoys.length = 0;
      disposeFfCoins(ffCoinsRef.current);
      disposeTacticals(tacticalRef.current, root);
      smokeField.clear();
      skybox?.dispose();
      skybox = null;
      weather?.dispose();
      weather = null;
      weatherApply = null;
      animatedWater?.dispose();
      animatedWater = null;
      stopWeatherAmbience();
      cancelWarm?.();
      cancelWarm = null;
      cancelAnimationFrame(raf);
      online?.dispose();
      online = null;
      // Character rigs. `dispose` drops the clone and its mixer bindings; the geometry,
      // materials and KTX2 textures are shared with the module cache and must survive for the
      // next match, so they are deliberately left alone.
      for (const f of fighters) {
        f.rig?.dispose();
        f.rig = null;
      }
      humanBody?.rig?.dispose();
      if (humanBody) humanBody.rig = null;
      danceRef.current = null;
      for (const plate of nameplates.values()) plate.dispose();
      nameplates.clear();
      skydiveRef.current?.dispose();
      skydiveRef.current = null;
      window.clearTimeout(leaderboardTimer);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
      for (const t of popupTimersRef.current) window.clearTimeout(t);
      popupTimersRef.current = [];
      renderer.domElement.removeEventListener("pointerdown", onTouchLookStart);
      renderer.domElement.removeEventListener("pointermove", onCanvasPointerMove);

      window.removeEventListener("pointerdown", trackDown, true);
      window.removeEventListener("pointerup", trackUp, true);
      window.removeEventListener("pointercancel", trackUp, true);
      window.removeEventListener("pointerup", onTouchLookEnd);
      window.removeEventListener("pointercancel", onTouchLookEnd);
      renderer.domElement.removeEventListener("lostpointercapture", onLostLookCapture);
      window.removeEventListener("touchend", onAnyTouchEnd);
      window.removeEventListener("touchcancel", onAnyTouchEnd);

      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mouseup", onMouseUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onReservedKey, { capture: true } as EventListenerOptions);
      suspendSfx();
      powerFx.dispose();
      barrierDome.dispose();
      // The KTX2 loader is deliberately NOT disposed: it is the page-wide singleton the lobby's
      // character and pet previews load through too, and `dispose()` revokes the blob URL its
      // workers spawn from, so disposing it here would leave every later KTX2 load broken.
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };



  }, []);

  useEffect(() => {
    showRoofRef.current = showRoof;
    const c = clipRef.current;
    if (c) c.renderer.clippingPlanes = showRoof ? [] : [c.plane];
  }, [showRoof, hud]);

  /**
   * Snap every per-match rule ref to the CURRENT mode. Both match entry points must call this or
   * the refs go stale and one mode's rules leak into another (BR storm in a 2v2, 4v4 round counts
   * in BR, etc.). This is the single source of truth for "which mode's rules are live".
   */
  const refreshModeRules = () => {
    const rules = MODE_RULES[gameModeRef.current];
    modeRulesRef.current = rules;
    const cfg = matchGoalsOf(rules);
    setMatchConfig(cfg);
    matchConfigRef.current = cfg;
    return rules;
  };

  const enterWalk = () => {
    // Play again / Restart re-enter here WITHOUT going through startMatchNow, so refresh the rule
    // refs first — otherwise the previous match's mode rules stick around.
    refreshModeRules();
    startMatchRef.current?.();
    setMode("walk");
    const canvas = mountRef.current?.querySelector("canvas");
    canvas?.requestPointerLock?.();
  };

  /** Guards the one-shot auto-start below. */
  const startedRef = useRef(false);

  const startMatchNow = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setMatchLiked(false);
    // Match pacing is per-mode now (2v2 / 4v4 / battle-royale each have their own
    // round length, round count and storm behaviour) rather than a quick/standard toggle.
    refreshModeRules();
    startMatchRef.current?.();
    speakAnnouncer("start");
    setMode("walk");
    const canvas = mountRef.current?.querySelector("canvas");
    canvas?.requestPointerLock?.();
  }, []);

  // Report readiness once, the moment the build finishes. The shell uses this to lift the deploy
  // screen, and to decide that a Battle Royale lobby search has found its match.
  useEffect(() => {
    if (status) return;
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /*
   * NO START-MATCH GATE.
   *
   * The build finishing used to raise an "Arena ready / Start match" overlay and make the player
   * confirm a match they had already asked for. It begins by itself now, as soon as the arena is
   * actually on screen.
   *
   * `hidden` is the shell's way of saying "the player is looking at the lobby, not at you". A
   * Battle Royale search builds this whole arena in the background while the player is still in the
   * menus, and starting then would run the plane and the dive behind the lobby UI.
   */
  useEffect(() => {
    if (status || hidden || startedRef.current) return;
    startMatchNow();
  }, [status, hidden, startMatchNow]);


  useEffect(() => {
    if (match.phase === "countdown" && mode === "walk" && !intro && humanDraftsRef.current) {
      setShopOpen(true);
      document.exitPointerLock?.();
    } else {
      setShopOpen(false);
    }
  }, [match.phase, mode, intro, draftLock]);


  /** Equip a weapon respecting the loadout rule: 2 heavy + 1 sidearm. */
  const equipWeapon = (w: Weapon) => {
    setSlots((prev) => {
      const next = [...prev];
      if (!isHeavy(w)) {
        next[2] = w.id;
        return next;
      }
      const existing = next.indexOf(w.id);
      if (existing !== -1) return next;
      const empty = next[0] === null ? 0 : next[1] === null ? 1 : -1;
      const target = empty !== -1 ? empty : activeSlot < 2 ? activeSlot : 0;
      next[target] = w.id;
      return next;
    });
    setActiveSlot(() => {
      if (!isHeavy(w)) return 2;
      return slots.indexOf(w.id) !== -1
        ? slots.indexOf(w.id)
        : slots[0] === null
          ? 0
          : slots[1] === null
            ? 1
            : activeSlot < 2
              ? activeSlot
              : 0;
    });
  };
  equipWeaponRef.current = equipWeapon;

  const buyWeapon = (w: Weapon) => {
    const free = modeRulesRef.current.freeWeapons;
    if (owned.includes(w.id)) {
      equipWeapon(w);
      return;
    }
    if (!free && credits < w.price) {
      playSfx("dryfire", 0.5);
      return;
    }
    playSfx(free ? "equip" : "buy", 0.85);
    if (!free) setCredits((c) => c - w.price);
    setOwned((o) => [...o, w.id]);
    setAmmo((prev) => ({
      ...prev,
      [w.id]: { mag: getMagazine(w.id, profileRef.current) },
    }));
    equipWeapon(w);
  };

  const sellAllWeapons = () => {
    const heavyIds = slots.slice(0, 2).filter(Boolean) as string[];
    if (heavyIds.length === 0) return;
    const refund = heavyIds.reduce((sum, id) => sum + (getWeapon(id)?.price ?? 0) * 0.5, 0);
    setCredits((c) => c + Math.floor(refund));
    setSlots((prev) => [null, null, prev[2] ?? null, prev[3] ?? "fists"]);
    setActiveSlot(2);
  };


  const selectSlot = (i: number) => {

    if (!slots[i]) return;
    setActiveSlot(i);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const binds = settingsRef.current.keybinds;
      const is = (a: BindAction) => binds[a] && e.code === binds[a];
      // typing in the chat box must never move or trigger anything
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const hangout = gameModeRef.current === "hangout";
      if (hangout && e.code === "KeyV") callCarRef.current();
      if (hangout && e.code === "KeyT") {
        e.preventDefault();
        setChatOpen(true);
        setChatUnread(0);
        document.exitPointerLock?.();
        return;
      }
      // Car enter/exit runs first: E is also the default power key, and the hangout early-return
      // below used to swallow it before the car ever saw it.
      if (e.code === "KeyE" && hangout && !miniGameOpenRef.current && islandInteractRef.current()) return;
      if (e.code === "KeyE" && carEnterExitRef.current()) return;
      if (hangout && (is("reload") || is("wall") || is("bomb") || is("heal") || is("power") || is("shop") || is("ping") || is("grenade") || is("inhaler") || e.code.startsWith("Digit"))) return;
      if (is("reload") && !isReloadingRef.current) {
        const weaponId = weaponRef.current;
        const cur = ammoRef.current[weaponId];
        const fam = familyOf(weaponId);
        if (cur && cur.mag < getMagazine(weaponId, profileRef.current) && fam && ammoPoolRef.current[fam] > 0) {
          startReloadRef.current(weaponId);
        }
      }
      if (is("wall")) throwShieldWallRef.current();
      if (is("bomb")) throwBombRef.current();
      if (is("heal")) useHealthKitRef.current();
      if (is("power")) activatePowerRef.current();
      if (is("prone") && !downedRef.current) {
        // Stance transition one-shots. The clip is chosen from the stance being LEFT, because
        // that is what the body has to move out of: going prone from a crouch is the authored
        // `crouch_to_prone`, and from standing there is no stand->prone clip, so the crouch
        // drop stands in (it starts low, which reads better than snapping flat). Coming back up
        // out of prone is that same clip reversed. All full-body — a stance change is legs.
        const wasProne = proneRef.current;
        const wasCrouched = crouchRef.current;
        if (wasProne) bodyClipRef.current?.(CLIP.crouchToProne, { reverse: true, rate: 1.4 });
        else bodyClipRef.current?.(CLIP.crouchToProne, { rate: wasCrouched ? 1 : 1.4 });
        setProne((v) => !v);
        setCrouch(false);
      }
      if (is("crouch") && !downedRef.current) {
        // stand<->crouch shares one authored clip, played backwards to stand back up (see
        // `reverse` in operativeModel's play). Dropping out of prone into a crouch is the
        // prone transition undone, so it reuses crouch_to_prone reversed.
        if (proneRef.current) bodyClipRef.current?.(CLIP.crouchToProne, { reverse: true, rate: 1.4 });
        else bodyClipRef.current?.(CLIP.standToCrouch, { reverse: crouchRef.current, rate: 1.3 });
        setCrouch((v) => !v);
        setProne(false);
      }
      if (is("sprint") && settingsRef.current.sprintMode === "toggle") {
        sprintToggleRef.current = !sprintToggleRef.current;
      }
      if (e.code === "Escape") actionsRef.current?.cancelWall();
      if (is("shop") && matchRef.current.phase === "countdown") setShopOpen((v) => !v);
      if (is("ping")) placePingRef.current();
      if (is("grenade")) cycleGrenadeRef.current();
      if (is("inhaler")) useInhalerRef.current();
      if (e.code === "Backquote") setShowDebug((v) => !v);
      if (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3" || e.code === "Digit4") {
        const i = Number(e.code.slice(5)) - 1;
        setSlots((s) => {
          if (s[i]) setActiveSlot(i);
          return s;
        });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const useHealthKit = () => {
    if (kits <= 0) return;
    actionsRef.current?.startHeal(kitPartialRef.current);
  };

  const throwBomb = () => {
    if (bombs <= 0) return;
    setBombArmed(!!actionsRef.current?.armBomb());
  };
  onBombThrownRef.current = () => {
    const kind = grenadeKindRef.current;
    setGrenades((g) => ({ ...g, [kind]: Math.max(0, g[kind] - 1) }));
    setBombArmed(false);
  };
  /** step to the next throwable that still has charges */
  const cycleGrenade = () => {
    const from = GRENADE_KINDS.indexOf(grenadeKindRef.current);
    for (let i = 1; i <= GRENADE_KINDS.length; i += 1) {
      const next = GRENADE_KINDS[(from + i) % GRENADE_KINDS.length]!;
      if (grenades[next] > 0 || next === grenadeKindRef.current) {
        setGrenadeKind(next);
        return;
      }
    }
  };
  const cycleGrenadeRef = useRef(cycleGrenade);
  cycleGrenadeRef.current = cycleGrenade;
  throwBombRef.current = throwBomb;
  useHealthKitRef.current = useHealthKit;

  const throwShieldWall = () => {
    if (wallCharges <= 0) {
      actionsRef.current?.cancelWall();
      return;
    }
    if (actionsRef.current?.wallButton()) setWallCharges((w) => Math.max(0, w - 1));
  };
  throwShieldWallRef.current = throwShieldWall;

  /**
   * The backpack's Throw button for a gun. It nulls the slot AND puts the weapon on the ground —
   * Brook: "if the player decidde to throw a gun or ammo or whatever will it show in the grond so
   * his teamet can pick it if not make it happens". Before, the gun simply stopped existing.
   */
  const dropWeapon = (index: number) => {
    if (index === 3) return;
    const id = slots[index];
    if (id && id !== "fists") dropToWorldRef.current(id);
    setSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setActiveSlot((cur) => (cur === index ? 3 : cur));
  };

  const isHangout = gameMode === "hangout";
  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full touch-none select-none" />
      {miniGame && <IslandMiniGames activeGame={miniGame} onExit={closeMiniGame} />}
      {gameMode === "hangout" && onlineCount > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
          ● Online — {onlineCount} {onlineCount === 1 ? "player" : "players"} here
        </div>
      )}
      {/* flashbang whiteout — opacity driven straight from the render loop */}
      <div
        ref={flashElRef}
        className="pointer-events-none absolute inset-0 z-40 bg-white"
        style={{ opacity: 0, transition: "opacity 60ms linear" }}
      />
      <div
        ref={vignetteRef}
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(200,30,30,0.6) 100%)",
        }}
      />

      {placingWall && !isHangout && (
        <div className="pointer-events-none absolute left-1/2 top-[14%] z-30 -translate-x-1/2 rounded-full border border-sky-300/50 bg-sky-500/15 px-4 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-sky-100 backdrop-blur">
          Aim the frost wall — fire or tap the frost button to place · Esc to cancel
        </div>
      )}

      {cursorFree && mode === "walk" && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-white/20 bg-black/55 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
          Mouse released · press ` or click the arena to aim again
        </div>
      )}

      {collisionDebug && mode === "walk" && (
        <div className="pointer-events-none absolute left-1/2 top-12 z-40 -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200 backdrop-blur">
          Collision debug on (F9)
          {blockReason ? ` · blocked by ${blockReason}` : " · pink box = map bounds, yellow = spawn cage"}
        </div>
      )}


      {status && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{status}</p>
          <div className="h-1.5 w-56 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full transition-[width] duration-200 ease-out"
              style={{ width: `${Math.round(mapLoadProgress * 100)}%`, background: "var(--gradient-hud)" }}
            />
          </div>
        </div>
      )}

      {mode === "walk" && (

        <>
          {paused && (
            <div className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/85 p-6 text-center backdrop-blur-md">
              <h2 className="text-3xl font-black uppercase tracking-[0.15em] text-foreground sm:text-4xl">
                Paused
              </h2>
              <p className="max-w-xs text-xs text-muted-foreground">
                Tap resume to jump back in, or open settings to tweak sensitivity, quality and controls.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaused(false);
                    resumeSfx();
                    mountRef.current?.querySelector("canvas")?.requestPointerLock?.();
                  }}
                  className="min-w-[200px] rounded-xl bg-[var(--hud-accent)] px-8 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)] transition hover:brightness-110 active:scale-95"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaused(false);
                    setSettingsOpen(true);
                    document.exitPointerLock?.();
                  }}
                  className="min-w-[200px] rounded-xl border border-border bg-card/80 px-8 py-3 text-xs font-bold uppercase tracking-[0.15em] text-foreground transition hover:bg-secondary active:scale-95"
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => onExit?.()}
                  className="min-w-[200px] rounded-xl border border-border bg-card/80 px-8 py-3 text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground transition hover:bg-secondary active:scale-95"
                >
                  Main menu
                </button>
              </div>
            </div>
          )}
          {settings.showMinimap && !isHangout && (
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                transform: `translate(env(safe-area-inset-left, 0px), env(safe-area-inset-top, 0px)) scale(${hudScale})`,
                transformOrigin: "top left",
                opacity: settings.hudOpacity,
              }}
            >
              <Minimap radarRef={radarRef} mapRef={mapGridRef} imageRef={mapImageRef} />
            </div>
          )}

          {/* squad status panel — hidden in a solo drop, where it would list only you */}
          {teammates.length > 1 && match.phase !== "warmup" && match.phase !== "matchEnd" && (
            <TeamPanel teammates={teammates} scale={hudScale} opacity={settings.hudOpacity} />
          )}

          {/* status strip right of the minimap: settings, companion, ping, spectators */}
          {isHangout ? (
            <div
              className="pointer-events-none absolute left-3 top-3 z-30 flex w-[min(300px,70vw)] flex-col gap-2"
              style={{ marginLeft: "env(safe-area-inset-left, 0px)", marginTop: "env(safe-area-inset-top, 0px)" }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Open settings"
                  onClick={() => {
                    setSettingsOpen(true);
                    document.exitPointerLock?.();
                  }}
                  className="pointer-events-auto rounded-full border border-border bg-background/70 p-1.5 text-foreground backdrop-blur active:scale-95"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onExit?.()}
                  className="pointer-events-auto rounded-full border border-border bg-background/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-foreground backdrop-blur active:scale-95"
                >
                  Leave
                </button>
                <button
                  type="button"
                  aria-label="Call or dismiss car"
                  onClick={() => callCarRef.current()}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-foreground backdrop-blur active:scale-95"
                >
                  <Car className="h-4 w-4" /> Car <span className="opacity-60">V</span>
                </button>
                <button
                  type="button"
                  aria-label="Open chat"
                  onClick={() => {
                    setChatOpen((v) => !v);
                    setChatUnread(0);
                    document.exitPointerLock?.();
                  }}
                  className={`pointer-events-auto relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest backdrop-blur active:scale-95 ${
                    chatOpen ? "border-[var(--hud-accent)] bg-[var(--hud-accent)] text-[var(--hud-accent-foreground)]" : "border-border bg-background/70 text-foreground"
                  }`}
                >
                  <MessageCircle className="h-4 w-4" /> Chat <span className="opacity-60">T</span>
                  {chatUnread > 0 && !chatOpen && (
                    <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] text-destructive-foreground">
                      {chatUnread}
                    </span>
                  )}
                </button>
              </div>
              {chatOpen && (
                <div className="pointer-events-auto flex flex-col gap-2 rounded-xl border border-border bg-background/80 p-2 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">World chat</span>
                    <button type="button" aria-label="Close chat" onClick={() => setChatOpen(false)} className="text-muted-foreground">
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
                    {chatLog.length === 0 ? (
                      <p className="text-muted-foreground">Say hi to everyone here.</p>
                    ) : (
                      chatLog.map((m, i) => (
                        <p key={`${m.at}-${i}`} className="break-words text-foreground">
                          <span className="font-bold text-[var(--hud-accent)]">{m.name}: </span>
                          {m.text}
                        </p>
                      ))
                    )}
                  </div>
                  <form
                    className="flex gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      chatSendRef.current(chatDraft);
                      setChatDraft("");
                    }}
                  >
                    <input
                      autoFocus
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Escape") setChatOpen(false);
                      }}
                      maxLength={160}
                      placeholder="Type a message…"
                      className="min-w-0 flex-1 rounded-md border border-border bg-background/90 px-2 py-1.5 text-xs text-foreground outline-none focus:border-[var(--hud-accent)]"
                    />
                    <button type="submit" aria-label="Send" className="rounded-md bg-[var(--hud-accent)] px-2 text-[var(--hud-accent-foreground)]">
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (<>
          <div className="absolute left-[148px] top-3 z-10 flex items-center gap-3 text-white/70 sm:left-[156px] sm:top-4" style={{ marginLeft: "env(safe-area-inset-left, 0px)", marginTop: "env(safe-area-inset-top, 0px)" }}>
            <button
              type="button"
              aria-label="Open settings"
              className="pointer-events-auto rounded-md p-0.5 transition hover:text-white"
              onClick={() => {
                setSettingsOpen(true);
                document.exitPointerLock?.();
              }}
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={settings.muted ? "Unmute game audio" : "Mute game audio"}
              title={settings.muted ? "Unmute" : "Mute"}
              className={`pointer-events-auto rounded-md p-0.5 transition hover:text-white ${
                settings.muted ? "text-rose-400" : ""
              }`}
              onClick={toggleMute}
            >
              {settings.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              aria-label={fullscreen ? "Leave fullscreen" : "Enter fullscreen"}
              title={fullscreen ? "Leave fullscreen (Esc)" : "Fullscreen"}
              className="pointer-events-auto rounded-md p-0.5 transition hover:text-white"
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
            <button
              type="button"
              aria-label={cursorFree ? "Grab mouse" : "Release mouse"}
              title="Release / grab mouse (`)"
              className={`pointer-events-auto rounded-md p-0.5 transition hover:text-white ${
                cursorFree ? "text-[var(--hud-accent)]" : ""
              }`}
              onClick={() => toggleCursorRef.current()}
            >
              <MousePointer2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Toggle collision debug"
              title="Show collision geometry (F9)"
              className={`pointer-events-auto rounded-md p-0.5 transition hover:text-white ${
                collisionDebug ? "text-emerald-400" : ""
              }`}
              onClick={() => setCollisionDebug((v) => !v)}
            >
              <Boxes className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Call or dismiss pet"
              title="Call / dismiss pet"
              className="pointer-events-auto rounded-md p-0.5 transition hover:text-white active:scale-90"
              style={{ color: `#${(PETS[(profile?.pet ?? "nibbles") as PetId]?.color ?? 0xffffff).toString(16).padStart(6, "0")}` }}
              onClick={() => callPetRef.current()}
            >
              <PawPrint className="h-4 w-4" />
            </button>
            {MODE_RULES[gameMode].vehicles && (
              <button
                type="button"
                aria-label="Call or dismiss car"
                title="Call / dismiss car"
                className="pointer-events-auto rounded-md p-0.5 transition hover:text-white active:scale-90"
                onClick={() => callCarRef.current()}
              >
                <Car className="h-4 w-4" />
              </button>
            )}
            <span className="flex items-center gap-1 text-[9px] font-semibold tabular-nums">
              <Wifi className="h-4 w-4" />
              92
            </span>
            <span className="flex items-center gap-1 text-[9px] font-semibold tabular-nums">
              <Eye className="h-4 w-4" />
              {hud.filter((f) => f.team === "blue" && f.alive).length}
            </span>
          </div>
          <div className="pointer-events-none absolute left-[152px] top-9 z-10 text-white/60 sm:left-[160px] sm:top-10" style={{ marginLeft: "env(safe-area-inset-left, 0px)", marginTop: "env(safe-area-inset-top, 0px)" }}>
            <Smile className="h-4 w-4" />
          </div>
          </>)}

          {/* Floating combat text at the hit point — colour carries the meaning:
              white flesh, yellow armour soaked part of it, red headshot, green heal. */}
          <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
            {damagePopups.map((d) => (
              <span
                key={d.id}
                className="absolute font-extrabold tabular-nums drop-shadow-[0_2px_3px_rgba(0,0,0,0.85)]"
                style={{
                  left: d.x,
                  top: d.y,
                  color:
                    d.kind === "head"
                      ? "rgb(255,64,48)"
                      : d.kind === "armor"
                        ? "rgb(255,214,64)"
                        : d.kind === "heal"
                          ? "rgb(96,232,150)"
                          : "rgb(255,255,255)",
                  fontSize: d.kind === "head" ? 30 : 20,
                  transform: "translate(-50%, -50%)",
                  animation: "arena-dmg-float 900ms ease-out forwards",
                }}
              >
                {d.kind === "heal" ? "+" : ""}
                {d.amount}
                {d.kind === "head" && (
                  <span className="ml-1 align-middle text-[0.55em] tracking-widest">HS</span>
                )}
              </span>
            ))}
          </div>

          {/* ADS edge-darkening — fades in whenever you aim (any weapon) so the
              zoom reads as a deliberate aim rather than a silent FOV nudge. Sits
              under the scope glass (z-15 < z-20) and stays clear in the centre. */}
          <div
            ref={adsVignetteRef}
            className="pointer-events-none absolute inset-0 z-[15]"
            style={{
              opacity: 0,
              background:
                "radial-gradient(circle at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.28) 66%, rgba(0,0,0,0.6) 100%)",
            }}
          />
          {/* Scope overlay — Free Fire style. Sides stay transparent so the player keeps peripheral vision. */}
          <div ref={scopeRef} className="pointer-events-none absolute inset-0 z-20" style={{ opacity: 0 }}>
            {/* Subtle darkening only at the bezel edge, sides remain see-through */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at center, rgba(0,0,0,0) 26%, rgba(0,0,0,0.35) 28%, rgba(0,0,0,0) 32%)",
              }}
            />
            {/* Chunky dark bezel ring with metallic inner highlight */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: "56vh",
                height: "56vh",
                boxShadow:
                  "0 0 0 10px rgba(10,12,14,0.98), 0 0 0 12px rgba(60,64,70,0.6), inset 0 0 0 6px rgba(18,20,24,0.95), inset 0 0 0 8px rgba(120,128,140,0.35), inset 0 0 40px rgba(0,0,0,0.9)",
              }}
            />
            {/* Inner lens recess shadow */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ width: "52vh", height: "52vh", boxShadow: "inset 0 0 28px rgba(0,0,0,0.85)" }}
            />
            {/* Reticle: short edge ticks + thin cross lines */}
            <div className="absolute left-1/2 top-1/2 h-px w-[44vh] -translate-x-1/2 -translate-y-1/2 bg-black/55" />
            <div className="absolute left-1/2 top-1/2 h-[44vh] w-px -translate-x-1/2 -translate-y-1/2 bg-black/55" />
            {/* Tick marks at the four edges */}
            <div className="absolute left-1/2 top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-[20vh] bg-black/85" />
            <div className="absolute left-1/2 top-1/2 h-2.5 w-0.5 -translate-x-1/2 translate-y-[20vh] bg-black/85" />
            <div className="absolute left-1/2 top-1/2 h-0.5 w-2.5 -translate-x-[20vh] -translate-y-1/2 bg-black/85" />
            <div className="absolute left-1/2 top-1/2 h-0.5 w-2.5 translate-x-[20vh] -translate-y-1/2 bg-black/85" />
            {/* Green center dot with glow */}
            <div
              className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: "#7CFC52", boxShadow: "0 0 6px 2px rgba(124,252,82,0.7)" }}
            />
            {/* Distance readout near top-right of the lens */}
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[16vh] text-[10px] font-semibold tabular-nums text-emerald-300/80">
              59m
            </span>
            {/* Thin scope-mount shapes at the bottom */}
            <div className="absolute left-1/2 top-1/2 h-2.5 w-10 -translate-x-1/2 translate-y-[25vh] rounded-sm bg-black/70" />
            <div className="absolute left-1/2 top-1/2 h-1.5 w-6 -translate-x-1/2 translate-y-[27.5vh] rounded-sm bg-black/60" />
          </div>

          {/* streak / multi-kill callout */}
          {streakBanner && !shopOpen && !paused && !settingsOpen && (
            <div
              key={streakBanner.id}
              className="pointer-events-none absolute left-1/2 top-[18%] z-10 -translate-x-1/2 text-center animate-in fade-in zoom-in-95 duration-200"
            >
              <p
                className="text-2xl font-black uppercase tracking-[0.32em] sm:text-3xl"
                style={{ color: "var(--hud-accent)", textShadow: "0 2px 18px rgba(0,0,0,0.85)" }}
              >
                {streakBanner.title}
              </p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.4em] text-white/60">{streakBanner.sub}</p>
            </div>
          )}

          {/* thin bottom-centre vitals strip — hidden while riding the dropship */}
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 z-10 w-[320px] -translate-x-1/2 sm:w-[380px]"
            style={{ display: match.phase === "skydive" || isHangout ? "none" : undefined }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/70">
                HP {playerHp}/{MAX_HP}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-black/70 ring-1 ring-white/20">
                <div
                  className="h-full bg-white transition-all duration-150"
                  style={{ width: `${Math.max(0, Math.min(100, (playerHp / MAX_HP) * 100))}%` }}
                />
              </div>
              <span className="text-[9px] uppercase tracking-widest text-white/45 tabular-nums">
                {playerStatsHud.kills}K/{playerStatsHud.deaths}D
              </span>
              <span className="text-[9px] uppercase tracking-widest text-amber-300/80 tabular-nums">
                FF {ffCoinCount}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-white/45 tabular-nums">
                BP{backpackLevel}
              </span>
            </div>
            {/* EP reserve — trickles into HP; inhalers (F) top it up */}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-300/80">
                EP {Math.round(ep)}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-sm bg-black/70 ring-1 ring-white/10">
                <div
                  className="h-full bg-amber-300 transition-all duration-150"
                  style={{ width: `${Math.max(0, Math.min(100, (ep / MAX_EP) * 100))}%` }}
                />
              </div>
              <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-white/45 tabular-nums">
                <img src={LOOT_ICON.inhaler} alt="Inhalers" draggable={false} className="h-3.5 w-3.5 object-contain" />
                {inhalers}
              </span>
            </div>
            {/* Armor strip — vest + helmet level and durability */}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-300/80">
                ARM
              </span>
              <div className="flex flex-1 gap-1">
                {[
                  { slot: "vest" as const, icon: "V", label: "VEST" },
                  { slot: "helmet" as const, icon: "H", label: "HELM" },
                ].map(({ slot, icon }) => {
                  const piece = armor[slot];
                  if (!piece) return (
                    <div key={slot} className="h-1 flex-1 overflow-hidden rounded-sm bg-black/50 ring-1 ring-white/10" />
                  );
                  const pct = (piece.durability / piece.maxDurability) * 100;
                  return (
                    <div key={slot} className="h-1 flex-1 overflow-hidden rounded-sm bg-black/70 ring-1 ring-white/10">
                      <div
                        className="h-full bg-cyan-300 transition-all duration-150"
                        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                {(["vest", "helmet"] as const).map((slot) => {
                  const piece = armor[slot];
                  const icon = piece ? armorIcon(slot, piece.level) : null;
                  return icon ? (
                    <img
                      key={slot}
                      src={icon}
                      alt={armorIconLabel(slot, piece!.level)}
                      title={armorIconLabel(slot, piece!.level)}
                      draggable={false}
                      className="h-4 w-4 object-contain"
                    />
                  ) : (
                    <span key={slot} className="w-4 text-center text-[9px] text-white/25">
                      —
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div
            ref={crosshairRef}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]"
            style={{
              width: 18,
              height: 18,
              opacity: settings.crosshairOpacity,
              display:
                isHangout || match.phase === "skydive" || settings.crosshairStyle === "dot" || settings.crosshairStyle === "none"
                  ? "none"
                  : undefined,
            }}
          >
            {settings.crosshairStyle === "circle" ? (
              <div
                className="h-full w-full rounded-full"
                style={{
                  border: `${settings.crosshairThickness}px solid ${onTarget ? "#ff3b30" : settings.crosshairColor}`,
                  transition: "border-color 90ms linear",
                }}
              />
            ) : (
              <div className="relative h-full w-full">
                {(["top", "bottom", "left", "right"] as const).map((side) => (
                  <span
                    key={side}
                    className="absolute"
                    style={{
                      background: onTarget ? "#ff3b30" : settings.crosshairColor,
                      transition: "background-color 90ms linear",
                      width: side === "left" || side === "right" ? "34%" : settings.crosshairThickness,
                      height: side === "top" || side === "bottom" ? "34%" : settings.crosshairThickness,
                      left: side === "left" ? 0 : side === "right" ? undefined : "50%",
                      right: side === "right" ? 0 : undefined,
                      top: side === "top" ? 0 : side === "bottom" ? undefined : "50%",
                      bottom: side === "bottom" ? 0 : undefined,
                      transform:
                        side === "left" || side === "right" ? "translateY(-50%)" : "translateX(-50%)",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <div
            ref={centerDotRef}
            className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: onTarget ? "#ff3b30" : settings.crosshairColor,
              transition: "background-color 90ms linear",
              display: match.phase === "skydive" || isHangout ? "none" : undefined,
              opacity:
                settings.crosshairStyle === "none"
                  ? 0
                  : settings.crosshairStyle === "dot" || settings.crosshairStyle === "cross"
                    ? settings.crosshairOpacity
                    : 0,
            }}
          />
          {hitMarker > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="relative h-8 w-8">
                <div className="absolute left-1/2 top-0 h-3 w-0.5 -translate-x-1/2 bg-primary" />
                <div className="absolute bottom-0 left-1/2 h-3 w-0.5 -translate-x-1/2 bg-primary" />
                <div className="absolute left-0 top-1/2 h-0.5 w-3 -translate-y-1/2 bg-primary" />
                <div className="absolute right-0 top-1/2 h-0.5 w-3 -translate-y-1/2 bg-primary" />
              </div>
            </div>
          )}
          {!weaponReady && !isHangout && (
            <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Recharging…
            </div>
          )}
          {skydiveUi && (
            <div className="pointer-events-none absolute inset-x-0 top-20 flex flex-col items-center gap-2">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                {skydiveUi.phase === "boarding"
                  ? "Aboard the dropship"
                  : skydiveUi.phase === "flare"
                    ? "Brace for landing"
                    : "Freefall"}
              </p>
              <p className="text-4xl font-bold tabular-nums text-foreground">
                {skydiveUi.altitude}
                <span className="ml-1 text-base text-muted-foreground">m</span>
              </p>
              {skydiveUi.phase === "boarding" ? (
                <button
                  type="button"
                  onClick={() => {
                    ejectRequestedRef.current = true;
                  }}
                  className="pointer-events-auto mt-2 animate-pulse rounded-2xl bg-[var(--hud-accent)] px-10 py-3 text-sm font-black uppercase tracking-[0.35em] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)] transition hover:brightness-110 active:scale-95"
                >
                  Launch · {keyLabel(settings.keybinds.eject)}
                </button>
              ) : (
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  WASD to steer · slowing on approach
                </p>
              )}
            </div>
          )}
          {match.phase === "countdown" && !shopOpen && !isSandbox(MODE_RULES[gameMode]) && (
            <div className="pointer-events-none absolute inset-x-0 top-24 flex flex-col items-center gap-1">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                Round {match.round} · buy phase · press B for armory
              </p>
              <p className="text-5xl font-bold tabular-nums text-foreground">{match.countdown}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Locked inside your spawn cage
              </p>
            </div>
          )}

          {shopOpen && (
            <WeaponShop
              credits={credits}
              owned={owned}
              slots={slots}
              activeSlot={activeSlot}
              secondsLeft={match.countdown}
              totalSeconds={modeRulesRef.current.buySeconds || COUNTDOWN_SECONDS}
              onBuy={buyWeapon}
              onSelectSlot={selectSlot}
              onSellAll={sellAllWeapons}
              onClose={() => setShopOpen(false)}
              free={modeRulesRef.current.freeWeapons}
            />
          )}

          {!shopOpen && !isHangout && match.phase !== "skydive" && !spectating && (
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{ transform: `translate(calc(-1 * env(safe-area-inset-right, 0px)), env(safe-area-inset-top, 0px)) scale(${hudScale})`, transformOrigin: "top right" }}
            >
              <WeaponSlots slots={slots} activeSlot={activeSlot} onSelect={selectSlot} ammo={ammo} pool={ammoPool} />
            </div>
          )}

          {!shopOpen && !paused && !settingsOpen && !spectating && (
            <TouchControls
              combatHidden={match.phase === "skydive"}
              hangout={isHangout}
              settings={settings}
              scale={hudScale}
              press={(code) => keysRef.current.add(code)}
              release={(code) => keysRef.current.delete(code)}
              onShootStart={() => actionsRef.current?.triggerDown()}
              onShootEnd={() => actionsRef.current?.triggerUp()}
              onScopeToggle={() => actionsRef.current?.toggleAds()}
              scoped={scoped}
              onJump={() => actionsRef.current?.jump()}
              onReload={() => actionsRef.current?.reload()}
              onCrouchToggle={() => {
                if (downedRef.current) return; // no stance games from the floor
                const wasProne = proneRef.current;
                if (wasProne) bodyClipRef.current?.(CLIP.crouchToProne, { reverse: true, rate: 1.4 });
                else bodyClipRef.current?.(CLIP.standToCrouch, { reverse: crouchRef.current, rate: 1.3 });
                setCrouch((v) => !v);
                setProne(false);
              }}
              crouch={crouch}
              onProneToggle={() => {
                if (downedRef.current) return; // already flat — knocked is its own stance
                const wasProne = proneRef.current;
                const wasCrouched = crouchRef.current;
                if (wasProne) bodyClipRef.current?.(CLIP.crouchToProne, { reverse: true, rate: 1.4 });
                else bodyClipRef.current?.(CLIP.crouchToProne, { rate: wasCrouched ? 1 : 1.4 });
                setProne((v) => !v);
                setCrouch(false);
              }}
              prone={prone}
              kits={kits}
              onHeal={useHealthKit}
              inhalers={inhalers}
              onUseInhaler={() => useInhalerRef.current()}
              healProgress={healProgress}
              bombs={bombs}
              bombArmed={bombArmed}
              onThrowBomb={throwBomb}
              grenadeLabel={GRENADE_DEFS[grenadeKind].short}
              grenadeIcon={GRENADE_ICON[grenadeKind]}
              onCycleGrenade={cycleGrenade}
              walls={wallCharges}
              onThrowWall={throwShieldWall}
              onPing={() => placePingRef.current()}
              onEmote={toggleEmote}
              slots={slots}
              onDropWeapon={dropWeapon}
              bagFill={bagFillPct}
              ammoPool={ammoPool}
              grenadeCounts={grenades}
              onThrowItem={(req) => throwItemRef.current(req)}
            />
          )}

          {/* The container under your feet, listed down the right edge. Brook: "when the player
              steps on it he will see the icons on the side of the scren of what that player had
              before medkit guns boombs ..etc the player can click on them to take the stuff".
              Nothing here is granted on contact — `roomFor` greys out what will not fit and
              `swapTargets` turns a gun with no free slot into a "replace which?" question. */}
          {openStash && !shopOpen && !paused && !settingsOpen && !spectating && (
            <LootPanel
              stash={openStash}
              fill={bagFillPct}
              roomFor={(e: StashEntry) => {
                switch (e.kind) {
                  case "weapon":
                    // Slots, not units. 0 only means "you are already carrying this exact gun".
                    return slots.includes(e.weaponId) ? 0 : 1;
                  case "ammo":
                    return roomForAmmo(bagLoad, backpackLevel, e.family, e.qty);
                  case "kit":
                    return roomForItem(bagLoad, backpackLevel, "kit", e.qty);
                  case "inhaler":
                    return roomForItem(bagLoad, backpackLevel, "inhaler", e.qty);
                  case "wall":
                    return roomForItem(bagLoad, backpackLevel, "wall", e.qty);
                  case "grenade":
                    return roomForItem(bagLoad, backpackLevel, "grenade", e.qty);
                  case "armor":
                    // Worn, not carried, so it costs no room — but a downgrade is still a no-op.
                    return shouldPickupArmor(armor[e.slot], e.level) ? 1 : 0;
                }
              }}
              swapTargets={(e: StashEntry) => {
                if (e.kind !== "weapon") return null;
                const w = getWeapon(e.weaponId);
                // Mirrors `takeWeapon`: only a full pair of heavies has anything to ask about.
                if (!w || !isHeavy(w)) return null;
                if (slots.includes(e.weaponId)) return null;
                if (slots[0] === null || slots[1] === null) return null;
                return [slots[0], slots[1]].filter((id): id is string => !!id);
              }}
              onTake={(i, swapWith) => takeStashRef.current(i, swapWith)}
              onTakeAll={() => takeAllStashRef.current()}
              onClose={() => closeStashRef.current()}
            />
          )}

          {/* Friend Island mini-game prompt + basketball HUD */}
          {isHangout && !miniGame && !paused && islandPrompt && (
            <button
              type="button"
              className="pointer-events-auto absolute bottom-40 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-background/70 px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-border backdrop-blur active:scale-95"
              onClick={() => islandInteractRef.current()}
            >
              {islandPrompt}
            </button>
          )}
          {isHangout && !miniGame && hoopHud && (
            <div className="pointer-events-none absolute bottom-40 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
              <div className="rounded-lg bg-background/70 px-3 py-1 text-xs font-bold text-foreground ring-1 ring-border backdrop-blur">
                Baskets {hoopHud.score} / {hoopHud.shots}
                {hoopHud.msg && <span className="ml-2 text-primary">{hoopHud.msg}</span>}
              </div>
              {hoopHud.holding && (
                <>
                  <div className="h-2 w-48 overflow-hidden rounded-full bg-muted ring-1 ring-border">
                    <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${hoopHud.power * 100}%` }} />
                  </div>
                  <div className="text-xs font-semibold text-foreground drop-shadow">
                    {hoopHud.canShoot ? "Hold click to charge · release to shoot · E to drop" : "Stand still to aim"}
                  </div>
                  <button
                    type="button"
                    className="pointer-events-auto mt-1 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg active:scale-95 md:hidden"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      hoopChargeRef.current.start();
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      hoopChargeRef.current.release();
                    }}
                  >
                    Hold to shoot
                  </button>
                </>
              )}
            </div>
          )}
          {/* Drive prompt — on foot next to your car, or seated in it. pointer-events-auto so
              the button itself is tappable on mobile even though the HUD layer isn't. */}
          {MODE_RULES[gameMode].vehicles &&
            !shopOpen &&
            !paused &&
            !settingsOpen &&
            !spectating &&
            (nearCar || driving) && (
              <button
                type="button"
                className="pointer-events-auto absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur active:scale-95"
                onClick={() => carEnterExitRef.current()}
              >
                {driving ? "Exit vehicle (E)" : "Drive (E)"}
              </button>
            )}

          {/* in-match emote wheel — same ring as the lobby, opened by the dance key or the
              touch emote button. Picking loops the dance until the player moves or hits Stop. */}
          {emoteOpen && (
            <EmoteWheel
              active={activeDance}
              owned={profile?.ownedDances}
              onPick={(id) => {
                danceRef.current?.play(id);
                setActiveDance(id);
                setEmoteOpen(false);
              }}
              onStop={() => {
                danceRef.current?.stop();
                setActiveDance(undefined);
                setEmoteOpen(false);
              }}
              onClose={() => setEmoteOpen(false)}
            />
          )}

          {!shopOpen && !isHangout && !paused && !settingsOpen && (() => {
            const hex = `#${power.color.toString(16).padStart(6, "0")}`;
            const ready = powerHud.cooldown === 0 && powerHud.active === 0;
            const charging = powerHud.active === 0 && powerHud.cooldown > 0;
            const pct = charging ? 1 - powerHud.cooldown / power.cooldown : 1;
            return (
              <div
                className="absolute bottom-[318px] left-7 z-20 flex flex-col items-center gap-1"
                style={{ transform: `scale(${hudScale})`, transformOrigin: "bottom left" }}
              >
                <button
                  type="button"
                  aria-label={`Use ${power.name}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    activatePowerRef.current();
                  }}
                  className="relative grid h-16 w-16 place-items-center rounded-full border backdrop-blur transition-transform active:scale-95"
                  style={{
                    borderColor: ready || powerHud.active > 0 ? hex : "var(--hud-line, rgba(255,255,255,0.25))",
                    background: `conic-gradient(${hex}55 ${pct * 360}deg, rgba(0,0,0,0.45) 0deg)`,
                    boxShadow: powerHud.active > 0 ? `0 0 18px ${hex}` : ready ? `0 0 10px ${hex}88` : "none",
                    opacity: charging ? 0.7 : 1,
                  }}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-black/70 text-center">
                    {powerHud.active > 0 ? (
                      <span className="text-lg font-bold" style={{ color: hex }}>
                        {powerHud.active}
                      </span>
                    ) : charging ? (
                      <span className="text-sm font-semibold text-white/80">{powerHud.cooldown}</span>
                    ) : (
                      <img
                        src={POWER_ICON[power.id]}
                        alt={power.name}
                        draggable={false}
                        className="h-10 w-10 object-contain"
                        style={{ filter: `drop-shadow(0 0 4px ${hex}aa)` }}
                      />
                    )}
                  </span>
                </button>
                {powerHud.shield > 0 && (
                  <span className="rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">
                    Shield {powerHud.shield}
                  </span>
                )}
              </div>
            );
          })()}

          {!shopOpen && !isHangout && (() => {
            const activeId = slots[activeSlot] ?? "fists";
            const w = getWeapon(activeId);
            const cur = ammo[activeId];
            const mag = cur?.mag ?? 0;
            // The spare count is the CALIBRE's, not this gun's: swapping an AK for an M4 keeps the
            // same number here, and picking up a sniper does not magically come with sniper rounds.
            const fam = familyOf(activeId);
            const reserve = fam ? ammoPool[fam] : 0;
            const magSize = getMagazine(activeId, profileRef.current);
            const hasAmmo = magSize > 0;
            const empty = hasAmmo && mag === 0;
            const low = hasAmmo && mag > 0 && mag <= Math.max(1, Math.ceil(magSize * 0.25));
            return (
              <div className="pointer-events-none absolute bottom-[186px] right-5 flex flex-col items-end gap-1">
                <div
                  className={`flex items-baseline gap-2 rounded-md border px-3 py-1 backdrop-blur transition-colors ${
                    empty
                      ? "border-destructive bg-destructive/15"
                      : low
                        ? "border-[var(--hud-accent)]/70 bg-[var(--hud-panel)]/90"
                        : "border-border/60 bg-[var(--hud-panel)]/90"
                  }`}
                >
                  <span
                    className={`text-xl font-bold tabular-nums ${
                      empty ? "text-destructive animate-pulse" : low ? "text-[var(--hud-accent)]" : "text-foreground"
                    }`}
                  >
                    {mag}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">/ {reserve}</span>
                </div>
                {empty && !isReloading && (
                  <div className="animate-pulse rounded-md bg-destructive px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-destructive-foreground">
                    Reload
                  </div>
                )}
                {isReloading && (
                  <div className="rounded-md bg-[var(--hud-accent)]/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--hud-accent-foreground)]">
                    Reloading… {reloadLeft.toFixed(1)}s
                  </div>
                )}
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  {w?.name ?? "Deagle"}
                </p>
              </div>
            );
          })()}


          {draftLock && match.phase === "countdown" && (
            <div className="pointer-events-none absolute inset-x-0 top-24 flex flex-col items-center gap-1">
              <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">Buy phase</p>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--hud-accent)]">
                {draftLock} is choosing the loadout
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Everyone runs the same guns this round</p>
            </div>
          )}

          {spectating ? (
            <div className="pointer-events-none absolute inset-x-0 top-16 flex flex-col items-center gap-1">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Eliminated</p>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--hud-accent)]">Spectating teammate</p>
            </div>
          ) : knockHud ? (
            <div className="pointer-events-none absolute inset-x-0 top-16 flex flex-col items-center gap-1">
              {knockHud.revivingName ? (
                <>
                  <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                    Reviving {knockHud.revivingName}
                  </p>
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">
                    Hold still — {knockHud.bleeding}s left on their bleed-out
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Knocked down</p>
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-400">
                    Bleeding out — {knockHud.bleeding}s
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Crawl to cover · a teammate can pick you back up
                  </p>
                </>
              )}
            </div>
          ) : (
            playerRespawn > 0 && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/50">
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Eliminated</p>
                <p className="text-4xl font-bold text-foreground">Respawn in {playerRespawn}</p>
              </div>
            )
          )}
          {match.phase === "matchEnd" && !isHangout && (
            <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-md">
              <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/95 p-6 text-center shadow-[var(--shadow-hud)]">
                {(() => {
                  const winner = match.matchWinner ?? match.roundWinner;
                  const won = winner === "blue";
                  return (
                    <>
                      <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
                        Match over
                      </p>
                      {won ? (
                        <div className="mx-auto mt-3 w-fit rounded-md border-2 border-[#ffd76a] bg-gradient-to-b from-[#ffe9a8] to-[#e2a712] px-8 py-2.5 shadow-[0_0_40px_-8px_rgba(255,200,80,0.9)]">
                          <p className="text-3xl font-black uppercase tracking-[0.25em] text-[#4a2c00] sm:text-4xl">
                            VICTORY
                          </p>
                        </div>
                      ) : (
                        <div className="mx-auto mt-3 w-fit rounded-md border-2 border-white/25 bg-gradient-to-b from-[#5b6068] to-[#2b2f35] px-8 py-2.5 shadow-[0_0_40px_-12px_rgba(0,0,0,0.9)]">
                          <p className="text-3xl font-black uppercase tracking-[0.25em] text-white/80 sm:text-4xl">
                            Defeat
                          </p>
                        </div>
                      )}
                      <p className="mt-4 text-2xl font-semibold tabular-nums text-foreground">
                        {match.blue} – {match.red}
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-border/60 bg-secondary/40 p-3">
                        <div>
                          <p className="text-xl font-bold tabular-nums text-foreground">{playerStatsHud.kills}</p>
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Kills</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold tabular-nums text-foreground">{playerStatsHud.deaths}</p>
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Deaths</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold tabular-nums text-foreground">{playerStatsHud.headshots}</p>
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Headshots</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold tabular-nums text-foreground">
                            {playerStatsHud.deaths === 0 ? playerStatsHud.kills : (playerStatsHud.kills / Math.max(1, playerStatsHud.deaths)).toFixed(2)}
                          </p>
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">K/D</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold tabular-nums text-foreground">{match.round}</p>
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Rounds</p>
                        </div>
                      </div>
                      {match.countdown > 0 && (
                        <p className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">
                          Next match in {match.countdown}
                        </p>
                      )}
                      <button
                        onClick={enterWalk}
                        className="mt-5 w-full rounded-xl bg-[var(--hud-accent)] px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)] transition hover:brightness-110 active:scale-95"
                      >
                        Play again
                      </button>
                      {match.phase === "matchEnd" && !matchLiked && (
                        <button
                          onClick={() => {
                            if (!profileRef.current) return;
                            setMatchLiked(true);
                            const next = applyLikeBonus(profileRef.current, 1);
                            profileRef.current = next;
                            onProfileChange?.(next);
                          }}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#ff4d6d]/40 bg-[#ff4d6d]/10 px-6 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-[#ff4d6d] transition hover:bg-[#ff4d6d]/20 active:scale-95"
                        >
                          <Heart className="h-4 w-4" />
                          Like this match (+10 gold)
                        </button>
                      )}
                      {match.phase === "matchEnd" && matchLiked && (
                        <p className="mt-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-[#ff4d6d]">
                          <Heart className="h-4 w-4 fill-current" />
                          Liked — thanks for the feedback!
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}




      {/* killfeed */}
      {settings.showKillFeed && !isHangout && killFeed.length > 0 && (
        <div className="pointer-events-none absolute right-4 top-[152px] flex max-w-xs flex-col gap-1 sm:right-5 sm:top-[158px]">
          {killFeed.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-card/80 px-3 py-1.5 text-xs text-foreground backdrop-blur"
            >
              <Skull className="h-3 w-3 text-muted-foreground" />
              <span className={item.killerTeam === "blue" ? "text-[#3f8fff]" : "text-[#ff3b1f]"}>
                {item.killer}
              </span>
              <span className="text-muted-foreground">{item.weapon}</span>
              <span className={item.victimTeam === "blue" ? "text-[#3f8fff]" : "text-[#ff3b1f]"}>
                {item.victim}
              </span>
            </div>
          ))}
        </div>
      )}

      {(leaderboard || orbitLeaderboard) && (
        <div className="pointer-events-none absolute left-3 top-[130px] max-w-xs rounded-lg border border-border/60 bg-card/80 p-3 backdrop-blur sm:left-4 sm:top-[136px]">
          <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">Leaderboard</p>
          <div className="mt-2 space-y-1 text-xs">
            {Object.entries((leaderboard ?? orbitLeaderboard)!.totals).map(([team, t]) => (
              <div key={team} className="flex justify-between gap-4">
                <span className={team === "blue" ? "text-[#3f8fff]" : "text-[#ff3b1f]"}>
                  {team === "blue" ? "Blue" : "Red"}
                </span>
                <span className="tabular-nums text-foreground">
                  {t.wins}W {t.losses}L · {t.kills}K {t.deaths}D
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* scoreboard */}
      {hud.length > 0 && !isHangout && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 sm:top-3">
          <div className="flex items-stretch overflow-hidden rounded-[3px] shadow-[0_0_18px_-6px_rgba(0,0,0,0.95)]">
            <div
              className="flex min-w-12 items-center justify-center bg-gradient-to-b from-[#2f7dfd] to-[#1147a8] px-3 py-0.5 text-base font-extrabold tabular-nums text-white"
              style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)" }}
            >
              {score.blue}
            </div>
            <div className="flex flex-col items-center justify-center bg-black/80 px-4 py-0.5 text-center backdrop-blur">
              <span className="text-[11px] font-bold tabular-nums leading-tight text-[#ffd45e]">
                {String(Math.floor(match.countdown / 60)).padStart(2, "0")}:
                {String(match.countdown % 60).padStart(2, "0")}
              </span>
              <span className="text-[7px] uppercase tracking-[0.25em] text-white/55">
                R{match.round} · {hud.filter((f) => f.team === "blue" && f.alive).length}v
                {hud.filter((f) => f.team === "red" && f.alive).length}
              </span>
            </div>
            <div
              className="flex min-w-12 items-center justify-center bg-gradient-to-b from-[#ff8a3d] to-[#c93a10] px-3 py-0.5 text-base font-extrabold tabular-nums text-white"
              style={{ clipPath: "polygon(8px 0, 100% 0, 100% 100%, 0 100%)" }}
            >
              {score.red}
            </div>
          </div>

          {/* objective / progress ribbon under the score, as in the reference HUD */}
          <div className="relative mx-auto mt-1.5 h-4 w-[280px] overflow-hidden rounded-[2px] border border-[#e0b64a]/60 bg-black/70 sm:w-[340px]">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#8c6a12] via-[#e9c34f] to-[#8c6a12] transition-all duration-300"
              style={{ width: `${Math.min(100, (score.blue / matchConfig.roundsToWinMatch) * 100)}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold uppercase tracking-[0.3em] text-white/90 drop-shadow">
              Victory
            </span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-1/2 z-20 -translate-y-1/2" style={{ marginLeft: "env(safe-area-inset-left, 0px)" }}>
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          {settings.showFps && <FpsCounter />}
          {showDebug && (
            <div className="flex flex-col items-stretch gap-2 rounded-lg border border-border/60 bg-card/85 p-3 backdrop-blur">

              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Debug</p>
              <button
                onClick={() => setShowRoof((v) => !v)}
                className="rounded-md border border-border bg-card/80 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-foreground transition-colors hover:bg-secondary"
              >
                {showRoof ? "Hide roof" : "Show roof"}
              </button>
              <button
                onClick={() => setMode((m) => (m === "orbit" ? "walk" : "orbit"))}
                className="rounded-md border border-border bg-card/80 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-foreground transition-colors hover:bg-secondary"
              >
                {mode === "orbit" ? "Ground view" : "Orbit view"}
              </button>
              <button
                onClick={enterWalk}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Restart match
              </button>
            </div>
          )}
        </div>
      </div>

      {settingsOpen && (
        <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

/** Lightweight FPS readout, mounted only when the player enables it in settings. */
function FpsCounter() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="pointer-events-none rounded-md border border-border/60 bg-card/85 px-2 py-1 text-[10px] font-bold tabular-nums text-foreground backdrop-blur">
      {fps} FPS
    </div>
  );
}

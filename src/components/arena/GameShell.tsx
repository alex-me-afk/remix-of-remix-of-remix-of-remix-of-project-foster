import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Play, Settings, Users, UserCircle, Store, LayoutGrid, PawPrint, Shirt, Crosshair, PartyPopper, User, MessageSquare, UserPlus, Car } from "lucide-react";

import BrandMark from "./BrandMark";
import SettingsPanel from "./SettingsPanel";
import ProfileCard from "./ProfileCard";
import StorePanel from "./StorePanel";
import DanceShop from "./DanceShop";
import OperativeViewer from "./OperativeViewer";
import EmoteWheel from "./EmoteWheel";
import CharacterPicker from "./CharacterPicker";
import Onboarding from "./Onboarding";
import LoadoutPanel from "./LoadoutPanel";
import PetPicker from "./PetPicker";
import PetViewer from "./PetViewer";
import CarShop from "./CarShop";
import VaultPanel from "./VaultPanel";
import ArmoryPanel from "./ArmoryPanel";
import { defaultCharacter, loadCharacter, saveCharacter, type ArenaCharacter } from "./characters";
import { defaultSettings, loadSettings, saveSettings, type ArenaSettings } from "./settings";
import { arenaAssets, preloadAll, prefetch, WAITING_ISLAND_URL } from "./preload";
import { initKeyboardLayout } from "./keyboardLayout";
import ModeSelect from "./ModeSelect";
import { isMapReady, mapFiles } from "./mapDownloads";
import MatchmakingCard from "./MatchmakingCard";
import { ARENA_MAPS, type MapId } from "./maps";
import { DEFAULT_MATCH_TYPE, DEFAULT_VARIANT, MODE_RULES, MODE_VARIANTS, MODES, modeForMap, variantLabel, type GameMode, type MatchType } from "./modes";
import { TeamRoster, FriendsPanel, ChatPanel, type PartyMember } from "./LobbySocial";
import { loadProfile, saveProfile, levelFromProfile, type PlayerProfile } from "./playerProfile";
import { useCloudProfile } from "./useCloudProfile";
import { saveLoadout } from "./skills";
import { PETS, savePet } from "./pets";
import { initSfx, startLobbyMusic, stopLobbyMusic } from "./sfx";
import SplashScene, { SPLASH_FRAMES } from "./SplashScene";
import keyArt from "@/assets/splash-key-art.jpg";
import lobbyBackdrop from "@/assets/lobby-backdrop.jpg";
import outpostCard from "@/assets/map-outpost-card.jpg";
import islandCard from "@/assets/map-island-card.jpg";
import friendIslandCard from "@/assets/map-friend-island-card.jpg";

const LoneWolfArena = lazy(() => import("./LoneWolfArena"));
// Lazy for the same reason as the arena: it pulls in three-mesh-bvh and the collision builder, and
// boot should not pay for a screen only Battle Royale ever shows. The deploy splash stays over it
// until it reports a real frame, so there is nothing to look at while the chunk arrives.
const WaitingRoom = lazy(() => import("./WaitingRoom"));

/** Small map thumbnail art keyed by map id (mirrors ModeSelect's CARD_ART). */
const MAP_THUMB: Record<MapId, string> = {
  frostline: keyArt,
  outpost: outpostCard,
  island: islandCard,
  ice: outpostCard,
  "friend-island": friendIslandCard,
};

type Phase = "boot" | "lobby" | "deploy" | "play";

const BOOT_TIPS = [
  "Aim for the head — headshots deal bonus damage.",
  "Use Frost Walls to create cover in open ground.",
  "Pick up armor vests and helmets to survive longer.",
  "Healing items restore HP, but some require you to stand still.",
  "Stay inside the safe zone — the storm drains HP quickly.",
  "Switch weapons instead of reloading in the middle of a fight.",
  "Crouch and prone make you harder to hit.",
  "Collect FF Coins to buy better guns during the match.",
];

const DEPLOY_TIPS = [
  "Frost walls buy you a second — place one, then reposition.",
  "Headshots hit for double. Slow down, then squeeze.",
  "Buy phase: press B to open the armory between rounds.",
  "Two heavies and a sidearm. Choose the pair that covers every range.",
  "Auto-fire is great on phones — turn it on in Settings > Gameplay.",
  "Low on frames? Switch Quality to Low in Settings > Video.",
];

const ALL_TIPS = [...BOOT_TIPS, ...DEPLOY_TIPS];

function ProgressBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="w-full">
      <div className="h-[4px] w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%`, background: "var(--gradient-hud)" }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
        <span>{value >= 1 ? "Assets cached" : "Streaming assets"}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

export default function GameShell() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Contacting arena");
  const [bytesDone, setBytesDone] = useState(false);
  const [bgReady, setBgReady] = useState(false);
  const [charReady, setCharReady] = useState(false);
  const [petReady, setPetReady] = useState(false);
  const [warmTimedOut, setWarmTimedOut] = useState(false);
  const [settings, setSettings] = useState<ArenaSettings>(() => defaultSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [character, setCharacter] = useState<ArenaCharacter>(() => defaultCharacter());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [petOpen, setPetOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [armoryOpen, setArmoryOpen] = useState(false);
  const [arenaReady, setArenaReady] = useState(false);
  /** The waiting island has drawn a real frame, so the deploy splash can come off it. */
  const [roomShown, setRoomShown] = useState(false);
  const [tip, setTip] = useState(0);
  const [mapId, setMapId] = useState<MapId>("friend-island");
  // The mode MUST match the map (each map belongs to one mode). Seed it from the
  // default map instead of a standalone DEFAULT_MODE, or the lobby boots with
  // frostline (a 2v2 map) staged under ironclash's 4v4 rules — the exact
  // cross-mode leak that shipped: crates, paid weapons and respawns in a "2v2".
  const [gameMode, setGameMode] = useState<GameMode>(modeForMap("friend-island"));
  const [matchType, setMatchType] = useState<MatchType>(DEFAULT_MATCH_TYPE);
  const [variant, setVariant] = useState<number>(DEFAULT_VARIANT[modeForMap("friend-island")]);
  const [variantOpen, setVariantOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  // Local, backend-free party + social state. The party is just YOU until
  // real invites exist; friends/chat panels are UI stubs.
  const [party, setParty] = useState<PartyMember[]>([]);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [teamWarning, setTeamWarning] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [profileOpen, setProfileOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [danceShopOpen, setDanceShopOpen] = useState(false);
  const [garageOpen, setGarageOpen] = useState(false);
  // Lobby emote wheel. `danceId` is the clip currently looping on the lobby operative;
  // `emoteOpen` toggles the radial picker that clicking the character opens.
  const [danceId, setDanceId] = useState<string | undefined>(undefined);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const deployStart = useRef(0);
  /**
   * Battle Royale matchmaking, run IN THE NORMAL LOBBY.
   *
   * Picking a BR map and pressing Play no longer hands the player to a splash or to a separate
   * 3-D room. They stay exactly where they are — operative, pet, settings, store all still live —
   * and a small card reports the search while the match level builds invisibly behind the lobby.
   * `null` means no search is running.
   */
  const [search, setSearch] = useState<{ startedAt: number; average: number } | null>(null);
  /** seconds the current search has been running; ticks while `search` is set */
  const [searchElapsed, setSearchElapsed] = useState(0);

  useEffect(() => setSettings(loadSettings()), []);
  useEffect(() => void initKeyboardLayout(), []);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => setCharacter(loadCharacter()), []);
  useEffect(() => saveProfile(profile), [profile]);
  const { loaded: profileLoaded } = useCloudProfile(profile, setProfile);

  /** splash 1 — stream every asset before the lobby is offered */
  useEffect(() => {
    let alive = true;
    // profile.pet is read once, at mount: loadProfile() runs in the useState initialiser, so
    // this is already the real equipped pet, and it cannot change while the splash is up.
    const petUrl = PETS[profile.pet].model.url;
    // The body is read straight from storage rather than off `character`, because the effect
    // on the line above this block is what puts the saved pick INTO that state — so the
    // `character` captured in this closure is still defaultCharacter() on the first commit,
    // and preloading it would warm Howl's body for a player who plays Nyx.
    const bodyUrl = loadCharacter().model;
    // The four montage shots ride the boot bar so every crossfade is between already-decoded
    // textures — swapping to an undecoded frame mid-fade would flash. keyArt stays in the list
    // because the lobby map thumbnail still uses it.
    preloadAll(arenaAssets([keyArt, lobbyBackdrop, ...SPLASH_FRAMES], petUrl, bodyUrl), (p, l) => {
      if (!alive) return;
      setProgress(p);
      setLabel(l);
    }).then(() => alive && setBytesDone(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The Enter button waits on two different things.
   *
   * `bytesDone` means every file finished downloading. The three `*Ready` flags mean the lobby
   * has actually drawn itself — backdrop decoded, character and pet parsed, KTX2 textures
   * transcoded, uploaded to the GPU and rendered at least once. Downloading is only half the
   * cost: without the second half the player taps Enter and then watches an empty stage for
   * several seconds while three.js chews through 13 MB of GLB.
   *
   * `warmTimedOut` is the escape hatch. A 404 on one model should cost the player a missing
   * character, never the whole game.
   */
  const lobbyReady = (bgReady && charReady && petReady) || warmTimedOut;
  const canEnter = bytesDone && lobbyReady;

  useEffect(() => {
    if (!bytesDone || lobbyReady) return;
    const id = window.setTimeout(() => setWarmTimedOut(true), 12000);
    return () => window.clearTimeout(id);
  }, [bytesDone, lobbyReady]);

  const markBgReady = useCallback(() => setBgReady(true), []);
  const markCharReady = useCallback(() => setCharReady(true), []);
  const markPetReady = useCallback(() => setPetReady(true), []);

  useEffect(() => {
    if (phase !== "boot" && phase !== "deploy") return;
    const id = window.setInterval(() => setTip((t) => (t + 1) % ALL_TIPS.length), 3200);
    return () => window.clearInterval(id);
  }, [phase]);

  /*
   * Battle Royale holds the player in the waiting island before the plane instead of behind a
   * still splash. The gate is the mode's OWN rule field and never its name: `waitingRoomSeconds`
   * is 0 for fangDuel and ironclash, so those two keep the splash and change in no way at all.
   * `modeForMap` rather than the `gameMode` state for the same reason the arena uses it — the
   * loaded map is the single source of truth for which rules are in force.
   */
  const activeMode = modeForMap(mapId);
  const waitRules = MODE_RULES[activeMode];
  const useWaitingRoom = waitRules.waitingRoomSeconds > 0;

  // Warm the island's 6 MB while the player is in the menus. Fetching it on an idle network beats
  // fetching it at the exact moment the room is supposed to already be there, and it stays off the
  // boot bar because it is not needed until Play is pressed.
  useEffect(() => {
    if (phase !== "lobby" || !useWaitingRoom || !isMapReady(mapId)) return;
    prefetch([WAITING_ISLAND_URL]);
  }, [phase, useWaitingRoom, mapId]);

  /*
   * ---- one build at a time ----
   *
   * The room and the match level used to start building in the same tick, and on an 8 GB machine
   * that killed the tab about ten seconds in: two WebGL contexts, two GLTF parses, two collider
   * builds and the KTX2 transcoder pool fed from both sides at once. Nothing here is individually
   * large — the island is 6 MB of geometry and 23 MB of 512-pixel textures — it is the concurrency
   * that does it.
   *
   * So the arena now waits for the room to finish. The room is the smaller of the two by a wide
   * margin, it is what the player is actually looking at, and it warms the shared operative body
   * the match needs anyway. The timer is the fail-open half: a room that never reports in cannot
   * hold the match hostage, it just loses its head start.
   */
  const [armArena, setArmArena] = useState(false);
  useEffect(() => {
    if (phase !== "deploy" || !useWaitingRoom || armArena) return;
    const id = window.setTimeout(() => setArmArena(true), 9000);
    return () => window.clearTimeout(id);
  }, [phase, useWaitingRoom, armArena]);

  /**
   * Fail-open for the room reveal. `onLoaded` always fires — both the success path and the failure
   * path end in a `finally` — but a splash that never lifts is the one failure that strands a player
   * completely, so it is on a timer as well.
   */
  useEffect(() => {
    if (phase !== "deploy" || !useWaitingRoom || roomShown) return;
    const id = window.setTimeout(() => setRoomShown(true), 30000);
    return () => window.clearTimeout(id);
  }, [phase, useWaitingRoom, roomShown]);

  /** splash 3 holds until the map is built, with a short minimum so it never flickers */
  useEffect(() => {
    if (phase !== "deploy" || !arenaReady) return;
    // The waiting island runs its own release — roster full, or its ceiling reached — and calls
    // through to `setPhase("play")` itself. Arming this timer as well would yank the player out of
    // the room 1.4 s after the map finished, mid-countdown.
    if (useWaitingRoom) return;
    const wait = Math.max(0, 1400 - (performance.now() - deployStart.current));
    const id = window.setTimeout(() => setPhase("play"), wait);
    return () => window.clearTimeout(id);
  }, [phase, arenaReady, useWaitingRoom]);

  // lobby ambience: a quiet synth pad whenever the player is in the menus — and on through the
  // waiting island, which is still the lobby, just a three-dimensional one.
  useEffect(() => {
    if (phase === "lobby" || (phase === "deploy" && useWaitingRoom)) startLobbyMusic();
    else stopLobbyMusic();
    return () => stopLobbyMusic();
  }, [phase, useWaitingRoom]);

  // Picking a mode in the selector no longer launches the match — it drops the
  // player back to the lobby with that mode staged, where the party-size chip and
  // the Play button live. Reset the variant to the mode's headline format.
  const selectMode = useCallback((mode: GameMode, type: MatchType, id: MapId) => {
    setGameMode(mode);
    setMatchType(type);
    setMapId(id);
    setVariant(DEFAULT_VARIANT[mode]);
    setModeOpen(false);
    // Changing the map mid-search abandons the search: the arena behind the card was already
    // building the old level, and the roster size comes from the new map's rules.
    setSearch(null);
  }, []);

  // Full roster = YOU plus any invited teammates. `variant` is the per-side cap.
  const teamMembers: PartyMember[] = [{ id: "you", name: profile.name, you: true }, ...party];

  const deploy = useCallback(() => {
    // A search already running owns the wait. Pressing Play again must not restart the background
    // build — `deployStart` is the arena's React key, so a second call would tear the level down
    // and rebuild it from zero. Picking a different map cancels the search (see `selectMode`), so
    // this only ever swallows a redundant press.
    if (search) return;
    // Cross-mode rule: a solo/1v1 format can't be entered while you're teamed up.
    if (variant <= 1 && party.length > 0) {
      setTeamWarning("Can't play that mode with your current team — pick another mode or leave the team.");
      return;
    }
    setTeamWarning(null);
    setModeOpen(false);
    setVariantOpen(false);
    setFriendsOpen(false);
    setChatOpen(false);
    deployStart.current = performance.now();
    setArenaReady(false);
    setRoomShown(false);
    setArmArena(false);
    /*
     * Battle Royale matchmakes in the lobby. Everything else keeps the deploy splash, so this is
     * gated on the mode's own rule field rather than on its name.
     */
    if (useWaitingRoom) {
      setSearch({
        startedAt: performance.now(),
        // The queue's advertised average. Cosmetic, but a 30-player lobby that always says the
        // same number reads as broken, so it varies per search.
        average: 18 + Math.round(Math.random() * 26),
      });
      setSearchElapsed(0);
      return;
    }
    setSearch(null);
    setPhase("deploy");
  }, [variant, party.length, useWaitingRoom, search]);

  // Trim the party if the chosen variant shrinks below its size.
  useEffect(() => {
    setParty((p) => (p.length > variant - 1 ? p.slice(0, Math.max(0, variant - 1)) : p));
  }, [variant]);

  const inviteFriend = useCallback(
    (name: string) => {
      setParty((p) => {
        if (p.length >= variant - 1) return p; // team full for this variant
        return [...p, { id: `mate-${Date.now()}`, name }];
      });
      setTeamWarning(null);
    },
    [variant],
  );

  const backToLobby = useCallback(() => {
    setArenaReady(false);
    setRoomShown(false);
    setArmArena(false);
    setPhase("lobby");
  }, []);

  /**
   * The arena mounts in `deploy` (once the room has reported loaded) and in `play` — NOT during the
   * lobby search. The three stages deliberately split the work:
   *   1. lobby    — the search card runs; only BYTES are fetched, which is network work and does not
   *                 touch the main thread.
   *   2. splash   — the waiting room itself is built and cached here, so it can never stutter in
   *                 front of the player.
   *   3. room     — the match level builds behind the room while the roster fills (see `armArena`).
   */
  const mountArena = phase === "play" || (phase === "deploy" && (!useWaitingRoom || armArena));

  // search clock
  useEffect(() => {
    if (!search) return;
    const id = window.setInterval(
      () => setSearchElapsed((performance.now() - search.startedAt) / 1000),
      250,
    );
    return () => window.clearInterval(id);
  }, [search]);

  /*
   * Stage 1's real job: pull the BYTES that stages 2 and 3 will parse. Fetching is network work and
   * does not occupy the main thread, so it rides along while the player reads the lobby and watches
   * the card. By the time the splash goes to build the waiting room and the room goes to build the
   * level, the files are in cache and only decode is left — which is the part those two stages
   * exist to hide.
   */
  useEffect(() => {
    if (!search) return;
    const map = ARENA_MAPS[mapId];
    prefetch(mapFiles(mapId));
    void map;
  }, [search, mapId]);

  /*
   * How full the roster reads while the search runs in the lobby. The last seat is held back until
   * the search is actually over, so the card never claims a full lobby it cannot deliver.
   */
  const searchPlayers = waitRules.waitingRoomPlayers;
  const searchFill = Math.max(8, Math.min(30, waitRules.waitingRoomSeconds * 0.4));
  const searchFound = search
    ? Math.min(
        searchPlayers - 1,
        Math.max(1, Math.round(searchPlayers * (0.2 + 0.8 * (searchElapsed / searchFill)))),
      )
    : 0;
  const searchReady = search !== null && searchElapsed >= searchFill;

  /**
   * Match found. Hand over to `deploy`, which is stage 2: the splash covers the waiting room being
   * built, and the room then covers the match level being built. The player is never in a live 3-D
   * screen while something heavy is parsing.
   */
  useEffect(() => {
    if (!searchReady) return;
    setSearch(null);
    setPhase("deploy");
  }, [searchReady]);

  const cancelSearch = useCallback(() => {
    setSearch(null);
    setArmArena(false);
    setArenaReady(false);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {/* ---------- the game itself ---------- */}
      {mountArena && (() => {
        // Single source of truth: the loaded map decides the mode and the legal
        // party sizes, so the arena can never run one mode's rules on another
        // mode's level even if `gameMode`/`variant` state drifted in the lobby.
        const mode = modeForMap(mapId);
        const sizes = MODE_VARIANTS[mode];
        const size = sizes.includes(variant) ? variant : DEFAULT_VARIANT[mode];
        return (
        /*
         * Out of flow whenever the match is not the thing on screen. The arena is mounted during
         * deploy (behind the waiting room) and this div is `h-full w-full` — left in flow it would
         * push the room a screen down. `absolute inset-0` keeps the box full-size so the canvas
         * still measures correctly without occupying layout, and `pointer-events-none` guarantees
         * the hidden arena can never swallow a tap meant for the room.
         */
        <div className={phase === "play" ? "h-full w-full" : "pointer-events-none absolute inset-0 opacity-0"}>
          <Suspense fallback={null}>
            <LoneWolfArena key={deployStart.current} mapId={mapId} gameMode={mode} matchType={matchType} teamSize={size} profile={profile} onProfileChange={setProfile} onReady={() => setArenaReady(true)} onExit={backToLobby} hidden={phase !== "play"} />
          </Suspense>
        </div>
        );
      })()}

      {/* ---------- the waiting island : Battle Royale only ----------
          Free Fire's pre-match room, and the reason the arena above is allowed to take its time:
          the player stands on a real deck with the roster filling around them while those fifteen
          megabytes are fetched, parsed, tiled and lit behind this. It replaces the still splash for
          this mode only, and it owns the release into the match.

          It is NOT revealed until the match is built — see the "cache behind a flat screen" effect
          above. Revealing it on its own first frame is what made the room laggy. */}
      {phase === "deploy" && useWaitingRoom && (
        <Suspense fallback={null}>
          <WaitingRoom
            key={deployStart.current}
            bodyUrl={character.model}
            crowd={settings.quality !== "low"}
            pixelRatio={(settings.quality === "low" ? 1 : 1.5) * settings.renderScale}
            seconds={waitRules.waitingRoomSeconds}
            players={waitRules.waitingRoomPlayers}
            mapReady={arenaReady}
            tip={ALL_TIPS[tip % ALL_TIPS.length] ?? ""}
            onLoaded={() => {
              // Stage 2 finished: the room is fully cached, so it can be revealed without a stutter,
              // and stage 3 begins — the match level now builds behind it while the roster fills.
              setRoomShown(true);
              setArmArena(true);
            }}
            onDeploy={() => setPhase("play")}
          />
        </Suspense>
      )}

      {/* ---------- first-run onboarding ---------- */}
      {phase === "lobby" && profileLoaded && !profile.onboarded && (
        <Onboarding
          initialName={profile.name}
          onDone={({ name, character: c, danceId: dance }) => {
            setCharacter(c);
            saveCharacter(c.id);
            const nextLoadout = { ...profile.loadout, active: c.power };
            saveLoadout(nextLoadout);
            setProfile((p) => ({
              ...p,
              name,
              loadout: nextLoadout,
              ownedCharacters: [c.id],
              ownedDances: [dance],
              onboarded: true,
            }));
          }}
        />
      )}

      {/* ---------- splash 1 : boot ---------- */}
      {phase === "boot" && (
        <div className="absolute inset-0 z-50">
          <SplashScene />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(4,7,12,0.15)_20%,rgba(4,7,12,0.92)_92%)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-between px-8 py-10 text-center sm:py-14">
            <div />
            <div className="flex flex-col items-center gap-8">
              <BrandMark />
              {canEnter ? (
                <button
                  type="button"
                  onClick={() => {
                    initSfx(); // first user gesture — unlock audio, then lobby pad starts
                    setPhase("lobby");
                  }}
                  className="rounded-full border border-[var(--hud-accent)]/60 bg-background/40 px-12 py-3 text-[11px] font-bold uppercase tracking-[0.5em] text-foreground backdrop-blur transition hover:bg-[var(--hud-accent)] hover:text-[var(--hud-accent-foreground)] active:scale-95"
                >
                  Enter arena
                </button>
              ) : (
                <p className="animate-pulse text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
                  {bytesDone ? "Preparing lobby" : label}
                </p>
              )}
            </div>
            <div className="w-full max-w-md">
              <ProgressBar value={progress} />
              {!canEnter && (
                <p className="mt-4 min-h-[2.5rem] text-center text-xs leading-relaxed text-muted-foreground transition-opacity duration-300">
                  {ALL_TIPS[tip % ALL_TIPS.length]}
                </p>
              )}
              {canEnter && (
                <p className="mt-3 text-center text-[10px] uppercase tracking-[0.35em] text-[var(--hud-accent)]">
                  Tap Enter to start
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------- lobby ----------
          Mounted during boot as well, hidden behind the splash. That is what lets the Enter
          button be honest: the backdrop, the character and the pet all report in from a real
          render, so tapping Enter reveals a finished lobby instead of an empty stage.

          `opacity-0` and deliberately not `hidden`/`display:none` — a display:none host has no
          box, so the viewers' ResizeObservers would size their canvases to 1x1 and nothing
          would actually warm up. Same trick the arena uses at "deploy". */}
      {(phase === "lobby" || phase === "boot") && (
        <div
          className={
            phase === "lobby"
              ? "absolute inset-0 z-40 overflow-hidden"
              : "pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-0"
          }
        >
          <img
            src={lobbyBackdrop}
            alt="Ironhowl lobby hangar"
            width={1920}
            height={1088}
            onLoad={markBgReady}
            onError={markBgReady}
            className="h-full w-full scale-105 object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(4,7,12,0.96)_3%,rgba(4,7,12,0.15)_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,color-mix(in_oklab,var(--hud-accent)_18%,transparent),transparent_60%)]" />

          {/* accent pool under the character's feet — moved ahead of the models in the DOM so
              it paints behind them instead of over their nameplates */}
          <div className="pointer-events-none absolute bottom-[8%] left-1/2 h-24 w-[26rem] max-w-[70vw] -translate-x-1/2 rounded-[50%] bg-[var(--hud-accent)]/15 blur-3xl" />

          {/* character — the real operative GLB on its unarmed breathing idle, drag to turn.
              Raised off the floor line so the feet clear the nameplate below: the default
              operative is called Howl, and at bottom-[4%] it stood directly on its own name. */}
          <OperativeViewer
            character={character}
            danceId={danceId}
            onClick={() => setEmoteOpen(true)}
            onReady={markCharReady}
            className="absolute bottom-[12%] left-1/2 h-[74%] w-[min(34rem,80vw)] -translate-x-1/2"
          />

          {/* the emote wheel — the "circle" of dances, opened by clicking the operative.
              All dances unlocked; the gating shop is deferred. */}
          {emoteOpen && (
            <EmoteWheel
              active={danceId}
              owned={profile.ownedDances}
              onPick={(id) => {
                setDanceId(id);
                setEmoteOpen(false);
              }}
              onStop={() => {
                setDanceId(undefined);
                setEmoteOpen(false);
              }}
              onClose={() => setEmoteOpen(false)}
            />
          )}

          {/* the pet's own accent pool. Its contact shadow is near-black and so is the lobby
              floor at this height, so the shadow alone would not read. */}
          <div className="pointer-events-none absolute bottom-[11%] left-[calc(50%+7rem)] hidden h-8 w-[9rem] rounded-[50%] bg-[var(--hud-accent)]/20 blur-xl sm:block" />
          {/* equipped pet, standing at its owner's heel — close in and level with the
              character's feet rather than small and set back upstage */}
          <PetViewer
            key={profile.pet}
            pet={PETS[profile.pet]}
            onReady={markPetReady}
            className="absolute bottom-[10%] left-[calc(50%+5rem)] hidden h-[26%] w-[13rem] sm:block"
          />
          <p className="pointer-events-none absolute bottom-[6%] left-[calc(50%+5rem)] hidden w-[13rem] text-center text-[9px] uppercase tracking-[0.3em] text-muted-foreground sm:block">
            {PETS[profile.pet].name}
          </p>

          <div className="pointer-events-none absolute bottom-[3%] left-1/2 -translate-x-1/2 text-center">
            <p className="text-sm font-black uppercase tracking-[0.35em] text-foreground">{character.name}</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">{character.tagline}</p>
          </div>

          {/* team roster — appears whenever the staged variant is a team format */}
          <TeamRoster
            members={teamMembers}
            maxTeam={variant}
            mode={gameMode}
            variant={variant}
            onInvite={() => setFriendsOpen(true)}
          />

          {/* brand, top-left */}
          <div className="absolute left-6 top-6 text-left sm:left-10 sm:top-8">
            <p className="text-2xl font-black uppercase tracking-[0.3em] text-foreground sm:text-3xl">
              Iron<span className="text-[var(--hud-accent)]">howl</span>
            </p>
            <div className="mt-2 h-px w-40" style={{ background: "var(--gradient-hud)" }} />
            <p className="mt-2 text-[9px] uppercase tracking-[0.45em] text-muted-foreground">
              Frostline Arena · Season 01
            </p>
          </div>

          {/* profile widget, top-right */}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="absolute right-6 top-6 flex items-center gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3 text-left backdrop-blur-md transition hover:bg-card active:scale-95 sm:right-10 sm:top-8"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hud-accent)]/15 text-[var(--hud-accent)]">
              <UserCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground">{profile.name}</p>
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.2em] text-[var(--hud-accent)]">
                Lvl {levelFromProfile(profile)} · {profile.gold} Gold · {profile.shards} Shards
              </p>
            </div>
          </button>

          {/* left rail — vertical menu, Free Fire style */}
          <div className="absolute left-4 top-1/2 flex -translate-y-1/2 flex-col gap-3 sm:left-6">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <Users className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Characters</span>
            </button>
            <button
              type="button"
              onClick={() => setLoadoutOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <LayoutGrid className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Loadout</span>
            </button>
            <button
              type="button"
              onClick={() => setPetOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <PawPrint className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Pet</span>
            </button>
            <button
              type="button"
              onClick={() => setDanceShopOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <PartyPopper className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Dances</span>
            </button>
            <button
              type="button"
              onClick={() => setGarageOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <Car className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Garage</span>
            </button>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <MessageSquare className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Chat</span>
            </button>
          </div>

          {/* right rail — vertical menu, Free Fire style */}
          <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col gap-3 sm:right-6">
            <button
              type="button"
              onClick={() => setStoreOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <Store className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Store</span>
            </button>
            <button
              type="button"
              onClick={() => setVaultOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <Shirt className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Vault</span>
            </button>
            <button
              type="button"
              onClick={() => setArmoryOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <Crosshair className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Armory</span>
            </button>
            <button
              type="button"
              onClick={() => setFriendsOpen(true)}
              className="flex h-12 w-40 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95"
            >
              <UserPlus className="h-5 w-5 shrink-0 text-[var(--hud-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">Friends</span>
            </button>
          </div>

          {/* bottom-left: settings */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="absolute bottom-8 left-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-card/60 text-foreground backdrop-blur-md transition hover:bg-card active:scale-95 sm:bottom-10 sm:left-6"
          >
            <Settings className="h-5 w-5" />
          </button>

          {/* bottom-right: mode + party-size chip, then play */}
          <div className="absolute bottom-8 right-4 flex flex-col items-end gap-3 sm:bottom-10 sm:right-6">
            {teamWarning && (
              <p className="max-w-[16rem] rounded-xl border border-red-500/50 bg-red-500/15 px-3 py-2 text-right text-[9px] font-bold uppercase tracking-[0.15em] text-red-200 backdrop-blur">
                {teamWarning}
              </p>
            )}
            {/* staged-mode chip: left half opens the mode selector, the person-count
                badge opens the party-size popup (Free-Fire style). Outer wrapper is
                NOT clipped so the popup can escape upward; only the button row clips. */}
            <div className="relative">
              <div className="flex items-stretch overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setModeOpen(true)}
                className="flex items-center gap-2.5 px-3 py-2 text-left transition hover:bg-card/80"
              >
                <img
                  src={MAP_THUMB[mapId]}
                  alt=""
                  width={40}
                  height={40}
                  className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-border/60"
                />
                <span className="flex flex-col">
                  <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                    {matchType === "ranked" ? "Ranked" : "Casual"}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground">
                    {MODES[gameMode].name}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => MODE_VARIANTS[gameMode].length > 1 && setVariantOpen((v) => !v)}
                aria-label="Change party size"
                className={`flex items-center gap-1 border-l border-border/50 px-3 transition ${
                  MODE_VARIANTS[gameMode].length > 1 ? "hover:bg-[var(--hud-accent)]/15" : "cursor-default opacity-90"
                }`}
              >
                <PartyIcons count={variant} />
              </button>
              </div>

              {variantOpen && MODE_VARIANTS[gameMode].length > 1 && (
                <div className="absolute bottom-full right-0 z-10 mb-2 flex gap-2 rounded-xl border border-border/60 bg-card/95 p-2 shadow-[var(--shadow-hud)]">
                  {MODE_VARIANTS[gameMode].map((size) => {
                    const active = size === variant;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setVariant(size);
                          setVariantOpen(false);
                        }}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 transition ${
                          active
                            ? "border-[var(--hud-accent)]/70 bg-[var(--hud-accent)]/15"
                            : "border-border/50 hover:border-[var(--hud-accent)]/40"
                        }`}
                      >
                        <PartyIcons count={size} />
                        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-foreground">
                          {variantLabel(gameMode, size)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={deploy}
              className="group flex h-16 items-center gap-4 rounded-2xl bg-[var(--hud-accent)] pl-10 pr-8 text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)] transition hover:brightness-110 active:scale-95"
            >
              <span className="text-base font-black uppercase tracking-[0.4em]">Play</span>
              <Play className="h-6 w-6 fill-current transition group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      )}

      {/* ---------- splash 3 : deploying ----------
          Stays up over the waiting island until the island has drawn a frame, which is what keeps
          the handover clean: the player never sees an empty dark room, and if the room's GLB fails
          outright they simply get this splash for the whole wait, exactly as before. */}
      {phase === "deploy" && !(useWaitingRoom && roomShown) && (
        <div className="absolute inset-0 z-50">
          <SplashScene mode="loading" recede />
          <div className="absolute inset-0 bg-[rgba(4,7,12,0.82)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 px-8 text-center">
            <BrandMark size="sm" />
            <div className="w-full max-w-sm">
              <p className="text-[10px] uppercase tracking-[0.5em] text-[var(--hud-accent)]">
                {arenaReady ? "Arena ready" : "Building the arena"}
              </p>
              <div className="mt-5">
                <ProgressBar value={arenaReady ? 1 : 0.72} />
              </div>
              <p className="mt-6 min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
                {ALL_TIPS[tip % ALL_TIPS.length]}
              </p>
              {arenaReady && (
                <p className="mt-3 text-[10px] uppercase tracking-[0.35em] text-[var(--hud-accent)]">
                  Dropping in…
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {modeOpen && phase === "lobby" && (
        <ModeSelect onDeploy={selectMode} onClose={() => setModeOpen(false)} />
      )}

      {friendsOpen && phase === "lobby" && (
        <FriendsPanel onClose={() => setFriendsOpen(false)} onInvite={inviteFriend} />
      )}

      {chatOpen && phase === "lobby" && <ChatPanel onClose={() => setChatOpen(false)} />}

      {settingsOpen && (
        <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
      )}

      {profileOpen && (
        <ProfileCard profile={profile} character={character} onChange={setProfile} onClose={() => setProfileOpen(false)} />
      )}

      {storeOpen && (
        <StorePanel profile={profile} onChange={setProfile} onClose={() => setStoreOpen(false)} />
      )}

      {danceShopOpen && (
        <DanceShop character={character} profile={profile} onChange={setProfile} onClose={() => setDanceShopOpen(false)} />
      )}

      {garageOpen && (
        <CarShop profile={profile} onChange={setProfile} onClose={() => setGarageOpen(false)} />
      )}

      {pickerOpen && (
        <CharacterPicker
          selected={character}
          profile={profile}
          onSelect={(c) => {
            setCharacter(c);
            saveCharacter(c.id);
            const nextLoadout = { ...profile.loadout, active: c.power };
            setProfile((p) => ({ ...p, loadout: nextLoadout }));
            saveLoadout(nextLoadout);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {loadoutOpen && (
        <LoadoutPanel
          loadout={profile.loadout}
          characterPowerId={character.power}
          onChange={(l) => {
            setProfile((p) => ({ ...p, loadout: l }));
            saveLoadout(l);
          }}
          onClose={() => setLoadoutOpen(false)}
        />
      )}

      {petOpen && (
        <PetPicker
          selected={profile.pet}
          profile={profile}
          onSelect={(id) => {
            setProfile((p) => ({ ...p, pet: id }));
            savePet(id);
          }}
          onClose={() => setPetOpen(false)}
        />
      )}

      {vaultOpen && <VaultPanel profile={profile} onClose={() => setVaultOpen(false)} />}
      {armoryOpen && <ArmoryPanel profile={profile} onClose={() => setArmoryOpen(false)} onChange={(next) => { setProfile(next); saveProfile(next); }} />}

      {/* ---------- matchmaking: the wait, in the lobby ----------
          Deliberately last in the tree and above the panels: it is the one thing on the lobby screen
          that must stay visible while the player opens the store, the armory or their profile. It
          does not block them — the card is the only interactive part of it. */}
      {search && (
        <MatchmakingCard
          found={searchFound}
          players={searchPlayers}
          elapsed={searchElapsed}
          average={search.average}
          ready={arenaReady}
          onCancel={cancelSearch}
        />
      )}
    </div>
  );
}

/** Row of person silhouettes — 1, 2 or 4 — that reads the party size at a glance. */
function PartyIcons({ count }: { count: number }) {
  const n = Math.max(1, Math.min(4, count));
  return (
    <span className="flex items-center -space-x-1 text-[var(--hud-accent)]">
      {Array.from({ length: n }).map((_, i) => (
        <User key={i} className="h-3.5 w-3.5" strokeWidth={2.5} />
      ))}
    </span>
  );
}

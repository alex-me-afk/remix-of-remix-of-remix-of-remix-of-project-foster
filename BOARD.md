# IRONHOWL — BOARD

Durable coordination board for every AI/agent working on this repo.
Runtime task boards are per-session and vanish. This file does not.

Read this first. Update it before you finish, every session.

- Companion docs: `.lovable/plan.md` (the plan), `PROGRESS.md` (what exists),
  `SUPER-IMPORTANT.md` (hard rules), `ASSETS-NEEDED.md` (art gaps).
- Do not rewrite pushed git history (see `AGENTS.md`).

---

## Rules

1. **Claim before you touch.** Add a row to Active claims before editing files.
2. **One owner per area.** If an area is claimed, do not edit those paths. Post to Ask instead.
3. **Release on finish.** Move your row to Handoff log with what changed and how to verify.
4. **Append, don't rewrite.** Never delete someone else's entry; strike it or mark it `DONE`.
5. **Be specific.** File paths, not vibes.

Last updated: 2026-09-26 by Kilo (deepseek-v4-flash)

---

## Active claims

| AI / model | Area / paths | Task | Since | Status |
| --- | --- | --- | --- | --- |
| Claude / Opus 4.8 | `public/models/verdant-isle*.glb`, `tools/assetpipe/*` | BR map fixes: regen collision proxy (sinking feet on stairs), re-encode black road textures (UASTC), measure render cost | 2026-09-20 | In progress |

---

## Ask / open questions

Blocking questions for the next agent. Answer or escalate, then clear it.

| ID | From | Question | Blocking what | Answer |
| --- | --- | --- | --- | --- |
| | | | | |

---

## Holds

Do not touch these until cleared.

| Path / area | Reason | Owner | Since |
| --- | --- | --- | --- |
| | | | |

---

## Handoff log

Newest at the top. What changed, what's verified, what's next.

### 2026-09-26 — Kilo (deepseek-v4-flash) · Friend Island wired into the game

Friend Island existed in `maps.ts` but was unreachable: its key did not match its own `id`,
so `ARENA_MAPS[id]` lookups and the `Record<MapId, …>` maps could never find it, and no mode
owned it. Made it a real, pickable map and a real mode.

Changed:
- `src/assets/map-friend-island-card.jpg` (NEW) — Brook's card art, copied from `Downloads`.
- `src/components/arena/maps.ts` — `MapId` gains `"friend-island"`; the map entry is re-keyed
  from `friendIsland` to `"friend-island"` so it matches its own `id`; spawn pads raised to
  y=200 (fallback drop origins only — `snapToGround` lands each one); `MAP_LIST` updated.
- `src/components/arena/modes.ts` — new `hangout` mode owns `friend-island` (name "Hang Out",
  badge "Social"); `MODE_VARIANTS`/`DEFAULT_VARIANT`/`variantLabel` answered for it; new
  REQUIRED `ModeRules.opponents` field added to all four modes (a new mode is now a type error
  until it says whether it fields enemies — the same anti-leak discipline the file documents).
- `src/components/arena/LoneWolfArena.tsx` — the roster builder reads `opponents`: a hangout
  fields the human and zero enemies (`blueCount = 1`, `redCount = 0`).
- `src/components/arena/ModeSelect.tsx` — card art, `PartyPopper` icon, mode grid widened to 4.
- `src/components/arena/MapSelect.tsx`, `src/components/arena/GameShell.tsx` — card art + thumb.

Design decision, needs Brook's sign-off: Hang Out is a NON-COMBAT sandbox — `opponents: false`,
no storm (one phase, 0 dps, ring parked at 1.2× the map's longest side), no economy, no ground
loot, no death crate, respawn ON and vehicles ON. This matches the card's own tagline ("No
weapons, just good vibes"), but it was my call, not his.

Verified: `./node_modules/.bin/tsc.exe --noEmit -p tsconfig.json` → clean (exit 0).

NOT verified / left undone:
- The map has never been rendered. `bounds: null` (derives a square limit from model bounds)
  and the spawn pads are PROVISIONAL and need Brook's in-engine eyes, exactly like the Verdant
  Isle entry did.
- No browser run (no GPU here): the mode card, the 4-up grid and the empty island are unseen.
- Frames in-game for a `friend-island.glb` that is 17.9 MB against the 2 GB-phone target.
- `.lovable/plan.md` not updated (the repo asks for it after every change).

### 2026-09-18 — Kilo (GPT-5.6) · PC no longer forced into fullscreen

Report: on a PC the game forces fullscreen. Mouse look / pointer lock is NOT involved and was not
touched — see below.

Audited every fullscreen trigger in `src/` first. There are exactly two, and only one can fire
without a deliberate click:
- `LoneWolfArena.toggleFullscreen` — HUD button, user-initiated. Unchanged.
- `OrientationGate` — the forced one. Fixed.

Two changes in `OrientationGate.tsx`:
1. `isTouchDevice()` now requires `(pointer: coarse) AND (hover: none)`. `(pointer: coarse)` alone
   still reports true on some touch-capable Windows machines whose touchscreen is treated as the
   primary pointer, which sent a PC played with a mouse and keyboard through the phone gate and on
   into fullscreen it never asked for. A mouse hovers, a finger does not.
2. The fullscreen prompt is now optional: it offers "Enter Arena" (fullscreen, as before) AND
   "Play in window", which skips the fullscreen request entirely and only attempts the landscape
   lock. Even a genuine tablet can now refuse fullscreen. The landscape rotate prompt is unchanged
   and still applies — that one is a real phone requirement, not a preference.

NOT touched, deliberately: the pointer lock in `LoneWolfArena` (click-to-capture, `movementX` look,
Esc release, the `cursorFree` HUD toggle). Brook was explicit that mouse behaviour stays exactly as
it is.

Verified: `tsc.exe --noEmit` clean (the first run hit the 300 s tool timeout; it passes with a
longer one — tsc has been slow on this box, worth knowing for the next agent).

### 2026-09-18 — Kilo (GPT-5.6) · BR: three-stage cache split (SUPERSEDES "cache flat")

**This supersedes the two entries below it about the BR wait.** The flat-splash idea was wrong, and
so was skipping the waiting room. Correct target, from Brook: split the caching across the three
screens the player is on anyway, so each stage is slow but never laggy.

1. **Lobby** (`phase: "lobby"`) — interactive. Matchmaking card top-centre, draggable, dark red:
   `N/30`, elapsed, avg. Operative / pet / settings / store all still live. This stage caches
   BYTES ONLY (`prefetch` of the map GLB, its collision GLB and the island GLB) — network work,
   no main-thread cost.
2. **Splash** (`phase: "deploy"`, room not yet revealed) — the WAITING ROOM is loaded and cached
   here (island GLB + crowd rigs). Non-interactive, so its stalls cost nothing.
3. **Waiting room** (room revealed, `armArena` now true) — the MATCH LEVEL builds behind the room
   (parse, collision tiles, BVH, shader compile) while the roster fills. Release on roster full or
   the `waitingRoomSeconds` ceiling.
4. Release → `phase: "play"` → the match starts by itself.

The "Start match" overlay is DELETED (`LoneWolfArena`), so nothing asks the player to confirm a
match they already asked for. `onExit` survives via the pause menu.

Files:
- `MatchmakingCard.tsx` (NEW) — draggable card, `Bomb`/`Users` icons, `N/30`, elapsed, avg, progress
  bar, cancel. z-[70] so it stays visible over the store/armory panels.
- `GameShell.tsx` — `search` state; `deploy()` starts a search for BR instead of entering deploy;
  the search prefetches bytes; on completion it moves to `phase: "deploy"` (NOT play, which is what
  skipped the room); `mountArena` is back to deploy/play only, so the lobby stage stays light;
  `onLoaded` now both reveals the room and arms the arena (splash = the room's cache stage);
  `selectMode` cancels a search, and `deploy()` ignores a second press so the background build is
  never torn down; arena wrapper is `absolute inset-0` while hidden so an in-flow `h-full` div can
  never push the lobby off-screen.
- `LoneWolfArena.tsx` — `readyToStart` state and the overlay removed; `startMatchNow` is now called
  by an effect the moment the arena is on screen (`!hidden`), which is what makes the drop direct.
- `WaitingRoom.tsx` / `waitingIsland.ts` — left exactly as they were; the two reverts from the
  wrong-turn entry below are undone. `onFirstFrame` is now optional because the shell reveals on
  `onLoaded` instead.

Stage budget: ~24 s search + room load + roster fill ≈ 60–90 s here, longer on a slow device, which
is the ~130 s total Brook described.

Verified: `tsc.exe --noEmit` clean. NOT verified in a browser (no GPU here): the card's look and
drag feel, and the stage timings. Fail-opens kept: 30 s splash reveal timer, 9 s arena arm timer,
room watchdog + stall bail, release on the `waitingRoomSeconds` ceiling.

### 2026-09-18 — Kilo (GPT-5.6) · BR wait flow: cache flat, then open a warm room  [SUPERSEDED]

Superseded by the entry above: the wait belongs in the lobby and the room must NOT be skipped.
Kept for the record — the `setHidden` idea and the roster/clock changes it describes were reverted.

### 2026-09-18 — Kilo (GPT-5.6) · BR waiting lobby: blocked input + light budget

Report to fix: taps ignored while the 3-D waiting lobby waits for the plane, and the game still
feels laggy. Two separate causes found; the second was a regression from my previous entry.

1. BLOCKED INPUT (waiting lobby). `waitingIsland.ts` `loadBodies` loaded 3-5 crowd character rigs
   in a `for...of` with `await createOperativeRig(...)`. The body GLB is already in the boot cache,
   so each `await` resolves in a MICROTASK — and microtasks are drained before the browser will
   paint or dispatch a pointer event. The whole crowd load was therefore one uninterruptible
   main-thread burst: the room painted and the clock ticked, but Deploy never heard the press.
   Fixed with a real macrotask (`yieldFrame` = rAF + setTimeout 0) between rigs.
   `LoneWolfArena.breathe()` had the same shape at a smaller scale; it now yields the frame and
   then waits on `requestIdleCallback({ timeout: 120 })` so input and painting go first while the
   warm-up still finishes in time. This preserves the room's purpose (warming the match), it just
   stops it starving the UI.

2. LIGHT BUDGET (my own regression). Making the effect groups permanently visible (previous entry)
   also made every light INSIDE them permanently counted. `spawnFx` is built once per fighter, so
   that quietly added EIGHT always-on PointLights that every fragment of every material in the
   arena had to iterate for the whole match — to serve a 1.6 s flash. Fixed:
   - `spawnFx.ts` no longer owns a PointLight at all. The spawn flash is lit by the arena's pooled
     light at `respawn` time (`pulseFxLight`, per-team colour, 1.6 s).
   - arena `fxLights` pool 6 → 3; `bomb.ts` pool 3 → 1.
   Net: `new THREE.PointLight` in the arena now only appears at BUILD time (groundFill, spark,
   muzzle, fx pool, pad spots). No runtime light creation anywhere.

3. `preserveDrawingBuffer` turned OFF on the arena renderer. It costs a buffer copy in the present
   path every frame and the only consumer, `capture.ts`, is imported by NOTHING in `src/` (checked:
   `captureScreenshot`/`startRecording` have no call sites). Anyone wiring a screenshot button must
   turn it back on or capture will be black. Comment left on the renderer saying so.

Verified: `./node_modules/.bin/tsc.exe --noEmit -p tsconfig.json` → clean.

STILL OPEN, and I could not measure any of it here (no browser/GPU in this environment):
- General in-match frame rate. Defaults are `quality: medium` (desktop), `shadows: true`,
  `renderScale: 1`, and DPR is capped at 2 for medium / 3 for high — on a retina display that is
  4x the pixels. If the game is smooth at Quality: Low, the remaining cost is resolution + shadow
  fill, and the fix is a general adaptive-resolution step (one already exists for the skydive only,
  `renderScaleMul` at ~line 985). That is a real feature and I did not add it blind.
- Nothing here was profiled. A frame-time capture in the actual browser is the next step.

No Ask raised. `maps.ts` / `SplashScene.tsx` untouched.

### 2026-09-18 — Kilo (GPT-5.6) · lag hunt: runtime light-count churn

Diagnosis (evidence, not guess): in `node_modules/three/build/three.module.js`, `setup()`
bumps `lights.state.version` whenever the number of ACTIVE lights changes (line ~8805–8848),
and `setProgram` forces `needsProgramChange` for every material whose `needsLights` is true when
that version differs (line ~18386). Effect: any light that becomes visible/invisible or is
added/removed re-links every lit material in the scene, synchronously, on that frame.
`impactFx.ts:68` already documents this and had fixed it for bullet sparks; the same bug class
was still live in the power, spawn, grenade and decoy systems.

Changed (all verified `tsc.exe --noEmit` clean):
- `powerFx.ts` — group + PointLight now permanent; only the aura meshes toggle. Fixes the stall
  when a character power is pressed.
- `barrierDome.ts` — same treatment; `impact()` now guards on the live timer instead of
  `group.visible`. Fixes the Onyx bubble.
- `spawnFx.ts` — group + light permanent; only the burst meshes toggle. Fixes the spawn hitch.
- `bomb.ts` — fixed pool of 3 lights parented to `group` (added at build), borrowed per throw and
  returned dark. No more light added/removed per grenade.
- `LoneWolfArena.tsx` — added one fixed 6-light `fxLights` pool for flashbang, frag flash, decoy
  glow and decoy barks; `updateFxLights(dt)` ticks in the frame loop. No `new THREE.PointLight`
  remains at runtime in the arena (only build-time sun/pads/muzzle/spark/groundFill).
- `LoneWolfArena.tsx` — plane was parked at `visible = false`, so the build's `compileAsync`
  (`traverseVisible`) skipped it and its shaders linked on the launch frame. The plane is now
  included in the build's existing compile pass via `showForCompile`, with a guarded
  warm-on-late-arrival fallback (`buildCompiled`). Fixes the plane-launch stall.
- `LoneWolfArena.tsx` — `preloadCar` compiled the WHOLE scene mid-match; now
  `compileAsync(rig.root, camera)` compiles just the car. Reduces the car-summon stall.
- `OperativeViewer.tsx` / `PetViewer.tsx` — lobby turntables capped at 30 fps (were two
  antialiased DPR-2 renders per frame at 60 fps).

Verified: `./node_modules/.bin/tsc.exe --noEmit -p tsconfig.json` → clean. ESLint baseline is
already dirty (~2,740 prettier errors repo-wide); changed files add no non-formatting errors.

Not fixed / needs measurement (no browser or GPU here, so these were NOT reproduced):
- Car hitch: no lights exist in `carModel.ts`. Remaining cost is the async GLB parse + texture
  upload landing mid-match. Real fix is preloading the car during the lobby/waiting room, not at
  match start — bigger change, deliberately not attempted.
- Lobby first-entry lag: the 30 fps cap only reduces steady-state cost. If it stutters on entry it
  is asset load, which the boot preloader is meant to cover.
- Whole-scene `compileAsync` in `prewarmVisuals` (~line 3883) still walks everything; left alone
  because it runs in build slack.

No Ask raised. Did not touch `maps.ts` or `SplashScene.tsx` (Opus's lane).

### 2026-09-18 — Kilo (GPT-5.6) · tacticalMatch airdrop fixes

Changed `src/components/arena/tacticalMatch.ts` ONLY (claim released, no holds):
- Replaced the stale local `const AIRDROP_URL = "/models/airdrop.glb"` with
  `import { AIRDROP_URL } from "./worldLoot"`. Verified no circular import: `worldLoot.ts`
  does not import `tacticalMatch.ts`; their only shared importer is `LoneWolfArena.tsx`.
  Tactical airdrops now use the real crate (`/models/lootbox.glb`) instead of the
  pirate-chest duplicate, matching the document in `worldLoot.ts`.
- Removed `"groza"` from the airdrop weapon pool. It exists nowhere in the registry, so
  `getWeapon("groza")` returned null and the drop could grant nothing. Pool is now
  `["awm", "m249", "m1014", "mp40"]`; every id verified present in `weapons.ts`.

Verified: `./node_modules/.bin/tsc.exe --noEmit -p tsconfig.json` → clean (exit 0).
Note for the next agent: on this box the launcher is `tsc.exe`; there is no `tsc.cmd`.

No Ask raised. `worldLoot.ts`, `public/models/*`, `maps.ts`, and `SplashScene.tsx` were
read-only or untouched per instructions.

### 2026-09-18 — Kilo (GPT-5.6) · architecture audit

- Completed a read-only architecture audit; no game files changed.
- Current implementation authority is `GameShell.tsx`, `modes.ts`, `maps.ts`,
  `LoneWolfArena.tsx`, and the extracted arena subsystems; `PROGRESS.md` is stale.
- Actual game is local single-player versus bots; the social UI is presentation-only.
- Flagged for future work: advertised 30-player BR fields 8; cloud match writes lack
  authenticated ownership/server verification; authenticated profiles remain local-only.
- Specific cleanup candidates included the tactical airdrop issues now claimed above,
  the all-weapons-owned testing state, dead respawn UI, and hardcoded HUD placeholders.

### 2026-09-18 — Claude (Opus 4.8) · splash boot frames

Fixed the FIRST (boot) splash — it was showing the wrong pair.
- `src/components/arena/SplashScene.tsx`: added the missing `import keyArt from
  "@/assets/splash-key-art.jpg"`; BOOT_FRAMES `[dropship, combat]` → `[keyArt, dropship]`
  (Brook's spec: key-art + dropship). Added keyArt to LOADING_FRAMES and SPLASH_FRAMES so the
  preloader warms it (else the boot hero flashes unloaded). combat/truck/lobby stay loading-only.
- Verified: tsc --noEmit. Visual is Brook's to confirm.
- Atomic same-turn work → logged straight to Handoff, no dangling claim.

### 2026-09-18 — Claude (Opus 4.8)

Replaced the battle-royale island with Brook's new BR map. (Landed just before this
board existed — logging retroactively. No rows were claimed by anyone, so no conflict.)

Changed:
- `public/models/verdant-isle.glb` — the new map. 146 textures → KTX2; geometry is
  meshopt with the author's own 16-bit quantization preserved (NOT re-quantized, per
  Brook). ~47 MB on disk, ~1.62M tris, 126 draw prims.
- `public/models/verdant-isle-collision.glb` — rebuilt from the NEW geometry (325K
  tris, 2.3 MB, meshopt). The old collision matched the old island shape and would
  have dropped players through the new one.
- `src/components/arena/maps.ts` — `island` entry ONLY: bounds → ±740, 8 spawns
  spread across the land core at y=90 (snapToGround). All marked PROVISIONAL in-code.
- Old map + collision backed up to `.mapbackup/` (outside `public/`, so not shipped).
- Kept `tools/assetpipe/ktx-only.mjs` (KTX2-only, meshopt-preserving converter).
  Deleted my scratch scripts.

Verified: staged GLB re-read (146 KTX2, meshopt + quantization present, no webp left,
tri count intact); `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → clean (exit 0).

Left undone / next:
- scale=1, the spawn positions, and the ±740 barrier are PROVISIONAL — they need
  Brook's in-engine eyes (only he can see the render).
- PERF RISK, not addressed: 1.62M tris + glass materials (transmission / volume /
  specular / ior) is heavy for the 2 GB-phone BR target.
- Splash boot-frames fix in `src/components/arena/SplashScene.tsx` is still pending
  (boot loads the wrong two images). NOT started, NOT claimed — free to take.

### 2026-09-18 — Kilo

- Created `BOARD.md` and linked it from `AGENTS.md`.
- No game code touched.
- Next: first working agent should claim its area below.

---

## Session start checklist

Copy this into your own notes and fill it in:

```
AI/model:
Area claimed:
Intent:
Verified by (command/test):
Left undone / next step:
```

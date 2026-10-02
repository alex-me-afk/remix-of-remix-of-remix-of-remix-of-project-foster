# IRONHOWL — PROGRESS (full audit of what exists right now)

Companion to `.lovable/plan.md`. This file = what is ALREADY built and working.
After every change the AI must update `.lovable/plan.md` (mark `X` on done items, or log off-list work).
Last full audit: 2026-08-19.

---

## 1. App shell & boot
- Single route app: `src/routes/index.tsx` mounts `GameShell` — no page navigation, everything is in-canvas.
- Phase machine: `boot → lobby → deploy → play`, each with its own screen.
- Asset preloader (`preload.ts`): streams all models, textures and audio with a live progress bar + status label before the lobby unlocks.
- Deploy splash: holds until the 3D map is fully built, with a minimum time so it never flickers; now shows percentage readout and extra mobile tips.
- Loading tips: 4 rotating gameplay hints cycling every 3.2s on the deploy screen.
- Orientation gate: asks mobile players to rotate to landscape before playing.
- Brand mark, splash key art and lobby backdrop images.
- FPS counter overlay (toggleable).
- Runtime error capture and error-page hooks for debugging.

## 2. Lobby
- 3D-lit lobby dashboard with Play, Settings, Character, Map, Profile and Store entries.
- Character picker: 6 operatives, each with tagline, colour, accent and a signature power; live 3D capsule preview.
- Map select: choose the arena before deploying.
- Mode select: choose Lone Wolf, Clash Squad or Battle Royale; toggle Ranked vs Casual.
- Weapon shop / armory: buy and equip weapons with credits; sell-all refund.
- Weapon slots: two heavy slots + sidearm, with slot switching and drop-weapon.
- Selected character persists in localStorage.
- Loadout panel: one active power + up to three passive skills + one tactical item; tactical choices include Bounty Token (bonus gold on first kill), Armor Crate (spawn with random vest + helmet) and Leg Pockets (start with backpack level 2).

## 2. Progression & identity
- Guest login: persistent guest ID generated on first boot, stored in localStorage.
- Operator profile: callsign, level, guest ID, K/D, win rate, total kills, deaths and headshot best.
- Local profile card: edit callsign, view career stats, gold, diamonds, and claim Booyah Pass rewards.
- Gold currency: earned from every match (base pay + win + kills + headshot bonus), persists across sessions.
- Diamonds currency: premium currency stored in profile, awarded from Luck Royale and Booyah Pass rewards.
- Match rewards: Lone Wolf Arena reports match results and applies gold/XP/character progress to the profile.
- Ranked ladder: Ranked matches award rank points; tier updates in profile (Bronze → Heroic).
- Luck Royale store: gacha-style spinning wheel in the lobby that spends Gold for random gold, diamond, XP or bonus spins.
- Booyah Pass tier tracking with claimable rewards: each tier grants gold and/or diamonds; UI lists claimable tiers and one-tap claim.
- Character Link system: characters beyond the starter are unlocked by playing a set number of matches with them; picker shows lock status and remaining matches.

## 3. Characters & powers
- Roster: Howl (Frostline vanguard), Ember (close-quarters rusher), Vireo (recon/flanks), Onyx (bubble breacher), Lumen (support/walls), Nyx (silent marksman).
- 7 active abilities: Coldsnap (−45% damage taken), Overburn, Slipstream, Bulwark, Lifespring, Deadeye, Emberveil.
- Each power has duration, cooldown, HUD ring, colour and aura VFX (`powerFx.ts`).
- Power effect channels: damage taken, damage dealt, fire rate, recoil, move speed, HP regen, one-shot shield, instant reload, projected barrier dome.
- Barrier dome (`barrierDome.ts`): projected bubble that blocks all incoming fire while active.

## 4. Maps & world
- Frostline Depot — 2v2 industrial duel, fixed blue/red spawns.
- Timber Outpost — 4v4 woodland compound, separate low-poly collision mesh, ground-snapped spawns, fenced hard bounds.
- Map barrier system (`mapBarrier.ts`): invisible hard walls so players can never leave the arena.
- Procedural arena scene builder (`arenaScene.ts`) for the base compound.
- Day skybox with configurable palette and horizon (`skybox.ts`).
- Baked vertex lighting (`bakeLighting.ts`) — fast lighting path plus blob shadows.
- Weather (`weather.ts`): GPU-only rain and snow, max two draw calls, plus lightning flashes that brighten sky/fog and trigger delayed thunder.
- Collision system (`collision.ts`): merged collider, tiled collision, lazy tile warm-up, nearby-tile queries, step-up and wall probes.
- Collision debug view for development.

## 5. Weapons
- 15 weapons: AK47, M4A1, SCAR, Treatment Rifle (Assault), MP40, UMP (SMG), M1014, SPAS12 (Shotgun), AWM, KAR98K, Treatment Sniper (Sniper), M249 (Heavy), Desert Eagle (Pistol), Fists, Combat Knife (Melee).
- Per-weapon stats: price, damage, fire rate, range, magazine, shop art.
- Fire modes: auto, single, bolt-action, melee — each with interval, cycle time, pellet count, spread, recoil and scope zoom.
- Magazines and reserve ammo per weapon (e.g. M249 100/200, AWM 5/20).
- Reload: arcade 0.5s rack for every gun, with auto-reload-when-empty option and dry-fire feedback.
- Damage profiles: range falloff, headshot multiplier, per-zone damage.
- Treatment Rifle and Treatment Sniper: shooting teammates restores HP (green tracer + popup), shooting enemies still deals reduced damage.
- Bullet spread and recoil applied per shot, plus tracers.
- Weapon attachments: muzzle, silencer, foregrip, magazine, stock and scope slots that modify damage, range, magazine size, reload speed and recoil; owned attachments persist and apply during live fire.

## 6. Combat
- Hitscan shooting with raycast against fighters, walls and level geometry.
- Headshot / body hit zones with distinct damage and popup colours.
- Damage numbers projected into screen space over the victim.
- Hit markers, impact FX with surface-coloured sparks, damage flash vignette and screen shake.
- Aim assist: Off / Light / Standard / Strong, with target acquisition, lock tracking, aim heaviness and manual-aim override.
- ADS / scope with per-weapon zoom and separate scoped sensitivity.
- Gloo walls (`glooWall.ts`): 3.6×2.5×0.9 deployable cover with its own HP, damage states and destruction; two placement modes (ghost aim-and-place, or instant drop).
- Bombs (`bomb.ts`): 5s fuse, 5m radius, 300 damage, physics arc with live trajectory preview, different throw power when jumping.
- Explosion FX with radius-scaled blast.
- Medkits: timed channelled heal that cancels if you move.
- Energy Point (EP) system: yellow reserve bar that trickles into HP when wounded.
- Inhalers: instant small HP + EP top-up usable while moving (`F` / touch chip), 2 charges.
- Mushroom pickups: ground spawns that grant +30 EP on contact and regrow after 25 s.
- Bot AI (`botAi.ts`): four difficulty tiers (Recruit/Regular/Veteran/Nightmare) scaling reaction, accuracy falloff, damage, headshot chance, move speed, aggression, strafe, burst length and retreat threshold; tactical state machine (hunt / engage / reposition / retreat), collision-aware sliding movement, throttled line-of-sight probes and firing discipline. Enemy skill is selectable in Settings > Gameplay.
- Safe zone / electrical storm: a shrinking circle that starts covering the arena and damages anyone outside it, forcing fights to a central duel ring.
- Throwables: frag (5s fuse, 300 dmg), flashbang (1.7s fuse, 16 m blind — whiteout for the player, bots hold fire ~3s), smoke (billboard cloud that blocks bot line of sight for 9s) and decoy (fake gunshots, minimap bait, draws bots). Cycle with `G` on desktop or the chip above the grenade button on touch.
- Melee deflection: Pan, Titanium Bat and Katana block ~35% of shots that hit the back; available in the shop and on some bots.
- Armor system (vests + helmets): level 1-4 pickups reduce body/headshot damage with durability that degrades as it absorbs hits; rarity-colored 3D world pickups and HUD durability strip.
- Backpack system: level 1-3 bags with capacity/level shown in HUD; Leg Pockets tactical starts the player at backpack level 2.
- FF Coins: yellow ground tokens dropped by eliminated fighters and auto-picked up near the player; count shown in HUD.

## 7. Movement & controls
- Desktop: WASD move, jump, sprint, crouch, prone, reload, gloo wall, bomb, medkit, character power, shop — all rebindable.
- Non-QWERTY keyboard detection: bindings keep physical position and are relabelled to the user's printed keys.
- Sprint and ADS each switchable between Hold and Toggle.
- Pointer lock mouse look, wheel input, fullscreen mode with reserved-key handling.
- Prone lowers eye height; crouch changes profile.
- Touch controls: movement stick (210px), sprint indicator, larger fire button (104px) with press feedback, scope toggle, jump, crouch, prone, gloo wall, medkit, bomb and backpack.
- Controls editor: drag to reposition, scale and hide any individual touch button; layout persists.
- Touch look with separate touch sensitivity and multi-pointer tracking.

## 8. Match flow
- Round-based match: countdown → live → intermission → match end, with configurable kills-to-win-round and rounds-to-win-match.
- Quick match mode (shorter rounds).
- Manual "Start match" overlay after map load lets players skip the warmup wait.
- Respawn timer per fighter with spawn FX.
- Score tracking per team, plus personal kills/deaths.
- Kill feed: last 6 kills with killer, victim, team colours and weapon.
- Kill streak banners: Double / Triple / Quad kill, Wolfpack, On a roll (3), Rampage (5), Unstoppable (8), Lone wolf (every 5 after).
- Polished round/match summary card with Booyah/Defeat banner, K/D and rounds, plus a full-width Play Again CTA.
- Victory stinger on match win, auto-restart into the next match.
- End-of-match results saved to the cloud, then the leaderboard refreshes in the HUD.

## 9. HUD
- Health, ammo, weapon slots, ability cooldown ring, gloo/medkit/bomb counters.
- Minimap (`Minimap.tsx`) with teammates, enemies and geometry.
- Kill feed, streak banner, round/score header, personal K/D readout.
- Squad panel: teammate name, HP bar, alive/dead count (shown outside warmup/match end).
- Crosshair engine: cross / dot / circle / none, custom colour, size, thickness, opacity, dynamic bloom, centre dot.
- HUD opacity, HUD scale and per-element toggles.

## 10. Audio
- Procedural WebAudio SFX engine (`sfx.ts`): rifle, carbine, SMG, shotgun, sniper, MG, pistol, deagle, knife, hit, kill, spawn, reload, pump, dry-fire and more.
- Distance-attenuated positional one-shots and stoppable loops.
- Victory stinger, thunder with strike delay, and looping rain/snow ambience beds.
- Master volume, effects volume, mute, hit sounds; auto-suspend when the tab is hidden.

## 11. Video & performance
- Quality presets: Low / Balanced / High.
- Render resolution scale, effects/particle density, shadow toggle, baked-lighting toggle.
- Live sky brightness, fog intensity, cloud drift and baked ground-light sliders.
- Adaptive pixel ratio, lazy-loaded arena bundle, collision tile warm-up to avoid hitches.

## 12. Settings panel (8 tabs, all persisted locally)
- Aim: mouse/touch sensitivity, scoped sensitivity, FOV, aim assist, ADS mode, invert Y.
- Crosshair: style, colour, size, thickness, opacity, dynamic spread, centre dot, hit markers.
- Interface: HUD opacity/size, screen shake, minimap, kill feed, damage numbers, damage vignette, FPS counter.
- Audio: master, effects, hit sounds, mute.
- Video: quality, render scale, effects density, shadows, baked light, sky/fog/cloud/ground sliders.
- Gameplay: auto-fire, auto-reload, quick match, sprint mode, gloo wall placement mode.
- Keyboard: click-to-rebind every action, reset keybinds.
- Controls: touch-control toggle + full on-screen layout editor.
- Reset-all and back-to-match actions.

## 13. Backend (Lovable Cloud)
- `saveMatchResult` server function: writes blue/red score, winner, player team, kills and deaths to `match_results`.
- `getLeaderboard` server function: reads the last 100 matches and aggregates per-team wins, losses, kills and deaths plus the 10 most recent games.
- Supabase client, admin client, auth middleware and auth attacher wired in.
- Note: no SQL migration file is checked into `supabase/migrations` — the `match_results` table lives only in the cloud project.

## 14. Extras
- Screenshot capture and in-browser match recording (`capture.ts`).
- Spawn FX, power FX, impact FX and explosion FX particle systems.
- Backpack panel on touch HUD.
- Weapon drop and sell-all economy actions.

---

## Known gaps vs `.lovable/plan.md`
No social accounts, guilds, friends, chat or voice. No BR mode, plane/drop sequence, loot/attachments, backpacks, vehicles, ziplines, knock/revive, spectating or ranked points. Tactical items Scanner, Bonfire, Airdrop and Leg Pockets have UI slots but no in-match logic yet.

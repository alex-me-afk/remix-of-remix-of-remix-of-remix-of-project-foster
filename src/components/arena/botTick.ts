/**
 * What a bot does with its turn: pick a target, decide whether it can see them, move, and shoot.
 *
 * Brook: "The bot AI tick loop (botTick, moveBot) — big, dense, and rarely needs to touch player-only
 * state". Exactly so, and that is what makes it worth its own file: ~300 lines that read one thing
 * about the player (where they are standing, and whether they are moving) and otherwise care only
 * about fighters, geometry and their own brain.
 *
 * The brain itself — profiles, difficulty, burst and strafe rolls — already lived in `botAi.ts`; this
 * is the loop that drives it, moved out of the frame loop's closure unchanged. `botAi.ts` is pure
 * numbers with no scene; this is the half that raycasts, walks and pulls the trigger, which is why
 * the two are separate files rather than one.
 *
 * TWO STATE MACHINES RUN HERE, not one. `brain.state` (engage / reposition / retreat / hunt) chooses
 * movement, and the firing block below it is a separate ladder of early returns — flashed, no line of
 * sight, still reacting, mid-pause, on cooldown — each of which leaves the bot moving but silent. A
 * bot that has a target and can see it still may not shoot this frame, and that is the whole reason
 * they read as human rather than as turrets.
 */

import * as THREE from "three";

import { BOT_PROFILES, attractToDecoy, rerollStrafe, rollBurst, rollPause } from "./botAi";
import {
  BOT_DAMAGE,
  MAX_HP,
  REVIVE_RADIUS,
  REVIVE_SECONDS,
  type Fighter,
  type Team,
} from "./fighter";
import { CLIP } from "./operativeAnims";
import { playSfxAt } from "./sfx";
import { PLAYER_RADIUS, STEP_UP } from "./walkPhysics";
import { getWeapon, getWeaponBehavior, getWeaponFireInterval, getWeaponRange } from "./weapons";

export function createBotTick(deps: {
  /** Every fighter in the match, the human included — the target list, live and shared. */
  fighters: Fighter[];
  /** Live decoys. Enemy ones bait bots that have nothing better to chase. */
  decoys: readonly { root: THREE.Group; team: Team }[];
  /**
   * The player's FEET position, held rather than copied: the human fighter's own `pos` lags a frame
   * behind the walk physics, and a bot aiming at last frame's position misses a strafing player.
   */
  walkPos: THREE.Vector3;
  /** Only for attenuating gunfire by distance from the listener. */
  camera: THREE.Camera;
  groundAt: (x: number, z: number, fromY: number, maxRise?: number) => number | null;
  /** Closest hit or null — line of sight and wall probes. The hit itself is never inspected. */
  castFirst: (origin: THREE.Vector3, dir: THREE.Vector3, far: number) => unknown;
  respawn: (f: Fighter) => void;
  reviveFighter: (f: Fighter) => void;
  damage: (victim: Fighter, amount: number, killer: Fighter, headshot?: boolean) => unknown;
  pushKillFeed: (killer: Fighter, victim: Fighter, weaponName?: string) => void;
  /** Bots stand still outside the round proper — countdown, intermission, skydive. */
  inRound: () => boolean;
  /** False in the elimination modes, where a dead bot stays dead for the round. */
  respawnEnabled: () => boolean;
  /** Is the player moving? A static target is easier to hit, which is the same rule they get. */
  humanMoving: () => boolean;
  /** Player's shield bubble — rounds stop on its skin instead of reaching them. */
  barrierUp: () => boolean;
  barrierRadius: number;
  /** Smoke between two points, which breaks line of sight without breaking geometry. */
  smokeBlocks: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
}) {
  const {
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
    inRound,
    respawnEnabled,
    humanMoving,
    barrierUp,
    barrierRadius,
    smokeBlocks,
  } = deps;

  // Bots barely move, so re-probing the ground under every one of them on
  // every frame is pure waste — refresh each ~4 Hz (or when they teleport).
  const botGroundTimers = new Map<string, number>();
  /**
   * Scratch for `moveBot`'s wall probe.
   *
   * One per factory, like `botGroundTimers` above, and shared by every bot the factory ticks — safe
   * because a tick never yields. `tryStep` runs up to three times per bot per frame (full move, then
   * each axis alone) and it used to build two fresh vectors on every one of those, so a squad of
   * eight walking bots threw away up to forty-eight vectors a frame for the entire match. Neither
   * value outlives the `castFirst` call that reads it — `raycaster.set` copies both.
   */
  const stepEye = new THREE.Vector3();
  const stepDir = new THREE.Vector3();
  /**
   * The movement basis, and the hunt vector — same reasoning as the pair above, once per bot per
   * frame rather than three times.
   *
   * Kept separate from `stepEye`/`stepDir` deliberately: `moveBot` is called WITH values read out of
   * these, so sharing one scratch between the two would have the probe overwrite the basis it was
   * derived from. They are read component-wise at the call, so as written it is safe either way —
   * but a shared scratch would make that an accident rather than a fact.
   */
  const botFlat = new THREE.Vector3();
  const botSide = new THREE.Vector3();
  const botAway = new THREE.Vector3();
  /**
   * Collision-aware bot step: tries the full move, then each axis alone so
   * bots slide along walls instead of sticking to them.
   */
  const moveBot = (f: Fighter, dx: number, dz: number) => {
    if (!dx && !dz) return;
    const tryStep = (ax: number, az: number) => {
      const nx = f.pos.x + ax;
      const nz = f.pos.z + az;
      // Scratch, not fresh vectors — `castFirst` calls `raycaster.set`, which copies both.
      const eye = stepEye.set(f.pos.x, f.pos.y + 1.0, f.pos.z);
      const dir = stepDir.set(ax, 0, az);
      const len = dir.length();
      if (len < 1e-4) return false;
      dir.divideScalar(len);
      if (castFirst(eye, dir, len + PLAYER_RADIUS) !== null) return false;
      const gy = groundAt(nx, nz, f.pos.y + 0.6, STEP_UP + 0.5);
      if (gy === null || Math.abs(gy - f.pos.y) > STEP_UP + 0.5) return false;
      f.pos.set(nx, gy, nz);
      return true;
    };
    if (tryStep(dx, dz)) return;
    if (tryStep(dx, 0)) return;
    tryStep(0, dz);
  };

  const botTick = (f: Fighter, dt: number) => {
    if (!f.group) return;
    if (!inRound()) return;
    // knocked bots are out of the fight — the bleed-out tick (in the frame loop) finishes them
    if (f.downed) return;
    if (!f.alive) {
      // Elimination modes never respawn — the bot stays down for the round.
      if (!respawnEnabled()) return;
      f.respawnIn -= dt;
      if (f.respawnIn <= 0) respawn(f);
      return;
    }

    const brain = f.ai;
    if (!brain) return;
    const prof = BOT_PROFILES[brain.difficulty];
    if (brain.blindLeft > 0) brain.blindLeft -= dt;

    // keep bots planted on the ground
    const nextProbe = (botGroundTimers.get(f.id) ?? 0) - dt;
    if (nextProbe <= 0) {
      botGroundTimers.set(f.id, 0.25);
      const gy = groundAt(f.pos.x, f.pos.z, f.pos.y + 0.5, 1.0);
      if (gy !== null) f.pos.y = gy;
    } else {
      botGroundTimers.set(f.id, nextProbe);
    }

    // ---- revive priority: a downed teammate outranks every other goal. Walk to them and
    // stand over them until the revive completes; enemies may still shoot the bot down mid-way.
    const downedMate = fighters.find((o) => o.team === f.team && o.downed);
    if (downedMate) {
      const dd = downedMate.pos.distanceTo(f.pos);
      if (dd > REVIVE_RADIUS) {
        const to = downedMate.pos.clone().sub(f.pos);
        to.y = 0;
        to.normalize();
        moveBot(f, to.x * prof.moveSpeed * dt, to.z * prof.moveSpeed * dt);
      } else {
        downedMate.beingRevived += dt;
        if (downedMate.beingRevived >= REVIVE_SECONDS) reviveFighter(downedMate);
      }
      f.group.position.copy(f.pos);
      return;
    }

    // ---- decoy bait timer
    if (brain.decoyAttractLeft > 0) brain.decoyAttractLeft -= dt;
    if (brain.decoyAttractLeft <= 0) brain.decoyAttract = null;

    // ---- target selection: nearest living enemy, sticky to the current one
    let bestTarget: Fighter | null = null;
    let bestDist = Infinity;
    for (const other of fighters) {
      if (other.team === f.team || !other.alive) continue;
      const p = other.isHuman ? walkPos : other.pos;
      let d = p.distanceTo(f.pos);
      // A knocked enemy is not a threat: bots go for whoever can still shoot back and only
      // come back to finish the knock when there's nobody else. Without this they empty the
      // downed HP pool immediately and the revive window never opens.
      if (other.downed) d += 400;
      // hysteresis so bots do not flip-flop between two equidistant enemies
      if (other.id === brain.targetId) d *= 0.75;
      if (d < bestDist) {
        bestDist = d;
        bestTarget = other;
      }
    }

    // enemy decoys draw bots that can hear them; closer/smarter bots fall for it longer
    if (bestDist > 18) {
      for (const d of decoys) {
        if (d.team === f.team) continue;
        const distToDecoy = d.root.position.distanceTo(f.pos);
        if (distToDecoy < 55 && Math.random() < 0.35) {
          attractToDecoy(brain, d.root.position, 2.5 + Math.random() * 2);
          break;
        }
      }
    }

    if (!bestTarget) {
      brain.state = "hunt";
      brain.targetId = null;
      if (brain.decoyAttract) {
        const goal = brain.decoyAttract;
        const away = goal.clone().sub(f.pos);
        away.y = 0;
        if (away.length() > 2.5) {
          away.normalize();
          moveBot(f, away.x * prof.moveSpeed * 0.8 * dt, away.z * prof.moveSpeed * 0.8 * dt);
        }
      }
      f.group.position.copy(f.pos);
      return;
    }

    if (bestTarget.id !== brain.targetId) {
      brain.targetId = bestTarget.id;
      brain.reactionLeft = prof.reaction * (0.8 + Math.random() * 0.5);
      brain.burstLeft = rollBurst(prof);
      brain.pauseLeft = 0;
      brain.losClear = false;
      brain.losTimer = 0;
    }

    const targetPos = (bestTarget.isHuman ? walkPos : bestTarget.pos).clone();
    const aim = targetPos.clone().setY(targetPos.y + 1.3);
    const eye = f.pos.clone().setY(f.pos.y + 1.3);
    const toTarget = aim.clone().sub(eye);
    const dist = toTarget.length();
    const dir = toTarget.clone().normalize();

    // ---- line of sight, re-probed a few times a second instead of per frame
    brain.losTimer -= dt;
    if (brain.losTimer <= 0) {
      brain.losTimer = 0.12 + Math.random() * 0.08;
      brain.losClear =
        castFirst(eye, dir, Math.max(0.1, dist - 0.4)) === null && !smokeBlocks(eye, aim);
      if (brain.losClear) {
        brain.lastSeen = targetPos.clone();
      }
    }
    const visible = brain.losClear;

    // ---- state machine
    const hurt = f.hp <= MAX_HP * prof.retreatHp;
    if (hurt && visible && dist < brain.preferredRange * 0.8) brain.state = "retreat";
    else if (visible) brain.state = dist > brain.preferredRange * 1.4 ? "reposition" : "engage";
    else brain.state = "hunt";

    // ---- face the target (or the last place it was seen)
    const facePoint = visible ? targetPos : (brain.lastSeen ?? targetPos);
    // No vector here: the clone existed only so two of its components could be read once.
    const wantYaw = Math.atan2(facePoint.x - f.pos.x, facePoint.z - f.pos.z) + Math.PI;
    const yawDelta = ((wantYaw - f.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    f.group.rotation.y += yawDelta * Math.min(1, prof.tracking * 6 * dt * 10);

    // ---- movement
    // Three more per-bot-per-frame vectors on scratch. `flat` is the horizontal aim direction and
    // `side` is its left normal; both are read component-wise by the moveBot calls below and never
    // stored. `moveBot` uses its own pair (stepEye/stepDir), so these cannot be clobbered by it.
    const flat = botFlat.set(dir.x, 0, dir.z).normalize();
    const side = botSide.set(-flat.z, 0, flat.x);
    brain.strafeLeft -= dt;
    if (brain.strafeLeft <= 0) rerollStrafe(brain);
    brain.moveLeft -= dt;

    let forward = 0;
    let strafe = 0;
    if (brain.state === "engage") {
      // hold the pocket: nudge in or out, strafe across the duel
      const gap = dist - brain.preferredRange;
      forward = Math.abs(gap) > 4 ? Math.sign(gap) * 0.5 * prof.aggression : 0;
      strafe = brain.strafeDir * prof.strafe;
    } else if (brain.state === "reposition") {
      forward = prof.aggression;
      strafe = brain.strafeDir * prof.strafe * 0.4;
    } else if (brain.state === "retreat") {
      forward = -0.9;
      strafe = brain.strafeDir * prof.strafe * 0.8;
    } else {
      // hunt: walk to the last known position or a decoy bait, then wander around it
      const goal = brain.decoyAttract ?? brain.lastSeen ?? bestTarget.home.top;
      const away = botAway.copy(goal).sub(f.pos);
      away.y = 0;
      if (away.length() > 2.5) {
        away.normalize();
        moveBot(f, away.x * prof.moveSpeed * 0.9 * dt, away.z * prof.moveSpeed * 0.9 * dt);
      } else if (brain.moveLeft <= 0) {
        brain.moveLeft = 0.8 + Math.random() * 1.4;
        rerollStrafe(brain);
      } else {
        moveBot(
          f,
          side.x * brain.strafeDir * prof.moveSpeed * 0.5 * dt,
          side.z * brain.strafeDir * prof.moveSpeed * 0.5 * dt,
        );
      }
    }

    if (brain.state !== "hunt" && (forward || strafe)) {
      const step = prof.moveSpeed * dt;
      moveBot(
        f,
        (flat.x * forward + side.x * strafe) * step,
        (flat.z * forward + side.z * strafe) * step,
      );
    }

    f.group.position.copy(f.pos);

    const bw = getWeapon(f.weapon);
    const botRange = bw ? getWeaponRange(bw) : 120;
    const botInterval = bw ? getWeaponFireInterval(bw) : 0.65;
    const botWeaponName = bw?.name ?? "Rifle";

    // ---- firing discipline: reaction delay, bursts, pauses
    if (brain.blindLeft > 0) {
      // flashed: stumble, hold fire
      brain.reactionLeft = Math.max(brain.reactionLeft, prof.reaction);
      return;
    }
    if (!visible || dist > botRange) {
      brain.reactionLeft = Math.min(brain.reactionLeft + dt * 0.5, prof.reaction);
      return;
    }
    if (brain.reactionLeft > 0) {
      brain.reactionLeft -= dt;
      return;
    }
    if (brain.pauseLeft > 0) {
      brain.pauseLeft -= dt;
      return;
    }

    f.cooldown -= dt;
    if (f.cooldown > 0) return;
    f.cooldown = botInterval * (0.9 + Math.random() * 0.3);
    // Upper-body only (CLIP.fire is on the UPPER_ONLY list), so the legs keep whatever
    // locomotion clip they were mid-stride in instead of snapping to a standing shoot.
    f.rig?.play(CLIP.fire);
    brain.burstLeft -= 1;
    if (brain.burstLeft <= 0) {
      brain.burstLeft = rollBurst(prof);
      brain.pauseLeft = rollPause(prof);
    }

    // distant gunfire — attenuated so the arena has depth
    playSfxAt(
      getWeaponBehavior(f.weapon).sound,
      eye.distanceTo(camera.position),
      0.85,
      (Math.random() - 0.5) * 0.05,
    );

    if (f.tracer) {
      const attr = f.tracer.line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      // rounds aimed at a shielded player visibly stop on the bubble skin
      const shielded = bestTarget.isHuman && barrierUp();
      const end = shielded
        ? eye.clone().add(dir.clone().multiplyScalar(Math.max(0, dist - barrierRadius)))
        : aim;
      arr[0] = eye.x;
      arr[1] = eye.y;
      arr[2] = eye.z;
      arr[3] = end.x;
      arr[4] = end.y;
      arr[5] = end.z;
      attr.needsUpdate = true;
      f.tracer.mat.color.setHex(f.team === "blue" ? 0x8ec5ff : 0xff9d5c);
      f.tracer.mat.opacity = 1;
      f.tracer.ttl = 0.1;
    }

    // accuracy falls off with distance and improves against static targets
    const moving = bestTarget.isHuman ? humanMoving() : brain.state !== "hunt";
    const hitChance = Math.max(
      0.12,
      prof.accuracy - dist / prof.accuracyFalloff - (moving ? 0.12 : 0),
    );
    if (Math.random() < hitChance) {
      const head = Math.random() < prof.headshotChance;
      const amount = BOT_DAMAGE * prof.damageScale * (head ? 2.2 : 1);
      damage(bestTarget, amount, f, head);
      if (!bestTarget.alive) pushKillFeed(f, bestTarget, botWeaponName);
    }
  };

  return { moveBot, botTick };
}

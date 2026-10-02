import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import * as THREE from "three";
import dominoTableAsset from "@/assets/domino-table.png.asset.json";
import { Canvas, useFrame } from "@react-three/fiber";
import { X, RotateCcw, Volume2, VolumeX, Trophy, Play, ChevronRight, Gamepad2, Sparkles, Target, Compass } from "lucide-react";

// ==================== SECTION 1: PROCEDURAL ARCADE AUDIO ====================
// Fully procedural WebAudio SFX + synth music for the arcade cabinet.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let hum: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.28;
    musicGain.connect(master);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.25, slideTo?: number, dest?: AudioNode, at?: number) {
  const c = ac();
  const t = at ?? c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 20), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest ?? master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.4, cutoff = 1200) {
  const c = ac();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(cutoff, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(60, c.currentTime + dur);
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master!);
  src.start();
}

export const sfx = {
  unlock: () => ac(),
  select: () => { tone(660, 0.08, "square", 0.15); tone(990, 0.1, "square", 0.12, undefined, undefined, ac().currentTime + 0.07); },
  move: () => tone(220, 0.06, "triangle", 0.08, 330),
  laser: () => tone(1400, 0.16, "sawtooth", 0.12, 180),
  alienLaser: () => tone(400, 0.2, "square", 0.08, 90),
  bounce: () => tone(520, 0.05, "square", 0.14),
  brick: () => tone(880 + Math.random() * 300, 0.07, "square", 0.14),
  flap: () => tone(380, 0.12, "triangle", 0.18, 760),
  chime: () => { const t = ac().currentTime; [880, 1175, 1568].forEach((f, i) => tone(f, 0.18, "triangle", 0.14, undefined, undefined, t + i * 0.06)); },
  levelUp: () => { const t = ac().currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "square", 0.12, undefined, undefined, t + i * 0.08)); },
  explode: () => { noise(0.7, 0.55, 2400); tone(160, 0.6, "sawtooth", 0.2, 30); },
  hit: () => { noise(0.25, 0.35, 3000); },
  gameOver: () => { const t = ac().currentTime; [392, 330, 262, 196].forEach((f, i) => tone(f, 0.28, "square", 0.14, undefined, undefined, t + i * 0.18)); },
};

export function setHum(on: boolean, speed = 0) {
  const c = ac();
  if (on && !hum) {
    const osc = c.createOscillator();
    const osc2 = c.createOscillator();
    const gain = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    osc.type = "sawtooth";
    osc2.type = "square";
    gain.gain.value = 0.05;
    osc.connect(f);
    osc2.connect(f);
    f.connect(gain).connect(master!);
    osc.start();
    osc2.start();
    hum = { osc, osc2, gain };
  }
  if (!on && hum) {
    hum.gain.gain.setTargetAtTime(0, c.currentTime, 0.05);
    const h = hum;
    setTimeout(() => { h.osc.stop(); h.osc2.stop(); }, 300);
    hum = null;
  }
  if (hum) {
    const base = 45 + speed * 1.2;
    hum.osc.frequency.setTargetAtTime(base, c.currentTime, 0.1);
    hum.osc2.frequency.setTargetAtTime(base * 1.505, c.currentTime, 0.1);
  }
}

// Minor-key synthwave loop: bass + arpeggio, lookahead scheduler.
const BASS = [45, 45, 41, 41, 48, 48, 43, 43];
const ARP = [0, 3, 7, 12, 7, 3, 7, 10];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export function startMusic(tempo = 118) {
  const c = ac();
  if (musicTimer !== null) return;
  const step = 60 / tempo / 4;
  let next = c.currentTime + 0.05;
  let i = 0;
  musicTimer = window.setInterval(() => {
    while (next < c.currentTime + 0.2) {
      const bar = Math.floor(i / 16) % BASS.length;
      const root = BASS[bar]!;
      if (i % 4 === 0) tone(midi(root), step * 3.5, "sawtooth", 0.22, undefined, musicGain!, next);
      tone(midi(root + 24 + ARP[i % 8]!), step * 0.9, "square", 0.07, undefined, musicGain!, next);
      if (i % 8 === 4) {
        const buf = c.createBuffer(1, 2000, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / d.length);
        const s = c.createBufferSource();
        s.buffer = buf;
        const g = c.createGain();
        g.gain.value = 0.15;
        s.connect(g).connect(musicGain!);
        s.start(next);
      }
      next += step;
      i++;
    }
  }, 50);
}

export function stopMusic() {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
}

export function stopAllAudio() {
  stopMusic();
  if (ctx) setHum(false);
}

// ==================== SECTION 2: 2D CANVAS ARCADE GAMES ====================

export const W = 640;
export const H = 360;

export type GameProps = { playing: boolean; runId: number; onScore: (s: number) => void; onOver: (s: number) => void };

type Api = { keys: Set<string>; score: (n: number) => void; over: () => void };
type Game = { update: (dt: number) => void; draw: (g: CanvasRenderingContext2D) => void; press?: (code: string) => void };

function Canvas2D({ playing, runId, onScore, onOver, create }: GameProps & { create: (api: Api) => Game }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef({ onScore, onOver, playing });
  cb.current = { onScore, onOver, playing };

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const keys = new Set<string>();
    let score = 0;
    let dead = false;
    const api: Api = {
      keys,
      score: (n) => { score += n; cb.current.onScore(score); },
      over: () => { if (!dead) { dead = true; cb.current.onOver(score); } },
    };
    const game = create(api);
    const down = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (cb.current.playing && !dead && !e.repeat) game.press?.(e.code);
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const click = () => cb.current.playing && !dead && game.press?.("Space");
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    canvas.addEventListener("pointerdown", click);
    let last = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      if (cb.current.playing && !dead) game.update(dt);
      game.draw(g);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      canvas.removeEventListener("pointerdown", click);
    };
    // runId restarts the game with fresh state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return <canvas ref={ref} width={W} height={H} className="h-full w-full touch-none" style={{ imageRendering: "pixelated" }} />;
}

const left = (k: Set<string>) => k.has("KeyA") || k.has("ArrowLeft");
const right = (k: Set<string>) => k.has("KeyD") || k.has("ArrowRight");
const hitRect = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

function bg(g: CanvasRenderingContext2D, top: string, bottom: string) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

function glow(g: CanvasRenderingContext2D, color: string, blur = 12) {
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.fillStyle = color;
}

/* ---------------- Space Invaders ---------------- */
export function SpaceInvaders(props: GameProps) {
  return (
    <Canvas2D
      {...props}
      create={(api) => {
        const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.5 }));
        let px = W / 2;
        let lives = 3;
        let wave = 1;
        let cooldown = 0;
        let invuln = 0;
        let dir = 1;
        let aliens: { x: number; y: number; row: number; alive: boolean }[] = [];
        let bullets: { x: number; y: number }[] = [];
        let enemyShots: { x: number; y: number }[] = [];
        let shields: { x: number; y: number; hp: number }[] = [];
        let stepTimer = 0;
        let animFrame = 0;
        const spawnWave = () => {
          aliens = [];
          for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) aliens.push({ x: 80 + c * 50, y: 40 + r * 30, row: r, alive: true });
          dir = 1;
        };
        const buildShields = () => {
          shields = [];
          for (let s = 0; s < 4; s++) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) shields.push({ x: 90 + s * 140 + i * 10, y: 290 + j * 8, hp: 3 });
        };
        spawnWave();
        buildShields();
        const shoot = () => {
          if (cooldown > 0) return;
          bullets.push({ x: px, y: H - 34 });
          cooldown = 0.35;
          sfx.laser();
        };
        return {
          press: (code) => { if (code === "Space" || code === "KeyW" || code === "ArrowUp") shoot(); },
          update(dt) {
            const k = api.keys;
            const mv = (right(k) ? 1 : 0) - (left(k) ? 1 : 0);
            px = Math.max(20, Math.min(W - 20, px + mv * 280 * dt));
            if (k.has("Space")) shoot();
            cooldown -= dt;
            invuln -= dt;
            bullets.forEach((b) => (b.y -= 460 * dt));
            enemyShots.forEach((b) => (b.y += (160 + wave * 20) * dt));
            const live = aliens.filter((a) => a.alive);
            stepTimer -= dt;
            if (stepTimer <= 0) {
              stepTimer = Math.max(0.08, 0.6 - (36 - live.length) * 0.014 - wave * 0.04);
              animFrame ^= 1;
              const edge = live.some((a) => (dir > 0 && a.x > W - 40) || (dir < 0 && a.x < 40));
              if (edge) { dir *= -1; live.forEach((a) => (a.y += 14)); } else live.forEach((a) => (a.x += dir * 10));
              sfx.move();
            }
            if (live.length && Math.random() < dt * (0.9 + wave * 0.35)) {
              const a = live[Math.floor(Math.random() * live.length)]!;
              enemyShots.push({ x: a.x, y: a.y + 10 });
              sfx.alienLaser();
            }
            for (const b of bullets) {
              for (const a of live) if (a.alive && Math.abs(b.x - a.x) < 16 && Math.abs(b.y - a.y) < 12) {
                a.alive = false; b.y = -99; api.score((4 - a.row) * 10); sfx.hit();
              }
              for (const s of shields) if (s.hp > 0 && hitRect(b.x - 1, b.y, 2, 8, s.x, s.y, 10, 8)) { s.hp--; b.y = -99; }
            }
            for (const e of enemyShots) {
              for (const s of shields) if (s.hp > 0 && hitRect(e.x - 2, e.y, 4, 8, s.x, s.y, 10, 8)) { s.hp--; e.y = H + 99; }
              if (invuln <= 0 && hitRect(e.x - 2, e.y, 4, 8, px - 16, H - 30, 32, 14)) {
                e.y = H + 99; lives--; invuln = 1.5; sfx.explode();
                if (lives <= 0) { sfx.gameOver(); api.over(); }
              }
            }
            bullets = bullets.filter((b) => b.y > -10);
            enemyShots = enemyShots.filter((b) => b.y < H + 10);
            if (live.some((a) => a.alive && a.y > H - 60)) { sfx.explode(); sfx.gameOver(); api.over(); }
            if (!aliens.some((a) => a.alive)) { wave++; api.score(100); sfx.levelUp(); spawnWave(); buildShields(); }
            stars.forEach((s) => { s.y += s.s * 20 * dt; if (s.y > H) s.y = 0; });
          },
          draw(g) {
            bg(g, "#05010f", "#1a0633");
            g.shadowBlur = 0;
            g.fillStyle = "#ffffff";
            stars.forEach((s) => g.fillRect(s.x, s.y, s.s, s.s));
            const colors = ["#ff4fd8", "#b56bff", "#4fd8ff", "#4fff9a"];
            for (const a of aliens) if (a.alive) {
              glow(g, colors[a.row]!);
              g.fillRect(a.x - 12, a.y - 6, 24, 12);
              g.fillStyle = "#05010f";
              g.fillRect(a.x - 7, a.y - 3, 4, 4);
              g.fillRect(a.x + 3, a.y - 3, 4, 4);
              glow(g, colors[a.row]!);
              const leg = animFrame ? 4 : -4;
              g.fillRect(a.x - 12 + leg, a.y + 6, 4, 5);
              g.fillRect(a.x + 8 - leg, a.y + 6, 4, 5);
            }
            for (const s of shields) if (s.hp > 0) { glow(g, `rgba(79,255,154,${s.hp / 3})`, 4); g.fillRect(s.x, s.y, 10, 8); }
            glow(g, "#fff36b");
            bullets.forEach((b) => g.fillRect(b.x - 1.5, b.y, 3, 10));
            glow(g, "#ff5a5a");
            enemyShots.forEach((b) => g.fillRect(b.x - 2, b.y, 4, 9));
            if (invuln <= 0 || Math.floor(invuln * 10) % 2) {
              glow(g, "#4fd8ff", 16);
              g.fillRect(px - 16, H - 22, 32, 10);
              g.fillRect(px - 4, H - 32, 8, 10);
            }
            g.shadowBlur = 0;
            g.fillStyle = "#ffffff";
            g.font = "14px monospace";
            g.fillText(`LIVES ${"▲".repeat(Math.max(lives, 0))}   WAVE ${wave}`, 12, H - 6);
          },
        };
      }}
    />
  );
}

/* ---------------- Neon Breakout ---------------- */
export function NeonBreakout(props: GameProps) {
  return (
    <Canvas2D
      {...props}
      create={(api) => {
        const PW = 90;
        let px = W / 2;
        let lives = 3;
        let level = 1;
        let ball = { x: W / 2, y: H - 50, vx: 0, vy: 0, stuck: true };
        let bricks: { x: number; y: number; hp: number; row: number }[] = [];
        let sparks: { x: number; y: number; vx: number; vy: number; t: number; c: string }[] = [];
        const colors = ["#ff4fd8", "#ff8a3d", "#fff36b", "#4fff9a", "#4fd8ff", "#b56bff"];
        const build = () => {
          bricks = [];
          for (let r = 0; r < 6; r++) for (let c = 0; c < 11; c++) bricks.push({ x: 22 + c * 55, y: 36 + r * 20, hp: r < Math.min(level, 3) ? 2 : 1, row: r });
        };
        build();
        const speed = () => 300 + level * 40;
        const launch = () => {
          if (!ball.stuck) return;
          ball.stuck = false;
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
          ball.vx = Math.cos(a) * speed();
          ball.vy = Math.sin(a) * speed();
          sfx.bounce();
        };
        return {
          press: (code) => { if (code === "Space" || code === "KeyW" || code === "ArrowUp") launch(); },
          update(dt) {
            const k = api.keys;
            px = Math.max(PW / 2, Math.min(W - PW / 2, px + ((right(k) ? 1 : 0) - (left(k) ? 1 : 0)) * 420 * dt));
            if (ball.stuck) { ball.x = px; ball.y = H - 36; return; }
            ball.x += ball.vx * dt;
            ball.y += ball.vy * dt;
            if (ball.x < 6 || ball.x > W - 6) { ball.vx *= -1; ball.x = Math.max(6, Math.min(W - 6, ball.x)); sfx.bounce(); }
            if (ball.y < 6) { ball.vy = Math.abs(ball.vy); sfx.bounce(); }
            if (ball.vy > 0 && hitRect(ball.x - 6, ball.y - 6, 12, 12, px - PW / 2, H - 28, PW, 10)) {
              const off = (ball.x - px) / (PW / 2);
              const a = -Math.PI / 2 + off * 1.05;
              ball.vx = Math.cos(a) * speed();
              ball.vy = Math.sin(a) * speed();
              sfx.bounce();
            }
            for (const b of bricks) {
              if (b.hp > 0 && hitRect(ball.x - 6, ball.y - 6, 12, 12, b.x, b.y, 50, 16)) {
                b.hp--;
                const overlapX = Math.min(ball.x + 6 - b.x, b.x + 50 - (ball.x - 6));
                const overlapY = Math.min(ball.y + 6 - b.y, b.y + 16 - (ball.y - 6));
                if (overlapX < overlapY) ball.vx *= -1; else ball.vy *= -1;
                if (b.hp === 0) {
                  api.score((6 - b.row) * 10);
                  sfx.brick();
                  for (let i = 0; i < 8; i++) sparks.push({ x: b.x + 25, y: b.y + 8, vx: (Math.random() - 0.5) * 240, vy: (Math.random() - 0.5) * 240, t: 0.5, c: colors[b.row]! });
                } else sfx.bounce();
                break;
              }
            }
            if (ball.y > H + 10) {
              lives--;
              sfx.explode();
              if (lives <= 0) { sfx.gameOver(); api.over(); }
              ball.stuck = true;
            }
            if (!bricks.some((b) => b.hp > 0)) { level++; api.score(200); sfx.levelUp(); build(); ball.stuck = true; }
            sparks.forEach((s) => { s.x += s.vx * dt; s.y += s.vy * dt; s.t -= dt; });
            sparks = sparks.filter((s) => s.t > 0);
          },
          draw(g) {
            bg(g, "#0a0220", "#200a3a");
            g.shadowBlur = 0;
            g.strokeStyle = "rgba(181,107,255,0.15)";
            for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
            for (const b of bricks) if (b.hp > 0) {
              glow(g, colors[b.row]!, 10);
              g.globalAlpha = b.hp === 2 ? 1 : 0.8;
              g.fillRect(b.x, b.y, 50, 16);
              if (b.hp === 2) { g.fillStyle = "#ffffff"; g.fillRect(b.x + 4, b.y + 6, 42, 3); }
              g.globalAlpha = 1;
            }
            for (const s of sparks) { g.globalAlpha = s.t * 2; glow(g, s.c, 6); g.fillRect(s.x, s.y, 3, 3); }
            g.globalAlpha = 1;
            glow(g, "#4fd8ff", 18);
            g.fillRect(px - PW / 2, H - 28, PW, 10);
            glow(g, "#ffffff", 16);
            g.beginPath();
            g.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
            g.fill();
            g.shadowBlur = 0;
            g.font = "14px monospace";
            g.fillText(`LIVES ${lives}   LEVEL ${level}${ball.stuck ? "   SPACE to launch" : ""}`, 12, H - 6);
          },
        };
      }}
    />
  );
}

/* ---------------- Cyber Flap ---------------- */
export function CyberFlap(props: GameProps) {
  return (
    <Canvas2D
      {...props}
      create={(api) => {
        const GRAVITY = 1100;
        const FLAP = -360;
        const GAP = 120;
        let y = H / 2;
        let vy = 0;
        let t = 0;
        let started = false;
        let pipes: { x: number; gapY: number; passed: boolean }[] = [];
        let spawn = 0;
        let dead = false;
        const pipeSpeed = () => 170 + Math.min(pipes.filter((p) => p.passed).length, 40) * 4;
        const flap = () => { started = true; vy = FLAP; sfx.flap(); };
        return {
          press: (code) => { if (code === "Space" || code === "KeyW" || code === "ArrowUp") flap(); },
          update(dt) {
            t += dt;
            if (!started || dead) return;
            vy += GRAVITY * dt;
            y += vy * dt;
            spawn -= dt;
            if (spawn <= 0) { pipes.push({ x: W + 30, gapY: 70 + Math.random() * (H - 140 - GAP), passed: false }); spawn = 1.5; }
            const sp = pipeSpeed();
            for (const p of pipes) {
              p.x -= sp * dt;
              if (!p.passed && p.x + 30 < 120) { p.passed = true; api.score(1); sfx.chime(); }
              if (hitRect(108, y - 12, 24, 24, p.x - 30, 0, 60, p.gapY) || hitRect(108, y - 12, 24, 24, p.x - 30, p.gapY + GAP, 60, H)) dead = true;
            }
            pipes = pipes.filter((p) => p.x > -60);
            if (y > H - 10 || y < -20) dead = true;
            if (dead) { sfx.explode(); sfx.gameOver(); api.over(); }
          },
          draw(g) {
            bg(g, "#12002b", "#3a0a4a");
            g.shadowBlur = 0;
            // synth sun
            const grd = g.createLinearGradient(0, 80, 0, 260);
            grd.addColorStop(0, "#fff36b");
            grd.addColorStop(1, "#ff4fd8");
            g.fillStyle = grd;
            g.beginPath();
            g.arc(W / 2, 250, 110, Math.PI, 0);
            g.fill();
            g.fillStyle = "#12002b";
            for (let i = 0; i < 6; i++) g.fillRect(W / 2 - 120, 170 + i * 14, 240, 2 + i);
            g.strokeStyle = "rgba(79,216,255,0.35)";
            const off = (t * 60) % 40;
            for (let x = -off; x < W; x += 40) { g.beginPath(); g.moveTo(x, H - 40); g.lineTo(x - 40, H); g.stroke(); }
            for (const p of pipes) {
              glow(g, "#4fff9a", 16);
              g.fillRect(p.x - 30, 0, 60, p.gapY);
              g.fillRect(p.x - 30, p.gapY + GAP, 60, H);
              g.fillStyle = "#0a3a22";
              g.fillRect(p.x - 24, 0, 48, p.gapY - 8);
              g.fillRect(p.x - 24, p.gapY + GAP + 8, 48, H);
            }
            g.save();
            g.translate(120, y);
            g.rotate(Math.max(-0.5, Math.min(1.2, vy / 500)));
            glow(g, "#ff4fd8", 20);
            g.fillRect(-12, -10, 24, 20);
            g.fillStyle = "#ffffff";
            g.fillRect(4, -6, 6, 6);
            g.fillStyle = "#fff36b";
            g.fillRect(12, -2, 8, 5);
            g.restore();
            g.shadowBlur = 0;
            if (!started) { g.fillStyle = "#ffffff"; g.font = "16px monospace"; g.fillText("SPACE / click to flap", W / 2 - 100, H - 60); }
          },
        };
      }}
    />
  );
}

// ==================== SECTION 3: 3D CUBE RUN RUNNER ====================

const LANE = 7;
const START_SPEED = 28;
const SPEED_STEP = 4;
const LEVEL_POINTS = 250;
const OBSTACLES = 40;
const FAR = -140;

function Runner({ playing, runId, onScore, onOver }: GameProps) {
  const ship = useRef<THREE.Mesh>(null);
  const cubes = useRef<THREE.InstancedMesh>(null);
  const grid = useRef<THREE.GridHelper>(null);
  const keys = useRef(new Set<string>());
  const state = useRef({ x: 0, vx: 0, score: 0, speed: START_SPEED, lastHud: 0, level: 1, dead: false, lastInput: 0 });
  const obs = useRef(Array.from({ length: OBSTACLES }, () => ({ x: 0, z: 0 })));
  const dummy = useRef(new THREE.Object3D());

  useEffect(() => {
    state.current = { x: 0, vx: 0, score: 0, speed: START_SPEED, lastHud: 0, level: 1, dead: false, lastInput: 0 };
    obs.current.forEach((o, i) => { o.x = (Math.random() * 2 - 1) * LANE; o.z = FAR - 20 - i * 4 - Math.random() * 4; });
  }, [runId]);

  useEffect(() => {
    const d = (e: KeyboardEvent) => keys.current.add(e.code);
    const u = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => { window.removeEventListener("keydown", d); window.removeEventListener("keyup", u); setHum(false); };
  }, []);

  useEffect(() => { setHum(playing, START_SPEED); if (!playing) setHum(false); }, [playing, runId]);

  useFrame(({ camera }, raw) => {
    const dt = Math.min(raw, 0.05);
    const s = state.current;
    const k = keys.current;
    const live = playing && !s.dead;
    if (live) {
      const input = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
      if (input !== 0 && input !== s.lastInput) sfx.move();
      s.lastInput = input;
      s.vx += input * 90 * dt;
      s.vx *= Math.exp(-8 * dt);
      s.x = THREE.MathUtils.clamp(s.x + s.vx * dt, -LANE, LANE);
      s.score += s.speed * dt;
      const level = Math.floor(s.score / LEVEL_POINTS) + 1;
      if (level > s.level) { s.level = level; sfx.levelUp(); }
      s.speed = START_SPEED + (level - 1) * SPEED_STEP;
      setHum(true, s.speed);
      for (const o of obs.current) {
        o.z += s.speed * dt;
        if (o.z > 6) { o.z = FAR - Math.random() * 20; o.x = (Math.random() * 2 - 1) * LANE; }
        if (Math.abs(o.z) < 1.1 && Math.abs(o.x - s.x) < 1.2) {
          s.dead = true; setHum(false); sfx.explode(); sfx.gameOver(); onOver(Math.floor(s.score)); break;
        }
      }
      s.lastHud += dt;
      if (s.lastHud > 0.1) { s.lastHud = 0; onScore(Math.floor(s.score)); }
    }
    if (ship.current) { ship.current.position.x = s.x; ship.current.rotation.z = -s.vx * 0.04; }
    if (grid.current) grid.current.position.z = (grid.current.position.z + s.speed * dt * (live ? 1 : 0.2)) % 4;
    if (cubes.current) {
      obs.current.forEach((o, i) => { dummy.current.position.set(o.x, 0.9, o.z); dummy.current.updateMatrix(); cubes.current!.setMatrixAt(i, dummy.current.matrix); });
      cubes.current.instanceMatrix.needsUpdate = true;
    }
    camera.position.set(s.x * 0.5, 3.2, 7);
    camera.lookAt(s.x * 0.5, 0.8, -12);
  });

  return (
    <>
      <color attach="background" args={["#10061f"]} />
      <fog attach="fog" args={["#10061f", 40, 130]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 10, 6]} intensity={1.6} />
      <gridHelper ref={grid} args={[400, 100, "#ff3fa4", "#3a1f7a"]} position={[0, 0.01, 0]} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -60]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#1b0b33" />
      </mesh>
      <mesh position={[0, 12, -120]}>
        <circleGeometry args={[22, 48]} />
        <meshBasicMaterial color="#ff5fa8" fog={false} />
      </mesh>
      <mesh ref={ship} position={[0, 0.5, 0]} rotation-x={-Math.PI / 2}>
        <coneGeometry args={[0.6, 1.8, 4]} />
        <meshStandardMaterial color="#ffe14d" emissive="#ff9d00" emissiveIntensity={0.6} />
      </mesh>
      <instancedMesh ref={cubes} args={[undefined, undefined, OBSTACLES]}>
        <boxGeometry args={[1.8, 1.8, 1.8]} />
        <meshStandardMaterial color="#22e0ff" emissive="#0a7ea0" emissiveIntensity={0.7} />
      </instancedMesh>
    </>
  );
}

function CubeRun(props: GameProps) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ fov: 65, near: 0.1, far: 300 }}>
      <Runner {...props} />
    </Canvas>
  );
}

const GAMES = [
  { id: "cuberun", name: "Cube Run", tag: "3D synthwave runner", controls: "A/D · ←/→ dodge", C: CubeRun },
  { id: "invaders", name: "Space Invaders", tag: "Alien shooter · shields", controls: "A/D move · SPACE fire", C: SpaceInvaders },
  { id: "breakout", name: "Neon Breakout", tag: "Paddle & brick breaker", controls: "A/D paddle · SPACE launch", C: NeonBreakout },
  { id: "flap", name: "Cyber Flap", tag: "Flap through neon pipes", controls: "SPACE / click flap", C: CyberFlap },
] as const;

type Phase = "ready" | "playing" | "over";
const bestKey = (id: string) => `arcade-best-${id}`;
const readBests = () => Object.fromEntries(GAMES.map((g) => [g.id, Number(localStorage.getItem(bestKey(g.id)) ?? (g.id === "cuberun" ? localStorage.getItem("cuberun-best") ?? 0 : 0))]));

export function CubeRunArcade({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [runId, setRunId] = useState(0);
  const [bests, setBests] = useState<Record<string, number>>({});

  useEffect(() => {
    setBests(readBests());
    return () => stopAllAudio();
  }, []);

  const open = useCallback((i: number) => {
    sfx.select();
    startMusic();
    setGame(i);
    setPhase("ready");
    setScore(0);
    setRunId((r) => r + 1);
  }, []);

  const start = useCallback(() => {
    sfx.select();
    startMusic();
    setScore(0);
    setRunId((r) => r + 1);
    setPhase("playing");
  }, []);

  const toMenu = useCallback(() => { sfx.select(); setGame(null); setPhase("ready"); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      sfx.unlock();
      if (e.code === "Escape") { e.preventDefault(); onExit(); return; }
      if (game === null) {
        const n = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(e.code);
        if (n >= 0) open(n);
        if (e.code === "ArrowDown" || e.code === "KeyS") { setCursor((c) => (c + 1) % 4); sfx.move(); }
        if (e.code === "ArrowUp" || e.code === "KeyW") { setCursor((c) => (c + 3) % 4); sfx.move(); }
        if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); open(cursor); }
        return;
      }
      if (e.code === "Backspace" || e.code === "KeyM") { if (phase !== "playing") toMenu(); return; }
      if ((e.code === "Space" || e.code === "Enter") && phase !== "playing") { e.preventDefault(); start(); }
      if (e.code === "Space") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, game, cursor, phase, open, start, toMenu]);

  const over = useCallback((s: number) => {
    setScore(s);
    setPhase("over");
    if (game === null) return;
    const id = GAMES[game]!.id;
    setBests((b) => {
      const n = Math.max(b[id] ?? 0, s);
      localStorage.setItem(bestKey(id), String(n));
      return { ...b, [id]: n };
    });
  }, [game]);

  const current = game !== null ? GAMES[game]! : null;
  const Game = current?.C;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onPointerDown={() => sfx.unlock()}>
      <div className="w-full max-w-4xl rounded-[2rem] border-4 border-primary bg-card p-4 shadow-2xl">
        <div className="mb-3 rounded-xl bg-primary py-2 text-center font-mono text-2xl font-black tracking-[0.3em] text-primary-foreground">
          {current ? current.name.toUpperCase() : "ISLAND ARCADE"}
        </div>
        <div className="relative aspect-video overflow-hidden rounded-xl border-4 border-foreground/80 bg-[#0a0220]">
          {current && Game ? (
            <>
              <Game playing={phase === "playing"} runId={runId} onScore={setScore} onOver={over} />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-3 font-mono text-lg font-bold text-primary drop-shadow">
                <span>SCORE {score}</span>
                <span>BEST {bests[current.id] ?? 0}</span>
              </div>
              {phase !== "playing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 text-center font-mono">
                  <h2 className="text-4xl font-black text-primary">{phase === "over" ? "GAME OVER" : current.name.toUpperCase()}</h2>
                  {phase === "over" && <p className="text-xl text-foreground">Score: {score}{score >= (bests[current.id] ?? 0) && score > 0 ? " · NEW BEST!" : ""}</p>}
                  <p className="text-foreground">Press SPACE / ENTER to {phase === "over" ? "retry" : "start"}</p>
                  <p className="text-sm text-muted-foreground">{current.controls}</p>
                  <p className="text-sm text-muted-foreground">M · game menu   ESC · leave arcade</p>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col justify-center gap-2 p-6 font-mono">
              <p className="mb-2 text-center text-sm text-muted-foreground">Pick a game · 1–4 or ↑/↓ + ENTER</p>
              {GAMES.map((g, i) => (
                <button
                  key={g.id}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => open(i)}
                  className={`flex items-center justify-between rounded-lg border-2 px-4 py-3 text-left transition ${cursor === i ? "border-primary bg-primary/20" : "border-border bg-card/40"}`}
                >
                  <span>
                    <span className="mr-3 text-primary">{i + 1}.</span>
                    <span className="text-lg font-bold text-foreground">{g.name}</span>
                    <span className="ml-3 text-xs text-muted-foreground">{g.tag}</span>
                  </span>
                  <span className="text-sm text-primary">HI {bests[g.id] ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-between font-mono text-sm text-muted-foreground">
          <span>{current ? current.controls : "♪ sound on"}</span>
          <span className="flex gap-2">
            {current && phase !== "playing" && <button className="rounded border border-border px-3 py-1 text-foreground" onClick={toMenu}>M · menu</button>}
            <button className="rounded border border-border px-3 py-1 text-foreground" onClick={onExit}>ESC · exit</button>
          </span>
        </div>
      </div>
    </div>
  );
}

// ==================== SECTION 4: TABLETOP 5-GAME SUITE ====================

/* ---------------- Audio Synthesis ---------------- */
let actx: AudioContext | null = null;
const getAudioContext = () => {
  if (!actx) actx = new AudioContext();
  if (actx.state === "suspended") void actx.resume();
  return actx;
};

function playClack(soft = false) {
  try {
    const c = getAudioContext();
    const t = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.05);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = soft ? 1200 : 2100;
    bp.Q.value = 3;
    const g = c.createGain();
    g.gain.value = soft ? 0.35 : 0.75;
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t);
  } catch {}
}

function playChime(win: boolean) {
  try {
    const c = getAudioContext();
    const notes = win ? [523, 659, 784, 1047] : [440, 370, 311, 262];
    notes.forEach((f, i) => {
      const t = c.currentTime + i * 0.14;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.5);
    });
  } catch {}
}

/* =========================================================================
   1. DOMINOES (Realistic Table, Shuffling & Dealing, Smooth Tile Placement)
   ========================================================================= */
const DOMINO_TABLE_BG = dominoTableAsset.url;

type Tile = { a: number; b: number; id: number };
type Placed = Tile & { flip: boolean; animKey?: number };
type Side = "L" | "R";
type Who = "player" | "bot";

function newDominoDeal() {
  const set: Tile[] = [];
  let id = 0;
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) set.push({ a, b, id: id++ });
  }
  for (let i = set.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [set[i], set[j]] = [set[j]!, set[i]!];
  }
  return { player: set.slice(0, 7), bot: set.slice(7, 14), boneyard: set.slice(14) };
}

const pipSum = (t: Tile) => t.a + t.b;
const leftEnd = (train: Placed[]) => (train[0]!.flip ? train[0]!.b : train[0]!.a);
const rightEnd = (train: Placed[]) => {
  const t = train[train.length - 1]!;
  return t.flip ? t.a : t.b;
};

function validSides(train: Placed[], t: Tile): Side[] {
  if (!train.length) return ["R"];
  const s: Side[] = [];
  const l = leftEnd(train);
  const r = rightEnd(train);
  if (t.a === l || t.b === l) s.push("L");
  if (t.a === r || t.b === r) s.push("R");
  return s;
}

function placeTile(train: Placed[], t: Tile, side: Side, animKey = Date.now()): Placed[] {
  if (!train.length) return [{ ...t, flip: false, animKey }];
  if (side === "L") {
    const l = leftEnd(train);
    return [{ ...t, flip: t.a === l, animKey }, ...train];
  }
  const r = rightEnd(train);
  return [...train, { ...t, flip: t.b === r, animKey }];
}

const PIPS: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

function HalfTile({ n, size }: { n: number; size: number }) {
  const pip = Math.max(3, size * 0.18);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {PIPS[n]?.map(([r, c], i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            width: pip,
            height: pip,
            top: size * (0.2 + r * 0.3) - pip / 2,
            left: size * (0.2 + c * 0.3) - pip / 2,
            background: "radial-gradient(circle at 60% 65%, #3a3a3a 0%, #0d0d0d 75%)",
            boxShadow: "inset 0.5px 1px 1.5px rgba(0,0,0,0.9), 0 0.5px 0 rgba(255,255,255,0.7)",
          }}
        />
      ))}
    </div>
  );
}

function DominoTileView({
  a,
  b,
  vertical,
  size = 36,
  faceDown,
  highlight,
  onClick,
  dim,
  animateIn,
  animFrom,
}: {
  a: number;
  b: number;
  vertical?: boolean;
  size?: number;
  faceDown?: boolean;
  highlight?: boolean;
  onClick?: (() => void) | undefined;
  dim?: boolean;
  animateIn?: boolean;
  animFrom?: "player" | "bot";
}) {
  const face = "linear-gradient(145deg, #fffdf6 0%, #f1ead8 55%, #d9cfb6 100%)";
  const back = "linear-gradient(145deg, #2b2b2b 0%, #141414 100%)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative flex shrink-0 items-center justify-center transition-all duration-300 ${
        vertical ? "flex-col" : "flex-row"
      } ${onClick ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default"} ${
        highlight ? "scale-105 ring-2 ring-amber-400 shadow-lg" : ""
      } ${
        animateIn
          ? animFrom === "bot"
            ? "animate-domino-fly-bot"
            : "animate-domino-fly-player"
          : ""
      }`}
      style={{
        borderRadius: size * 0.16,
        background: faceDown ? back : face,
        boxShadow:
          "inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -2px 3px rgba(0,0,0,0.25), 1px 3px 6px rgba(0,0,0,0.45)",
        opacity: dim ? 0.45 : 1,
        padding: 1,
      }}
    >
      {faceDown ? (
        <div
          style={{ width: vertical ? size : size * 2, height: vertical ? size * 2 : size }}
          className="flex items-center justify-center"
        >
          <span
            className="rounded-full shadow-inner"
            style={{ width: size * 0.22, height: size * 0.22, background: "radial-gradient(circle, #e2bc43 0%, #947118 100%)" }}
          />
        </div>
      ) : (
        <>
          <HalfTile n={a} size={size} />
          <span
            style={{
              [vertical ? "width" : "height"]: size * 0.8,
              [vertical ? "height" : "width"]: 2,
              background: "#8f866f",
              borderRadius: 1,
            }}
          />
          <HalfTile n={b} size={size} />
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow"
            style={{
              width: size * 0.13,
              height: size * 0.13,
              background: "radial-gradient(circle at 35% 35%, #f6de8d, #9c7a22)",
            }}
          />
        </>
      )}
    </button>
  );
}

function DominoGameTab() {
  const [deal, setDeal] = useState(newDominoDeal);
  const [train, setTrain] = useState<Placed[]>([]);
  const [turn, setTurn] = useState<Who>("player");
  const [passes, setPasses] = useState(0);
  const [over, setOver] = useState<{ winner: Who | "draw"; reason: string } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [log, setLog] = useState("Your lead — play any tile to start the table.");
  const [score, setScore] = useState({ player: 0, bot: 0 });

  // Intro animation states: shuffling -> dealing -> playing
  const [phase, setPhase] = useState<"shuffling" | "dealing" | "playing">("shuffling");
  const [dealStep, setDealStep] = useState(0);
  const [lastPlacedKey, setLastPlacedKey] = useState<number | null>(null);
  const introTimers = useRef<number[]>([]);

  const clearIntroTimers = () => {
    introTimers.current.forEach((t) => window.clearTimeout(t));
    introTimers.current = [];
  };

  const startShuffleAndDeal = () => {
    clearIntroTimers();
    const newD = newDominoDeal();
    setDeal(newD);
    setTrain([]);
    setTurn("player");
    setPasses(0);
    setOver(null);
    setSel(null);
    setLastPlacedKey(null);
    setPhase("shuffling");
    setDealStep(0);
    setLog("Shuffling the dominoes on the table...");

    // Clacks while the tiles mix
    [300, 650, 1000].forEach((ms) =>
      introTimers.current.push(window.setTimeout(() => playClack(true), ms))
    );

    // After the shuffle, deal 7 tiles to each player one by one
    introTimers.current.push(
      window.setTimeout(() => {
        setPhase("dealing");
        setLog("Dealing 7 dominoes to each player...");
        for (let i = 1; i <= 7; i++) {
          introTimers.current.push(
            window.setTimeout(() => {
              setDealStep(i);
              playClack(true);
            }, i * 170)
          );
        }
        introTimers.current.push(
          window.setTimeout(() => {
            setPhase("playing");
            setLog("Your lead — play any tile to start the table.");
          }, 7 * 170 + 400)
        );
      }, 1400)
    );
  };

  // Run shuffle + deal once on mount
  useEffect(() => {
    startShuffleAndDeal();
    return clearIntroTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetGame = () => {
    startShuffleAndDeal();
  };

  const skipIntro = () => {
    clearIntroTimers();
    setPhase("playing");
    setLog("Your lead — play any tile to start the table.");
  };

  const checkFinish = (pTiles: Tile[], bTiles: Tile[], currentPasses: number) => {
    if (!pTiles.length) {
      setOver({ winner: "player", reason: "You played all tiles! Domino victory!" });
      setScore((s) => ({ ...s, player: s.player + 1 }));
      playChime(true);
      return true;
    }
    if (!bTiles.length) {
      setOver({ winner: "bot", reason: "Bot played all its tiles!" });
      setScore((s) => ({ ...s, bot: s.bot + 1 }));
      playChime(false);
      return true;
    }
    if (currentPasses >= 2) {
      const pSum = pTiles.reduce((sum, t) => sum + pipSum(t), 0);
      const bSum = bTiles.reduce((sum, t) => sum + pipSum(t), 0);
      const win = pSum < bSum ? "player" : bSum < pSum ? "bot" : "draw";
      setOver({ winner: win, reason: `Board blocked! Points: You ${pSum}, Bot ${bSum}.` });
      if (win === "player") {
        setScore((s) => ({ ...s, player: s.player + 1 }));
        playChime(true);
      } else if (win === "bot") {
        setScore((s) => ({ ...s, bot: s.bot + 1 }));
        playChime(false);
      }
      return true;
    }
    return false;
  };

  // Bot Turn
  useEffect(() => {
    if (turn !== "bot" || over || phase !== "playing") return;
    const timer = setTimeout(() => {
      let currentBot = [...deal.bot];
      const currentBoneyard = [...deal.boneyard];
      let drewCount = 0;

      const getMoves = () =>
        currentBot
          .flatMap((t) => validSides(train, t).map((side) => ({ t, side })))
          .sort((x, y) => pipSum(y.t) - pipSum(x.t));

      let moves = getMoves();
      while (!moves.length && currentBoneyard.length) {
        currentBot.push(currentBoneyard.pop()!);
        drewCount++;
        moves = getMoves();
      }

      if (drewCount) playClack(true);

      if (!moves.length) {
        const nextPasses = passes + 1;
        setPasses(nextPasses);
        setDeal((d) => ({ ...d, bot: currentBot, boneyard: currentBoneyard }));
        setTurn("player");
        setLog(`Bot drew ${drewCount} tile(s) and passed.`);
        checkFinish(deal.player, currentBot, nextPasses);
        return;
      }

      const bestMove = moves[0]!;
      currentBot = currentBot.filter((t) => t.id !== bestMove.t.id);
      playClack();
      const animKey = Date.now();
      setLastPlacedKey(animKey);
      const nextTrain = placeTile(train, bestMove.t, bestMove.side, animKey);
      setTrain(nextTrain);
      setDeal((d) => ({ ...d, bot: currentBot, boneyard: currentBoneyard }));
      setPasses(0);
      setTurn("player");
      setLog(`Bot ${drewCount ? `drew ${drewCount} & ` : ""}placed ${bestMove.t.a}|${bestMove.t.b}.`);
      checkFinish(deal.player, currentBot, 0);
    }, 900);
    return () => clearTimeout(timer);
  }, [turn, over, train, deal, passes, phase]);

  const selTile = deal.player.find((t) => t.id === sel);
  const selSides = selTile ? validSides(train, selTile) : [];

  const commitPlay = (tile: Tile, side: Side) => {
    playClack();
    const animKey = Date.now();
    setLastPlacedKey(animKey);
    const nextPlayer = deal.player.filter((t) => t.id !== tile.id);
    const nextTrain = placeTile(train, tile, side, animKey);
    setTrain(nextTrain);
    setDeal((d) => ({ ...d, player: nextPlayer }));
    setSel(null);
    setPasses(0);
    setTurn("bot");
    setLog(`You placed ${tile.a}|${tile.b}.`);
    checkFinish(nextPlayer, deal.bot, 0);
  };

  const handlePlay = (side: Side) => {
    if (!selTile || phase !== "playing") return;
    commitPlay(selTile, side);
  };

  const handleDraw = () => {
    if (turn !== "player" || over || !deal.boneyard.length || phase !== "playing") return;
    const boneyard = [...deal.boneyard];
    const drawn = boneyard.pop()!;
    playClack(true);
    setDeal((d) => ({ ...d, player: [...d.player, drawn], boneyard }));
    setLog(`You drew ${drawn.a}|${drawn.b} from the boneyard.`);
  };

  const handlePass = () => {
    if (turn !== "player" || over || phase !== "playing") return;
    const nextPasses = passes + 1;
    setPasses(nextPasses);
    setTurn("bot");
    setLog("You passed your turn.");
    checkFinish(deal.player, deal.bot, nextPasses);
  };

  const playerCanPlayAny = deal.player.some((t) => validSides(train, t).length > 0);

  // Which tiles are visible during the intro sequence
  const visiblePlayerTiles =
    phase === "shuffling" ? [] : phase === "dealing" ? deal.player.slice(0, dealStep) : deal.player;
  const visibleBotTiles =
    phase === "shuffling" ? [] : phase === "dealing" ? deal.bot.slice(0, dealStep) : deal.bot;

  return (
    <div className="flex flex-col h-full select-none relative overflow-hidden">
      <style>{`
        @keyframes dominoSwirl {
          0% { transform: translate(var(--sx), var(--sy)) rotate(var(--sr)); }
          50% { transform: translate(calc(var(--sx) * -0.65), calc(var(--sy) * -0.65)) rotate(calc(var(--sr) + 180deg)); }
          100% { transform: translate(var(--sx), var(--sy)) rotate(calc(var(--sr) + 360deg)); }
        }
        @keyframes dominoFlyPlayer {
          0% { transform: translateY(90px) scale(1.25); opacity: 0.2; }
          65% { transform: translateY(-6px) scale(1.04); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes dominoFlyBot {
          0% { transform: translateY(-90px) scale(1.25); opacity: 0.2; }
          65% { transform: translateY(6px) scale(1.04); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes dominoPlacePulse {
          0% { transform: scale(1.35); filter: brightness(1.6); box-shadow: 0 0 18px 6px rgba(255, 210, 100, 0.7); }
          100% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 0 0 rgba(255, 210, 100, 0); }
        }
        .animate-domino-fly-player { animation: dominoFlyPlayer 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28) backwards; }
        .animate-domino-fly-bot { animation: dominoFlyBot 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28) backwards; }
        .animate-domino-landed { animation: dominoPlacePulse 0.45s cubic-bezier(0.22, 1, 0.36, 1); }
      `}</style>

      {/* Top Status */}
      <div className="flex items-center justify-between px-3 py-2 bg-stone-900/90 text-xs text-amber-200 border-b border-amber-900/40 z-10">
        <div className="flex items-center gap-4">
          <span className="font-bold">Score: You {score.player} - {score.bot} Bot</span>
          <span className="text-stone-400">Boneyard: {deal.boneyard.length} tiles</span>
        </div>
        <div className="flex items-center gap-2">
          {phase === "playing" ? (
            <span className={`px-2 py-0.5 rounded font-medium ${turn === "player" ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300"}`}>
              {turn === "player" ? "Your Turn" : "Bot thinking..."}
            </span>
          ) : (
            <button onClick={skipIntro} className="px-2 py-0.5 rounded bg-stone-700 hover:bg-stone-600 text-stone-100 font-medium">
              Skip intro
            </button>
          )}
          <button onClick={resetGame} className="p-1 text-stone-400 hover:text-white transition-colors" title="Reshuffle & redeal">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Table: real domino-table photo under a dark green felt tint */}
      <div
        className="flex-1 flex flex-col justify-between p-3 rounded-b-lg overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(rgba(10, 26, 16, 0.62), rgba(7, 18, 11, 0.74)), url(${DOMINO_TABLE_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          border: "3px solid #2b1d12",
          boxShadow: "inset 0 0 50px rgba(0,0,0,0.75)",
        }}
      >
        {/* Bot Tiles (Face Down) */}
        <div className="flex items-center justify-center gap-1.5 py-1 shrink-0" style={{ minHeight: 40 }}>
          {visibleBotTiles.map((t, idx) => (
            <div
              key={t.id}
              className={phase === "dealing" ? "animate-domino-fly-bot" : ""}
              style={phase === "dealing" ? { animationDelay: `${idx * 0.09}s` } : undefined}
            >
              <DominoTileView a={0} b={0} faceDown size={26} />
            </div>
          ))}
          {phase === "shuffling" && <span className="text-[11px] text-stone-300/70 italic">Bot hand is coming...</span>}
        </div>

        {/* Snaking / Multi-Row Board Wrap */}
        <div
          className="my-2 p-2.5 rounded-lg flex flex-col items-center gap-0 overflow-y-auto shrink-0 relative"
          style={{
            backgroundColor: "rgba(8, 30, 19, 0.55)",
            border: "1px solid rgba(40, 100, 64, 0.5)",
            height: 230,
            boxShadow: "inset 0 4px 18px rgba(0,0,0,0.6)",
          }}
        >
          {/* Shuffling: tiles swirl around the middle of the board */}
          {phase === "shuffling" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
              <div className="relative w-52 h-52 flex items-center justify-center">
                {[...Array(16)].map((_, i) => {
                  const angle = (i / 16) * 360;
                  const dist = 34 + (i % 3) * 18;
                  const rad = (angle * Math.PI) / 180;
                  return (
                    <div
                      key={i}
                      className="absolute"
                      style={
                        {
                          "--sx": `${Math.cos(rad) * dist}px`,
                          "--sy": `${Math.sin(rad) * dist}px`,
                          "--sr": `${angle}deg`,
                          animation: "dominoSwirl 1.15s infinite ease-in-out",
                          animationDelay: `${(i % 5) * 0.07}s`,
                        } as React.CSSProperties
                      }
                    >
                      <DominoTileView a={0} b={0} faceDown size={20} />
                    </div>
                  );
                })}
              </div>
              <span className="text-amber-200 font-bold tracking-wider text-xs px-3 py-1 rounded-full bg-black/60 border border-amber-600/40 mt-3">
                Shuffling...
              </span>
            </div>
          )}

          {phase === "dealing" && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <span className="text-amber-300 font-semibold text-xs px-4 py-1.5 rounded-full bg-black/70 border border-amber-500/50 shadow-lg">
                Dealing hands... ({dealStep} / 7)
              </span>
            </div>
          )}

          {train.length === 0 && phase === "playing" ? (
            <div className="text-stone-300/70 text-xs italic text-center my-auto">
              Table is open. Place the first domino to begin.
            </div>
          ) : (
            (() => {
              const ROW_SIZE = 6;
              const SIZE = 28;
              const SLOT_W = SIZE * 2 + 6;
              const ROW_W = ROW_SIZE * SLOT_W;
              const rows: Placed[][] = [];
              for (let i = 0; i < train.length; i += ROW_SIZE) rows.push(train.slice(i, i + ROW_SIZE));

              const tileSlot = (t: Placed, globalIdx: number, vertical: boolean, mirror: boolean) => {
                const leftVal = t.flip ? t.b : t.a;
                const rightVal = t.flip ? t.a : t.b;
                const a = mirror ? rightVal : leftVal;
                const b = mirror ? leftVal : rightVal;
                const justPlaced = lastPlacedKey !== null && t.animKey === lastPlacedKey;
                return (
                  <div key={`${t.id}-${globalIdx}`} className="flex items-center justify-center shrink-0" style={{ width: SLOT_W }}>
                    <div className={justPlaced ? "animate-domino-landed" : ""}>
                      <DominoTileView a={a} b={b} size={SIZE} vertical={vertical} />
                    </div>
                  </div>
                );
              };

              return rows.map((row, rowIdx) => {
                const reversed = rowIdx % 2 === 1;
                const isLastRow = rowIdx === rows.length - 1;
                const body = isLastRow ? row : row.slice(0, -1);
                const turnTile = isLastRow ? null : row[row.length - 1]!;

                return (
                  <div key={rowIdx} style={{ width: ROW_W }}>
                    <div className={`flex items-end ${reversed ? "flex-row-reverse" : ""}`}>
                      {body.map((t, i) => tileSlot(t, rowIdx * ROW_SIZE + i, t.a === t.b, reversed))}
                    </div>
                    {turnTile && (
                      <div className={`flex ${reversed ? "justify-start" : "justify-end"}`}>
                        {tileSlot(turnTile, rowIdx * ROW_SIZE + row.length - 1, true, false)}
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>

        {/* Message Log & End Placement Choices */}
        <div className="flex items-center justify-between text-xs py-1 px-2 text-stone-200 shrink-0" style={{ minHeight: 28 }}>
          <span className="italic truncate" style={{ maxWidth: "70%" }}>{log}</span>
          {selTile && phase === "playing" && (
            <div className="flex items-center gap-1.5">
              <span className="text-amber-300" style={{ fontSize: 11 }}>Connect to:</span>
              {selSides.includes("L") && (
                <button onClick={() => handlePlay("L")} className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 font-bold text-white" style={{ fontSize: 11 }}>
                  Left ({leftEnd(train)})
                </button>
              )}
              {selSides.includes("R") && (
                <button onClick={() => handlePlay("R")} className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 font-bold text-white" style={{ fontSize: 11 }}>
                  Right ({rightEnd(train)})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Player Tiles & Actions */}
        <div className="pt-2 flex flex-col items-center gap-2" style={{ borderTop: "1px solid #1b5034" }}>
          <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-full" style={{ minHeight: 48 }}>
            {visiblePlayerTiles.map((t, idx) => {
              const playable = validSides(train, t).length > 0;
              const isSelected = sel === t.id;
              return (
                <div
                  key={t.id}
                  className={phase === "dealing" ? "animate-domino-fly-player" : ""}
                  style={phase === "dealing" ? { animationDelay: `${idx * 0.09}s` } : undefined}
                >
                  <DominoTileView
                    a={t.a}
                    b={t.b}
                    size={34}
                    highlight={isSelected}
                    dim={turn !== "player" || (!playable && train.length > 0) || phase !== "playing"}
                    onClick={
                      turn === "player" && !over && phase === "playing" && (playable || train.length === 0)
                        ? () => {
                            if (train.length === 0) {
                              commitPlay(t, "R");
                            } else {
                              const sides = validSides(train, t);
                              if (sides.length === 1) {
                                commitPlay(t, sides[0]!);
                              } else {
                                setSel(isSelected ? null : t.id);
                              }
                            }
                          }
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-1">
            {deal.boneyard.length > 0 ? (
              <button
                type="button"
                onClick={handleDraw}
                disabled={turn !== "player" || over !== null || playerCanPlayAny || phase !== "playing"}
                className="px-3 py-1 text-xs rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-amber-200 border border-stone-600 font-semibold transition-all"
              >
                Draw Tile ({deal.boneyard.length})
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePass}
                disabled={turn !== "player" || over !== null || playerCanPlayAny || phase !== "playing"}
                className="px-3 py-1 text-xs rounded bg-amber-900/80 hover:bg-amber-800 disabled:opacity-40 text-amber-100 font-semibold transition-all"
              >
                Pass Turn
              </button>
            )}
            {over && (
              <button
                type="button"
                onClick={resetGame}
                className="px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold animate-pulse"
              >
                Play Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


/* =========================================================================
   Shared UI: "vs Bot / 2 Players" switch used by the board games
   ========================================================================= */
function ModeToggle({ vsBot, onChange }: { vsBot: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-stone-700 text-[11px] font-semibold">
      {([true, false] as const).map((v) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => {
            if (vsBot !== v) onChange(v);
          }}
          className={`px-2 py-0.5 transition-colors ${
            vsBot === v ? "bg-amber-600 text-white" : "bg-stone-800 text-stone-300 hover:bg-stone-700"
          }`}
        >
          {v ? "vs Bot" : "2 Players"}
        </button>
      ))}
    </div>
  );
}

/* =========================================================================
   2. CHESS - full rules (legal moves, check, checkmate, stalemate, castling,
      en passant, promotion, 50-move and insufficient-material draws) plus a
      small alpha-beta bot. You play White; Black is the bot (or a 2nd player).
   ========================================================================= */
type CBoard = string[][];
type CColor = "white" | "black";
type ChessMove = {
  fr: number;
  fc: number;
  tr: number;
  tc: number;
  promo?: string;
  castle?: "K" | "Q";
  ep?: boolean;
};
type MoveExtra = Pick<ChessMove, "promo" | "castle" | "ep">;
type ChessState = {
  board: CBoard;
  turn: CColor;
  rights: { K: boolean; Q: boolean; k: boolean; q: boolean };
  ep: [number, number] | null; // square a pawn just skipped over (en passant target)
  clock: number; // half-moves since the last capture or pawn move
};
type ChessResult = { kind: "mate" | "stalemate" | "fifty" | "insufficient"; winner?: CColor };

// Uppercase = White (bottom, row 7), lowercase = Black (top, row 0).
const INITIAL_CHESS_BOARD = [
  ["r", "n", "b", "q", "k", "b", "n", "r"],
  ["p", "p", "p", "p", "p", "p", "p", "p"],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["P", "P", "P", "P", "P", "P", "P", "P"],
  ["R", "N", "B", "Q", "K", "B", "N", "R"],
];

const newChessGame = (): ChessState => ({
  board: INITIAL_CHESS_BOARD.map((row) => [...row]),
  turn: "white",
  rights: { K: true, Q: true, k: true, q: true },
  ep: null,
  clock: 0,
});

// "#" = off the board, "" = empty square
const sqAt = (b: CBoard, r: number, c: number): string =>
  r < 0 || r > 7 || c < 0 || c > 7 ? "#" : b[r]![c]!;
const isWhitePiece = (p: string) => p !== "" && p !== "#" && p === p.toUpperCase();
const isBlackPiece = (p: string) => p !== "" && p !== "#" && p === p.toLowerCase();

const KNIGHT_D: [number, number][] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_D: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG_D: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH_D: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function squareAttacked(b: CBoard, r: number, c: number, byWhite: boolean): boolean {
  const pawnRow = byWhite ? r + 1 : r - 1;
  const pawn = byWhite ? "P" : "p";
  if (sqAt(b, pawnRow, c - 1) === pawn || sqAt(b, pawnRow, c + 1) === pawn) return true;
  const knight = byWhite ? "N" : "n";
  for (const [dr, dc] of KNIGHT_D) if (sqAt(b, r + dr, c + dc) === knight) return true;
  const king = byWhite ? "K" : "k";
  for (const [dr, dc] of KING_D) if (sqAt(b, r + dr, c + dc) === king) return true;
  const diagonal = byWhite ? "BQ" : "bq";
  const straight = byWhite ? "RQ" : "rq";
  for (const [dr, dc] of DIAG_D) {
    let rr = r + dr;
    let cc = c + dc;
    while (sqAt(b, rr, cc) === "") {
      rr += dr;
      cc += dc;
    }
    const x = sqAt(b, rr, cc);
    if (x !== "#" && diagonal.includes(x)) return true;
  }
  for (const [dr, dc] of ORTH_D) {
    let rr = r + dr;
    let cc = c + dc;
    while (sqAt(b, rr, cc) === "") {
      rr += dr;
      cc += dc;
    }
    const x = sqAt(b, rr, cc);
    if (x !== "#" && straight.includes(x)) return true;
  }
  return false;
}

function pseudoMoves(s: ChessState): ChessMove[] {
  const b = s.board;
  const white = s.turn === "white";
  const mine = white ? isWhitePiece : isBlackPiece;
  const theirs = white ? isBlackPiece : isWhitePiece;
  const out: ChessMove[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c]!;
      if (!mine(p)) continue;
      const kind = p.toLowerCase();
      const add = (tr: number, tc: number, extra?: MoveExtra) => {
        out.push({ fr: r, fc: c, tr, tc, ...extra });
      };

      if (kind === "p") {
        const dr = white ? -1 : 1;
        const lastRow = white ? 0 : 7;
        const addPawn = (tr: number, tc: number, ep?: boolean) => {
          if (tr === lastRow) {
            for (const q of ["q", "r", "b", "n"]) add(tr, tc, { promo: white ? q.toUpperCase() : q });
          } else add(tr, tc, ep ? { ep: true } : undefined);
        };
        if (sqAt(b, r + dr, c) === "") {
          addPawn(r + dr, c);
          if (r === (white ? 6 : 1) && sqAt(b, r + 2 * dr, c) === "") add(r + 2 * dr, c);
        }
        for (const dc of [-1, 1]) {
          const tr = r + dr;
          const tc = c + dc;
          if (theirs(sqAt(b, tr, tc))) addPawn(tr, tc);
          else if (s.ep && s.ep[0] === tr && s.ep[1] === tc) addPawn(tr, tc, true);
        }
      } else if (kind === "n") {
        for (const [dr, dc] of KNIGHT_D) {
          const x = sqAt(b, r + dr, c + dc);
          if (x !== "#" && !mine(x)) add(r + dr, c + dc);
        }
      } else if (kind === "k") {
        for (const [dr, dc] of KING_D) {
          const x = sqAt(b, r + dr, c + dc);
          if (x !== "#" && !mine(x)) add(r + dr, c + dc);
        }
        const home = white ? 7 : 0;
        if (r === home && c === 4 && !squareAttacked(b, home, 4, !white)) {
          const rook = white ? "R" : "r";
          if (
            (white ? s.rights.K : s.rights.k) &&
            sqAt(b, home, 7) === rook &&
            sqAt(b, home, 5) === "" &&
            sqAt(b, home, 6) === "" &&
            !squareAttacked(b, home, 5, !white) &&
            !squareAttacked(b, home, 6, !white)
          ) {
            add(home, 6, { castle: "K" });
          }
          if (
            (white ? s.rights.Q : s.rights.q) &&
            sqAt(b, home, 0) === rook &&
            sqAt(b, home, 1) === "" &&
            sqAt(b, home, 2) === "" &&
            sqAt(b, home, 3) === "" &&
            !squareAttacked(b, home, 3, !white) &&
            !squareAttacked(b, home, 2, !white)
          ) {
            add(home, 2, { castle: "Q" });
          }
        }
      } else {
        const dirs = kind === "b" ? DIAG_D : kind === "r" ? ORTH_D : [...DIAG_D, ...ORTH_D];
        for (const [dr, dc] of dirs) {
          let rr = r + dr;
          let cc = c + dc;
          for (;;) {
            const x = sqAt(b, rr, cc);
            if (x === "#" || mine(x)) break;
            add(rr, cc);
            if (x !== "") break; // captured an enemy piece: stop sliding
            rr += dr;
            cc += dc;
          }
        }
      }
    }
  }
  return out;
}

function applyChessMove(s: ChessState, m: ChessMove): ChessState {
  const board = s.board.map((row) => [...row]);
  const piece = board[m.fr]![m.fc]!;
  const captured = board[m.tr]![m.tc]!;
  board[m.fr]![m.fc] = "";
  board[m.tr]![m.tc] = m.promo ?? piece;
  if (m.ep) board[m.fr]![m.tc] = ""; // the captured pawn sits beside the mover, not on the target square
  if (m.castle === "K") {
    board[m.tr]![5] = board[m.tr]![7]!;
    board[m.tr]![7] = "";
  }
  if (m.castle === "Q") {
    board[m.tr]![3] = board[m.tr]![0]!;
    board[m.tr]![0] = "";
  }

  const rights = { ...s.rights };
  if (piece === "K") {
    rights.K = false;
    rights.Q = false;
  }
  if (piece === "k") {
    rights.k = false;
    rights.q = false;
  }
  // a rook leaving, or being captured on, its corner ends that castling right
  const touch = (r: number, c: number) => {
    if (r === 7 && c === 0) rights.Q = false;
    if (r === 7 && c === 7) rights.K = false;
    if (r === 0 && c === 0) rights.q = false;
    if (r === 0 && c === 7) rights.k = false;
  };
  touch(m.fr, m.fc);
  touch(m.tr, m.tc);

  const isPawn = piece.toLowerCase() === "p";
  const ep: [number, number] | null =
    isPawn && Math.abs(m.tr - m.fr) === 2 ? [(m.fr + m.tr) / 2, m.fc] : null;
  return {
    board,
    turn: s.turn === "white" ? "black" : "white",
    rights,
    ep,
    clock: isPawn || captured !== "" || m.ep ? 0 : s.clock + 1,
  };
}

function kingSquare(b: CBoard, white: boolean): [number, number] | null {
  const k = white ? "K" : "k";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r]![c] === k) return [r, c];
  return null;
}

const chessInCheck = (s: ChessState): boolean => {
  const k = kingSquare(s.board, s.turn === "white");
  return k ? squareAttacked(s.board, k[0], k[1], s.turn !== "white") : false;
};

function legalChessMoves(s: ChessState): ChessMove[] {
  const white = s.turn === "white";
  return pseudoMoves(s).filter((m) => {
    const n = applyChessMove(s, m);
    const k = kingSquare(n.board, white);
    return !k || !squareAttacked(n.board, k[0], k[1], !white);
  });
}

function insufficientMaterial(b: CBoard): boolean {
  const rest: string[] = [];
  for (const row of b) for (const p of row) if (p && p.toLowerCase() !== "k") rest.push(p.toLowerCase());
  return rest.length === 0 || (rest.length === 1 && (rest[0] === "b" || rest[0] === "n"));
}

function chessResult(s: ChessState, moves: ChessMove[]): ChessResult | null {
  if (!moves.length) {
    if (chessInCheck(s)) return { kind: "mate", winner: s.turn === "white" ? "black" : "white" };
    return { kind: "stalemate" };
  }
  if (insufficientMaterial(s.board)) return { kind: "insufficient" };
  if (s.clock >= 100) return { kind: "fifty" };
  return null;
}

/* ---- Chess bot: negamax + alpha-beta, material and light positional eval ---- */
const CHESS_VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function evalChess(b: CBoard): number {
  let score = 0; // positive = good for White
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c]!;
      if (!p) continue;
      const white = isWhitePiece(p);
      const kind = p.toLowerCase();
      let v = CHESS_VAL[kind] ?? 0;
      const centre = 7 - (Math.abs(r - 3.5) + Math.abs(c - 3.5)); // 0 (corner) .. 6 (middle)
      if (kind === "n" || kind === "b") v += centre * 5;
      else if (kind === "p") v += (white ? 6 - r : r - 1) * 6 + (c === 3 || c === 4 ? 4 : 0);
      else if (kind === "q") v += centre;
      score += white ? v : -v;
    }
  }
  return score;
}

function orderMoves(s: ChessState, moves: ChessMove[]): ChessMove[] {
  const rank = (m: ChessMove) => {
    const victim = m.ep ? "p" : sqAt(s.board, m.tr, m.tc);
    const attacker = sqAt(s.board, m.fr, m.fc).toLowerCase();
    const capture = victim !== "" ? 10 * (CHESS_VAL[victim.toLowerCase()] ?? 0) - (CHESS_VAL[attacker] ?? 0) : 0;
    return capture + (m.promo ? 800 : 0);
  };
  return moves
    .map((m) => [m, rank(m)] as const)
    .sort((a, b) => b[1] - a[1])
    .map((x) => x[0]);
}

function chessNegamax(s: ChessState, depth: number, alpha: number, beta: number): number {
  if (depth === 0) {
    if (chessInCheck(s) && legalChessMoves(s).length === 0) return -100000; // mated on the last ply
    return (s.turn === "white" ? 1 : -1) * evalChess(s.board);
  }
  const moves = legalChessMoves(s);
  if (!moves.length) return chessInCheck(s) ? -100000 - depth : 0; // faster mates score higher
  let best = -Infinity;
  for (const m of orderMoves(s, moves)) {
    const v = -chessNegamax(applyChessMove(s, m), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function chooseChessMove(s: ChessState, depth = 3): ChessMove | null {
  const moves = legalChessMoves(s);
  if (!moves.length) return null;
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [moves[i], moves[j]] = [moves[j]!, moves[i]!]; // shuffle so equal moves vary from game to game
  }
  let best = moves[0]!;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const m of orderMoves(s, moves)) {
    const v = -chessNegamax(applyChessMove(s, m), depth - 1, -Infinity, -alpha);
    if (v > bestScore) {
      bestScore = v;
      best = m;
    }
    if (v > alpha) alpha = v;
  }
  return best;
}

const CHESS_GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
// U+FE0E forces the text form; without it Android renders the pawn as a colour emoji
const glyph = (p: string) => (CHESS_GLYPH[p.toLowerCase()] ?? "") + "\uFE0E";
const pieceStyle = (white: boolean) => ({
  color: white ? "#fffaf0" : "#1b120b",
  textShadow: white ? "0 1px 2px rgba(0,0,0,0.85)" : "0 1px 1px rgba(255,255,255,0.3)",
});

function ChessTab() {
  const [game, setGame] = useState<ChessState>(newChessGame);
  const [vsBot, setVsBot] = useState(true);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [last, setLast] = useState<ChessMove | null>(null);
  const [promo, setPromo] = useState<ChessMove[] | null>(null);

  const legal = useMemo(() => legalChessMoves(game), [game]);
  const result = useMemo(() => chessResult(game, legal), [game, legal]);
  const check = useMemo(() => chessInCheck(game), [game]);
  const resultKey = result ? `${result.kind}-${result.winner ?? ""}` : "";
  const botToMove = vsBot && game.turn === "black";

  useEffect(() => {
    if (!result) return;
    if (result.kind !== "mate") playClack(true);
    else playChime(!vsBot || result.winner === "white");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  useEffect(() => {
    if (!botToMove || result) return undefined;
    const id = window.setTimeout(() => {
      const m = chooseChessMove(game);
      if (!m) return;
      setGame(applyChessMove(game, m));
      setLast(m);
      setSel(null);
      playClack();
    }, 450);
    return () => window.clearTimeout(id);
  }, [botToMove, result, game]);

  const targets = useMemo(() => {
    const t = new Set<number>();
    if (sel) for (const m of legal) if (m.fr === sel[0] && m.fc === sel[1]) t.add(m.tr * 8 + m.tc);
    return t;
  }, [sel, legal]);

  const play = (m: ChessMove) => {
    setGame(applyChessMove(game, m));
    setLast(m);
    setSel(null);
    setPromo(null);
    playClack();
  };

  const reset = (nextVsBot: boolean = vsBot) => {
    setGame(newChessGame());
    setSel(null);
    setLast(null);
    setPromo(null);
    setVsBot(nextVsBot);
  };

  const onSquare = (r: number, c: number) => {
    if (result || botToMove || promo) return;
    if (sel) {
      const hits = legal.filter((m) => m.fr === sel[0] && m.fc === sel[1] && m.tr === r && m.tc === c);
      if (hits.length === 1) {
        play(hits[0]!);
        return;
      }
      if (hits.length > 1) {
        setPromo(hits); // pawn reached the last rank: let the player pick the piece
        return;
      }
    }
    const p = game.board[r]![c]!;
    const mine = game.turn === "white" ? isWhitePiece(p) : isBlackPiece(p);
    const same = sel !== null && sel[0] === r && sel[1] === c;
    setSel(mine && !same ? [r, c] : null);
  };

  const side = (c: CColor) => (c === "white" ? "White" : "Black");
  let status: string;
  if (result?.kind === "mate") {
    status = vsBot
      ? result.winner === "white"
        ? "Checkmate - you win!"
        : "Checkmate - the bot wins"
      : `Checkmate - ${side(result.winner ?? "white")} wins`;
  } else if (result?.kind === "stalemate") status = "Stalemate - draw";
  else if (result?.kind === "fifty") status = "Draw - 50-move rule";
  else if (result?.kind === "insufficient") status = "Draw - not enough material";
  else {
    const who = botToMove ? "Bot is thinking..." : vsBot ? "Your move" : `${side(game.turn)} to move`;
    status = `${check ? "Check! " : ""}${who}`;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full select-none p-3">
      <div className="flex items-center justify-between gap-2 w-full max-w-[344px] mb-2 text-xs text-amber-200">
        <span className="font-bold truncate">{status}</span>
        <div className="flex items-center gap-2 shrink-0">
          <ModeToggle vsBot={vsBot} onChange={(v) => reset(v)} />
          <button type="button" onClick={() => reset()} className="p-1 text-stone-400 hover:text-white" title="Reset board">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-8 rounded shadow-xl overflow-hidden" style={{ border: "4px solid #3e2716" }}>
        {game.board.map((row, r) =>
          row.map((piece, c) => {
            const dark = (r + c) % 2 === 1;
            const isSel = sel !== null && sel[0] === r && sel[1] === c;
            const isTarget = targets.has(r * 8 + c);
            const isLast =
              last !== null && ((last.fr === r && last.fc === c) || (last.tr === r && last.tc === c));
            const kingInCheck = check && piece === (game.turn === "white" ? "K" : "k");
            // Inline colors, not Tailwind arbitrary-value classes: some builds purge
            // bracketed bg-[#hex] utilities if this file isn't in the content scan,
            // which is what was leaving these squares plain black.
            const squareColor = isSel
              ? "#fbbf24"
              : kingInCheck
              ? "#ef4444"
              : isLast
              ? dark
                ? "#a4873a"
                : "#dcc766"
              : dark
              ? "#765134"
              : "#eed0a1";
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => onSquare(r, c)}
                className="relative w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-2xl sm:text-3xl leading-none transition-colors"
                style={{ backgroundColor: squareColor }}
              >
                {piece && <span style={pieceStyle(isWhitePiece(piece))}>{glyph(piece)}</span>}
                {isTarget &&
                  (piece ? (
                    <span className="pointer-events-none absolute inset-0 ring-[3px] ring-inset ring-black/35" />
                  ) : (
                    <span className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-black/30" />
                  ))}
              </button>
            );
          })
        )}
      </div>

      {promo && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-200">
          <span>Promote to:</span>
          {promo.map((m) => (
            <button
              key={m.promo}
              type="button"
              onClick={() => play(m)}
              className="w-8 h-8 rounded bg-stone-800 hover:bg-stone-700 border border-stone-600 text-xl leading-none"
            >
              <span style={pieceStyle(isWhitePiece(m.promo ?? ""))}>{glyph(m.promo ?? "")}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPromo(null);
              setSel(null);
            }}
            className="px-2 py-1 text-stone-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}
      {result && (
        <button
          type="button"
          onClick={() => reset()}
          className="mt-2 px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold"
        >
          Play Again
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   3. CHECKERS / DRAUGHTS - American rules on 8x8: men move and capture
      forward, kings any diagonal, captures are mandatory, multi-jumps are
      chained, and a man that reaches the far row is crowned (ending the turn).
      You play Red (bottom); Black is the bot (or a 2nd player).
   ========================================================================= */
type CkSide = "red" | "black";
type CkBoard = string[][]; // "" empty, r/b = men, R/B = kings
type CkMove = { path: [number, number][]; caps: [number, number][] };
type CkState = { board: CkBoard; turn: CkSide; idle: number };
type CkResult = { kind: "win"; winner: CkSide } | { kind: "draw" };

const CK_ALL: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const CK_UP: [number, number][] = [[-1, -1], [-1, 1]];
const CK_DOWN: [number, number][] = [[1, -1], [1, 1]];

const ckCell = (b: CkBoard, r: number, c: number): string =>
  r < 0 || r > 7 || c < 0 || c > 7 ? "#" : b[r]![c]!;
const ckOwner = (p: string): CkSide | null =>
  p === "r" || p === "R" ? "red" : p === "b" || p === "B" ? "black" : null;
const ckDirs = (p: string): [number, number][] =>
  p === "R" || p === "B" ? CK_ALL : p === "r" ? CK_UP : CK_DOWN;

function initCheckers(): CkBoard {
  const b: CkBoard = Array.from({ length: 8 }, () => Array<string>(8).fill(""));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) b[r]![c] = "b";
      else if (r > 4) b[r]![c] = "r";
    }
  }
  return b;
}

const newCheckersGame = (): CkState => ({ board: initCheckers(), turn: "red", idle: 0 });

// Depth-first search for every complete jump sequence of one piece. `b` is a
// scratch board: the moving piece is lifted off it and captured pieces are
// removed while searching (so nothing gets jumped twice) and restored after.
function ckCollectJumps(
  b: CkBoard,
  r: number,
  c: number,
  piece: string,
  path: [number, number][],
  caps: [number, number][],
  out: CkMove[]
): void {
  const side = ckOwner(piece);
  const king = piece === "R" || piece === "B";
  let extended = false;
  for (const [dr, dc] of ckDirs(piece)) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    const mid = ckCell(b, mr, mc);
    if (mid === "" || mid === "#" || ckOwner(mid) === side || ckCell(b, lr, lc) !== "") continue;
    extended = true;
    b[mr]![mc] = "";
    const nextPath: [number, number][] = [...path, [lr, lc]];
    const nextCaps: [number, number][] = [...caps, [mr, mc]];
    const crowned = !king && (side === "red" ? lr === 0 : lr === 7);
    if (crowned) out.push({ path: nextPath, caps: nextCaps }); // crowning ends the move
    else ckCollectJumps(b, lr, lc, piece, nextPath, nextCaps, out);
    b[mr]![mc] = mid;
  }
  if (!extended && caps.length > 0) out.push({ path, caps });
}

function legalCkMoves(s: CkState): CkMove[] {
  const b = s.board.map((row) => [...row]);
  const jumps: CkMove[] = [];
  const steps: CkMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c]!;
      if (ckOwner(p) !== s.turn) continue;
      b[r]![c] = "";
      ckCollectJumps(b, r, c, p, [[r, c]], [], jumps);
      b[r]![c] = p;
      for (const [dr, dc] of ckDirs(p)) {
        if (ckCell(b, r + dr, c + dc) === "") {
          steps.push({ path: [[r, c], [r + dr, c + dc]], caps: [] });
        }
      }
    }
  }
  return jumps.length ? jumps : steps; // capturing is mandatory
}

function applyCkMove(s: CkState, m: CkMove): CkState {
  const board = s.board.map((row) => [...row]);
  const [fr, fc] = m.path[0]!;
  const [tr, tc] = m.path[m.path.length - 1]!;
  const piece = board[fr]![fc]!;
  board[fr]![fc] = "";
  for (const [cr, cc] of m.caps) board[cr]![cc] = "";
  const man = piece === "r" || piece === "b";
  const crowned = man && (piece === "r" ? tr === 0 : tr === 7);
  board[tr]![tc] = crowned ? piece.toUpperCase() : piece;
  return {
    board,
    turn: s.turn === "red" ? "black" : "red",
    idle: man || m.caps.length > 0 ? 0 : s.idle + 1,
  };
}

function ckResult(s: CkState, moves: CkMove[]): CkResult | null {
  if (!moves.length) return { kind: "win", winner: s.turn === "red" ? "black" : "red" };
  if (s.idle >= 80) return { kind: "draw" }; // 40 moves each without a capture or a man move
  return null;
}

/* ---- Checkers bot: negamax + alpha-beta with a capture-only extension ---- */
function evalCk(b: CkBoard): number {
  let score = 0; // positive = good for Red
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c]!;
      if (!p) continue;
      const red = ckOwner(p) === "red";
      const king = p === "R" || p === "B";
      let v = king ? 175 : 100;
      if (!king) {
        v += (red ? 7 - r : r) * 5; // advance towards the crowning row
        if (red ? r === 7 : r === 0) v += 8; // keep some back-row guards
      }
      v += (3.5 - Math.abs(c - 3.5)) * 2; // prefer the middle of the board
      score += red ? v : -v;
    }
  }
  return score;
}

function ckNegamax(s: CkState, depth: number, alpha: number, beta: number): number {
  const moves = legalCkMoves(s);
  if (!moves.length) return -10000 - depth; // side to move has lost
  if (s.idle >= 80) return 0;
  const forced = moves[0]!.caps.length > 0;
  // don't stop the search in the middle of a forced capture exchange
  if (depth <= 0 && (!forced || depth <= -6)) return (s.turn === "red" ? 1 : -1) * evalCk(s.board);
  let best = -Infinity;
  for (const m of moves) {
    const v = -ckNegamax(applyCkMove(s, m), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function chooseCkMove(s: CkState, depth = 6): CkMove | null {
  const moves = legalCkMoves(s);
  if (!moves.length) return null;
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [moves[i], moves[j]] = [moves[j]!, moves[i]!];
  }
  let best = moves[0]!;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const m of moves) {
    const v = -ckNegamax(applyCkMove(s, m), depth - 1, -Infinity, -alpha);
    if (v > bestScore) {
      bestScore = v;
      best = m;
    }
    if (v > alpha) alpha = v;
  }
  return best;
}

const ckPathMatches = (m: CkMove, partial: [number, number][]) =>
  partial.every((sq, i) => m.path[i]?.[0] === sq[0] && m.path[i]?.[1] === sq[1]);

function CheckersTab() {
  const [game, setGame] = useState<CkState>(newCheckersGame);
  const [vsBot, setVsBot] = useState(true);
  const [partial, setPartial] = useState<[number, number][]>([]); // squares picked so far this turn
  const [last, setLast] = useState<CkMove | null>(null);

  const legal = useMemo(() => legalCkMoves(game), [game]);
  const result = useMemo(() => ckResult(game, legal), [game, legal]);
  const resultKey = result ? (result.kind === "win" ? `win-${result.winner}` : "draw") : "";
  const botToMove = vsBot && game.turn === "black";
  const mustCapture = legal.length > 0 && legal[0]!.caps.length > 0;

  useEffect(() => {
    if (!result) return;
    if (result.kind === "win") playChime(!vsBot || result.winner === "red");
    else playClack(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  useEffect(() => {
    if (!botToMove || result) return undefined;
    const id = window.setTimeout(() => {
      const m = chooseCkMove(game);
      if (!m) return;
      setGame(applyCkMove(game, m));
      setLast(m);
      setPartial([]);
      playClack();
    }, 550);
    return () => window.clearTimeout(id);
  }, [botToMove, result, game]);

  const cands = partial.length ? legal.filter((m) => ckPathMatches(m, partial)) : [];
  const nextSquares = new Set<number>();
  for (const m of cands) {
    const q = m.path[partial.length];
    if (q) nextSquares.add(q[0] * 8 + q[1]);
  }
  const movable = new Set(legal.map((m) => m.path[0]![0] * 8 + m.path[0]![1]));

  const play = (m: CkMove) => {
    setGame(applyCkMove(game, m));
    setLast(m);
    setPartial([]);
    playClack();
  };

  const reset = (nextVsBot: boolean = vsBot) => {
    setGame(newCheckersGame());
    setPartial([]);
    setLast(null);
    setVsBot(nextVsBot);
  };

  const onCell = (r: number, c: number) => {
    if (result || botToMove) return;
    if (partial.length > 0) {
      const next = cands.filter((m) => {
        const q = m.path[partial.length];
        return q !== undefined && q[0] === r && q[1] === c;
      });
      if (next.length) {
        const np: [number, number][] = [...partial, [r, c]];
        const done = next.find((m) => m.path.length === np.length);
        if (done) play(done);
        else setPartial(np); // more jumps to go: keep the piece selected
        return;
      }
      if (partial.length > 1) return; // already mid multi-jump, must finish it
    }
    const already = partial.length === 1 && partial[0]![0] === r && partial[0]![1] === c;
    setPartial(movable.has(r * 8 + c) && !already ? [[r, c]] : []);
  };

  const name = (s: CkSide) => (s === "red" ? "Red" : "Black");
  let status: string;
  if (result?.kind === "win") {
    status = vsBot ? (result.winner === "red" ? "You win!" : "The bot wins") : `${name(result.winner)} wins!`;
  } else if (result?.kind === "draw") status = "Draw - no progress";
  else status = botToMove ? "Bot is thinking..." : vsBot ? "Your move (Red)" : `${name(game.turn)} to move`;

  const humanTurn = !result && !botToMove;
  const hint =
    humanTurn && partial.length > 1
      ? "Keep jumping with the same piece."
      : humanTurn && mustCapture
      ? "You must capture - pick a piece that can jump."
      : "";

  return (
    <div className="flex flex-col items-center justify-center h-full select-none p-3">
      <div className="flex items-center justify-between gap-2 w-full max-w-[344px] mb-2 text-xs text-amber-200">
        <span className="font-bold truncate">{status}</span>
        <div className="flex items-center gap-2 shrink-0">
          <ModeToggle vsBot={vsBot} onChange={(v) => reset(v)} />
          <button type="button" onClick={() => reset()} className="p-1 text-stone-400 hover:text-white" title="Reset board">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-8 rounded shadow-xl overflow-hidden" style={{ border: "4px solid #3e2716" }}>
        {game.board.map((row, r) =>
          row.map((piece, c) => {
            const dark = (r + c) % 2 === 1;
            const idx = r * 8 + c;
            const picked = partial.some((q) => q[0] === r && q[1] === c);
            const isLast = last !== null && last.path.some((q) => q[0] === r && q[1] === c);
            const red = ckOwner(piece) === "red";
            const king = piece === "R" || piece === "B";
            const nudge = humanTurn && mustCapture && partial.length === 0 && movable.has(idx);
            // Inline colors, not Tailwind arbitrary-value classes: see the note in ChessTab.
            const squareColor = picked ? "#fbbf24" : isLast && dark ? "#4a3d1f" : dark ? "#2a241f" : "#d7b892";
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => onCell(r, c)}
                className="relative w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center transition-colors"
                style={{ backgroundColor: squareColor }}
              >
                {piece && (
                  <span
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full shadow-md flex items-center justify-center border-2 text-[10px] font-black ${
                      red ? "bg-red-600 border-red-300 text-amber-200" : "bg-stone-900 border-stone-600 text-amber-300"
                    } ${nudge ? "ring-2 ring-amber-300" : ""}`}
                  >
                    {king ? "K" : ""}
                  </span>
                )}
                {nextSquares.has(idx) && (
                  <span className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                )}
              </button>
            );
          })
        )}
      </div>

      <p className="mt-2 min-h-[16px] text-[11px] text-amber-300">{hint}</p>
      {result && (
        <button
          type="button"
          onClick={() => reset()}
          className="mt-1 px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold"
        >
          Play Again
        </button>
      )}
    </div>
  );
}
/* =========================================================================
   4. CONNECT FOUR (7 cols x 6 rows) - vs Bot (minimax + alpha-beta) or
      2 Players. Row 0 is the top; discs fall to the lowest empty row.
   ========================================================================= */
type C4Cell = "" | "red" | "yellow";
type C4Grid = C4Cell[][];

const newC4Grid = (): C4Grid =>
  Array.from({ length: 6 }, () => Array<C4Cell>(7).fill(""));

const C4_DIRS: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];

function c4Winner(g: C4Grid, r: number, c: number, p: C4Cell): boolean {
  return C4_DIRS.some(([dr, dc]) => {
    let count = 1;
    for (const s of [1, -1]) {
      let nr = r + dr * s;
      let nc = c + dc * s;
      while (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && g[nr]![nc] === p) {
        count++;
        nr += dr * s;
        nc += dc * s;
      }
    }
    return count >= 4;
  });
}

function c4DropRow(g: C4Grid, col: number): number {
  for (let r = 5; r >= 0; r--) if (!g[r]![col]) return r;
  return -1;
}

const c4OpenCols = (g: C4Grid): number[] =>
  [0, 1, 2, 3, 4, 5, 6].filter((c) => g[0]![c] === "");

function c4WindowScore(cells: C4Cell[], mine: C4Cell, theirs: C4Cell): number {
  const my = cells.filter((x) => x === mine).length;
  const opp = cells.filter((x) => x === theirs).length;
  const empty = cells.filter((x) => x === "").length;
  if (my > 0 && opp > 0) return 0; // window is contested, not scorable
  if (my === 4) return 100000;
  if (my === 3 && empty === 1) return 80;
  if (my === 2 && empty === 2) return 8;
  if (opp === 3 && empty === 1) return -90; // weight blocking slightly above pushing our own 3s
  if (opp === 2 && empty === 2) return -7;
  return 0;
}

function evalC4(g: C4Grid, mine: C4Cell): number {
  const theirs = mine === "red" ? "yellow" : "red";
  let score = 0;
  for (let c = 0; c < 7; c++) score += g[3]![c] === mine ? 6 : g[3]![c] === theirs ? -6 : 0; // centre column bias
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 4; c++) {
      score += c4WindowScore([g[r]![c]!, g[r]![c + 1]!, g[r]![c + 2]!, g[r]![c + 3]!], mine, theirs);
    }
  }
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r < 3; r++) {
      score += c4WindowScore([g[r]![c]!, g[r + 1]![c]!, g[r + 2]![c]!, g[r + 3]![c]!], mine, theirs);
    }
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      score += c4WindowScore([g[r]![c]!, g[r + 1]![c + 1]!, g[r + 2]![c + 2]!, g[r + 3]![c + 3]!], mine, theirs);
      score += c4WindowScore(
        [g[r + 3]![c]!, g[r + 2]![c + 1]!, g[r + 1]![c + 2]!, g[r]![c + 3]!],
        mine,
        theirs
      );
    }
  }
  return score;
}

const C4_COL_ORDER = [3, 2, 4, 1, 5, 0, 6]; // search the centre first: better pruning, better ties

function c4Minimax(
  g: C4Grid,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  bot: C4Cell,
  human: C4Cell
): number {
  const open = c4OpenCols(g);
  if (depth === 0 || open.length === 0) return evalC4(g, bot);
  if (maximizing) {
    let best = -Infinity;
    for (const c of C4_COL_ORDER) {
      if (g[0]![c] !== "") continue;
      const r = c4DropRow(g, c);
      g[r]![c] = bot;
      const score = c4Winner(g, r, c, bot) ? 1000000 + depth : c4Minimax(g, depth - 1, alpha, beta, false, bot, human);
      g[r]![c] = "";
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let worst = Infinity;
  for (const c of C4_COL_ORDER) {
    if (g[0]![c] !== "") continue;
    const r = c4DropRow(g, c);
    g[r]![c] = human;
    const score = c4Winner(g, r, c, human) ? -1000000 - depth : c4Minimax(g, depth - 1, alpha, beta, true, bot, human);
    g[r]![c] = "";
    if (score < worst) worst = score;
    if (worst < beta) beta = worst;
    if (alpha >= beta) break;
  }
  return worst;
}

function chooseC4Col(g: C4Grid, bot: C4Cell, depth = 6): number | null {
  const human = bot === "red" ? "yellow" : "red";
  const open = c4OpenCols(g);
  if (!open.length) return null;
  let best = open[0]!;
  let bestScore = -Infinity;
  for (const c of C4_COL_ORDER) {
    if (g[0]![c] !== "") continue;
    const r = c4DropRow(g, c);
    g[r]![c] = bot;
    const score = c4Winner(g, r, c, bot) ? 1000000 : c4Minimax(g, depth - 1, -Infinity, Infinity, false, bot, human);
    g[r]![c] = "";
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function ConnectFourTab() {
  const [grid, setGrid] = useState<C4Grid>(newC4Grid);
  const [turn, setTurn] = useState<C4Cell>("red");
  const [winner, setWinner] = useState<C4Cell | "draw" | null>(null);
  const [vsBot, setVsBot] = useState(true);
  const botSide: C4Cell = "yellow";
  const botToMove = vsBot && !winner && turn === botSide;

  const reset = (nextVsBot: boolean = vsBot) => {
    setGrid(newC4Grid());
    setTurn("red");
    setWinner(null);
    setVsBot(nextVsBot);
  };

  const drop = (col: number) => {
    if (winner || botToMove) return;
    const r = c4DropRow(grid, col);
    if (r < 0) return;
    const next = grid.map((row) => [...row]);
    next[r]![col] = turn;
    setGrid(next);
    playClack();
    if (c4Winner(next, r, col, turn)) {
      setWinner(turn);
      playChime(!vsBot || turn === "red");
    } else if (c4OpenCols(next).length === 0) {
      setWinner("draw");
      playClack(true);
    } else {
      setTurn(turn === "red" ? "yellow" : "red");
    }
  };

  useEffect(() => {
    if (!botToMove) return undefined;
    const id = window.setTimeout(() => {
      const col = chooseC4Col(grid, botSide);
      if (col === null) return;
      const r = c4DropRow(grid, col);
      const next = grid.map((row) => [...row]);
      next[r]![col] = botSide;
      setGrid(next);
      playClack();
      if (c4Winner(next, r, col, botSide)) {
        setWinner(botSide);
        playChime(false);
      } else if (c4OpenCols(next).length === 0) {
        setWinner("draw");
        playClack(true);
      } else {
        setTurn("red");
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [botToMove, grid]);

  const label = (p: C4Cell) => (p === "red" ? "Red" : "Yellow");
  let status: string;
  if (winner === "draw") status = "Board full - draw!";
  else if (winner) status = vsBot ? (winner === "red" ? "You win!" : "The bot wins") : `${label(winner)} wins!`;
  else status = botToMove ? "Bot is thinking..." : vsBot ? "Your move (Red)" : `Turn: ${label(turn)}`;

  return (
    <div className="flex flex-col items-center justify-center h-full select-none p-3">
      <div className="flex items-center justify-between w-full max-w-[320px] mb-2 text-xs text-amber-200">
        <span className="font-bold truncate">{status}</span>
        <div className="flex items-center gap-2 shrink-0">
          <ModeToggle vsBot={vsBot} onChange={(v) => reset(v)} />
          <button type="button" onClick={() => reset()} className="p-1 text-stone-400 hover:text-white" title="Reset board">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 p-3 bg-blue-700 rounded-xl shadow-2xl border-4 border-blue-900">
        {Array.from({ length: 7 }).map((_, c) => (
          <button
            key={c}
            type="button"
            onClick={() => drop(c)}
            disabled={!!winner || botToMove}
            className="flex flex-col gap-1.5 hover:bg-blue-600/40 p-1 rounded transition-colors disabled:hover:bg-transparent"
          >
            {Array.from({ length: 6 }).map((_, r) => {
              const val = grid[r]![c];
              return (
                <span
                  key={r}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full shadow-inner border border-blue-900/50 ${
                    val === "red" ? "bg-red-500 shadow-md" : val === "yellow" ? "bg-amber-400 shadow-md" : "bg-blue-950"
                  }`}
                />
              );
            })}
          </button>
        ))}
      </div>
      {winner && (
        <button
          type="button"
          onClick={() => reset()}
          className="mt-2 px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold"
        >
          Play Again
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   5. TIC-TAC-TOE (3x3) - vs Bot (perfect-play minimax) or 2 Players
   ========================================================================= */
type TttCell = "" | "X" | "O";
const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

function tttWinner(b: TttCell[]): TttCell | null {
  for (const [a, c, d] of TTT_LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]!;
  return null;
}

function tttMinimax(b: TttCell[], player: TttCell, bot: TttCell, depth: number): number {
  const w = tttWinner(b);
  if (w === bot) return 10 - depth;
  if (w && w !== bot) return depth - 10;
  if (b.every((v) => v !== "")) return 0;
  const scores = b
    .map((v, i) => (v === "" ? i : -1))
    .filter((i) => i >= 0)
    .map((i) => {
      const next = [...b];
      next[i] = player;
      return tttMinimax(next, player === "X" ? "O" : "X", bot, depth + 1);
    });
  return player === bot ? Math.max(...scores) : Math.min(...scores);
}

function chooseTttMove(b: TttCell[], bot: TttCell): number | null {
  const empties = b.map((v, i) => (v === "" ? i : -1)).filter((i) => i >= 0);
  if (!empties.length) return null;
  if (b.every((v) => v === "")) return 4; // opening move: take the centre, skip the full search
  let best = empties[0]!;
  let bestScore = -Infinity;
  for (const i of empties) {
    const next = [...b];
    next[i] = bot;
    const score = tttMinimax(next, bot === "X" ? "O" : "X", bot, 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function TicTacToeTab() {
  const [board, setBoard] = useState<TttCell[]>(Array(9).fill(""));
  const [turn, setTurn] = useState<TttCell>("X");
  const [winner, setWinner] = useState<TttCell | "Draw" | null>(null);
  const [vsBot, setVsBot] = useState(true);
  const botSide: TttCell = "O";
  const botToMove = vsBot && !winner && turn === botSide;

  const reset = (nextVsBot: boolean = vsBot) => {
    setBoard(Array(9).fill(""));
    setTurn("X");
    setWinner(null);
    setVsBot(nextVsBot);
  };

  const place = (i: number, p: TttCell, b: TttCell[]) => {
    const next = [...b];
    next[i] = p;
    setBoard(next);
    playClack();
    const w = tttWinner(next);
    if (w) {
      setWinner(w);
      playChime(!vsBot || w === "X");
    } else if (next.every((v) => v !== "")) {
      setWinner("Draw");
      playClack(true);
    } else {
      setTurn(p === "X" ? "O" : "X");
    }
  };

  const handleCell = (i: number) => {
    if (board[i] || winner || botToMove) return;
    place(i, turn, board);
  };

  useEffect(() => {
    if (!botToMove) return undefined;
    const id = window.setTimeout(() => {
      const i = chooseTttMove(board, botSide);
      if (i !== null) place(i, botSide, board);
    }, 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botToMove, board]);

  let status: string;
  if (winner === "Draw") status = "Draw!";
  else if (winner) status = vsBot ? (winner === "X" ? "You win!" : "The bot wins") : `${winner} wins!`;
  else status = botToMove ? "Bot is thinking..." : vsBot ? "Your move (X)" : `Turn: Player ${turn}`;

  return (
    <div className="flex flex-col items-center justify-center h-full select-none p-3">
      <div className="flex items-center justify-between w-full max-w-[260px] mb-3 text-xs text-amber-200">
        <span className="font-bold truncate">{status}</span>
        <div className="flex items-center gap-2 shrink-0">
          <ModeToggle vsBot={vsBot} onChange={(v) => reset(v)} />
          <button type="button" onClick={() => reset()} className="p-1 text-stone-400 hover:text-white" title="Reset board">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3 bg-stone-900 rounded-xl border-2 border-stone-700 shadow-xl">
        {board.map((cell, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleCell(i)}
            disabled={!!winner || botToMove || cell !== ""}
            className="w-16 h-16 sm:w-18 sm:h-18 bg-stone-800 hover:bg-stone-700 disabled:hover:bg-stone-800 rounded-lg text-3xl font-black text-amber-400 flex items-center justify-center transition-all shadow-md"
          >
            {cell}
          </button>
        ))}
      </div>
      {winner && (
        <button
          type="button"
          onClick={() => reset()}
          className="mt-2 px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold"
        >
          Play Again
        </button>
      )}
    </div>
  );
}
/* =========================================================================
   MAIN EXPORT: TABLETOP GAMES OVERLAY
   ========================================================================= */
export type TabletopTab = "dominoes" | "chess" | "checkers" | "connect4" | "tictactoe";

export interface TabletopGamesProps {
  onExit: () => void;
  defaultTab?: TabletopTab;
}

export function TabletopGames({ onExit, defaultTab = "dominoes" }: TabletopGamesProps) {
  const [tab, setTab] = useState<TabletopTab>(defaultTab);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onExit();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div
        className="relative flex flex-col w-full max-w-2xl bg-stone-900 border border-amber-900/40 rounded-2xl shadow-2xl overflow-hidden"
        style={{ height: 570, maxHeight: "92vh" }}
      >
        {/* Navigation Bar */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-stone-950 border-b border-stone-800">
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
            {(
              [
                ["dominoes", "Dominoes"],
                ["chess", "Chess"],
                ["checkers", "Checkers"],
                ["connect4", "Connect 4"],
                ["tictactoe", "Tic-Tac-Toe"],
              ] as const
            ).map(([tKey, label]) => (
              <button
                key={tKey}
                type="button"
                onClick={() => setTab(tKey)}
                className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                  tab === tKey
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-stone-800/80 text-stone-300 hover:bg-stone-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onExit}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors ml-2"
            title="Exit Game (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Game Container */}
        <div className="flex-1 bg-stone-950/60 overflow-hidden">
          {tab === "dominoes" && <DominoGameTab />}
          {tab === "chess" && <ChessTab />}
          {tab === "checkers" && <CheckersTab />}
          {tab === "connect4" && <ConnectFourTab />}
          {tab === "tictactoe" && <TicTacToeTab />}
        </div>
      </div>
    </div>
  );
}

// Also export as DominoGame so it drop-in replaces existing DominoGame imports seamlessly!
export const DominoGame = TabletopGames;


/* =========================================================================
   10. BASKETBALL SHOOTING CHALLENGE
   ========================================================================= */
export type BasketballSpot = {
  name: string;
  pos: [number, number, number];
  distance: string;
  points: number;
};

export const BASKETBALL_SPOTS: BasketballSpot[] = [
  { name: "Free Throw Line", pos: [0, 1.2, 187.5], distance: "4.5m", points: 1 },
  { name: "Right Wing", pos: [4.2, 1.2, 188.0], distance: "5.5m", points: 2 },
  { name: "Left Corner", pos: [-4.8, 1.2, 191.0], distance: "5.0m", points: 2 },
  { name: "Top of the Key", pos: [0, 1.2, 184.8], distance: "7.2m (3PT)", points: 3 },
  { name: "Deep Downtown", pos: [-2.5, 1.2, 182.0], distance: "10.0m (Deep)", points: 5 },
];

export const HOOP_RIM_POSITION = new THREE.Vector3(0, 3.85, 191.95);
export const HOOP_RIM_RADIUS = 0.45;

function playBasketSound(type: "swish" | "rim" | "cheer") {
  try {
    const c = getAudioContext();
    const t = c.currentTime;
    if (type === "swish") {
      const len = Math.floor(c.sampleRate * 0.18);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = "highpass";
      bp.frequency.value = 1800;
      const g = c.createGain();
      g.gain.value = 0.4;
      src.connect(bp).connect(g).connect(c.destination);
      src.start(t);
    } else if (type === "rim") {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(260, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.3);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.3);
    } else if (type === "cheer") {
      const len = Math.floor(c.sampleRate * 0.7);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      const g = c.createGain();
      g.gain.value = 0.3;
      src.connect(bp).connect(g).connect(c.destination);
      src.start(t);
    }
  } catch {}
}

export function BasketballGameOverlay({ onExit }: { onExit: () => void }) {
  const [spotIdx, setSpotIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [power, setPower] = useState(45);
  const [angle, setAngle] = useState(48);
  const [charging, setCharging] = useState(false);
  const [shotActive, setShotActive] = useState(false);
  const [ballPos, setBallPos] = useState<[number, number, number]>([0, 1.2, 187.5]);
  const [feedback, setFeedback] = useState("Hold SPACE or Click & Hold to Charge Shot");

  const currentSpot = BASKETBALL_SPOTS[spotIdx]!;

  useEffect(() => {
    setBallPos(currentSpot.pos);
    setShotActive(false);
  }, [spotIdx, currentSpot]);

  const trajectoryPoints = useMemo(() => {
    const start = new THREE.Vector3(...currentSpot.pos);
    const target = HOOP_RIM_POSITION.clone();
    const dir = new THREE.Vector3().subVectors(target, start).setY(0).normalize();
    const rad = (angle * Math.PI) / 180;
    const v0 = (power / 100) * 16.5;
    const vx = dir.x * v0 * Math.cos(rad);
    const vz = dir.z * v0 * Math.cos(rad);
    const vy = v0 * Math.sin(rad);
    const g = 9.81;

    const pts: [number, number, number][] = [];
    const totalTime = Math.max(0.4, (2 * vy) / g + 0.3);
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * totalTime;
      const x = start.x + vx * t;
      const y = Math.max(0.2, start.y + vy * t - 0.5 * g * t * t);
      const z = start.z + vz * t;
      pts.push([x, y, z]);
    }
    return pts;
  }, [currentSpot, angle, power]);

  useEffect(() => {
    if (!charging || shotActive) return;
    const interval = setInterval(() => {
      setPower((p) => (p >= 98 ? 20 : p + 2.5));
    }, 30);
    return () => clearInterval(interval);
  }, [charging, shotActive]);

  const shootBall = () => {
    if (shotActive) return;
    setShotActive(true);
    setCharging(false);
    playBasketSound("swish");

    let step = 0;
    const pts = trajectoryPoints;
    const timer = setInterval(() => {
      step++;
      if (step < pts.length) {
        setBallPos(pts[step]!);
      } else {
        clearInterval(timer);
        const finalP = pts[pts.length - 1]!;
        const distToRim = Math.hypot(finalP[0] - HOOP_RIM_POSITION.x, finalP[2] - HOOP_RIM_POSITION.z);
        const heightDiff = Math.abs(finalP[1] - HOOP_RIM_POSITION.y);

        if (distToRim < HOOP_RIM_RADIUS * 1.3 && heightDiff < 0.6) {
          playBasketSound("cheer");
          setScore((s) => s + currentSpot.points);
          setStreak((st) => st + 1);
          setFeedback(`BUCKET! +${currentSpot.points} PTS!`);
          setTimeout(() => {
            setSpotIdx((prev) => (prev + 1) % BASKETBALL_SPOTS.length);
            setFeedback("Advancing to next spot!");
          }, 1000);
        } else if (distToRim < HOOP_RIM_RADIUS * 2.2) {
          playBasketSound("rim");
          setStreak(0);
          setFeedback("Clank! Off the rim!");
        } else {
          setStreak(0);
          setFeedback("Airball! Adjust power or angle.");
        }
        setTimeout(() => {
          setBallPos(currentSpot.pos);
          setShotActive(false);
        }, 1200);
      }
    }, 28);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !shotActive) {
        e.preventDefault();
        setCharging(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && charging) {
        e.preventDefault();
        shootBall();
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [charging, shotActive, trajectoryPoints]);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-between p-6">
      <div className="pointer-events-auto flex items-center justify-between bg-stone-900/90 backdrop-blur border border-stone-800 rounded-2xl p-4 max-w-2xl mx-auto w-full shadow-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-amber-400">ISLAND HOOPS</span>
            <span className="text-xs font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
              {currentSpot.name} ({currentSpot.distance})
            </span>
          </div>
          <div className="text-xs text-stone-400 mt-0.5">{feedback}</div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs font-mono text-stone-400">SCORE / STREAK</div>
            <div className="text-2xl font-black text-white">
              {score} <span className="text-sm font-semibold text-amber-400">🔥 {streak}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="p-2 rounded-xl bg-stone-800 text-stone-400 hover:text-white hover:bg-stone-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="pointer-events-auto bg-stone-900/90 backdrop-blur border border-stone-800 rounded-2xl p-4 max-w-md mx-auto w-full shadow-2xl flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-mono text-stone-300">
          <span>SHOT POWER: {Math.round(power)}%</span>
          <span>LAUNCH ANGLE: {angle}°</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="range"
            min="30"
            max="70"
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <div className="w-full h-4 bg-stone-950 rounded-full overflow-hidden border border-stone-800 p-0.5">
          <div
            className="h-full rounded-full transition-all duration-75"
            style={{
              width: `${power}%`,
              background:
                power > 40 && power < 70
                  ? "linear-gradient(90deg, #10b981, #059669)"
                  : "linear-gradient(90deg, #f59e0b, #ef4444)",
            }}
          />
        </div>

        <button
          type="button"
          onMouseDown={() => setCharging(true)}
          onMouseUp={shootBall}
          onTouchStart={() => setCharging(true)}
          onTouchEnd={shootBall}
          disabled={shotActive}
          className={`w-full py-3 rounded-xl font-extrabold text-sm uppercase tracking-wider shadow-lg transition-all ${
            shotActive
              ? "bg-stone-800 text-stone-500 cursor-not-allowed"
              : charging
              ? "bg-amber-500 text-stone-950 scale-95 shadow-amber-500/30"
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-700/30 hover:scale-[1.02]"
          }`}
        >
          {shotActive ? "Ball in Flight..." : charging ? "Release to Shoot!" : "Hold to Charge & Shoot"}
        </button>
      </div>
    </div>
  );
}



/* =========================================================================
   11. FOOTBALL / SOCCER PENALTY CHALLENGE
   ========================================================================= */
export const FOOTBALL_PITCH_POS = new THREE.Vector3(-14.74, 0.41, 193.02);
export const FOOTBALL_GOAL_NORTH = new THREE.Vector3(-14.74, 1.2, 212.95);
export const FOOTBALL_GOAL_SOUTH = new THREE.Vector3(-14.74, 1.2, 173.12);

export function FootballGameOverlay({ onExit }: { onExit: () => void }) {
  const [score, setScore] = useState(0);
  const [shots, setShots] = useState(0);
  const [aimX, setAimX] = useState(0); // -1 (left) to 1 (right)
  const [aimY, setAimY] = useState(0.5); // 0 (low) to 1 (high)
  const [power, setPower] = useState(50);
  const [curve, setCurve] = useState(0); // -1 to 1
  const [charging, setCharging] = useState(false);
  const [kicking, setKicking] = useState(false);
  const [keeperPos, setKeeperPos] = useState({ x: 0, y: 0.3 });
  const [feedback, setFeedback] = useState("Aim your shot and charge power!");

  // Keeper idle movement
  useEffect(() => {
    if (kicking) return;
    const interval = setInterval(() => {
      setKeeperPos({
        x: (Math.random() * 1.2 - 0.6),
        y: 0.2 + Math.random() * 0.3,
      });
    }, 600);
    return () => clearInterval(interval);
  }, [kicking]);

  // Power cycle
  useEffect(() => {
    if (!charging || kicking) return;
    const interval = setInterval(() => {
      setPower((p) => (p >= 96 ? 20 : p + 3));
    }, 30);
    return () => clearInterval(interval);
  }, [charging, kicking]);

  const kickBall = () => {
    if (kicking) return;
    setKicking(true);
    setCharging(false);
    setShots((s) => s + 1);

    // Goalkeeper dives toward predicted spot with slight error
    const keeperDiveX = (Math.random() - 0.5) * 1.6;
    const keeperDiveY = Math.random() * 0.9;
    setKeeperPos({ x: keeperDiveX, y: keeperDiveY });

    setTimeout(() => {
      // Evaluate goal vs save vs out
      const finalX = aimX + curve * 0.25;
      const finalY = aimY;

      const inGoalX = Math.abs(finalX) < 0.85;
      const inGoalY = finalY >= 0.1 && finalY <= 0.95;

      const saved = Math.hypot(finalX - keeperDiveX, finalY - keeperDiveY) < 0.35;

      if (inGoalX && inGoalY && !saved) {
        setScore((sc) => sc + 1);
        setFeedback("GOOOOOAL! Top Corner Strike! ⚽🔥");
        playBasketSound("cheer");
      } else if (saved) {
        setFeedback("SAVED by the Keeper! What a block! 🧤");
        playBasketSound("rim");
      } else {
        setFeedback("MISSED! Shot flew wide off target! 💨");
        playBasketSound("rim");
      }

      setTimeout(() => {
        setKicking(false);
        setFeedback("Place your ball for the next penalty.");
      }, 1600);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-between p-6">
      <div className="pointer-events-auto flex items-center justify-between bg-stone-900/90 backdrop-blur border border-stone-800 rounded-2xl p-4 max-w-2xl mx-auto w-full shadow-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-emerald-400">ISLAND PENALTY SHOOTOUT</span>
            <span className="text-xs font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
              Pitch Spot (11m)
            </span>
          </div>
          <div className="text-xs text-stone-400 mt-0.5">{feedback}</div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs font-mono text-stone-400">GOALS / SHOTS</div>
            <div className="text-2xl font-black text-white">
              {score} <span className="text-sm font-semibold text-emerald-400">/ {shots}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="p-2 rounded-xl bg-stone-800 text-stone-400 hover:text-white hover:bg-stone-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Goal Targeting Grid */}
      <div className="pointer-events-auto relative w-72 h-44 mx-auto bg-stone-950/80 border-4 border-white/80 rounded-t-lg shadow-2xl overflow-hidden">
        {/* Net pattern */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px]" />

        {/* Goalkeeper indicator */}
        <div
          className="absolute w-8 h-12 bg-amber-500 border-2 border-stone-950 rounded-t-full transition-all duration-300 flex items-center justify-center text-[10px] font-black text-stone-950"
          style={{
            left: `${50 + keeperPos.x * 40}%`,
            bottom: `${keeperPos.y * 50}%`,
            transform: "translateX(-50%)",
          }}
        >
          GK
        </div>

        {/* Aim crosshair */}
        <div
          className="absolute w-6 h-6 border-2 border-emerald-400 rounded-full flex items-center justify-center transition-all duration-75"
          style={{
            left: `${50 + aimX * 42}%`,
            top: `${(1 - aimY) * 75}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
        </div>
      </div>

      {/* Controls */}
      <div className="pointer-events-auto bg-stone-900/90 backdrop-blur border border-stone-800 rounded-2xl p-4 max-w-md mx-auto w-full shadow-2xl flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-mono text-stone-300">
          <span>POWER: {Math.round(power)}%</span>
          <span>CURVE: {curve > 0 ? `+${Math.round(curve * 100)}% R` : `${Math.round(curve * 100)}% L`}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-stone-400 uppercase font-mono">Horizontal Aim</label>
            <input
              type="range"
              min="-0.85"
              max="0.85"
              step="0.05"
              value={aimX}
              onChange={(e) => setAimX(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>
          <div>
            <label className="text-[10px] text-stone-400 uppercase font-mono">Curve Spin</label>
            <input
              type="range"
              min="-0.8"
              max="0.8"
              step="0.05"
              value={curve}
              onChange={(e) => setCurve(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>
        </div>

        <div className="w-full h-4 bg-stone-950 rounded-full overflow-hidden border border-stone-800 p-0.5">
          <div
            className="h-full rounded-full transition-all duration-75"
            style={{
              width: `${power}%`,
              background: "linear-gradient(90deg, #10b981, #f59e0b, #ef4444)",
            }}
          />
        </div>

        <button
          type="button"
          onMouseDown={() => setCharging(true)}
          onMouseUp={kickBall}
          onTouchStart={() => setCharging(true)}
          onTouchEnd={kickBall}
          disabled={kicking}
          className={`w-full py-3 rounded-xl font-extrabold text-sm uppercase tracking-wider shadow-lg transition-all ${
            kicking
              ? "bg-stone-800 text-stone-500 cursor-not-allowed"
              : charging
              ? "bg-emerald-500 text-stone-950 scale-95 shadow-emerald-500/30"
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-700/30 hover:scale-[1.02]"
          }`}
        >
          {kicking ? "Striking Ball..." : charging ? "Release to Kick!" : "Hold to Charge Shot"}
        </button>
      </div>
    </div>
  );
}



/* =========================================================================
   UNIFIED MINI-GAMES HUB EXPORT (ALL 11 GAMES)
   =========================================================================
   1. Cube Run 3D (Arcade)
   2. Space Invaders (Arcade)
   3. Neon Breakout (Arcade)
   4. Cyber Flap (Arcade)
   5. Dominoes (Tabletop)
   6. Chess (Tabletop)
   7. Checkers (Tabletop)
   8. Connect Four (Tabletop)
   9. Tic-Tac-Toe (Tabletop)
   10. Basketball Shooting Challenge
   11. Football Penalty Shootout
   ========================================================================= */

export type IslandGameMode = "tabletop" | "arcade" | "basketball" | "football" | null;

export interface IslandMiniGamesProps {
  activeGame: IslandGameMode;
  onExit: () => void;
  defaultTabletopTab?: "dominoes" | "chess" | "checkers" | "connect4" | "tictactoe";
  defaultArcadeGame?: "cuberun" | "invaders" | "breakout" | "flap";
}

export function IslandMiniGames({
  activeGame,
  onExit,
  defaultTabletopTab = "dominoes",
}: IslandMiniGamesProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onExit();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onExit]);

  if (!activeGame) return null;

  return (
    <>
      {activeGame === "tabletop" && <TabletopGames onExit={onExit} defaultTab={defaultTabletopTab} />}
      {activeGame === "arcade" && <CubeRunArcade onExit={onExit} />}
      {activeGame === "basketball" && <BasketballGameOverlay onExit={onExit} />}
      {activeGame === "football" && <FootballGameOverlay onExit={onExit} />}
    </>
  );
}

export default IslandMiniGames;

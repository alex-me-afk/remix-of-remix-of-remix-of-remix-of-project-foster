/**
 * Arena sound engine.
 *
 * Design goals:
 *  - **Zero lag.** Every sample is fetched once, decoded once into an
 *    AudioBuffer and then played through throw-away BufferSource nodes.
 *    Playing a sound costs a few microseconds and allocates nothing but a
 *    tiny node, so the render loop can never stall on audio.
 *  - **Never silent while loading.** A set of procedurally synthesised
 *    buffers is built instantly at init and used until the real samples
 *    finish downloading in the background.
 *  - **Bounded voices.** Hard caps on total concurrent voices and per-kind
 *    retrigger rate keep long full-auto bursts from stacking into mush or
 *    eating CPU.
 */

import rifleUrl from "@/assets/sfx/rifle.mp3?url";
import carbineUrl from "@/assets/sfx/carbine.mp3?url";
import smgUrl from "@/assets/sfx/smg.mp3?url";
import mgUrl from "@/assets/sfx/mg.mp3?url";
import shotgunUrl from "@/assets/sfx/shotgun.mp3?url";
import sniperUrl from "@/assets/sfx/sniper.mp3?url";
import pistolUrl from "@/assets/sfx/pistol.mp3?url";
import deagleUrl from "@/assets/sfx/deagle.mp3?url";
import knifeUrl from "@/assets/sfx/knife.mp3?url";
import hitUrl from "@/assets/sfx/hit.mp3?url";
import killUrl from "@/assets/sfx/kill.mp3?url";
import spawnUrl from "@/assets/sfx/spawn.mp3?url";
import reloadUrl from "@/assets/sfx/reload.mp3?url";
import pumpUrl from "@/assets/sfx/pump.mp3?url";
import dryfireUrl from "@/assets/sfx/dryfire.mp3?url";
import victoryUrl from "@/assets/sfx/victory.mp3?url";
import step1Url from "@/assets/sfx/step1.mp3?url";
import step2Url from "@/assets/sfx/step2.mp3?url";
import step3Url from "@/assets/sfx/step3.mp3?url";
import step4Url from "@/assets/sfx/step4.mp3?url";
import steprunUrl from "@/assets/sfx/steprun.mp3?url";
import steprun2Url from "@/assets/sfx/steprun2.mp3?url";
import buyUrl from "@/assets/sfx/buy.mp3?url";
import jumpUrl from "@/assets/sfx/jump.mp3?url";
import landUrl from "@/assets/sfx/land.mp3?url";
import hurtUrl from "@/assets/sfx/hurt.mp3?url";
import hurt2Url from "@/assets/sfx/hurt2.mp3?url";
import deathUrl from "@/assets/sfx/death.mp3?url";
import adsUrl from "@/assets/sfx/ads.mp3?url";
import equipUrl from "@/assets/sfx/equip.mp3?url";
import medkitUrl from "@/assets/sfx/medkit.mp3?url";
// The lobby theme is a real recorded track, not a synth pad — kept out of the `Kind` sample table
// because it is one long looping bed with its own loader and volume, not a one-shot triggered by
// gameplay.
import lobbyThemeUrl from "@/assets/sfx/lobby-theme.wav?url";

export type Kind =
  | "rifle"
  | "carbine"
  | "smg"
  | "shotgun"
  | "sniper"
  | "mg"
  | "pistol"
  | "deagle"
  | "knife"
  | "hit"
  | "kill"
  | "spawn"
  | "reload"
  | "pump"
  | "dryfire"
  | "victory"
  | "step1"
  | "step2"
  | "step3"
  | "step4"
  | "steprun"
  | "steprun2"
  | "buy"
  | "jump"
  | "land"
  | "hurt"
  | "hurt2"
  | "death"
  | "ads"
  | "equip"
  | "medkit";

const SOURCES: Record<Kind, string> = {
  rifle: rifleUrl,
  carbine: carbineUrl,
  smg: smgUrl,
  mg: mgUrl,
  shotgun: shotgunUrl,
  sniper: sniperUrl,
  pistol: pistolUrl,
  deagle: deagleUrl,
  knife: knifeUrl,
  hit: hitUrl,
  kill: killUrl,
  spawn: spawnUrl,
  reload: reloadUrl,
  pump: pumpUrl,
  dryfire: dryfireUrl,
  victory: victoryUrl,
  step1: step1Url,
  step2: step2Url,
  step3: step3Url,
  step4: step4Url,
  steprun: steprunUrl,
  steprun2: steprun2Url,
  buy: buyUrl,
  jump: jumpUrl,
  land: landUrl,
  hurt: hurtUrl,
  hurt2: hurt2Url,
  death: deathUrl,
  ads: adsUrl,
  equip: equipUrl,
  medkit: medkitUrl,
};

/** Minimum gap between two plays of the same kind (seconds of wall time, ms). */
const RETRIGGER_MS: Partial<Record<Kind, number>> = {
  rifle: 45,
  carbine: 40,
  smg: 32,
  mg: 34,
  shotgun: 120,
  sniper: 180,
  pistol: 60,
  deagle: 90,
  hit: 40,
  dryfire: 90,
  victory: 4000,
  step1: 130,
  step2: 130,
  step3: 130,
  step4: 130,
  steprun: 110,
  steprun2: 110,
  buy: 60,
  jump: 180,
  land: 200,
  hurt: 260,
  hurt2: 260,
  death: 500,
  ads: 120,
  equip: 120,
};

const MAX_VOICES = 22;
/** user-adjustable master level (0..1), see settings.ts */
let MASTER_GAIN = 0.5;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let comp: DynamicsCompressorNode | null = null;
let muted = false;
let loadStarted = false;
let voices = 0;
const buffers = new Map<Kind, AudioBuffer>();
const lastPlayed = new Map<Kind, number>();

/* ------------------------------------------------------------------ */
/* Instant procedural fallbacks (used until the samples land)          */
/* ------------------------------------------------------------------ */

function noiseShot(
  c: AudioContext,
  o: { dur: number; decay: number; lowStart: number; lowEnd: number; tone: number; toneEnd: number; gain: number },
) {
  const rate = c.sampleRate;
  const len = Math.max(1, Math.floor(o.dur * rate));
  const buf = c.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  let lp = 0;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const env = Math.pow(1 - t, o.decay);
    const n = Math.random() * 2 - 1;
    lp += (n - lp) * (o.lowStart + (o.lowEnd - o.lowStart) * t);
    phase += ((o.tone + (o.toneEnd - o.tone) * t) * Math.PI * 2) / rate;
    data[i] = Math.tanh((lp * 1.6 + Math.sin(phase) * 0.55) * env * o.gain * 1.4);
  }
  return buf;
}

function metallic(c: AudioContext, dur: number, f0: number, f1: number, gain: number) {
  const rate = c.sampleRate;
  const len = Math.floor(dur * rate);
  const buf = c.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  let p0 = 0;
  let p1 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const env = Math.pow(1 - t, 3);
    p0 += (f0 * Math.PI * 2) / rate;
    p1 += (f1 * Math.PI * 2) / rate;
    d[i] = (Math.sin(p0) * 0.6 + Math.sin(p1) * 0.4 + (Math.random() * 2 - 1) * 0.15) * env * gain;
  }
  return buf;
}

function buildFallbacks(c: AudioContext) {
  const set = (k: Kind, b: AudioBuffer) => {
    if (!buffers.has(k)) buffers.set(k, b);
  };
  set("pistol", noiseShot(c, { dur: 0.2, decay: 4, lowStart: 0.55, lowEnd: 0.1, tone: 220, toneEnd: 70, gain: 0.9 }));
  set("deagle", noiseShot(c, { dur: 0.28, decay: 3, lowStart: 0.45, lowEnd: 0.08, tone: 170, toneEnd: 55, gain: 1 }));
  set("rifle", noiseShot(c, { dur: 0.24, decay: 3.4, lowStart: 0.7, lowEnd: 0.12, tone: 180, toneEnd: 55, gain: 1 }));
  set("carbine", noiseShot(c, { dur: 0.2, decay: 3.8, lowStart: 0.75, lowEnd: 0.16, tone: 210, toneEnd: 70, gain: 0.95 }));
  set("smg", noiseShot(c, { dur: 0.14, decay: 5, lowStart: 0.85, lowEnd: 0.25, tone: 300, toneEnd: 110, gain: 0.75 }));
  set("mg", noiseShot(c, { dur: 0.2, decay: 3.2, lowStart: 0.6, lowEnd: 0.14, tone: 150, toneEnd: 48, gain: 1 }));
  set("shotgun", noiseShot(c, { dur: 0.42, decay: 2.4, lowStart: 0.4, lowEnd: 0.06, tone: 120, toneEnd: 38, gain: 1.05 }));
  set("sniper", noiseShot(c, { dur: 0.6, decay: 2, lowStart: 0.5, lowEnd: 0.05, tone: 140, toneEnd: 42, gain: 1.1 }));
  set("knife", metallic(c, 0.18, 1400, 2300, 0.35));
  set("hit", metallic(c, 0.09, 900, 1600, 0.3));
  set("kill", metallic(c, 0.3, 520, 780, 0.3));
  set("reload", metallic(c, 0.16, 620, 1100, 0.3));
  set("pump", metallic(c, 0.2, 700, 1500, 0.3));
  set("dryfire", metallic(c, 0.07, 1200, 2100, 0.25));
  set("victory", metallic(c, 1.2, 330, 494, 0.25));
  set("spawn", noiseShot(c, { dur: 0.9, decay: 1.6, lowStart: 0.08, lowEnd: 0.5, tone: 90, toneEnd: 420, gain: 0.6 }));
  // movement / body fallbacks — replaced by the real samples once they land
  const step = (f: number) => noiseShot(c, { dur: 0.12, decay: 5, lowStart: 0.5, lowEnd: 0.9, tone: f, toneEnd: f * 0.5, gain: 0.35 });
  set("step1", step(150));
  set("step2", step(170));
  set("step3", step(135));
  set("step4", step(185));
  set("steprun", step(120));
  set("steprun2", step(112));
  set("buy", metallic(c, 0.3, 880, 1320, 0.3));
  set("jump", noiseShot(c, { dur: 0.16, decay: 4, lowStart: 0.3, lowEnd: 0.8, tone: 200, toneEnd: 90, gain: 0.4 }));
  set("land", noiseShot(c, { dur: 0.22, decay: 3, lowStart: 0.2, lowEnd: 0.6, tone: 110, toneEnd: 45, gain: 0.5 }));
  set("hurt", noiseShot(c, { dur: 0.3, decay: 3, lowStart: 0.25, lowEnd: 0.35, tone: 165, toneEnd: 120, gain: 0.4 }));
  set("hurt2", noiseShot(c, { dur: 0.34, decay: 2.6, lowStart: 0.22, lowEnd: 0.3, tone: 140, toneEnd: 100, gain: 0.45 }));
  set("death", noiseShot(c, { dur: 0.7, decay: 2.2, lowStart: 0.2, lowEnd: 0.28, tone: 130, toneEnd: 70, gain: 0.5 }));
  set("ads", metallic(c, 0.07, 1800, 2600, 0.2));
  set("equip", metallic(c, 0.22, 800, 1500, 0.28));
}

/* ------------------------------------------------------------------ */
/* Sample loading                                                      */
/* ------------------------------------------------------------------ */

async function loadOne(c: AudioContext, kind: Kind, url: string) {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return;
    const data = await res.arrayBuffer();
    const buf = await c.decodeAudioData(data);
    buffers.set(kind, buf); // replaces the fallback
  } catch {
    /* keep the procedural fallback */
  }
}

function loadSamples(c: AudioContext) {
  if (loadStarted) return;
  loadStarted = true;
  // Guns first so the very first trigger is already the real thing, then the
  // rest. Requests are tiny (~10 KB each) and fully parallel.
  const order: Kind[] = [
    "rifle",
    "pistol",
    "deagle",
    "smg",
    "mg",
    "shotgun",
    "sniper",
    "carbine",
    "knife",
    "hit",
    "kill",
    "reload",
    "pump",
    "dryfire",
    "spawn",
    "victory",
    "step1",
    "step2",
    "step3",
    "step4",
    "steprun",
    "steprun2",
    "buy",
    "jump",
    "land",
    "hurt",
    "hurt2",
    "death",
    "ads",
    "equip",
  ];
  for (const k of order) void loadOne(c, k, SOURCES[k]);
  // The lobby theme decodes alongside the gun samples so it is ready before the player taps Enter.
  // It is ~1 MB against the ~10 KB one-shots, so it goes last and is fire-and-forget: if it is not
  // ready when the lobby opens, the synth pad covers the gap and the swap happens on the next entry.
  void loadLobbyTheme(c);
}

/**
 * The recorded lobby track, decoded once and looped. Held apart from the `buffers` map because it
 * is not a `Kind` — nothing in gameplay triggers it, `startLobbyMusic` owns it — and because it is
 * a hundred times the size of a one-shot, so it must not sit in the guns-first load order.
 */
let lobbyThemeBuffer: AudioBuffer | null = null;
let lobbyThemeLoading = false;
async function loadLobbyTheme(c: AudioContext) {
  if (lobbyThemeBuffer || lobbyThemeLoading) return;
  lobbyThemeLoading = true;
  try {
    const res = await fetch(lobbyThemeUrl, { cache: "force-cache" });
    if (!res.ok) return;
    lobbyThemeBuffer = await c.decodeAudioData(await res.arrayBuffer());
  } catch {
    /* keep the synth pad — startLobbyMusic falls back to it when the buffer is null */
  } finally {
    lobbyThemeLoading = false;
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Must be called from a user gesture (click / keypress). Safe to call often. */
export function initSfx() {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const Ctor: typeof AudioContext | undefined =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor({ latencyHint: "interactive" });
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_GAIN;
  // Glue compressor: keeps overlapping full-auto shots punchy instead of clipping.
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 22;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.16;
  master.connect(comp);
  comp.connect(ctx.destination);
  buildFallbacks(ctx);
  loadSamples(ctx);
}

/** Preload+decode without a gesture is not possible, but the bytes can be warmed. */
export function warmSfx() {
  if (typeof window === "undefined") return;
  for (const url of Object.values(SOURCES)) void fetch(url, { cache: "force-cache" }).catch(() => {});
}

/**
 * @param volume  0..1 linear gain
 * @param detune  playback-rate offset, e.g. 0.03 = +3% pitch
 */
export function playSfx(kind: Kind, volume = 1, detune = 0) {
  if (!ctx || !master || muted || volume <= 0.004) return;
  const buf = buffers.get(kind);
  if (!buf) return;

  const now = performance.now();
  const gap = RETRIGGER_MS[kind] ?? 0;
  if (gap > 0 && now - (lastPlayed.get(kind) ?? -1e9) < gap) return;
  if (voices >= MAX_VOICES) return;
  lastPlayed.set(kind, now);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = Math.max(0.5, 1 + detune);
  const g = ctx.createGain();
  g.gain.value = Math.min(1, volume);
  src.connect(g);
  g.connect(master);
  voices++;
  src.onended = () => {
    voices--;
    src.disconnect();
    g.disconnect();
  };
  src.start();
}

/**
 * One-shot that can be stopped early (channelled actions such as the medkit).
 * Bypasses the retrigger gate and returns a stop function, or null when the
 * sample is not ready yet.
 */
export function playSfxStoppable(kind: Kind, volume = 1): (() => void) | null {
  if (!ctx || !master || muted) return null;
  const buf = buffers.get(kind);
  if (!buf) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = Math.min(1, volume);
  src.connect(g);
  g.connect(master);
  voices++;
  let done = false;
  src.onended = () => {
    if (done) return;
    done = true;
    voices--;
    src.disconnect();
    g.disconnect();
  };
  src.start();
  return () => {
    if (done) return;
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
  };
}

/**
 * Distance-attenuated one-shot — used for other fighters' guns so the arena
 * has depth without a full 3D panner graph per shot.
 */
export function playSfxAt(kind: Kind, distance: number, baseVolume = 1, detune = 0) {
  const falloff = 1 / (1 + (distance / 14) ** 1.6);
  const v = baseVolume * falloff;
  if (v < 0.02) return; // inaudible — skip the work entirely
  playSfx(kind, v, detune + (distance > 40 ? -0.03 : 0));
}

/**
 * Victory stinger. It must be heard, so it bypasses the voice cap and the
 * retrigger gate, resumes a suspended context first, and falls back to a plain
 * <audio> element if the sample has not been decoded yet.
 */
export function playVictory(volume = 0.9) {
  if (muted) return;
  if (ctx && ctx.state === "suspended") void ctx.resume();
  const buf = buffers.get("victory");
  if (ctx && master && buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = Math.min(1, volume);
    src.connect(g);
    g.connect(master);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start();
    return;
  }
  try {
    const el = new Audio(SOURCES.victory);
    el.volume = Math.min(1, volume * MASTER_GAIN);
    void el.play().catch(() => {});
  } catch {
    /* no audio available */
  }
}


/** Set the master output level (0..1). Applies instantly, survives mute. */
export function setSfxVolume(volume: number) {
  MASTER_GAIN = Math.max(0, Math.min(1, volume));
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, ctx.currentTime, 0.02);
}

export function getSfxVolume() {
  return MASTER_GAIN;
}

export function setSfxMuted(next: boolean) {
  muted = next;
  if (next) stopSpeech();
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : MASTER_GAIN, ctx.currentTime, 0.02);
}

export function isSfxMuted() {
  return muted;
}

/** Call when the tab loses focus to stop burning CPU on audio. */
export function suspendSfx() {
  stopSpeech();
  if (ctx && ctx.state === "running") void ctx.suspend();
}

export function resumeSfx() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/* ------------------------------------------------------------------ */
/* Weather ambience (procedural — no extra downloads, no per-frame JS) */
/* ------------------------------------------------------------------ */

/**
 * Rain / wind beds are a single looping noise buffer through a filter, so the
 * cost is one source node for as long as the weather lasts. Thunder is a
 * short synthesised burst — nothing is fetched or decoded at runtime.
 */

let ambienceSrc: AudioBufferSourceNode | null = null;
let ambienceGain: GainNode | null = null;
let ambienceKind: "rain" | "snow" | null = null;
let noiseBed: AudioBuffer | null = null;

function bedBuffer(c: AudioContext) {
  if (noiseBed) return noiseBed;
  const len = Math.floor(c.sampleRate * 4);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.86 + white * 0.14; // pink-ish
    d[i] = last * 2.2 + white * 0.35;
  }
  // crossfade the seam so the loop is inaudible
  const fade = Math.floor(c.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    d[i] = d[i]! * t + d[len - fade + i]! * (1 - t);
  }
  noiseBed = buf;
  return buf;
}

/** Start/stop the weather bed. Pass null to fade the current one out. */
export function setWeatherAmbience(kind: "rain" | "snow" | null, volume = 0.35) {
  if (!ctx || !master) return;
  if (kind === ambienceKind) {
    if (ambienceGain) ambienceGain.gain.setTargetAtTime(kind ? volume : 0, ctx.currentTime, 1.2);
    return;
  }
  const now = ctx.currentTime;
  if (ambienceSrc && ambienceGain) {
    const oldSrc = ambienceSrc;
    const oldGain = ambienceGain;
    oldGain.gain.cancelScheduledValues(now);
    oldGain.gain.setTargetAtTime(0, now, 0.8);
    window.setTimeout(() => {
      try {
        oldSrc.stop();
      } catch {
        /* already stopped */
      }
      oldSrc.disconnect();
      oldGain.disconnect();
    }, 3500);
  }
  ambienceSrc = null;
  ambienceGain = null;
  ambienceKind = kind;
  if (!kind) return;

  const src = ctx.createBufferSource();
  src.buffer = bedBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  if (kind === "rain") {
    filter.type = "bandpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.5;
  } else {
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
  }
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(volume, now, 2.0); // weather rolls in slowly
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start();
  ambienceSrc = src;
  ambienceGain = g;
}

/** Thunder clap — synthesised rumble, scheduled `delay` seconds from now. */
export function playThunder(delay = 0, volume = 0.7) {
  if (!ctx || !master || muted) return;
  const start = ctx.currentTime + Math.max(0, delay);
  const dur = 2.4 + Math.random() * 1.6;

  const src = ctx.createBufferSource();
  src.buffer = bedBuffer(ctx);
  src.loop = true;
  src.playbackRate.value = 0.6 + Math.random() * 0.25;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1600, start);
  lp.frequency.exponentialRampToValueAtTime(110, start + dur);
  lp.Q.value = 0.6;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.02, volume), start + 0.05);
  g.gain.exponentialRampToValueAtTime(0.22 * volume, start + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  // sub rumble under the crack
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(58, start);
  osc.frequency.exponentialRampToValueAtTime(26, start + dur);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, start);
  og.gain.exponentialRampToValueAtTime(0.35 * volume, start + 0.12);
  og.gain.exponentialRampToValueAtTime(0.0001, start + dur * 0.8);

  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  osc.connect(og);
  og.connect(master);
  src.start(start);
  src.stop(start + dur + 0.1);
  osc.start(start);
  osc.stop(start + dur + 0.1);
  src.onended = () => {
    src.disconnect();
    lp.disconnect();
    g.disconnect();
  };
  osc.onended = () => {
    osc.disconnect();
    og.disconnect();
  };
}

/** Hard stop (map unload / unmount). */
export function stopWeatherAmbience() {
  setWeatherAmbience(null);
}

/* ------------------------------------------------------------------ */
/* Plane engine drone (skydive fly-over) — synthesised, no downloads   */
/* ------------------------------------------------------------------ */

/**
 * A looping propeller-plane drone: two detuned saws for the engine block, a
 * lowpassed rumble, and a chopped band of noise driven by an LFO for the prop
 * blades. One graph, torn down on stop — the whole thing is a handful of nodes.
 */
let engineNodes: { stop: () => void } | null = null;

export function startPlaneEngine(volume = 0.5) {
  if (!ctx || !master || engineNodes) return;
  if (ctx.state === "suspended") void ctx.resume();
  const c = ctx;
  const now = c.currentTime;

  const out = c.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(volume, now, 0.7); // spool up
  out.connect(master);

  // engine block: two detuned saws through a lowpass
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 360;
  lp.Q.value = 0.7;
  lp.connect(out);
  const oscA = c.createOscillator();
  oscA.type = "sawtooth";
  oscA.frequency.value = 76;
  const oscB = c.createOscillator();
  oscB.type = "sawtooth";
  oscB.frequency.value = 81; // slow beat between the two
  const engGain = c.createGain();
  engGain.gain.value = 0.5;
  oscA.connect(engGain);
  oscB.connect(engGain);
  engGain.connect(lp);

  // propeller chop: band of noise gated by a blade-rate LFO
  const propBed = c.createBufferSource();
  propBed.buffer = bedBuffer(c);
  propBed.loop = true;
  const propBp = c.createBiquadFilter();
  propBp.type = "bandpass";
  propBp.frequency.value = 850;
  propBp.Q.value = 0.9;
  const propGain = c.createGain();
  propGain.gain.value = 0.16;
  const lfo = c.createOscillator();
  lfo.type = "triangle";
  lfo.frequency.value = 22; // prop blades per second
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.12;
  lfo.connect(lfoGain);
  lfoGain.connect(propGain.gain);
  propBed.connect(propBp);
  propBp.connect(propGain);
  propGain.connect(out);

  oscA.start();
  oscB.start();
  propBed.start();
  lfo.start();

  engineNodes = {
    stop: () => {
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.5); // spool down
      window.setTimeout(() => {
        try {
          oscA.stop();
          oscB.stop();
          propBed.stop();
          lfo.stop();
        } catch {
          /* already stopped */
        }
        for (const n of [oscA, oscB, propBed, lfo, lfoGain, propGain, propBp, engGain, lp, out]) n.disconnect();
      }, 1100);
    },
  };
}

export function stopPlaneEngine() {
  if (!engineNodes) return;
  engineNodes.stop();
  engineNodes = null;
}

/* ------------------------------------------------------------------ */
/* Wingsuit wind — a live noise bed driven by airspeed                 */
/* ------------------------------------------------------------------ */

/**
 * Rushing-air loop for the skydive, held open for the whole fall and steered frame by frame
 * from the diver's speed rather than fired as one-shots. The dive was silent, which is most of
 * why it "felt like shit": with no rising roar there is nothing to tell you you are moving, and
 * the eye alone cannot judge speed against 100 m of empty air.
 *
 * Two layers so the intensity sweep reads as *air* rather than a volume knob: a bandpass buffet
 * that climbs in pitch as you accelerate (the whistle over your ears) and a steady lowpassed
 * rumble underneath. Both ride one buffer source, and everything is torn down on stop, so the
 * cost is a handful of nodes no matter how many matches are dropped into.
 */
let windNodes: {
  out: GainNode;
  bp: BiquadFilterNode;
  bpGain: GainNode;
  stop: () => void;
} | null = null;

export function startWindLoop(volume = 0.0) {
  if (!ctx || !master || windNodes) return;
  if (ctx.state === "suspended") void ctx.resume();
  const c = ctx;

  const out = c.createGain();
  out.gain.value = volume;
  out.connect(master);

  const bed = c.createBufferSource();
  bed.buffer = bedBuffer(c);
  bed.loop = true;

  // whistle layer: bandpass that sweeps 300 Hz (coasting) → 1900 Hz (flat out)
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 300;
  bp.Q.value = 0.8;
  const bpGain = c.createGain();
  bpGain.gain.value = 0.2;
  bed.connect(bp);
  bp.connect(bpGain);
  bpGain.connect(out);

  // body layer: constant lowpassed rumble so quiet moments still sound like open air
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  const lpGain = c.createGain();
  lpGain.gain.value = 0.35;
  bed.connect(lp);
  lp.connect(lpGain);
  lpGain.connect(out);

  bed.start();

  windNodes = {
    out,
    bp,
    bpGain,
    stop: () => {
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.25);
      window.setTimeout(() => {
        try {
          bed.stop();
        } catch {
          /* already stopped */
        }
        for (const n of [bed, bp, bpGain, lp, lpGain, out]) n.disconnect();
      }, 600);
    },
  };
}

/**
 * Steer the open wind loop. `intensity` is 0..1 (0 = hanging still, 1 = full forward dive).
 * Called every frame, so every write is a `setTargetAtTime` glide — stepping `.value` directly
 * at 60 Hz is what makes synthesised wind crackle.
 */
export function setWindIntensity(intensity: number, volume = 0.55) {
  const w = windNodes;
  if (!w || !ctx) return;
  const x = Math.max(0, Math.min(1, intensity));
  const t = ctx.currentTime;
  w.out.gain.setTargetAtTime(volume * (0.35 + 0.65 * x), t, 0.08);
  w.bp.frequency.setTargetAtTime(300 + 1600 * x, t, 0.12);
  w.bpGain.gain.setTargetAtTime(0.12 + 0.5 * x, t, 0.12);
}

export function stopWindLoop() {
  if (!windNodes) return;
  windNodes.stop();
  windNodes = null;
}

/* ------------------------------------------------------------------ */
/* Car engine — a live loop driven by road speed                       */
/* ------------------------------------------------------------------ */

/**
 * Driving had no sound at all. Same shape as the wind loop: hold one small graph open for as
 * long as the player is seated and steer it from `rig.speed`, instead of retriggering samples.
 * Two detuned saws for the engine order plus a filtered noise bed for tyre roar; the saw pitch
 * and the filter both track revs, so lifting off audibly drops the note.
 */
let carNodes: {
  out: GainNode;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  lp: BiquadFilterNode;
  tyre: GainNode;
  stop: () => void;
} | null = null;

export function startCarEngine(volume = 0.32) {
  if (!ctx || !master || carNodes) return;
  if (ctx.state === "suspended") void ctx.resume();
  const c = ctx;
  const now = c.currentTime;

  const out = c.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(volume, now, 0.25);
  out.connect(master);

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  lp.Q.value = 0.9;
  lp.connect(out);

  const oscA = c.createOscillator();
  oscA.type = "sawtooth";
  oscA.frequency.value = 55;
  const oscB = c.createOscillator();
  oscB.type = "square";
  oscB.frequency.value = 55 * 1.5; // a fifth up thickens the idle without a second engine
  const engGain = c.createGain();
  engGain.gain.value = 0.42;
  oscA.connect(engGain);
  oscB.connect(engGain);
  engGain.connect(lp);

  // tyre/road noise, gated up with speed
  const bed = c.createBufferSource();
  bed.buffer = bedBuffer(c);
  bed.loop = true;
  const tyreBp = c.createBiquadFilter();
  tyreBp.type = "bandpass";
  tyreBp.frequency.value = 900;
  tyreBp.Q.value = 0.7;
  const tyre = c.createGain();
  tyre.gain.value = 0;
  bed.connect(tyreBp);
  tyreBp.connect(tyre);
  tyre.connect(out);

  oscA.start();
  oscB.start();
  bed.start();

  carNodes = {
    out,
    oscA,
    oscB,
    lp,
    tyre,
    stop: () => {
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.2);
      window.setTimeout(() => {
        try {
          oscA.stop();
          oscB.stop();
          bed.stop();
        } catch {
          /* already stopped */
        }
        for (const n of [oscA, oscB, bed, engGain, tyreBp, tyre, lp, out]) n.disconnect();
      }, 500);
    },
  };
}

/**
 * `revs` is 0..1 (|speed| / topSpeed) and `throttle` is -1..1. Revs set the note and the tyre
 * roar; throttle only opens the lowpass, which is what makes the difference between coasting
 * and pinning it audible at the same road speed.
 */
export function setCarEngine(revs: number, throttle = 0) {
  const cn = carNodes;
  if (!cn || !ctx) return;
  const r = Math.max(0, Math.min(1, revs));
  const load = Math.max(0, Math.min(1, Math.abs(throttle)));
  const t = ctx.currentTime;
  const base = 55 + 145 * r; // idle 55 Hz → 200 Hz at redline
  cn.oscA.frequency.setTargetAtTime(base, t, 0.07);
  cn.oscB.frequency.setTargetAtTime(base * 1.5, t, 0.07);
  cn.lp.frequency.setTargetAtTime(380 + 1500 * r + 500 * load, t, 0.07);
  cn.tyre.gain.setTargetAtTime(0.02 + 0.16 * r, t, 0.1);
}

export function stopCarEngine() {
  if (!carNodes) return;
  carNodes.stop();
  carNodes = null;
}

/**
 * One-shot body impact for a car hitting geometry: a short filtered noise burst plus a low thud.
 * `force` is 0..1 (impact speed over top speed) and scales both level and brightness.
 */
export function playCarImpact(force = 1) {
  if (!ctx || !master) return;
  const c = ctx;
  const now = c.currentTime;
  const f = Math.max(0.05, Math.min(1, force));

  const out = c.createGain();
  out.gain.value = 0.5 * f;
  out.gain.setValueAtTime(0.5 * f, now);
  out.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  out.connect(master);

  // crunch
  const bed = c.createBufferSource();
  bed.buffer = bedBuffer(c);
  bed.loop = false;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 500 + 1400 * f;
  bp.Q.value = 0.6;
  bed.connect(bp);
  bp.connect(out);

  // thud
  const thud = c.createOscillator();
  thud.type = "sine";
  thud.frequency.setValueAtTime(120, now);
  thud.frequency.exponentialRampToValueAtTime(45, now + 0.2);
  const thudGain = c.createGain();
  thudGain.gain.value = 0.6;
  thud.connect(thudGain);
  thudGain.connect(out);

  bed.start(now);
  thud.start(now);
  thud.stop(now + 0.3);
  window.setTimeout(() => {
    try {
      bed.stop();
    } catch {
      /* already stopped */
    }
    for (const n of [bed, bp, thud, thudGain, out]) n.disconnect();
  }, 500);
}

/* ------------------------------------------------------------------ */
/* Lobby ambient pad — synthesised, low, breathing                     */
/* ------------------------------------------------------------------ */

/**
 * The lobby bed. When the recorded theme has decoded it loops that; until then (or if the fetch
 * failed) it falls back to a slow synth chord so the lobby is never dead silent. Either way it
 * fades in and out instead of snapping, and either way `stopLobbyMusic` tears it down the same way.
 *
 * `startLobbyMusic` is called on every entry to the lobby and on through the Battle Royale waiting
 * island, so it is idempotent: a second call while a bed is already playing is a no-op, and the
 * recorded track is picked over the synth the instant the buffer is present — a first entry before
 * the download finished gets the pad, and the next entry gets the real thing.
 */
let lobbyNodes: { stop: () => void } | null = null;

/** The recorded theme's default level. Lower than a one-shot — it sits under the UI, not over it. */
const LOBBY_THEME_VOLUME = 0.5;

export function startLobbyMusic(volume = 0.13) {
  if (!ctx || !master || lobbyNodes) return;
  if (ctx.state === "suspended") void ctx.resume();
  const c = ctx;
  const now = c.currentTime;

  // Recorded track wins whenever it is ready; the synth path below is the fallback.
  if (lobbyThemeBuffer) {
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(LOBBY_THEME_VOLUME, now, 1.2);
    out.connect(master);
    const src = c.createBufferSource();
    src.buffer = lobbyThemeBuffer;
    src.loop = true;
    src.connect(out);
    src.start();
    lobbyNodes = {
      stop: () => {
        const t = c.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0, t, 0.8);
        window.setTimeout(() => {
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
          src.disconnect();
          out.disconnect();
        }, 1100);
      },
    };
    return;
  }

  const out = c.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(volume, now, 2.5); // slow fade-in
  out.connect(master);

  const freqs = [110, 164.81, 220, 329.63]; // A2 · E3 · A3 · E4
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  freqs.forEach((f, i) => {
    const o = c.createOscillator();
    o.type = i > 2 ? "triangle" : "sine";
    o.frequency.value = f;
    o.detune.value = i % 2 === 0 ? -5 : 5; // gentle chorus
    const g = c.createGain();
    g.gain.value = 0.28 / (i + 1);
    o.connect(g);
    g.connect(out);
    o.start();
    oscs.push(o);
    gains.push(g);
  });

  // very slow tremolo so the pad breathes
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoGain = c.createGain();
  lfoGain.gain.value = volume * 0.4;
  lfo.connect(lfoGain);
  lfoGain.connect(out.gain);
  lfo.start();

  lobbyNodes = {
    stop: () => {
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 1.1);
      window.setTimeout(() => {
        try {
          oscs.forEach((o) => o.stop());
          lfo.stop();
        } catch {
          /* already stopped */
        }
        oscs.forEach((o) => o.disconnect());
        gains.forEach((g) => g.disconnect());
        lfo.disconnect();
        lfoGain.disconnect();
        out.disconnect();
      }, 1500);
    },
  };
}

export function stopLobbyMusic() {
  if (!lobbyNodes) return;
  lobbyNodes.stop();
  lobbyNodes = null;
}

/* ------------------------------------------------------------------ */
/* Pet voice — synthesised bark / chirp                                */
/* ------------------------------------------------------------------ */

/**
 * A short pet call: one or two pitched, band-filtered chirps. `dog` barks,
 * `pup` yips higher, `soft` is a single friendly chirp (used for the carrot).
 */
export function playPetVoice(variant: "dog" | "pup" | "soft" = "dog") {
  if (!ctx || !master || muted) return;
  const c = ctx;
  const now = c.currentTime;
  const barks = variant === "soft" ? 1 : 2;
  const baseF = variant === "pup" ? 620 : variant === "soft" ? 520 : 330;
  for (let b = 0; b < barks; b += 1) {
    const t0 = now + b * 0.16;
    const dur = variant === "soft" ? 0.18 : 0.13;
    const o = c.createOscillator();
    o.type = variant === "soft" ? "triangle" : "sawtooth";
    o.frequency.setValueAtTime(baseF * 1.4, t0);
    o.frequency.exponentialRampToValueAtTime(baseF, t0 + 0.05);
    o.frequency.exponentialRampToValueAtTime(baseF * 0.7, t0 + dur);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = baseF * 2.2;
    bp.Q.value = 1.1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(bp);
    bp.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }
}

/* ------------------------------------------------------------------ */
/* UI & Interactive sound effects — procedural DSP, zero latency      */
/* ------------------------------------------------------------------ */

/** Clean, tactile mechanical click for HUD/menus. */
export function playUiClick(tone: "low" | "mid" | "high" = "mid") {
  if (!ctx || !master || muted) return;
  const c = ctx;
  const out = master;
  const now = c.currentTime;
  const f = tone === "high" ? 1800 : tone === "low" ? 750 : 1200;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(f, now);
  osc.frequency.exponentialRampToValueAtTime(f * 0.35, now + 0.035);
  const g = c.createGain();
  g.gain.setValueAtTime(0.18, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
  osc.connect(g);
  g.connect(out);
  osc.start(now);
  osc.stop(now + 0.04);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

/** Affirmative selection / equip / toggle chime. */
export function playUiSelect() {
  if (!ctx || !master || muted) return;
  const c = ctx;
  const out = master;
  const now = c.currentTime;
  const freqs = [660, 990];
  freqs.forEach((f, i) => {
    const t0 = now + i * 0.055;
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t0);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.13);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  });
}

/** Negative / denied / insufficient currency buzz. */
export function playUiError() {
  if (!ctx || !master || muted) return;
  const c = ctx;
  const out = master;
  const now = c.currentTime;
  const freqs = [220, 160];
  freqs.forEach((f) => {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f, now);
    const bp = c.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = 480;
    const g = c.createGain();
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(bp);
    bp.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + 0.17);
    osc.onended = () => {
      osc.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  });
}

/** Crate opening & rare item unveil sequence. */
export function playUiCrateOpen() {
  if (!ctx || !master || muted) return;
  const c = ctx;
  const out = master;
  const now = c.currentTime;
  // Sub boom
  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(140, now);
  sub.frequency.exponentialRampToValueAtTime(32, now + 0.45);
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.32, now);
  sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  sub.connect(sg);
  sg.connect(out);
  sub.start(now);
  sub.stop(now + 0.46);

  // Sparkle arpeggio
  const arps = [440, 554, 659, 880, 1108, 1318];
  arps.forEach((f, i) => {
    const t0 = now + i * 0.06;
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f, t0);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.15, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.32);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  });
}

/* ------------------------------------------------------------------ */
/* Announcer voice & character lines — platform synthesis engine       */
/* ------------------------------------------------------------------ */

export const CHARACTER_VOICE_LINES: Record<string, { line: string; pitch: number; rate: number }> = {
  howl: { line: "Howl standing by. Frostline ready.", pitch: 0.85, rate: 0.95 },
  ember: { line: "Ember here. Ready to burn them down.", pitch: 1.1, rate: 1.05 },
  vireo: { line: "Vireo active. Perimeter is green.", pitch: 0.95, rate: 1.0 },
  onyx: { line: "Onyx online. Shields locked.", pitch: 0.75, rate: 0.9 },
  lumen: { line: "Lumen ready. Support incoming.", pitch: 1.05, rate: 0.95 },
  nyx: { line: "Nyx locked on. Target acquired.", pitch: 0.9, rate: 0.9 },
};

/** Spoken operative greeting when selecting or entering lobby. */
export function speakLobbyGreeting(characterId = "howl") {
  const fallback = { line: "Howl standing by. Frostline ready.", pitch: 0.85, rate: 0.95 };
  const key = characterId.toLowerCase();
  const v = (key in CHARACTER_VOICE_LINES ? CHARACTER_VOICE_LINES[key] : null) ?? fallback;
  speak(v.line, { pitch: v.pitch, rate: v.rate, volume: 0.95 });
}

export type AnnouncerEvent =
  | "start"
  | "doubleKill"
  | "tripleKill"
  | "headshot"
  | "safeZone"
  | "airdrop"
  | "victory"
  | "defeat";

/** In-match tactical announcer voice callouts. */
export function speakAnnouncer(event: AnnouncerEvent) {
  const MAP: Record<AnnouncerEvent, { text: string; pitch: number; rate: number }> = {
    start: { text: "Deploying into the arena! Eliminate all hostiles!", pitch: 0.82, rate: 1.0 },
    doubleKill: { text: "Double Kill!", pitch: 0.9, rate: 1.05 },
    tripleKill: { text: "Triple Kill! Unstoppable!", pitch: 0.95, rate: 1.1 },
    headshot: { text: "Headshot!", pitch: 0.85, rate: 1.05 },
    safeZone: { text: "Warning: safe zone is shrinking!", pitch: 0.8, rate: 0.95 },
    airdrop: { text: "Airdrop incoming!", pitch: 0.82, rate: 1.0 },
    victory: { text: "Victory! Booyah!", pitch: 0.88, rate: 1.0 },
    defeat: { text: "Defeat!", pitch: 0.75, rate: 0.9 },
  };
  const e = MAP[event];
  if (e) speak(e.text, { pitch: e.pitch, rate: e.rate });
}

/**
 * Spoken callouts ("Victory!", "Defeat"). Uses the platform speech engine so it
 * ships zero audio files. Respects mute and scales roughly with the master
 * level. Silently does nothing where speech synthesis is unavailable.
 */
export function speak(text: string, opts: { rate?: number; pitch?: number; volume?: number } = {}) {
  if (muted || typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 0.95;
    u.pitch = opts.pitch ?? 0.8;
    u.volume = Math.min(1, (opts.volume ?? 1) * Math.min(1, MASTER_GAIN + 0.45));
    synth.cancel(); // never stack announcements on top of each other
    synth.speak(u);
  } catch {
    /* speech synthesis unavailable */
  }
}

/** Stop any pending/queued announcer speech (mute, tab hide, unmount). */
export function stopSpeech() {
  if (typeof window === "undefined") return;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

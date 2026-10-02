/**
 * Arena weather — GPU-only rain & snow.
 *
 * Performance contract:
 *  - Two draw calls max (one rain LineSegments, one snow Points), and only the
 *    active one is visible. Nothing else is added to the scene graph.
 *  - Zero per-particle CPU work. Every drop/flake is positioned entirely in the
 *    vertex shader from static attributes; the render loop only writes a few
 *    uniforms (time, camera position, intensity). Geometry is uploaded once.
 *  - The field is wrapped around the camera in world space with `mod`, so it
 *    follows the player forever without ever touching a buffer again.
 *  - Weather comes and goes on a timer; while it is clear both meshes are
 *    hidden and the update costs ~nothing.
 */

import * as THREE from "three";

export type WeatherKind = "clear" | "rain" | "snow";
export type Quality = "low" | "medium" | "high";

export type Weather = {
  /** cheap: writes a handful of uniforms */
  update: (cameraPos: THREE.Vector3, dt: number) => void;
  /** 0..1 lightning flash amount for the frame (drives sky/fog brightening) */
  flash: () => number;
  kind: () => WeatherKind;
  /** force a state (used by dev/settings); pass null to resume auto weather */
  set: (kind: WeatherKind) => void;
  setEnabled: (on: boolean) => void;
  dispose: () => void;
};

export type WeatherHooks = {
  /** called when the weather state changes (audio ambience follows this) */
  onKind?: (kind: WeatherKind) => void;
  /** called on a lightning strike, with the delay in seconds until the boom */
  onThunder?: (delaySeconds: number) => void;
};

const RAIN_COUNT: Record<Quality, number> = { low: 900, medium: 2400, high: 4500 };
const SNOW_COUNT: Record<Quality, number> = { low: 600, medium: 1500, high: 3000 };

const EXTENT = 90; // horizontal box side, metres
const HEIGHT = 42; // vertical wrap height

/* ------------------------------------------------------------------ */
/* Rain — camera-anchored streaks, 2 verts per drop, one draw call     */
/* ------------------------------------------------------------------ */

const RAIN_VERT = /* glsl */ `
attribute vec3 aBase;   // 0..1 random cell position
attribute float aSide;  // 0 = tail (top), 1 = head (bottom)
attribute float aRand;

uniform float uTime;
uniform vec3 uCam;
uniform float uExtent;
uniform float uHeight;
uniform float uSpeed;
uniform float uLen;
uniform vec2 uWind;
uniform float uIntensity;

varying float vAlpha;

void main() {
  float hx = uExtent * 0.5;
  float drift = uTime * 1.0;

  // world-anchored wrap around the camera => real parallax, no CPU work
  float wx = aBase.x * uExtent + uWind.x * drift;
  float wz = aBase.z * uExtent + uWind.y * drift;
  vec3 p;
  p.x = uCam.x + mod(wx - uCam.x + hx, uExtent) - hx;
  p.z = uCam.z + mod(wz - uCam.z + hx, uExtent) - hx;

  float speed = uSpeed * (0.85 + aRand * 0.4);
  float fy = aBase.y * uHeight - uTime * speed;
  p.y = uCam.y + mod(fy - uCam.y + uHeight * 0.5, uHeight) - uHeight * 0.5;

  vec3 dir = normalize(vec3(uWind.x, -speed, uWind.y));
  // tail vertex trails behind the head along the motion vector
  p -= dir * uLen * (1.0 - aSide) * (0.7 + aRand * 0.6);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;

  // cull the tail of the distribution when intensity ramps in/out
  float alive = step(aRand, uIntensity);
  float near = smoothstep(0.6, 3.0, dist);
  float far = 1.0 - smoothstep(uExtent * 0.35, uExtent * 0.55, dist);
  vAlpha = alive * near * far * (0.35 + aRand * 0.35) * aSide * 0.9 + alive * near * far * 0.12;

  gl_Position = projectionMatrix * mv;
}
`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  if (vAlpha < 0.01) discard;
  gl_FragColor = vec4(uColor, vAlpha * uOpacity);
}
`;

/* ------------------------------------------------------------------ */
/* Snow — soft sprites with per-flake sway                             */
/* ------------------------------------------------------------------ */

const SNOW_VERT = /* glsl */ `
attribute vec3 aBase;
attribute float aRand;

uniform float uTime;
uniform vec3 uCam;
uniform float uExtent;
uniform float uHeight;
uniform float uSpeed;
uniform vec2 uWind;
uniform float uIntensity;
uniform float uPixelRatio;

varying float vAlpha;

void main() {
  float hx = uExtent * 0.5;
  float sway = sin(uTime * (0.5 + aRand * 0.9) + aRand * 31.4) * (0.6 + aRand);
  float wx = aBase.x * uExtent + uWind.x * uTime + sway;
  float wz = aBase.z * uExtent + uWind.y * uTime + cos(uTime * 0.4 + aRand * 12.0) * 0.6;

  vec3 p;
  p.x = uCam.x + mod(wx - uCam.x + hx, uExtent) - hx;
  p.z = uCam.z + mod(wz - uCam.z + hx, uExtent) - hx;
  float speed = uSpeed * (0.6 + aRand * 0.8);
  float fy = aBase.y * uHeight - uTime * speed;
  p.y = uCam.y + mod(fy - uCam.y + uHeight * 0.5, uHeight) - uHeight * 0.5;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  gl_PointSize = (2.0 + aRand * 4.0) * uPixelRatio * (26.0 / max(dist, 0.8));

  float alive = step(aRand, uIntensity);
  float near = smoothstep(0.5, 2.5, dist);
  float far = 1.0 - smoothstep(uExtent * 0.3, uExtent * 0.5, dist);
  vAlpha = alive * near * far * (0.45 + aRand * 0.45);

  gl_Position = projectionMatrix * mv;
}
`;

const SNOW_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  if (vAlpha < 0.01) discard;
  vec4 t = texture2D(uMap, gl_PointCoord);
  if (t.a < 0.02) discard;
  gl_FragColor = vec4(uColor, t.a * vAlpha * uOpacity);
}
`;

let flakeTex: THREE.Texture | null = null;
function flakeSprite() {
  if (flakeTex) return flakeTex;
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  flakeTex = tex;
  return tex;
}

export function createWeather(
  scene: THREE.Scene,
  quality: Quality = "medium",
  hooks: WeatherHooks = {},
): Weather {
  const pixelRatio = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, 2);

  /* ---- rain geometry (2 verts / drop) ---- */
  const rainCount = RAIN_COUNT[quality];
  const rainGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(rainCount * 2 * 3);
    const base = new Float32Array(rainCount * 2 * 3);
    const side = new Float32Array(rainCount * 2);
    const rand = new Float32Array(rainCount * 2);
    for (let i = 0; i < rainCount; i++) {
      const bx = Math.random();
      const by = Math.random();
      const bz = Math.random();
      const r = Math.random();
      for (let v = 0; v < 2; v++) {
        const k = i * 2 + v;
        base[k * 3] = bx;
        base[k * 3 + 1] = by;
        base[k * 3 + 2] = bz;
        side[k] = v; // 0 tail, 1 head
        rand[k] = r;
      }
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    rainGeo.setAttribute("aBase", new THREE.BufferAttribute(base, 3));
    rainGeo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    rainGeo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
  }

  const rainMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uExtent: { value: EXTENT },
      uHeight: { value: HEIGHT },
      uSpeed: { value: 32 },
      uLen: { value: 0.9 },
      uWind: { value: new THREE.Vector2(2.2, 0.8) },
      uIntensity: { value: 0 },
      uColor: { value: new THREE.Color(0xcfe4f5) },
      uOpacity: { value: 0.85 },
    },
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.renderOrder = 5;
  rain.visible = false;
  scene.add(rain);

  /* ---- snow geometry ---- */
  const snowCount = SNOW_COUNT[quality];
  const snowGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(snowCount * 3);
    const base = new Float32Array(snowCount * 3);
    const rand = new Float32Array(snowCount);
    for (let i = 0; i < snowCount; i++) {
      base[i * 3] = Math.random();
      base[i * 3 + 1] = Math.random();
      base[i * 3 + 2] = Math.random();
      rand[i] = Math.random();
    }
    snowGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    snowGeo.setAttribute("aBase", new THREE.BufferAttribute(base, 3));
    snowGeo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
  }

  const snowMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uExtent: { value: EXTENT },
      uHeight: { value: HEIGHT },
      uSpeed: { value: 3.2 },
      uWind: { value: new THREE.Vector2(0.9, 0.4) },
      uIntensity: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uMap: { value: flakeSprite() },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.9 },
    },
    vertexShader: SNOW_VERT,
    fragmentShader: SNOW_FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  snow.renderOrder = 5;
  snow.visible = false;
  scene.add(snow);

  /* ---- state machine ---- */
  let enabled = true;
  let current: WeatherKind = "clear";
  let target: WeatherKind = "clear";
  let intensity = 0; // eased 0..1
  let time = 0;
  // first spell arrives 45–110 s in, then it alternates clear / weather
  let timer = 45 + Math.random() * 65;
  let flashAmount = 0;
  let flashTimer = 0;
  let boltTimer = 4 + Math.random() * 9;

  const setKind = (k: WeatherKind) => {
    if (target === k) return;
    target = k;
    if (k !== "clear") {
      current = k;
      hooks.onKind?.(k);
    }
  };

  return {
    kind: () => (intensity > 0.02 ? current : "clear"),
    flash: () => flashAmount,
    set: (k) => {
      timer = k === "clear" ? 60 + Math.random() * 60 : 70 + Math.random() * 60;
      setKind(k);
    },
    setEnabled: (on) => {
      enabled = on;
      if (!on) setKind("clear");
    },
    update: (cameraPos, dt) => {
      // fade in/out first — when fully clear the whole system is a no-op
      const want = enabled && target !== "clear" ? 1 : 0;
      if (intensity !== want) {
        const rate = dt / (want > 0 ? 6 : 4); // slow, natural build-up
        intensity = want > intensity ? Math.min(want, intensity + rate) : Math.max(want, intensity - rate);
      }

      if (enabled) {
        timer -= dt;
        if (timer <= 0) {
          if (target === "clear") {
            const k: WeatherKind = Math.random() < 0.65 ? "rain" : "snow";
            timer = 70 + Math.random() * 90; // spell length
            setKind(k);
          } else {
            timer = 90 + Math.random() * 150; // dry spell
            setKind("clear");
            hooks.onKind?.("clear");
          }
        }
      }

      if (flashTimer > 0) {
        flashTimer = Math.max(0, flashTimer - dt);
        // double-blink falloff, reads like a real strike
        const t = flashTimer;
        flashAmount = (t > 0.16 ? 1 : t / 0.16) * (0.55 + 0.45 * Math.sin(t * 62));
      } else if (flashAmount !== 0) {
        flashAmount = 0;
      }

      if (intensity <= 0.02) {
        if (rain.visible) rain.visible = false;
        if (snow.visible) snow.visible = false;
        return;
      }

      time += dt;
      const isRain = current === "rain";
      rain.visible = isRain;
      snow.visible = !isRain;

      const mat = isRain ? rainMat : snowMat;
      mat.uniforms["uTime"]!.value = time;
      (mat.uniforms["uCam"]!.value as THREE.Vector3).copy(cameraPos);
      mat.uniforms["uIntensity"]!.value = intensity;

      // lightning only during rain
      if (isRain && intensity > 0.45) {
        boltTimer -= dt;
        if (boltTimer <= 0) {
          boltTimer = 9 + Math.random() * 22;
          flashTimer = 0.28 + Math.random() * 0.18;
          // sound travels: 0.4–2.6 s of suspense before the boom
          hooks.onThunder?.(0.4 + Math.random() * 2.2);
        }
      }
    },
    dispose: () => {
      scene.remove(rain);
      scene.remove(snow);
      rainGeo.dispose();
      rainMat.dispose();
      snowGeo.dispose();
      snowMat.dispose();
    },
  };
}

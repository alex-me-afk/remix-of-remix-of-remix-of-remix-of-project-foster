/**
 * Procedural daytime skybox.
 *
 * The levels ship with baked lighting, so we can't brighten them with more
 * real-time lights without paying for extra shading. Instead we wrap the map
 * in a very large inverted sphere painted with a canvas-generated day sky
 * (zenith blue → warm horizon haze plus a sun glow), and a second, slightly
 * smaller transparent sphere carrying soft clouds that drifts slowly around
 * the map so the sky never looks frozen.
 *
 * Two unlit draw calls, no lighting cost — but the horizon, fog colour and
 * overall exposure all read as daylight.
 */
import * as THREE from "three";

export type SkyPalette = {
  /** colour straight overhead */
  zenith: string;
  /** mid-sky */
  mid: string;
  /** hazy band where the sky meets the ground */
  horizon: string;
  /** warm sun disc / glow tint */
  sun: string;
};

export const DAY_SKY: SkyPalette = {
  zenith: "#2f6fc4",
  mid: "#7db4e8",
  horizon: "#d8e6f2",
  sun: "#fff3d0",
};

/** Fog / clear colour that blends with the horizon band of the sky above. */
export const DAY_HORIZON = 0xcddcea;

function makeSkyTexture(palette: SkyPalette, size: number): THREE.Texture {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // vertical gradient: zenith at the top of the equirect map, horizon at 50%,
  // then a slightly darker ground haze underneath so nothing looks cut off.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, palette.zenith);
  grad.addColorStop(0.28, palette.mid);
  grad.addColorStop(0.5, palette.horizon);
  grad.addColorStop(0.62, "#b9c8d4");
  grad.addColorStop(1.0, "#8d9aa5");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // sun glow — roughly matching the baked sun direction (+x/+z, high up)
  const sunX = w * 0.68;
  const sunY = h * 0.2;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.55);
  glow.addColorStop(0, "rgba(255,246,214,0.95)");
  glow.addColorStop(0.12, "rgba(255,236,186,0.55)");
  glow.addColorStop(0.4, "rgba(255,230,180,0.16)");
  glow.addColorStop(1, "rgba(255,230,180,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.fillStyle = palette.sun;
  ctx.arc(sunX, sunY, h * 0.022, 0, Math.PI * 2);
  ctx.fill();

  return finishTexture(canvas);
}

/** transparent equirect cloud sheet — drawn on its own drifting sphere */
function makeCloudTexture(size: number, seedValue: number, density: number): THREE.Texture {
  const w = size;
  const h = Math.round(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  let seed = seedValue;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const count = Math.round(90 * density);
  for (let i = 0; i < count; i += 1) {
    const cx = rand() * w;
    const cy = h * (0.12 + rand() * 0.34);
    const scale = 0.4 + rand() * 1.5;
    const rx = h * 0.06 * scale;
    const ry = rx * (0.32 + rand() * 0.22);
    const alpha = 0.12 + rand() * 0.34;
    const puff = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    puff.addColorStop(0, `rgba(255,255,255,${alpha})`);
    puff.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.5})`);
    puff.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return finishTexture(canvas);
}

function finishTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export type Skybox = {
  mesh: THREE.Mesh;
  /**
   * Keep the dome centred on the camera and advance the cloud drift.
   * `dt` is seconds since the last frame.
   */
  update: (cameraPos: THREE.Vector3, dt: number) => void;
  /** 0.5 (moody) – 1.8 (blown out); 1 = the authored sky */
  setBrightness: (value: number) => void;
  /** 0 = clouds frozen, 1 = default drift speed */
  setCloudMotion: (value: number) => void;
  dispose: () => void;
};

/**
 * Adds a daylight sky dome to the scene and returns a handle.
 * `radius` should sit comfortably inside the camera far plane.
 */
export function addDaySkybox(
  scene: THREE.Scene,
  opts: {
    radius?: number;
    textureSize?: number;
    palette?: SkyPalette;
    brightness?: number;
    /** cloud drift speed multiplier (0 = static) */
    cloudMotion?: number;
  } = {},
): Skybox {
  const radius = opts.radius ?? 900;
  const size = opts.textureSize ?? 1024;
  const skyTex = makeSkyTexture(opts.palette ?? DAY_SKY, size);

  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const mat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "DaySkybox";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  scene.add(mesh);

  // Two cloud sheets at slightly different speeds read as parallax without
  // costing anything measurable (two unlit, depth-write-free spheres).
  const layers: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; tex: THREE.Texture; speed: number }> = [];
  const layerSpecs = [
    { r: radius * 0.97, seed: 20260819, density: 1, speed: 0.0026, opacity: 1 },
    { r: radius * 0.93, seed: 991733, density: 0.55, speed: 0.0045, opacity: 0.7 },
  ];
  for (const spec of layerSpecs) {
    const tex = makeCloudTexture(size, spec.seed, spec.density);
    const cmat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      opacity: spec.opacity,
    });
    const cmesh = new THREE.Mesh(new THREE.SphereGeometry(spec.r, 24, 16), cmat);
    cmesh.name = "DaySkyClouds";
    cmesh.frustumCulled = false;
    cmesh.renderOrder = -999;
    scene.add(cmesh);
    layers.push({ mesh: cmesh, mat: cmat, tex, speed: spec.speed });
  }

  let brightness = opts.brightness ?? 1;
  let motion = opts.cloudMotion ?? 1;
  const applyBrightness = () => {
    mat.color.setScalar(brightness);
    for (const l of layers) l.mat.color.setScalar(Math.min(1.4, brightness));
  };
  applyBrightness();

  return {
    mesh,
    update: (cameraPos, dt) => {
      mesh.position.copy(cameraPos);
      const step = Math.min(dt, 0.1) * motion;
      for (const l of layers) {
        l.mesh.position.copy(cameraPos);
        if (step > 0) {
          l.tex.offset.x = (l.tex.offset.x + l.speed * step) % 1;
        }
      }
    },
    setBrightness: (value) => {
      brightness = Math.max(0.4, Math.min(2, value));
      applyBrightness();
    },
    setCloudMotion: (value) => {
      motion = Math.max(0, Math.min(3, value));
    },
    dispose: () => {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
      skyTex.dispose();
      for (const l of layers) {
        scene.remove(l.mesh);
        l.mesh.geometry.dispose();
        l.mat.dispose();
        l.tex.dispose();
      }
      layers.length = 0;
    },
  };
}

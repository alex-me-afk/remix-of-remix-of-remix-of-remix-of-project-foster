/**
 * Frost wall — the deployable frozen shield.
 *
 * Uses the FF-style frost wall GLB when it loads, otherwise falls back to a
 * procedurally built cluster of frozen blobs so the ability always works.
 * Either way the mesh gets our own procedural frost texture, an additive inner
 * glow shell, a pop-in animation and a damage flash.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const frostAsset = { url: "/models/frost_wall.glb" };

export const FROST_WIDTH = 3.6;
export const FROST_HEIGHT = 2.5;
export const FROST_DEPTH = 0.9;

let frostTexture: THREE.Texture | null = null;
let frostBump: THREE.Texture | null = null;

/** cracked-ice diffuse + a matching bump, painted once into a canvas */
function buildFrostTextures() {
  if (frostTexture && frostBump) return { map: frostTexture, bump: frostBump };
  const size = 512;
  const make = (draw: (ctx: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    draw(ctx);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  };

  const crackPath = (ctx: CanvasRenderingContext2D, strokes: number, color: string, w: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    for (let i = 0; i < strokes; i++) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      let a = Math.random() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        a += (Math.random() - 0.5) * 1.1;
        x += Math.cos(a) * (14 + Math.random() * 34);
        y += Math.sin(a) * (14 + Math.random() * 34);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };

  frostTexture = make((ctx) => {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, "#cfeeff");
    g.addColorStop(0.5, "#9ad8f5");
    g.addColorStop(1, "#e6f9ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // frosted speckle
    for (let i = 0; i < 2600; i++) {
      const r = Math.random() * 5 + 1;
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    crackPath(ctx, 26, "rgba(255,255,255,0.55)", 2);
    crackPath(ctx, 14, "rgba(80,160,200,0.45)", 3);
  });

  frostBump = make((ctx) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1400; i++) {
      const r = Math.random() * 10 + 2;
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    crackPath(ctx, 30, "rgba(0,0,0,0.7)", 3);
  });

  return { map: frostTexture, bump: frostBump };
}

function makeIceMaterial() {
  const { map, bump } = buildFrostTextures();
  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.35,
    color: 0xbfeaff,
    emissive: 0x1d6ea8,
    emissiveIntensity: 0.55,
    roughness: 0.18,
    metalness: 0.12,
    transparent: true,
    opacity: 0.9,
  });
}

function makeGlowMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0x7fd8ff,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

/* ---------------- model loading ---------------- */

let templatePromise: Promise<THREE.Object3D | null> | null = null;

/** loads (once) the frost wall model, normalised to FROST_WIDTH x FROST_HEIGHT */
export function loadFrostTemplate(): Promise<THREE.Object3D | null> {
  if (templatePromise) return templatePromise;
  templatePromise = new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      frostAsset.url,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (!Number.isFinite(size.x) || size.x <= 0 || size.y <= 0) {
          resolve(null);
          return;
        }
        const scale = Math.min(FROST_WIDTH / size.x, FROST_HEIGHT / size.y);
        model.scale.setScalar(scale);
        // re-centre horizontally, sit on the ground
        const box2 = new THREE.Box3().setFromObject(model);
        const c = new THREE.Vector3();
        box2.getCenter(c);
        model.position.set(-c.x, -box2.min.y, -c.z);
        const holder = new THREE.Group();
        holder.add(model);
        resolve(holder);
      },
      undefined,
      () => resolve(null),
    );
  });
  return templatePromise;
}

/** chunky frozen blob wall, used when the model isn't available */
function buildFallbackWall(): THREE.Object3D {
  const g = new THREE.Group();
  const cols = 5;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < 2; j++) {
      const r = 0.55 + Math.random() * 0.25;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), makeIceMaterial());
      const pos = blob.geometry.attributes["position"] as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const s = 1 + (Math.random() - 0.5) * 0.22;
        pos.setXYZ(v, pos.getX(v) * s, pos.getY(v) * s, pos.getZ(v) * s);
      }
      pos.needsUpdate = true;
      blob.geometry.computeVertexNormals();
      blob.position.set(
        (i - (cols - 1) / 2) * (FROST_WIDTH / cols) + (Math.random() - 0.5) * 0.12,
        0.55 + j * 1.05 + (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.25,
      );
      blob.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(blob);
    }
  }
  return g;
}

export type FrostVisual = {
  /** the animated visual root (add it as a child of your collider) */
  object: THREE.Object3D;
  update: (dt: number) => void;
  /** 0..1 remaining health — drives cracking / fading */
  setHealth: (t: number) => void;
  flash: () => void;
  dispose: () => void;
};

/**
 * Builds a frost wall visual. Pass the shared template (from loadFrostTemplate)
 * to clone the model; omit it for the procedural fallback.
 */
export function createFrostVisual(template: THREE.Object3D | null, opts?: { ghost?: boolean }): FrostVisual {
  const ghost = !!opts?.ghost;
  const root = new THREE.Group();
  const iceMats: THREE.MeshStandardMaterial[] = [];

  const body = template ? template.clone(true) : buildFallbackWall();
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = makeIceMaterial();
    if (ghost) {
      mat.opacity = 0.4;
      mat.emissiveIntensity = 1.1;
      mat.depthWrite = false;
    }
    m.material = mat;
    m.castShadow = !ghost;
    m.receiveShadow = !ghost;
    iceMats.push(mat);
  });
  root.add(body);

  // additive glow shell hugging the silhouette
  const glowMat = makeGlowMaterial();
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(FROST_WIDTH * 0.98, FROST_HEIGHT * 0.96, FROST_DEPTH * 1.15),
    glowMat,
  );
  glow.position.y = FROST_HEIGHT * 0.48;
  glow.renderOrder = 2;
  root.add(glow);

  // ground frost ring
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x9fe4ff,
    transparent: true,
    opacity: ghost ? 0.5 : 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(FROST_WIDTH * 0.3, FROST_WIDTH * 0.62, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  root.add(ring);

  let t = 0;
  let popIn = ghost ? 1 : 0;
  let flashT = 0;
  let health = 1;

  const update = (dt: number) => {
    t += dt;
    if (popIn < 1) {
      popIn = Math.min(1, popIn + dt * 4.5);
      // ease-out-back so it snaps into place
      const p = popIn;
      const e = 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
      body.scale.set(1, Math.max(0.05, e), 1);
      glow.scale.setScalar(0.9 + e * 0.1);
    }
    const pulse = 0.16 + Math.sin(t * 2.4) * 0.05 + flashT * 0.7;
    glowMat.opacity = ghost ? 0.3 + Math.sin(t * 6) * 0.1 : pulse;
    ringMat.opacity = (ghost ? 0.45 : 0.3) * (0.7 + Math.sin(t * 3) * 0.3);
    ring.rotation.z += dt * (ghost ? 1.2 : 0.35);
    if (flashT > 0) flashT = Math.max(0, flashT - dt * 3.5);
    for (const m of iceMats) {
      m.emissiveIntensity = (ghost ? 1.1 : 0.45) + flashT * 1.6 + (1 - health) * 0.5;
    }
  };

  const setHealth = (v: number) => {
    health = Math.max(0, Math.min(1, v));
    for (const m of iceMats) m.opacity = ghost ? 0.4 : 0.35 + health * 0.55;
  };

  const dispose = () => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat.dispose();
    });
  };

  return { object: root, update, setHealth, flash: () => (flashT = 1), dispose };
}

/** tints the ghost preview red when the spot is invalid */
export function setGhostValid(visual: FrostVisual, valid: boolean) {
  visual.object.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial & { color?: THREE.Color };
    if (mat.color) mat.color.setHex(valid ? 0xbfeaff : 0xff7a6a);
    if ((mat as THREE.MeshStandardMaterial).emissive)
      (mat as THREE.MeshStandardMaterial).emissive.setHex(valid ? 0x1d6ea8 : 0x8a1a10);
  });
}

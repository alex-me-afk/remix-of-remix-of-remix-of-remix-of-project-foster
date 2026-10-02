/**
 * Cheap in-browser "light bake".
 *
 * Instead of paying for a hemisphere + sun + fill + point light on every
 * fragment of the ~880k-vertex level, we fold a static approximation of that
 * lighting into the level's vertex colours once, at load time, and then draw
 * the whole map with unlit (MeshBasicMaterial) shading.
 *
 * The approximation has three parts:
 *  - sky gradient: up-facing verts get the sky colour, down-facing verts get
 *    the ground-bounce colour, blended by the vertex normal.
 *  - sun wrap: a soft N·L term in the sun's direction.
 *  - ambient occlusion: a coarse voxel occupancy grid built from the level's
 *    own vertices; each vertex probes a few offsets along its normal and gets
 *    darker the more of those probes land inside geometry. That is what puts
 *    shade under crates, in corners and inside buildings.
 *
 * Everything is O(vertices) with a handful of array lookups per vertex, so a
 * full level bakes in a few hundred milliseconds behind the deploy splash.
 */
import * as THREE from "three";

export type BakeOptions = {
  /** direction the sunlight travels *from* (i.e. towards the scene) */
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.Color | number;
  sunIntensity?: number;
  skyColor?: THREE.Color | number;
  groundColor?: THREE.Color | number;
  ambient?: number;
  /** how dark a fully occluded vertex gets (0 = black, 1 = no AO) */
  aoFloor?: number;
  /** voxel size, world units */
  cell?: number;
};

type Grid = {
  data: Uint8Array;
  nx: number;
  ny: number;
  nz: number;
  min: THREE.Vector3;
  cell: number;
};

function buildOccupancy(meshes: THREE.Mesh[], cell: number): Grid | null {
  const bounds = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const pos = m.geometry.getAttribute("position");
    if (!pos) continue;
    // Bounds only need the shape of the level, so a coarse sample is plenty.
    const stride = Math.max(1, Math.floor(pos.count / 20000));
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.matrixWorld);
      bounds.expandByPoint(v);
    }
  }
  if (bounds.isEmpty()) return null;
  bounds.expandByScalar(cell * 2);

  const size = bounds.getSize(new THREE.Vector3());
  const nx = Math.max(1, Math.ceil(size.x / cell));
  const ny = Math.max(1, Math.ceil(size.y / cell));
  const nz = Math.max(1, Math.ceil(size.z / cell));
  if (nx * ny * nz > 8_000_000) return null; // pathological map — skip AO

  const grid: Grid = { data: new Uint8Array(nx * ny * nz), nx, ny, nz, min: bounds.min.clone(), cell };
  for (const m of meshes) {
    const pos = m.geometry.getAttribute("position");
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m.matrixWorld);
      const ix = Math.floor((v.x - grid.min.x) / cell);
      const iy = Math.floor((v.y - grid.min.y) / cell);
      const iz = Math.floor((v.z - grid.min.z) / cell);
      if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) continue;
      grid.data[(iy * nz + iz) * nx + ix] = 1;
    }
  }
  return grid;
}

function occupied(g: Grid, x: number, y: number, z: number) {
  const ix = Math.floor((x - g.min.x) / g.cell);
  const iy = Math.floor((y - g.min.y) / g.cell);
  const iz = Math.floor((z - g.min.z) / g.cell);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= g.nx || iy >= g.ny || iz >= g.nz) return 0;
  return g.data[(iy * g.nz + iz) * g.nx + ix] ? 1 : 0;
}

/** unlit stand-in for a lit material, reusing its texture and blend state */
function toUnlit(src: THREE.Material, cache: Map<THREE.Material, THREE.Material>) {
  const hit = cache.get(src);
  if (hit) return hit;

  const std = src as THREE.MeshStandardMaterial;
  const basic = new THREE.MeshBasicMaterial({
    map: std.map ?? null,
    color: std.color ? std.color.clone() : new THREE.Color(0xffffff),
    vertexColors: true,
    transparent: std.transparent,
    opacity: std.opacity,
    alphaTest: std.alphaTest,
    alphaMap: std.alphaMap ?? null,
    side: std.side,
    depthWrite: std.depthWrite,
    fog: true,
    wireframe: std.wireframe ?? false,
  });
  basic.name = `${src.name || "level"}_baked`;
  cache.set(src, basic);
  return basic;
}

/**
 * Bakes approximate lighting into `root`'s vertex colours and swaps every
 * material for an unlit one. Returns the number of meshes converted.
 */
export function bakeVertexLighting(root: THREE.Object3D, opts: BakeOptions = {}) {
  const sunDir = (opts.sunDirection ?? new THREE.Vector3(-0.55, -0.72, -0.4)).clone().normalize();
  const toSun = sunDir.clone().negate();
  const sun = new THREE.Color(opts.sunColor ?? 0xffd9a0);
  const sky = new THREE.Color(opts.skyColor ?? 0x9fc6ff);
  const ground = new THREE.Color(opts.groundColor ?? 0x7a6a58);
  const sunI = opts.sunIntensity ?? 0.95;
  const ambient = opts.ambient ?? 0.62;
  const aoFloor = opts.aoFloor ?? 0.34;
  const cell = opts.cell ?? 2.2;

  root.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry?.getAttribute("position")) meshes.push(m);
  });
  if (meshes.length === 0) return 0;

  const grid = buildOccupancy(meshes, cell);
  const cache = new Map<THREE.Material, THREE.Material>();

  // Probe offsets, in units of `cell`, biased upward — the dominant light in an
  // outdoor arena comes from the sky, so "how much sky can this vertex see"
  // is the term that matters.
  const probes: Array<[number, number, number, number]> = [
    [0, 1, 0, 1.3],
    [0, 1, 0, 2.6],
    [0.9, 0.8, 0, 1.6],
    [-0.9, 0.8, 0, 1.6],
    [0, 0.8, 0.9, 1.6],
    [0, 0.8, -0.9, 1.6],
  ];

  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const lit = new THREE.Color();
  const bounce = new THREE.Color();

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const nrm = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
    if (!nrm) geo.computeVertexNormals();
    const norm = geo.getAttribute("normal") as THREE.BufferAttribute;

    const colors = new Float32Array(pos.count * 3);
    normalMatrix.getNormalMatrix(mesh.matrixWorld);

    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(norm, i).applyMatrix3(normalMatrix).normalize();

      // sky / bounce gradient
      const up = (n.y + 1) * 0.5;
      lit.copy(ground).lerp(sky, up).multiplyScalar(ambient);

      // soft wrapped sun term
      const nl = Math.max(0, n.dot(toSun) * 0.75 + 0.25);
      bounce.copy(sun).multiplyScalar(nl * nl * sunI);
      lit.add(bounce);

      // ambient occlusion from the coarse occupancy grid
      if (grid) {
        let hits = 0;
        let total = 0;
        for (const [ox, oy, oz, dist] of probes) {
          const d = dist * cell;
          const sx = p.x + (n.x * 0.6 + ox) * d;
          const sy = p.y + (n.y * 0.6 + oy) * d;
          const sz = p.z + (n.z * 0.6 + oz) * d;
          hits += occupied(grid, sx, sy, sz);
          total++;
        }
        const ao = 1 - (1 - aoFloor) * (hits / total);
        lit.multiplyScalar(ao);
      }

      colors[i * 3] = Math.min(1, lit.r);
      colors[i * 3 + 1] = Math.min(1, lit.g);
      colors[i * 3 + 2] = Math.min(1, lit.b);
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const swapped = mats.map((m) => toUnlit(m, cache));
    mesh.material = Array.isArray(mesh.material) ? swapped : swapped[0]!;
    // Unlit geometry can neither cast into nor receive from a shadow map.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  return meshes.length;
}

/** small radial-gradient sprite used as a fake contact shadow under fighters */
export function makeBlobShadowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.55, "rgba(0,0,0,0.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

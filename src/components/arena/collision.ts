import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { computeBoundsTree } from "three-mesh-bvh";

export type CollisionBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** How much every collider is fattened (5%), and the absolute cap in metres. */
const INFLATE_PCT = 0.05;
const INFLATE_MAX = 0.12;

/**
 * Fattens a baked, world-space collider about its own bounding-box centre.
 *
 * Authored collision proxies are paper-thin at the silhouette, so a probe that
 * starts a hair inside a wall (or crosses it between two frames) finds nothing.
 * Growing each piece by 5% gives every surface a real skin. The growth is
 * capped in absolute metres so huge pieces (terrain shells, the perimeter
 * fence) do not visibly drift out of place.
 */
function inflateGeometry(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const axisScale = (span: number) => {
    const half = span / 2;
    if (half < 1e-5) return 1;
    const delta = Math.min(half * INFLATE_PCT, INFLATE_MAX);
    return (half + delta) / half;
  };
  const sx = axisScale(size.x);
  const sy = axisScale(size.y);
  const sz = axisScale(size.z);
  if (sx === 1 && sy === 1 && sz === 1) return;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      centre.x + (pos.getX(i) - centre.x) * sx,
      centre.y + (pos.getY(i) - centre.y) * sy,
      centre.z + (pos.getZ(i) - centre.z) * sz,
    );
  }
  pos.needsUpdate = true;
  geo.boundingBox = null;
}

/**
 * Bakes every mesh of a (collision proxy) hierarchy into world-space,
 * position-only geometry.
 *
 * Positions may be quantized (KHR_mesh_quantization ships int8/int16
 * normalized attributes). Baking a world matrix straight into an integer
 * buffer truncates every vertex into garbage — so always dequantize into
 * plain float32 first, using getX/Y/Z which un-normalizes for us.
 */
function bakeWorldGeometries(source: THREE.Object3D): THREE.BufferGeometry[] {
  source.updateMatrixWorld(true);

  const parts: THREE.BufferGeometry[] = [];
  source.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const src = mesh.geometry;
    const pos = src.getAttribute("position");
    if (!pos) return;

    const count = pos.count;
    const floats = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      floats[i * 3] = pos.getX(i);
      floats[i * 3 + 1] = pos.getY(i);
      floats[i * 3 + 2] = pos.getZ(i);
    }

    const instanced = mesh as unknown as THREE.InstancedMesh;
    const matrices: THREE.Matrix4[] = [];
    if (instanced.isInstancedMesh && instanced.instanceMatrix) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, m);
        matrices.push(new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, m));
      }
    } else {
      matrices.push(mesh.matrixWorld.clone());
    }

    for (const world of matrices) {
      const baked = new THREE.BufferGeometry();
      baked.setAttribute("position", new THREE.BufferAttribute(floats.slice(), 3));
      if (src.index) baked.setIndex(src.index.clone());
      baked.applyMatrix4(world);
      const flat = baked.index ? baked.toNonIndexed() : baked;
      if (baked.index) baked.dispose();
      inflateGeometry(flat);
      parts.push(flat);
    }
  });

  return parts;
}

/** three-mesh-bvh build options (targetLeafSize replaces the old maxLeafTris). */
const BVH_OPTS = { targetLeafSize: 12 } as const;

function makeCollider(
  geometry: THREE.BufferGeometry,
  name: string,
  opts: { deferBvh?: boolean } = {},
): THREE.Mesh {
  if (!opts.deferBvh) computeBoundsTree.call(geometry, BVH_OPTS);
  // Collision-only proxy: never rendered, so face winding must not matter.
  // DoubleSide makes raycasts register on flipped-normal faces too (otherwise a
  // downward ground ray misses an inverted floor and the player falls through).
  const collider = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
  );
  collider.name = name;
  collider.visible = false;
  collider.matrixAutoUpdate = false;
  collider.updateMatrix();
  collider.updateMatrixWorld(true);
  return collider;
}


/** One merged, BVH-indexed collision mesh for the whole hierarchy. */
export function buildMergedCollider(source: THREE.Object3D): THREE.Mesh | null {
  const parts = bakeWorldGeometries(source);
  if (parts.length === 0) return null;
  const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
  if (parts.length > 1) for (const p of parts) p.dispose();
  if (!merged) return null;
  return makeCollider(merged, "CollisionProxy");
}

export type CollisionTile = {
  mesh: THREE.Mesh;
  /** tile centre in world XZ */
  cx: number;
  cz: number;
  /** tile half-diagonal, for cone/sphere tests against the whole footprint */
  radius: number;
  /** coarse region index (map split into a few regions for low-end devices) */
  region: number;
  /** true once its BVH has been built (lazily, on first activation) */
  ready: boolean;
};


/**
 * Splits the collision hierarchy into a coarse XZ grid of merged, BVH-indexed
 * tiles, dropping anything outside the playable bounds.
 *
 * Two wins over one giant collider:
 *  - scenery far outside the fence never enters a bounds tree at all
 *  - probes can be restricted to the handful of tiles around the player, so a
 *    frame's movement checks only ever touch nearby geometry
 */
export function buildCollisionTiles(
  source: THREE.Object3D,
  opts: {
    tileSize?: number;
    bounds?: CollisionBounds | null;
    margin?: number;
    /** grid resolution of the coarse region split (default 2 → 2×2 quadrants) */
    regions?: number;
  } = {},
): CollisionTile[] {
  const tileSize = opts.tileSize ?? 32;
  const margin = opts.margin ?? 12;
  const regions = Math.max(1, Math.floor(opts.regions ?? 2));
  const b = opts.bounds ?? null;
  const parts = bakeWorldGeometries(source);
  if (parts.length === 0) return [];

  const buckets = new Map<string, THREE.BufferGeometry[]>();
  const a = new THREE.Vector3();
  const bv = new THREE.Vector3();
  const c = new THREE.Vector3();

  const inBounds = (x: number, z: number) =>
    !b ||
    (x >= b.minX - margin &&
      x <= b.maxX + margin &&
      z >= b.minZ - margin &&
      z <= b.maxZ + margin);

  for (const geo of parts) {
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const tris = pos.count / 3;
    // triangle -> tile bucket, keyed by its centroid cell
    const perTile = new Map<string, number[]>();
    for (let t = 0; t < tris; t++) {
      const i = t * 3;
      a.fromBufferAttribute(pos, i);
      bv.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      const mx = (a.x + bv.x + c.x) / 3;
      const mz = (a.z + bv.z + c.z) / 3;
      if (!inBounds(mx, mz)) continue;
      const key = `${Math.floor(mx / tileSize)}|${Math.floor(mz / tileSize)}`;
      let list = perTile.get(key);
      if (!list) perTile.set(key, (list = []));
      list.push(t);
    }
    for (const [key, tris_] of perTile) {
      const arr = new Float32Array(tris_.length * 9);
      let w = 0;
      for (const t of tris_) {
        for (let k = 0; k < 3; k++) {
          const i = t * 3 + k;
          arr[w++] = pos.getX(i);
          arr[w++] = pos.getY(i);
          arr[w++] = pos.getZ(i);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(g);
    }
    geo.dispose();
  }

  // Region index: split the playable bounds (or the tile extent) into a
  // regions×regions grid so low-end devices can keep whole quadrants dormant.
  const centres: { key: string; cx: number; cz: number; merged: THREE.BufferGeometry }[] = [];
  for (const [key, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (geos.length > 1) for (const g of geos) g.dispose();
    if (!merged) continue;
    const [gx, gz] = key.split("|").map(Number) as [number, number];
    centres.push({ key, merged, cx: (gx + 0.5) * tileSize, cz: (gz + 0.5) * tileSize });
  }
  if (centres.length === 0) return [];

  const minX = b ? b.minX : Math.min(...centres.map((t) => t.cx));
  const maxX = b ? b.maxX : Math.max(...centres.map((t) => t.cx));
  const minZ = b ? b.minZ : Math.min(...centres.map((t) => t.cz));
  const maxZ = b ? b.maxZ : Math.max(...centres.map((t) => t.cz));
  const spanX = Math.max(1e-6, maxX - minX);
  const spanZ = Math.max(1e-6, maxZ - minZ);
  const clampIdx = (v: number) => Math.min(regions - 1, Math.max(0, Math.floor(v * regions)));

  const radius = tileSize * 0.707;
  return centres.map(({ key, merged, cx, cz }) => ({
    mesh: makeCollider(merged, `CollisionTile_${key}`, { deferBvh: true }),
    cx,
    cz,
    radius,
    region: clampIdx((cz - minZ) / spanZ) * regions + clampIdx((cx - minX) / spanX),
    ready: false,
  }));
}

/** Builds a tile's BVH the first time it is actually needed. */
export function ensureTileReady(tile: CollisionTile): THREE.Mesh {
  if (!tile.ready) {
    computeBoundsTree.call(tile.mesh.geometry, BVH_OPTS);
    tile.ready = true;
  }
  return tile.mesh;
}

/**
 * Builds pending BVHs off the hot path (idle callbacks) so no frame ever pays
 * for one. Indexing a tile takes several milliseconds; doing it inside the
 * render loop stalls the main thread, which delays queued mouse/key events and
 * feels exactly like the camera or the player "gliding" after input stopped.
 * Returns a cancel function.
 */
export function warmTiles(tiles: CollisionTile[], perSlice = 2): () => void {
  let cancelled = false;
  let i = 0;
  const idle: (cb: () => void) => number =
    typeof (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback === "function"
      ? (cb) => (globalThis as unknown as { requestIdleCallback: (c: () => void) => number }).requestIdleCallback(cb)
      : (cb) => setTimeout(cb, 32) as unknown as number;

  const step = () => {
    if (cancelled) return;
    let built = 0;
    while (i < tiles.length && built < perSlice) {
      const t = tiles[i++]!;
      if (!t.ready) {
        ensureTileReady(t);
        built++;
      }
    }
    if (i < tiles.length) idle(step);
  };
  idle(step);
  return () => {
    cancelled = true;
  };
}

/** Tiles whose centre sits within `radius` of (x, z). */
export function nearbyTileMeshes(
  tiles: CollisionTile[],
  x: number,
  z: number,
  radius: number,
): THREE.Mesh[] {
  const r2 = radius * radius;
  const out: THREE.Mesh[] = [];
  for (const t of tiles) {
    const dx = t.cx - x;
    const dz = t.cz - z;
    if (dx * dx + dz * dz <= r2) out.push(t.mesh);
  }
  return out;
}

/**
 * Nearby tiles, each guaranteed BVH-indexed, for one-off probes into a single
 * column of the map.
 *
 * This exists because the alternative is catastrophic. A raycast with no
 * explicit object list runs against every collider on the level — on Verdant
 * Isle that is 281 meshes — and a caller like the battle-royale loot scatter
 * probes a column up to four times per candidate spot, for eighty-four drops.
 * Restricted to the tiles actually over the column that is four to nine meshes
 * instead of 281, and the answer is identical: a tile whose footprint does not
 * contain (x, z) cannot own the surface under (x, z).
 *
 * `radius` must be at least a tile's half-diagonal (`tileSize * 0.707`) or the
 * column's own tile can be missed; 40 is safe for the default 32 m tiles.
 */
export function nearbyTileMeshesReady(
  tiles: CollisionTile[],
  x: number,
  z: number,
  radius: number,
): THREE.Mesh[] {
  const r2 = radius * radius;
  const out: THREE.Mesh[] = [];
  for (const t of tiles) {
    const dx = t.cx - x;
    const dz = t.cz - z;
    if (dx * dx + dz * dz <= r2) out.push(ensureTileReady(t));
  }
  return out;
}

/**
 * Tiles the player can actually interact with this moment: anything within
 * `nearRadius` (you can always fall onto / walk into it) plus anything inside
 * the view cone out to `viewRadius` (you can shoot at it). BVHs are built
 * lazily so a match starts without indexing the whole level.
 */
export function activeTileMeshes(
  tiles: CollisionTile[],
  pos: { x: number; z: number },
  dir: { x: number; z: number },
  opts: {
    nearRadius?: number;
    viewRadius?: number;
    viewCosHalfAngle?: number;
    /** max BVHs to build synchronously in this call (near tiles are exempt) */
    maxBuilds?: number;
  } = {},
): THREE.Mesh[] {
  const nearRadius = opts.nearRadius ?? 48;
  const viewRadius = opts.viewRadius ?? 140;
  const cosHalf = opts.viewCosHalfAngle ?? Math.cos(Math.PI / 3); // 120° cone
  let budget = opts.maxBuilds ?? Infinity;

  const near2 = nearRadius * nearRadius;
  const view2 = viewRadius * viewRadius;
  const len = Math.hypot(dir.x, dir.z);
  const fx = len > 1e-6 ? dir.x / len : 0;
  const fz = len > 1e-6 ? dir.z / len : 0;

  const out: THREE.Mesh[] = [];
  for (const t of tiles) {
    const dx = t.cx - pos.x;
    const dz = t.cz - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > view2) continue;

    const isNear = d2 <= near2;
    let keep = isNear;
    if (!keep && len > 1e-6) {
      const d = Math.sqrt(d2);
      if (d <= t.radius) {
        keep = true;
      } else {
        // widen the cone by the tile's angular footprint so a tile clipped by
        // the cone edge still counts
        const cos = (dx * fx + dz * fz) / d;
        const slack = Math.min(1, t.radius / d);
        keep = cos >= cosHalf - slack;
      }
    }
    if (!keep) continue;
    if (t.ready) {
      out.push(t.mesh);
      continue;
    }
    // Near tiles are safety-critical (you can fall through them), so they are
    // always indexed. Distant ones wait for a later frame or the idle warmer
    // rather than stalling this one.
    if (isNear || budget > 0) {
      if (!isNear) budget--;
      out.push(ensureTileReady(t));
    }
  }
  return out;
}


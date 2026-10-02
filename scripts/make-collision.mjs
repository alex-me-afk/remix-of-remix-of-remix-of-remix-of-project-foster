/**
 * Build a collision-only GLB from a full map.
 *
 * Collision meshes are never rendered — the raycaster only needs positions and
 * triangles. So we drop every material, texture, image and non-position vertex
 * attribute, weld, and heavily simplify. The result is a tiny geometry-only file
 * used for ground snaps, wall probes and bullets.
 *
 *   node scripts/make-collision.mjs <in.glb> <out.glb> [ratio] [error]
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify, prune, dedup, join, flatten } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);

const [, , inPath, outPath, ratioArg, errorArg] = process.argv;
if (!inPath || !outPath) throw new Error("usage: make-collision.mjs <in> <out> [ratio] [error]");
const ratio = Number(ratioArg ?? 0.2);
const error = Number(errorArg ?? 0.02);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(inPath);
const root = doc.getRoot();

const before = root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);

// Strip everything a raycast doesn't use FIRST — materials, and every vertex
// attribute except POSITION (kills normals, uvs, tangents, colors, joints) —
// so nothing left forces a seam. With no materials, join() can fuse the whole
// map into one primitive, letting weld + simplify collapse across it.
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    prim.setMaterial(null);
    for (const semantic of prim.listSemantics()) {
      if (semantic !== "POSITION") prim.setAttribute(semantic, null);
    }
    for (const target of prim.listTargets()) target.dispose();
  }
}
for (const m of root.listMaterials()) m.dispose();
for (const t of root.listTextures()) t.dispose();

await doc.transform(
  dedup(),
  flatten(),
  join({ keepMeshes: false, keepNamed: false }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }),
  prune(),
);

const after = root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);
let tris = 0;
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    const pos = prim.getAttribute("POSITION");
    tris += (idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3;
  }

await io.write(outPath, doc);
console.log(`collision: prims ${before} → ${after}, ~${Math.round(tris).toLocaleString()} tris → ${outPath}`);

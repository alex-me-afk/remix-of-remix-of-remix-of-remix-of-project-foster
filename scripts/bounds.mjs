/**
 * Print world-space bounds for a GLB: the whole scene, and each mesh, so we can
 * anchor spawns on real geometry. Run against the ice map to find the two
 * spawn buildings.
 *   node scripts/bounds.mjs <in.glb>
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const inPath = process.argv[2];
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(inPath);
const root = doc.getRoot();
const scene = root.listScenes()[0];

const fmt = (v) => v.map((n) => n.toFixed(1)).join(", ");
const sceneB = getBounds(scene);
console.log(`SCENE  min[${fmt(sceneB.min)}]  max[${fmt(sceneB.max)}]`);
console.log(`       center[${fmt(sceneB.min.map((n, i) => (n + sceneB.max[i]) / 2))}]`);
console.log("");

// per node that carries a mesh, with its material set (tells us which is a building)
scene.traverse((node) => {
  const mesh = node.getMesh();
  if (!mesh) return;
  const b = getBounds(node);
  const c = b.min.map((n, i) => (n + b.max[i]) / 2);
  const size = b.min.map((n, i) => b.max[i] - n);
  const mats = [...new Set(mesh.listPrimitives().map((p) => p.getMaterial()?.getName()).filter(Boolean))];
  console.log(`${(node.getName() || "?").padEnd(14)} mesh=${(mesh.getName() || "?").padEnd(8)} center[${fmt(c)}] size[${fmt(size)}]`);
  console.log(`   mats: ${mats.slice(0, 8).join(", ")}${mats.length > 8 ? " …" : ""}`);
});

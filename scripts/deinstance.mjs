/**
 * Expand low-count EXT_mesh_gpu_instancing nodes into plain child nodes.
 *
 * GPU instancing is a win when a mesh is scattered hundreds of times, but this
 * map's exporter also instanced meshes that appear 2-4 times, which costs a
 * draw call each and blocks `gltf-transform join` from merging them. Expanding
 * only the low-count nodes lets join collapse them per material, while the
 * genuinely dense scatter (hundreds to thousands of instances) stays instanced.
 *
 *   node scripts/deinstance.mjs in.glb out.glb --max 16
 *
 * The binary chunk is copied byte-for-byte — only the node graph is rewritten,
 * so no geometry is decoded, re-encoded or otherwise put at risk. Instance
 * transforms become child-node TRS, which is exactly what the extension means,
 * so the scene is visually identical. The now-orphaned instance accessors are
 * left for `gltf-transform join`'s prune pass to sweep up.
 */

import { readFile, writeFile } from "node:fs/promises";
import { MeshoptDecoder } from "meshoptimizer/decoder";

const [input, output] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const maxFlag = process.argv.indexOf("--max");
const MAX_INSTANCES = maxFlag > -1 ? Number(process.argv[maxFlag + 1]) : 16;
if (!input || !output) throw new Error("usage: node scripts/deinstance.mjs <in.glb> <out.glb> [--max 16]");

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT = {
  5120: { array: Int8Array, size: 1, norm: (c) => Math.max(c / 127, -1) },
  5121: { array: Uint8Array, size: 1, norm: (c) => c / 255 },
  5122: { array: Int16Array, size: 2, norm: (c) => Math.max(c / 32767, -1) },
  5123: { array: Uint16Array, size: 2, norm: (c) => c / 65535 },
  5125: { array: Uint32Array, size: 4, norm: (c) => c },
  5126: { array: Float32Array, size: 4, norm: (c) => c },
};
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const glb = await readFile(input);
if (glb.readUInt32LE(0) !== GLB_MAGIC) throw new Error("not a glb");

let cursor = 12;
let json = null;
let bin = Buffer.alloc(0);
while (cursor < glb.length) {
  const len = glb.readUInt32LE(cursor);
  const type = glb.readUInt32LE(cursor + 4);
  const body = glb.subarray(cursor + 8, cursor + 8 + len);
  if (type === CHUNK_JSON) json = JSON.parse(body.toString("utf8"));
  else if (type === CHUNK_BIN) bin = body;
  cursor += 8 + len;
  if (len % 4) cursor += 4 - (len % 4);
}
if (!json) throw new Error("no JSON chunk");

await MeshoptDecoder.ready;

/** Decoded bufferView bytes, transparently handling EXT_meshopt_compression. */
const viewCache = new Map();
function readView(index) {
  if (viewCache.has(index)) return viewCache.get(index);
  const view = json.bufferViews[index];
  const mo = view.extensions?.EXT_meshopt_compression;
  let bytes;
  if (mo) {
    const stride = mo.byteStride;
    bytes = new Uint8Array(mo.count * stride);
    const source = new Uint8Array(bin.buffer, bin.byteOffset + (mo.byteOffset ?? 0), mo.byteLength);
    MeshoptDecoder.decodeGltfBuffer(bytes, mo.count, stride, source, mo.mode, mo.filter ?? "NONE");
  } else {
    bytes = new Uint8Array(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0), view.byteLength);
  }
  viewCache.set(index, bytes);
  return bytes;
}

/** Accessor → array of tuples, normalized/dequantized to real units. */
function readAccessor(index) {
  const acc = json.accessors[index];
  const comp = COMPONENT[acc.componentType];
  const n = NUM_COMPONENTS[acc.type];
  if (!comp || !n) throw new Error(`unsupported accessor ${acc.componentType}/${acc.type}`);

  const view = json.bufferViews[acc.bufferView];
  const bytes = readView(acc.bufferView);
  const stride = view.extensions?.EXT_meshopt_compression?.byteStride ?? view.byteStride ?? comp.size * n;
  const base = acc.byteOffset ?? 0;

  const out = [];
  for (let i = 0; i < acc.count; i += 1) {
    const at = base + i * stride;
    // A fresh view per element: the stride may not be a multiple of the
    // component size, so a single typed-array view over the whole range is not
    // guaranteed to be aligned.
    const el = new comp.array(bytes.buffer, bytes.byteOffset + at, n);
    const tuple = new Array(n);
    for (let c = 0; c < n; c += 1) tuple[c] = acc.normalized ? comp.norm(el[c]) : el[c];
    out.push(tuple);
  }
  return out;
}

const EPS = 1e-6;
const isDefault = (v, d) => v.every((x, i) => Math.abs(x - d[i]) < EPS);

let expandedNodes = 0;
let createdNodes = 0;
let keptInstanced = 0;
let keptInstances = 0;

// Snapshot the length first: nodes are appended while iterating.
const originalNodeCount = json.nodes.length;
for (let i = 0; i < originalNodeCount; i += 1) {
  const node = json.nodes[i];
  const gi = node.extensions?.EXT_mesh_gpu_instancing;
  if (!gi || node.mesh === undefined) continue;

  const attrs = gi.attributes ?? {};
  const anyAccessor = attrs.TRANSLATION ?? attrs.ROTATION ?? attrs.SCALE;
  if (anyAccessor === undefined) continue;
  const count = json.accessors[anyAccessor].count;

  if (count > MAX_INSTANCES) {
    keptInstanced += 1;
    keptInstances += count;
    continue;
  }

  const t = attrs.TRANSLATION !== undefined ? readAccessor(attrs.TRANSLATION) : null;
  const r = attrs.ROTATION !== undefined ? readAccessor(attrs.ROTATION) : null;
  const s = attrs.SCALE !== undefined ? readAccessor(attrs.SCALE) : null;

  const children = node.children ? [...node.children] : [];
  for (let k = 0; k < count; k += 1) {
    const child = { mesh: node.mesh };
    if (node.name) child.name = `${node.name}_${k}`;
    if (t && !isDefault(t[k], [0, 0, 0])) child.translation = t[k];
    if (r && !isDefault(r[k], [0, 0, 0, 1])) child.rotation = r[k];
    if (s && !isDefault(s[k], [1, 1, 1])) child.scale = s[k];
    children.push(json.nodes.length);
    json.nodes.push(child);
    createdNodes += 1;
  }

  // The instanced node becomes a plain group holding the expanded copies.
  delete node.mesh;
  delete node.extensions.EXT_mesh_gpu_instancing;
  if (Object.keys(node.extensions).length === 0) delete node.extensions;
  node.children = children;
  expandedNodes += 1;
}

if (keptInstanced === 0) {
  const drop = (list) => list?.filter((e) => e !== "EXT_mesh_gpu_instancing");
  if (json.extensionsUsed) json.extensionsUsed = drop(json.extensionsUsed);
  if (json.extensionsRequired) json.extensionsRequired = drop(json.extensionsRequired);
}

const jsonChunk = Buffer.from(JSON.stringify(json), "utf8");
const jsonPad = (4 - (jsonChunk.length % 4)) % 4;
const binPad = (4 - (bin.length % 4)) % 4;
const total = 12 + 8 + jsonChunk.length + jsonPad + (bin.length ? 8 + bin.length + binPad : 0);

const out = Buffer.alloc(total);
out.writeUInt32LE(GLB_MAGIC, 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
let w = 12;
out.writeUInt32LE(jsonChunk.length + jsonPad, w);
out.writeUInt32LE(CHUNK_JSON, w + 4);
jsonChunk.copy(out, w + 8);
out.fill(0x20, w + 8 + jsonChunk.length, w + 8 + jsonChunk.length + jsonPad); // JSON pads with spaces
w += 8 + jsonChunk.length + jsonPad;
if (bin.length) {
  out.writeUInt32LE(bin.length + binPad, w);
  out.writeUInt32LE(CHUNK_BIN, w + 4);
  bin.copy(out, w + 8);
}
await writeFile(output, out);

console.log(`expanded    ${expandedNodes} instanced nodes (<=${MAX_INSTANCES} instances) into ${createdNodes} plain nodes`);
console.log(`kept        ${keptInstanced} instanced nodes carrying ${keptInstances} instances`);
console.log(`wrote       ${output}  ${(out.length / 1048576).toFixed(2)} MB  (bin chunk copied verbatim)`);

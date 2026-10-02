/**
 * Dump the structure of a .glb — draw calls, materials, textures, extensions.
 *
 * Reads the glTF JSON chunk only, so it is fast and never touches the binary
 * payload. Draw calls = total mesh primitives across all node instances, which
 * is what the renderer actually submits.
 *
 *   node scripts/glbinfo.mjs "path/to/file.glb"
 */

import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) throw new Error("usage: node scripts/glbinfo.mjs <file.glb>");

const buf = await readFile(file);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb (bad magic)");

// 12-byte header, then length-prefixed chunks: JSON first, BIN second.
let off = 12;
let json = null;
let binLength = 0;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const body = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
  else if (type === 0x004e4942) binLength = len;
  off += 8 + len + ((4 - (len % 4)) % 4) - ((4 - (len % 4)) % 4); // chunks are already padded
  off = off + 0;
  if (len % 4 !== 0) off += 4 - (len % 4);
}
if (!json) throw new Error("no JSON chunk");

const meshes = json.meshes ?? [];
const nodes = json.nodes ?? [];
const scene = json.scenes?.[json.scene ?? 0];

/** Walk the scene graph so instanced meshes are counted once per instance. */
const usedMesh = new Map();
let nodeCount = 0;
const walk = (i) => {
  const n = nodes[i];
  if (!n) return;
  nodeCount += 1;
  if (n.mesh !== undefined) usedMesh.set(n.mesh, (usedMesh.get(n.mesh) ?? 0) + 1);
  for (const c of n.children ?? []) walk(c);
};
for (const r of scene?.nodes ?? []) walk(r);

let drawCalls = 0;
let primCount = 0;
let triangles = 0;
const matUse = new Map();
for (const [mi, instances] of usedMesh) {
  for (const p of meshes[mi]?.primitives ?? []) {
    drawCalls += instances;
    primCount += 1;
    matUse.set(p.material, (matUse.get(p.material) ?? 0) + instances);
    const count = p.indices !== undefined ? json.accessors?.[p.indices]?.count : json.accessors?.[p.attributes?.POSITION]?.count;
    if (count) triangles += (count / 3) * instances;
  }
}

const imgKinds = new Map();
for (const img of json.images ?? []) {
  const kind = img.mimeType ?? (img.extensions?.EXT_texture_webp ? "image/webp" : "unknown");
  imgKinds.set(kind, (imgKinds.get(kind) ?? 0) + 1);
}
const ktxTextures = (json.textures ?? []).filter((t) => t.extensions?.KHR_texture_basisu).length;

console.log(`file            ${file}`);
console.log(`size            ${(buf.length / 1048576).toFixed(2)} MB  (bin chunk ${(binLength / 1048576).toFixed(2)} MB)`);
console.log(`extensionsUsed  ${(json.extensionsUsed ?? []).join(", ") || "(none)"}`);
console.log(`nodes           ${nodeCount} in scene / ${nodes.length} total`);
console.log(`meshes          ${meshes.length} (${usedMesh.size} referenced)`);
console.log(`primitives      ${primCount}`);
console.log(`DRAW CALLS      ${drawCalls}`);
console.log(`triangles       ${Math.round(triangles).toLocaleString()}`);
console.log(`materials       ${(json.materials ?? []).length} (${matUse.size} in use)`);
console.log(`textures        ${(json.textures ?? []).length}  (KHR_texture_basisu: ${ktxTextures})`);
console.log(`images          ${(json.images ?? []).length}  ${[...imgKinds].map(([k, v]) => `${k}×${v}`).join(" ") || ""}`);
console.log(`animations      ${(json.animations ?? []).length}`);
console.log(`skins           ${(json.skins ?? []).length}`);

// Per-material draw-call spread: the ceiling for how far joining can go, since
// only primitives sharing a material can be merged.
const spread = [...matUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`\ntop materials by draw calls (merge ceiling = ${matUse.size} calls):`);
for (const [mi, n] of spread) {
  const m = json.materials?.[mi];
  console.log(`  ${String(n).padStart(5)} calls  ${m?.name ?? `material ${mi}`}`);
}

if (process.argv.includes("--nodes")) {
  console.log("\nscene roots:");
  for (const r of scene?.nodes ?? []) console.log(`  ${nodes[r]?.name ?? r}`);
}

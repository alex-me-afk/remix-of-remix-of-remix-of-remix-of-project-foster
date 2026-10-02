/**
 * Convert Mixamo FBX clips into a mesh-less clip bundle that binds to the shared operative
 * skeleton — no Blender needed.
 *
 *   NODE_PATH=node_modules bun scripts/fbx-to-anim-glb.ts <out.glb> name=path.fbx [name=path.fbx ...]
 *
 * How it stays compatible with `operative-anims.glb`:
 *  - The skeleton written into the bundle IS the shared library's (loaded from that GLB), so
 *    `buildClipLibrary` derives the same scale / vertical channel for these clips.
 *  - Mixamo's `mixamorig*` prefix is stripped so tracks bind by bare bone name.
 *  - Only rotations + `Hips.position` are kept: per-bone translation/scale would write the
 *    FBX character's bone lengths onto whoever plays the clip.
 *  - The FBX is Y-up with Hips parented to the scene root; the library parents Hips under the
 *    `Operative` node (Blender's +90 X / 0.01 scale). Hips tracks are pre-multiplied by that
 *    node's inverse rotation so they land in the same space. Units are cm on both sides.
 */
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { readFileSync, writeFileSync } from "node:fs";

const g = globalThis as any;
g.self ??= globalThis;
g.FileReader ??= class {
  result: any = null;
  onloadend: any = null;
  onload: any = null;
  async readAsArrayBuffer(b: Blob) {
    this.result = await b.arrayBuffer();
    this.onload?.({ target: this });
    this.onloadend?.({ target: this });
  }
  async readAsDataURL(b: Blob) {
    const buf = Buffer.from(await b.arrayBuffer());
    this.result = `data:${b.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
    this.onload?.({ target: this });
    this.onloadend?.({ target: this });
  }
};

const ab = (p: string) => {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const [out, ...pairs] = process.argv.slice(2);
if (!out || pairs.length === 0) throw new Error("usage: fbx-to-anim-glb.ts out.glb name=file.fbx ...");

const gltf = await new GLTFLoader().parseAsync(ab("public/models/operative-anims.glb"), "");
const scene = gltf.scene;
const rootNode = scene.children[0]!;
const inv = rootNode.quaternion.clone().invert();
const bones = new Set<string>();
scene.traverse((o) => o.name && bones.add(o.name));

const clips: THREE.AnimationClip[] = [];
for (const pair of pairs) {
  const [name, file] = pair.split("=");
  const fbx = new FBXLoader().parse(ab(file!), "");
  const src = fbx.animations[0]!;
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of src.tracks) {
    const [rawBone, prop] = t.name.split(".");
    const bone = rawBone!.replace(/^mixamorig\d*:?/, "");
    if (!bones.has(bone)) continue;
    if (prop === "scale") continue;
    if (prop === "position" && bone !== "Hips") continue;
    const tr = t.clone();
    tr.name = `${bone}.${prop}`;
    if (bone === "Hips") {
      const v = tr.values;
      if (prop === "position") {
        const p = new THREE.Vector3();
        for (let i = 0; i < v.length; i += 3) {
          p.fromArray(v, i).applyQuaternion(inv).toArray(v, i);
        }
      } else if (prop === "quaternion") {
        const q = new THREE.Quaternion();
        for (let i = 0; i < v.length; i += 4) {
          q.fromArray(v, i).premultiply(inv).toArray(v, i);
        }
      }
    }
    tracks.push(tr);
  }
  clips.push(new THREE.AnimationClip(name, src.duration, tracks));
  console.log(`${name}: ${tracks.length}/${src.tracks.length} tracks, ${src.duration.toFixed(2)}s`);
}

const glb = (await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips })) as ArrayBuffer;
writeFileSync(out, Buffer.from(glb));
console.log(`wrote ${out} (${(glb.byteLength / 1024).toFixed(0)} KB)`);

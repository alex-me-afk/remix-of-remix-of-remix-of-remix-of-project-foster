/**
 * One KTX2 transcoder for the whole page, plus the GLTFLoader factory that uses it.
 *
 * WHY THIS FILE EXISTS. Every KTX2Loader instance downloads and compiles its OWN copy of the
 * basis transcoder and allocates its OWN pool of web workers (see `_activeLoaders` in
 * three/examples/jsm/loaders/KTX2Loader.js — it prints "Multiple active KTX2 loaders may cause
 * performance issues" the moment a second one initialises, which the console did). Four modules
 * each built their own: the arena level, the operative bodies, the pets and the cars. So a match
 * ran four transcoders and four worker pools where one would do, and the arena's was constructed
 * fresh on every mount.
 *
 * The transcode target is a property of the GPU, not of the caller, so one instance is correct:
 * `detectSupport` reads the renderer's texture-compression extensions and the whole page shares
 * one renderer capability set. It is detected ONCE, from the first renderer handed in — the
 * config is baked into each worker at spawn time (`postMessage({type:'init', config})`), so
 * re-detecting later would not reach the workers that already exist anyway.
 *
 * NEVER dispose this. `KTX2Loader.dispose()` revokes the blob URL its workers are spawned from
 * while leaving `transcoderPending` resolved, so a disposed loader can never load again — and
 * this one outlives any single arena mount by design.
 */
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

let shared: KTX2Loader | null = null;

/**
 * The page's KTX2 loader, created on the first call that supplies a renderer.
 *
 * Returns null when nothing has passed a renderer yet: a KTX2Loader without `detectSupport`
 * THROWS on load, so it is better to hand back nothing and let the caller load the
 * uncompressed path than to attach a loader that cannot decode.
 */
export function sharedKtx2Loader(renderer?: THREE.WebGLRenderer): KTX2Loader | null {
  if (!shared && renderer) {
    shared = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(renderer);
  }
  return shared;
}

/**
 * A GLTFLoader wired for this project's assets: meshopt geometry and KTX2/ETC1S textures.
 *
 * `renderer` is required the first time any KTX2 asset loads in the page, so the transcoder can
 * pick a format the GPU supports; without it those textures fail to decode and the model renders
 * untextured. Cheap to call per load — the loader itself is a thin object, and the expensive part
 * (the transcoder and its workers) is the shared singleton above.
 */
export function makeGltfLoader(renderer?: THREE.WebGLRenderer): GLTFLoader {
  const loader = new GLTFLoader();
  const ktx2 = sharedKtx2Loader(renderer);
  if (ktx2) loader.setKTX2Loader(ktx2);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

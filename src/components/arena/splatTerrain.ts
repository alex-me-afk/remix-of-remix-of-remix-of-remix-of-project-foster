/**
 * Splat-painted terrain support.
 *
 * Map terrain is painted with a 4-way splat map (grass / dirt / rock / sand /
 * road weights). Two storage flavours show up in the shipped GLBs:
 *
 *  1. AUTHORED MASK — the map editor exports its splat shader into material
 *     extras (`material.userData.splatUniforms`) and keeps the RGBA weight
 *     mask as the material's base-colour texture. Grass is the implicit base
 *     layer, so the mask is mostly black; rendered as a plain texture the
 *     terrain reads as a black shell. We detect the extras, take the base
 *     map back as the weight source, and rebuild the splat shader.
 *
 *  2. VERTEX COLOURS — weights baked into COLOR_0 (green = grass,
 *     blue = gravel/path, remainder = rock). Some exports strip the colour
 *     attribute entirely; then we synthesise plausible weights from slope
 *     and height so the ground still reads as terrain instead of a black
 *     or white shell.
 *
 * Either way the ground is re-shaded from small repeating tiles (a few MB
 * of VRAM) instead of a huge baked atlas.
 */
import * as THREE from "three";

const TEXTURE_ROOT = "/textures";

/** One terrain mesh picked up by {@link prepareSplatTerrain}. */
export interface SplatTarget {
  mesh: THREE.Mesh;
  /** Authored RGBA weight mask when the GLB embeds one, else null. */
  mask: THREE.Texture | null;
}

/**
 * The level's vertex-light bake runs *after* this prep and multiplies any
 * existing vertex colours in, so the weight snapshot must happen first and
 * live in its own attribute (`aSplat`) that the bake leaves untouched.
 */

const NAME_HINT = /terrain|ground|splat|island|floor/i;

/** Older three exports drop KHR_materials_pbrSpecularGlossiness; treat the
 *  mesh as splat terrain when it has no usable base colour at all. */
function hasBaseColourMap(material: THREE.Material | THREE.Material[]): boolean {
  const mats = Array.isArray(material) ? material : [material];
  return mats.some((m) => {
    const std = m as THREE.MeshStandardMaterial;
    return !!std?.map;
  });
}

function hasColourAttr(geo: THREE.BufferGeometry): boolean {
  const c = geo.getAttribute("color");
  return !!c && c.itemSize >= 3;
}

/** Copy the painted weights out of `color` before the light bake rewrites it. */
function snapshotColourWeights(colour: THREE.BufferAttribute): THREE.BufferAttribute {
  const out = new Float32Array(colour.count * 3);
  for (let i = 0; i < colour.count; i++) {
    out[i * 3] = colour.getX(i);
    out[i * 3 + 1] = colour.getY(i);
    out[i * 3 + 2] = colour.getZ(i);
  }
  return new THREE.BufferAttribute(out, 3);
}

/**
 * Derive splat weights from the mesh itself: green where the ground is flat
 * and low, grey rock where it's steep or high, dirt paths sprinkled along
 * gentle mid-slope bands so the result isn't a flat two-tone.
 */
function synthesizeWeights(mesh: THREE.Mesh): THREE.BufferAttribute {
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const count = pos.count;
  const out = new Float32Array(count * 3);

  mesh.updateWorldMatrix(true, false);
  const nMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  // find the height range so “low ground” is relative to this map
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const span = Math.max(1e-3, maxY - minY);

  for (let i = 0; i < count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    if (nrm) n.fromBufferAttribute(nrm, i).applyMatrix3(nMat).normalize();
    else n.set(0, 1, 0);

    const h = (p.y - minY) / span; // 0 low → 1 high
    const up = THREE.MathUtils.clamp(n.y, 0, 1); // 1 flat → 0 cliff

    const rock = THREE.MathUtils.smoothstep(1 - up, 0.25, 0.55) + THREE.MathUtils.smoothstep(h, 0.55, 0.85) * 0.5;
    const dirt = THREE.MathUtils.smoothstep(1 - up, 0.08, 0.2) * (1 - rock) * 0.35;
    const grass = Math.max(0, 1 - rock - dirt);

    out[i * 3] = Math.min(1, rock);
    out[i * 3 + 1] = grass;
    out[i * 3 + 2] = dirt;
  }
  return new THREE.BufferAttribute(out, 3);
}

/**
 * Find terrain meshes that need the splat treatment, snapshot their paint
 * weights (if any) and swap in a placeholder so the rest of the load
 * pipeline never draws the broken source material. Returns the picked
 * meshes so {@link applySplatMaterial} can re-shade them once textures are
 * ready.
 */
export function prepareSplatTerrain(
  root: THREE.Object3D,
  opts: { bakedAtlas?: THREE.Texture | null } = {},
): SplatTarget[] {
  root.updateMatrixWorld(true);
  const picked: SplatTarget[] = [];

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry?.getAttribute("position")) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];

    // Authored splat export: the editor serialised its splat shader into
    // material extras and kept the weight mask as the base-colour map.
    // That mask is mostly black (grass is implicit), which is exactly the
    // black-terrain bug.
    const authored = mats.find(
      (mat) => (mat as THREE.Material).userData?.["splatUniforms"],
    ) as THREE.MeshStandardMaterial | undefined;
    if (authored) {
      // Preferred fix: the editor's baked terrain albedo (shipped separately
      // as GPU-compressed KTX2). It samples with the same UVs as the mask, so
      // we can hand the mesh an ordinary textured material and let the
      // vertex-light bake treat it like every other mesh in the level.
      if (opts.bakedAtlas) {
        m.material = new THREE.MeshStandardMaterial({
          map: opts.bakedAtlas,
          roughness: 1,
          metalness: 0,
        });
        return;
      }
      // Fallback: reclaim the mask as the splat weight source.
      picked.push({ mesh: m, mask: authored.map ?? null });
      m.material = new THREE.MeshBasicMaterial({ color: 0x3f5a34 });
      return;
    }

    const named = NAME_HINT.test(m.name) || NAME_HINT.test(m.parent?.name ?? "");
    const splatPainted = named && hasColourAttr(m.geometry);
    const untextured = named && !hasBaseColourMap(m.material);
    if (!splatPainted && !untextured) return;

    const existing = m.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    const aSplat = existing ? snapshotColourWeights(existing) : synthesizeWeights(m);
    m.geometry.setAttribute("aSplat", aSplat);
    picked.push({ mesh: m, mask: null });

    // Cheap placeholder until the shader material is ready; keeps the bake
    // pass and any early frame from showing raw black or blinding white.
    m.material = new THREE.MeshBasicMaterial({ color: 0x3f5a34 });
  });

  return picked;
}

/** Load one repeating tile; failures fall back to flat green inside the shader. */
function loadTile(url: string, anisotropy: number): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

const VERT = /* glsl */ `
  attribute vec3 aSplat;
  attribute vec3 color;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vSplat;
  varying vec2 vUv;
  varying vec3 vColorBake;
  #ifdef USE_FOG
    varying float vFogDepth;
  #endif

  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vSplat = aSplat;
    vUv = uv;
    vColorBake = color;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #ifdef USE_FOG
      vFogDepth = -mvPosition.z;
    #endif
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uGrass;
  uniform sampler2D uDirt;
  uniform sampler2D uRock;
  uniform sampler2D uSand;
  uniform sampler2D uRoad;
  uniform sampler2D uSplat;
  uniform float uUseMask;
  uniform float uTileSize;
  uniform vec3 uSunDir;
  uniform float uLit;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vSplat;
  varying vec2 vUv;
  varying vec3 vColorBake;
  #ifdef USE_FOG
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    varying float vFogDepth;
  #endif

  void main() {
    vec2 tuv = vWorld.xz / uTileSize;
    vec3 grass = texture2D(uGrass, tuv).rgb;
    vec3 dirt = texture2D(uDirt, tuv).rgb;
    vec3 rock = texture2D(uRock, tuv).rgb;
    vec3 sand = texture2D(uSand, tuv).rgb;
    vec3 road = texture2D(uRoad, tuv).rgb;

    float wGrass; float wDirt; float wRock; float wSand; float wRoad;
    if (uUseMask > 0.5) {
      // Editor splat mask channels: R dirt · G rock · B sand · A road.
      // Grass is the implicit base layer — it's whatever paint is left.
      vec4 m = texture2D(uSplat, vUv);
      wDirt = m.r;
      wRock = m.g;
      wSand = m.b;
      wRoad = m.a;
      wGrass = clamp(1.0 - wDirt - wRock - wSand - wRoad, 0.0, 1.0);
    } else {
      // Vertex-colour weights: green = grass, blue = path, rest = rock.
      wGrass = clamp(vSplat.g, 0.0, 1.0);
      wRoad = clamp(vSplat.b, 0.0, 1.0);
      wRock = clamp(1.0 - wGrass - wRoad, 0.0, 1.0);
      wDirt = 0.0;
      wSand = 0.0;
    }

    vec3 albedo = grass * wGrass + dirt * wDirt + rock * wRock + sand * wSand + road * wRoad;

    vec3 col;
    if (uLit > 0.5) {
      // lit path: lambert sun + sky fill; vertex colours hold baked AO only
      float ndl = clamp(dot(normalize(vNormal), normalize(uSunDir)), 0.0, 1.0);
      float sky = 0.45 + 0.55 * clamp(vNormal.y, 0.0, 1.0);
      float ao = uUseMask > 0.5 ? 1.0 : clamp(vSplat.r * 1.15, 0.0, 1.0);
      vec3 light = vec3(0.32, 0.36, 0.42) * sky + vec3(1.0, 0.93, 0.78) * ndl * 1.15;
      col = albedo * light * ao;
    } else {
      // unlit path: the level's vertex-light bake already lives in the color attribute
      vec3 vBaked = vColorBake;
      col = albedo * vBaked;
    }

    gl_FragColor = vec4(col, 1.0);
    #ifdef USE_FOG
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
    #endif
  }
`;

/**
 * Re-shade prepared terrain meshes with the splat shader. Mask-driven meshes
 * (authored export) are grouped per mask texture; weight-in-attribute meshes
 * share one material that keeps the legacy grass/gravel/rock look.
 */
export function applySplatMaterial(
  targets: SplatTarget[],
  opts: {
    /** world meters per texture repeat for weight-attribute terrain */
    tileSize?: number;
    /** world meters per texture repeat on mask-driven terrain (the island editor paints at ~128 repeats over the map) */
    maskTileSize?: number;
    lit?: boolean;
    sunDirection?: THREE.Vector3;
    anisotropy?: number;
  } = {},
) {
  if (targets.length === 0) return;
  const aniso = opts.anisotropy ?? 4;
  const tileSize = opts.tileSize ?? 6;
  const maskTileSize = opts.maskTileSize ?? 12;

  const grass = loadTile(`${TEXTURE_ROOT}/terrain-grass.jpg`, aniso);
  const rock = loadTile(`${TEXTURE_ROOT}/terrain-rock.jpg`, aniso);
  const dirt = loadTile(`${TEXTURE_ROOT}/terrain-gravel.jpg`, aniso);
  const sand = loadTile(`${TEXTURE_ROOT}/ground.jpg`, aniso);
  const asphalt = loadTile(`${TEXTURE_ROOT}/terrain-asphalt.jpg`, aniso);

  const makeMaterial = (mask: THREE.Texture | null): THREE.ShaderMaterial => {
    // Standard fog uniforms: with `fog: true` the renderer refreshes them
    // from scene.fog every frame, so the terrain tracks weather/quality fog.
    const uniforms: Record<string, THREE.IUniform> = {
      ...THREE.UniformsLib.fog,
      uGrass: { value: grass },
      uDirt: { value: dirt },
      uRock: { value: rock },
      uSand: { value: sand },
      // legacy vertex-weight terrain paints gravel paths; authored roads get asphalt
      uRoad: { value: mask ? asphalt : dirt },
      uSplat: { value: mask ?? dirt },
      uUseMask: { value: mask ? 1 : 0 },
      uTileSize: { value: mask ? maskTileSize : tileSize },
      uSunDir: { value: (opts.sunDirection ?? new THREE.Vector3(0.4, 0.8, 0.35)).clone().normalize() },
      uLit: { value: opts.lit === false ? 0 : 1 },
    };
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      fog: true,
    });
  };

  // group mask meshes by texture so each authored mask gets one material
  const byMask = new Map<string, THREE.ShaderMaterial>();
  let attrMaterial: THREE.ShaderMaterial | null = null;

  for (const t of targets) {
    let mat: THREE.ShaderMaterial;
    if (t.mask) {
      const key = t.mask.uuid;
      mat = byMask.get(key) ?? makeMaterial(t.mask);
      byMask.set(key, mat);
    } else {
      attrMaterial = attrMaterial ?? makeMaterial(null);
      mat = attrMaterial;
    }
    t.mesh.material = mat;
  }
}

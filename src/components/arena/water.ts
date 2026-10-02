/**
 * Lightweight animated water for authored level meshes.
 *
 * The original GLB material, textures and geometry stay intact. Waves are
 * injected into the built-in material shader so the sea keeps the level's
 * lighting, fog and transparency while all movement remains on the GPU.
 */
import * as THREE from "three";

export type AnimatedWater = {
  update: (dt: number) => void;
  dispose: () => void;
};

type WaterShader = THREE.WebGLProgramParametersWithUniforms & {
  uniforms: Record<string, THREE.IUniform>;
};

const WATER_VERTEX_HEADER = /* glsl */ `
uniform float uWaterTime;
varying vec3 vWaterWorld;
varying float vWaterCrest;
`;

const WATER_VERTEX_WAVES = /* glsl */ `
#include <begin_vertex>
vec3 waterWorldBase = (modelMatrix * vec4(position, 1.0)).xyz;
float waterLong = sin(waterWorldBase.x * 0.030 + uWaterTime * 0.72)
  + sin(waterWorldBase.z * 0.024 - uWaterTime * 0.56);
float waterCross = sin((waterWorldBase.x + waterWorldBase.z) * 0.052 + uWaterTime * 0.94);
float waterFine = sin(waterWorldBase.x * 0.11 - waterWorldBase.z * 0.075 + uWaterTime * 1.35);
float waterHeight = waterLong * 0.30 + waterCross * 0.16 + waterFine * 0.07;
transformed += objectNormal * waterHeight;
vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWaterCrest = waterHeight;
`;

const WATER_FRAGMENT_HEADER = /* glsl */ `
uniform float uWaterTime;
varying vec3 vWaterWorld;
varying float vWaterCrest;
`;

const WATER_FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
float waterRippleA = sin(vWaterWorld.x * 0.085 + vWaterWorld.z * 0.032 + uWaterTime * 1.10);
float waterRippleB = sin(vWaterWorld.z * 0.105 - vWaterWorld.x * 0.026 - uWaterTime * 0.82);
float waterRipple = 0.5 + 0.25 * (waterRippleA + waterRippleB);
float waterGlint = smoothstep(0.72, 1.0, waterRipple) * (0.35 + max(vWaterCrest, 0.0));
vec3 waterDeep = vec3(0.025, 0.19, 0.28);
vec3 waterShallow = vec3(0.08, 0.43, 0.53);
vec3 waterTint = mix(waterDeep, waterShallow, clamp(waterRipple, 0.0, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, waterTint, 0.42);
diffuseColor.rgb += vec3(0.30, 0.48, 0.50) * waterGlint * 0.30;
`;

function cloneWaterMaterial(source: THREE.Material, time: THREE.IUniform<number>): THREE.Material {
  const material = source.clone();
  const previousCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    const waterShader = shader as WaterShader;
    waterShader.uniforms["uWaterTime"] = time;
    waterShader.vertexShader = `${WATER_VERTEX_HEADER}\n${waterShader.vertexShader}`.replace(
      "#include <begin_vertex>",
      WATER_VERTEX_WAVES,
    );
    waterShader.fragmentShader = `${WATER_FRAGMENT_HEADER}\n${waterShader.fragmentShader}`.replace(
      "#include <color_fragment>",
      WATER_FRAGMENT_COLOR,
    );
  };
  material.customProgramCacheKey = () => "ironhowl-water-v1";
  material.needsUpdate = true;
  return material;
}

/** Animate only the selected ocean mesh; gameplay continues using its static waterline. */
export function createAnimatedWater(mesh: THREE.Mesh): AnimatedWater {
  const time: THREE.IUniform<number> = { value: 0 };
  const original = mesh.material;
  const source = Array.isArray(original) ? original : [original];
  const animated = source.map((material) => cloneWaterMaterial(material, time));
  mesh.material = Array.isArray(original) ? animated : animated[0] ?? original;

  return {
    update: (dt) => {
      time.value += Math.min(dt, 0.05);
    },
    dispose: () => {
      mesh.material = original;
      for (const material of animated) material.dispose();
    },
  };
}
import * as THREE from "three";

/**
 * Ability aura: a rising ground ring, an orbiting particle swirl and a soft
 * light, all driven by one 0..1 intensity value. It follows the player every
 * frame so it reads as a Free Fire style "power is up" halo.
 */
export type PowerFx = {
  group: THREE.Group;
  /** fire the burst + hold the aura for `duration` seconds */
  activate: (color: number, duration: number) => void;
  stop: () => void;
  update: (dt: number, at: THREE.Vector3) => void;
  dispose: () => void;
};

const RING_SEGMENTS = 64;

function makeRing(inner: number, outer: number) {
  const geo = new THREE.RingGeometry(inner, outer, RING_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(geo, mat);
}

export function createPowerFx(particleCount = 48): PowerFx {
  /*
   * The GROUP stays visible even while the aura is idle, because it owns the PointLight below.
   * `three` bumps `lights.state.version` whenever the number of active lights changes, and that
   * forces every lit material in the scene to relink its program — a synchronous main-thread
   * stall in the exact frame the power is pressed. Hiding a group that holds a light is
   * therefore a hitch generator, not a saving (same note in `impactFx.ts`). The meshes are
   * hidden instead and the light is left in the scene at zero intensity, so the light count
   * never changes.
   */
  const group = new THREE.Group();

  const baseRing = makeRing(0.75, 1.05);
  const pulseRing = makeRing(0.4, 0.55);
  baseRing.visible = false;
  pulseRing.visible = false;
  group.add(baseRing, pulseRing);

  const positions = new Float32Array(particleCount * 3);
  const seeds = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) seeds[i] = Math.random();
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.13,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.visible = false;
  group.add(points);

  const light = new THREE.PointLight(0xffffff, 0, 7, 2);
  light.position.y = 1.1;
  group.add(light);

  let remaining = 0;
  let total = 1;
  let intensity = 0;
  let t = 0;
  let shown = false;

  /** Show/hide the aura's meshes only — never the group, which carries the light. */
  const setShown = (on: boolean) => {
    if (shown === on) return;
    shown = on;
    baseRing.visible = on;
    pulseRing.visible = on;
    points.visible = on;
  };

  const setColor = (color: number) => {
    (baseRing.material as THREE.MeshBasicMaterial).color.setHex(color);
    (pulseRing.material as THREE.MeshBasicMaterial).color.setHex(color);
    pMat.color.setHex(color);
    light.color.setHex(color);
  };

  return {
    group,
    activate(color, duration) {
      setColor(color);
      total = Math.max(0.1, duration);
      remaining = total;
      t = 0;
      setShown(true);
    },
    stop() {
      remaining = 0;
    },
    update(dt, at) {
      const target = remaining > 0 ? 1 : 0;
      intensity += (target - intensity) * (1 - Math.exp(-dt * 6));
      if (remaining > 0) remaining = Math.max(0, remaining - dt);
      if (intensity < 0.01 && target === 0) {
        setShown(false);
        light.intensity = 0;
        return;
      }
      setShown(true);
      group.position.copy(at);
      t += dt;

      // ground rings: one steady halo, one pulse that expands and fades
      const pulse = (t * 0.9) % 1;
      baseRing.rotation.y = t * 0.6;
      (baseRing.material as THREE.MeshBasicMaterial).opacity = 0.55 * intensity;
      const s = 0.6 + pulse * 2.4;
      pulseRing.scale.setScalar(s);
      pulseRing.position.y = pulse * 0.35;
      (pulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.7 * intensity;

      // orbiting motes rising around the operative
      const arr = pGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        const seed = seeds[i] ?? 0;
        const life = (t * 0.55 + seed) % 1;
        const a = seed * Math.PI * 2 + t * (1.4 + seed);
        const r = 0.85 * (1 - life * 0.55);
        arr.setXYZ(i, Math.cos(a) * r, life * 2.0, Math.sin(a) * r);
      }
      arr.needsUpdate = true;
      pMat.opacity = 0.85 * intensity;

      const flare = remaining > total - 0.35 ? 1.9 : 1;
      light.intensity = 5.5 * intensity * flare;
    },
    dispose() {
      baseRing.geometry.dispose();
      (baseRing.material as THREE.Material).dispose();
      pulseRing.geometry.dispose();
      (pulseRing.material as THREE.Material).dispose();
      pGeo.dispose();
      pMat.dispose();
      group.clear();
    },
  };
}
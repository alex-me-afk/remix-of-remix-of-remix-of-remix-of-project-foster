import * as THREE from "three";

/**
 * "Emberveil" — a personal energy bubble that follows the operative.
 * Incoming enemy fire dies on the shell; the operative can still shoot out.
 *
 * Deliberately NOT the icy blue dome you have seen elsewhere: this one is a
 * molten amber lattice with a magenta core wash, so it reads as heat rather
 * than ice.
 */
export type BarrierDome = {
  group: THREE.Group;
  radius: number;
  activate: (duration: number) => void;
  stop: () => void;
  /** flash a ripple where a bullet died on the shell (world-space point) */
  impact: (point: THREE.Vector3) => void;
  update: (dt: number, at: THREE.Vector3) => void;
  dispose: () => void;
};

const RADIUS = 2.6;

export function createBarrierDome(detail = 3): BarrierDome {
  /*
   * The GROUP stays visible for the whole match even while the dome is idle, because it owns the
   * PointLight below. `three` bumps `lights.state.version` when the active light count changes,
   * which relinks every lit material in the scene on the main thread — the stall that landed on
   * the frame the bubble was raised. Hiding a group that holds a light is a hitch generator, not
   * a saving (see `impactFx.ts`). The meshes are hidden instead and the light stays in the scene
   * at zero intensity, so the light count never changes.
   */
  const group = new THREE.Group();

  const shellGeo = new THREE.IcosahedronGeometry(RADIUS, detail);
  const shellMat = new THREE.MeshBasicMaterial({
    color: 0xff8a2b,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);

  // faceted lattice — the "plates" of the veil
  const latticeGeo = new THREE.IcosahedronGeometry(RADIUS * 1.005, Math.max(1, detail - 1));
  const latticeMat = new THREE.MeshBasicMaterial({
    color: 0xffd08a,
    transparent: true,
    opacity: 0,
    wireframe: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lattice = new THREE.Mesh(latticeGeo, latticeMat);

  // inner magenta wash so the inside of the bubble is tinted, not blinding
  const coreGeo = new THREE.SphereGeometry(RADIUS * 0.96, 24, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xff2f7a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);

  // ripple decal used when a round is stopped
  const rippleGeo = new THREE.RingGeometry(0.12, 0.42, 24);
  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xfff0c2,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ripple = new THREE.Mesh(rippleGeo, rippleMat);
  ripple.visible = false;

  const light = new THREE.PointLight(0xff9a3d, 0, 9, 2);
  light.position.y = 1.1;

  group.add(shell, lattice, core, ripple, light);
  shell.visible = false;
  lattice.visible = false;
  core.visible = false;

  let remaining = 0;
  let intensity = 0;
  let t = 0;
  let rippleT = 1;
  let shown = false;

  /** Show/hide the dome's meshes only — never the group, which carries the light. */
  const setShown = (on: boolean) => {
    if (shown === on) return;
    shown = on;
    shell.visible = on;
    lattice.visible = on;
    core.visible = on;
  };

  return {
    group,
    radius: RADIUS,
    activate(duration) {
      remaining = Math.max(0.1, duration);
      t = 0;
      setShown(true);
    },
    stop() {
      remaining = 0;
    },
    impact(point) {
      // Guard on the live timer, not `group.visible` — the group is always visible now.
      if (remaining <= 0) return;
      ripple.position.copy(point).sub(group.position);
      ripple.lookAt(new THREE.Vector3(0, 1.1, 0));
      ripple.visible = true;
      rippleT = 0;
    },
    update(dt, at) {
      const target = remaining > 0 ? 1 : 0;
      intensity += (target - intensity) * (1 - Math.exp(-dt * 7));
      if (remaining > 0) remaining = Math.max(0, remaining - dt);
      if (intensity < 0.01 && target === 0) {
        setShown(false);
        light.intensity = 0;
        return;
      }
      setShown(true);
      group.position.set(at.x, at.y + 1.1, at.z);
      t += dt;

      const breathe = 0.94 + Math.sin(t * 2.1) * 0.03;
      shell.scale.setScalar(breathe * intensity ** 0.5);
      lattice.scale.setScalar(breathe * intensity ** 0.5);
      core.scale.setScalar(breathe * intensity ** 0.5);
      lattice.rotation.y = t * 0.35;
      lattice.rotation.x = Math.sin(t * 0.4) * 0.2;
      shell.rotation.y = -t * 0.18;

      shellMat.opacity = 0.14 * intensity;
      latticeMat.opacity = (0.4 + Math.sin(t * 3.4) * 0.08) * intensity;
      coreMat.opacity = 0.1 * intensity;
      light.intensity = 3.2 * intensity;

      if (rippleT < 1) {
        rippleT = Math.min(1, rippleT + dt * 2.6);
        ripple.scale.setScalar(0.5 + rippleT * 2.4);
        rippleMat.opacity = (1 - rippleT) * 0.9 * intensity;
        if (rippleT >= 1) ripple.visible = false;
      }
    },
    dispose() {
      shellGeo.dispose();
      shellMat.dispose();
      latticeGeo.dispose();
      latticeMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      rippleGeo.dispose();
      rippleMat.dispose();
      group.clear();
    },
  };
}

import * as THREE from "three";

/**
 * Cheap, allocation-free explosion animation: a fireball that punches out and
 * fades, a ground shockwave ring, and a smoke puff. Everything is built once
 * and simply replayed, so triggering it never compiles a shader or adds a
 * light (the caller already flashes its own light).
 */
export type ExplosionFx = {
  group: THREE.Group;
  burst: (at: THREE.Vector3) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

const LIFETIME = 0.75;

export function createExplosionFx(radius = 5): ExplosionFx {
  const group = new THREE.Group();
  group.visible = false;

  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), coreMat);
  group.add(core);

  const fireMat = new THREE.MeshBasicMaterial({
    color: 0xff5a18,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fireMat);
  group.add(fire);

  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0x2a2118,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), smokeMat);
  group.add(smoke);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffb45c,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 36), ringMat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  let life = 0;

  return {
    group,
    burst: (at: THREE.Vector3) => {
      group.position.copy(at);
      life = LIFETIME;
      group.visible = true;
    },
    update: (dt: number) => {
      if (life <= 0) {
        if (group.visible) group.visible = false;
        return;
      }
      life = Math.max(0, life - dt);
      const p = 1 - life / LIFETIME;
      const ease = 1 - Math.pow(1 - p, 3);

      core.scale.setScalar(0.3 + ease * radius * 0.55);
      coreMat.opacity = Math.max(0, 1 - p * 3.2);

      fire.scale.setScalar(0.4 + ease * radius * 0.9);
      fireMat.opacity = Math.max(0, 0.85 * (1 - p * 1.7));

      smoke.scale.setScalar(0.5 + ease * radius * 1.05);
      smoke.position.y = ease * radius * 0.35;
      smokeMat.opacity = Math.max(0, Math.sin(Math.min(1, p * 1.2) * Math.PI) * 0.45);

      ring.scale.setScalar(0.6 + ease * radius * 1.6);
      ring.position.y = 0.12;
      ringMat.opacity = Math.max(0, 0.7 * (1 - p));

      if (life <= 0) group.visible = false;
    },
    dispose: () => {
      core.geometry.dispose();
      coreMat.dispose();
      fire.geometry.dispose();
      fireMat.dispose();
      smoke.geometry.dispose();
      smokeMat.dispose();
      ring.geometry.dispose();
      ringMat.dispose();
    },
  };
}

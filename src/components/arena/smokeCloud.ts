/**
 * Smoke grenade clouds: a cheap billboard puff cluster that also acts as a
 * vision blocker — bots lose line of sight through it, same as a player does.
 */
import * as THREE from "three";
import { SMOKE_LIFE, SMOKE_RADIUS } from "./bomb";

type Puff = { sprite: THREE.Sprite; offset: THREE.Vector3; phase: number; scale: number };
type Cloud = { center: THREE.Vector3; ttl: number; group: THREE.Group; puffs: Puff[] };

let smokeTex: THREE.Texture | null = null;
function puffTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "rgba(226,232,240,0.95)");
  g.addColorStop(0.55, "rgba(190,200,214,0.55)");
  g.addColorStop(1, "rgba(170,180,196,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

export type SmokeField = {
  group: THREE.Group;
  spawn: (at: THREE.Vector3) => void;
  update: (dt: number) => void;
  /** true when the segment from → to passes through any live cloud */
  blocks: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  /** true when a point sits inside a cloud */
  contains: (p: THREE.Vector3) => boolean;
  clear: () => void;
};

export function createSmokeField(density = 1): SmokeField {
  const group = new THREE.Group();
  const clouds: Cloud[] = [];
  const puffCount = Math.max(6, Math.round(16 * density));
  const mat = new THREE.SpriteMaterial({
    map: puffTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  });

  const spawn = (at: THREE.Vector3) => {
    const g = new THREE.Group();
    const puffs: Puff[] = [];
    for (let i = 0; i < puffCount; i++) {
      const sprite = new THREE.Sprite(mat.clone());
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * SMOKE_RADIUS * 1.5,
        Math.random() * 2.6,
        (Math.random() - 0.5) * SMOKE_RADIUS * 1.5,
      );
      const scale = SMOKE_RADIUS * (0.8 + Math.random() * 0.8);
      sprite.scale.setScalar(0.1);
      sprite.position.copy(at).add(offset);
      g.add(sprite);
      puffs.push({ sprite, offset, phase: Math.random() * Math.PI * 2, scale });
    }
    group.add(g);
    clouds.push({ center: at.clone().setY(at.y + 1.1), ttl: SMOKE_LIFE, group: g, puffs });
  };

  const update = (dt: number) => {
    const t = performance.now() * 0.001;
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i]!;
      c.ttl -= dt;
      const age = 1 - Math.max(0, c.ttl) / SMOKE_LIFE;
      // billow out fast, then fade for the last third of the life
      const grow = Math.min(1, age * 5);
      const fade = c.ttl < SMOKE_LIFE * 0.3 ? Math.max(0, c.ttl / (SMOKE_LIFE * 0.3)) : 1;
      for (const p of c.puffs) {
        p.sprite.scale.setScalar(p.scale * grow);
        p.sprite.position.y = c.center.y + p.offset.y * grow + Math.sin(t + p.phase) * 0.08;
        (p.sprite.material as THREE.SpriteMaterial).opacity = 0.8 * fade;
      }
      if (c.ttl <= 0) {
        group.remove(c.group);
        for (const p of c.puffs) (p.sprite.material as THREE.SpriteMaterial).dispose();
        clouds.splice(i, 1);
      }
    }
  };

  /** shortest distance from a point to a segment, used for both queries */
  const distToSegment = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
    const ab = b.clone().sub(a);
    const len2 = ab.lengthSq();
    if (len2 < 1e-6) return p.distanceTo(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / len2));
    return p.distanceTo(a.clone().addScaledVector(ab, t));
  };

  return {
    group,
    spawn,
    update,
    blocks: (from, to) => {
      for (const c of clouds) {
        if (c.ttl < 0.35) continue;
        if (distToSegment(c.center, from, to) < SMOKE_RADIUS * 0.85) return true;
      }
      return false;
    },
    contains: (p) => clouds.some((c) => c.ttl > 0.2 && c.center.distanceTo(p) < SMOKE_RADIUS),
    clear: () => {
      for (const c of clouds) group.remove(c.group);
      clouds.length = 0;
    },
  };
}

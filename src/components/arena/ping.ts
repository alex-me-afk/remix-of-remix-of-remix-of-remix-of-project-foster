/**
 * Ping / marker system.
 *
 * Players can mark enemies, locations or loot for teammates. Pings appear in
 * world-space, on the minimap, and fade out after a few seconds.
 */

import * as THREE from "three";

export type PingKind = "enemy" | "go" | "loot" | "watch";

export type Ping = {
  id: string;
  kind: PingKind;
  /** world-space position */
  pos: THREE.Vector3;
  team: "blue" | "red";
  /** remaining lifetime in seconds */
  life: number;
  /** max lifetime */
  maxLife: number;
  /** visual group attached to the scene */
  mesh: THREE.Group;
};

const PING_COLORS: Record<PingKind, number> = {
  enemy: 0xff3b1f,
  go: 0x3f8fff,
  loot: 0xf2c14e,
  watch: 0x7cff4f,
};

const PING_LABELS: Record<PingKind, string> = {
  enemy: "ENEMY",
  go: "GO",
  loot: "LOOT",
  watch: "WATCH",
};

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createPingMarker(kind: PingKind, pos: THREE.Vector3, team: "blue" | "red"): Ping {
  const group = new THREE.Group();
  group.position.copy(pos);

  const color = PING_COLORS[kind];
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.45, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }),
  );
  pole.position.y = 0.7;
  group.add(pole);

  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
  top.position.y = 1.4;
  group.add(top);

  group.userData["pingKind"] = kind;
  return { id: uuid(), kind, pos: pos.clone(), team, life: 6, maxLife: 6, mesh: group };
}

export function updatePings(pings: Ping[], dt: number) {
  for (let i = pings.length - 1; i >= 0; i--) {
    const p = pings[i]!;
    p.life -= dt;
    const t = performance.now() * 0.004;
    p.mesh.position.y = Math.sin(t + p.pos.x) * 0.08;
    const opacity = Math.max(0, p.life / p.maxLife);
    p.mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material && "opacity" in m.material) {
        (m.material as THREE.Material).transparent = true;
        (m.material as THREE.Material).opacity = opacity * (m.geometry.type === "RingGeometry" ? 0.85 : 0.6);
      }
    });
    if (p.life <= 0) {
      p.mesh.removeFromParent();
      pings.splice(i, 1);
    }
  }
}

export function pingKindAtIndex(index: number): PingKind {
  const kinds: PingKind[] = ["enemy", "go", "loot", "watch"];
  return kinds[index % kinds.length]!;
}

export function nextPingKind(current: PingKind): PingKind {
  const kinds: PingKind[] = ["enemy", "go", "loot", "watch"];
  return kinds[(kinds.indexOf(current) + 1) % kinds.length]!;
}

export { PING_COLORS, PING_LABELS };

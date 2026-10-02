/**
 * Friend Island mini-game spots, in map world coordinates (the map loads at scale 1, no offset).
 * Positions were measured from the screen / table meshes in the island model:
 *  - arcade: the 16 cabinet screens in the arcade hall
 *  - tabletop: the 4 wooden game tables next to it
 */
export type StationKind = "arcade" | "tabletop";
export type Station = { kind: StationKind; x: number; z: number };

const ARCADE_X = [-163, -165.6, -168.2, -170.8, -173.4, -176];
export const ISLAND_STATIONS: Station[] = [
  ...ARCADE_X.map((x) => ({ kind: "arcade" as const, x, z: 107.9 })),
  ...ARCADE_X.map((x) => ({ kind: "arcade" as const, x, z: 114.3 })),
  ...[117, 121.3, 125.7, 130].map((z) => ({ kind: "arcade" as const, x: -176.3, z })),
  { kind: "tabletop", x: -149, z: 114 },
  { kind: "tabletop", x: -155.5, z: 114 },
  { kind: "tabletop", x: -155.5, z: 121.5 },
  { kind: "tabletop", x: -149, z: 121.7 },
];

const REACH: Record<StationKind, number> = { arcade: 1.8, tabletop: 2.6 };

export function nearestStation(x: number, z: number): Station | null {
  let best: Station | null = null;
  let bestD = Infinity;
  for (const s of ISLAND_STATIONS) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < REACH[s.kind] && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Leftover node in the island model that must never be shown. */
export const ISLAND_STRAY_NODES = new Set(["Cube"]);

// ---------------------------------------------------------------------------
// "Stand here" light markers — the GTA Vice City style glowing pillar of light
// that shows where to stand to start a game. One per station, plus one on the
// basketball court. The nearest marker brightens as the player steps into it.
// ---------------------------------------------------------------------------
import * as THREE from "three";

/** Centre of the basketball court — the pickup spot gets a marker too. */
export const COURT_MARKER = { x: 8.4, z: 194.75 };

const MARKER_COLORS: Record<StationKind, number> = { arcade: 0x38e0ff, tabletop: 0xffb340 };
const COURT_COLOR = 0xff7a2a;

export type StationMarkers = { update: (dt: number, px: number, pz: number) => void; dispose: () => void };

export function createStationMarkers(scene: THREE.Scene): StationMarkers {
  const group = new THREE.Group();
  scene.add(group);

  type Marker = { x: number; z: number; beam: THREE.Mesh; ring: THREE.Mesh; base: number };
  const markers: Marker[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const addMarker = (x: number, z: number, color: number) => {
    const beamGeo = new THREE.CylinderGeometry(0.55, 0.7, 3.4, 20, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, 1.7, z);

    const ringGeo = new THREE.RingGeometry(0.5, 0.72, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.04, z);

    geos.push(beamGeo, ringGeo);
    mats.push(beamMat, ringMat);
    group.add(beam, ring);
    markers.push({ x, z, beam, ring, base: Math.random() * Math.PI * 2 });
  };

  for (const s of ISLAND_STATIONS) addMarker(s.x, s.z, MARKER_COLORS[s.kind]);
  addMarker(COURT_MARKER.x, COURT_MARKER.z, COURT_COLOR);

  let t = 0;
  return {
    update(dt, px, pz) {
      t += dt;
      for (const m of markers) {
        const near = Math.hypot(m.x - px, m.z - pz) < 1.2;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + m.base);
        (m.beam.material as THREE.MeshBasicMaterial).opacity = (near ? 0.34 : 0.13) + pulse * 0.06;
        (m.ring.material as THREE.MeshBasicMaterial).opacity = (near ? 0.95 : 0.45) + pulse * 0.15;
        const s = near ? 1.12 : 1;
        m.ring.scale.setScalar(s);
      }
    },
    dispose() {
      scene.remove(group);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/**
 * Hard, hand-authored map barriers.
 *
 * The Timber Outpost barrier ring was authored in Blender and exported as a
 * closed fence loop; only its footprint matters here, so the polygon below is
 * baked in (already converted into arena space: model offsets applied). The
 * model itself is never loaded or rendered.
 *
 * The ring is convex, which is what makes it an absolute limit: the player
 * position is projected back inside every frame, so no amount of speed,
 * height, or clipping can ever put them outside it.
 */
export type BarrierPoly = { x: number; z: number }[];

/** Timber Outpost (4v4) — counter-clockwise, arena space.
 *  These are the *actual* corners of the solid terrain island (the smaller
 *  ground the props and spawns sit on) measured from the collision mesh — the
 *  huge plane beyond it is water and is never walkable. The clamp margin then
 *  keeps the player a full metre inside this edge on every side.
 */
export const OUTPOST_BARRIER: BarrierPoly = [
  { x: -179.92, z: -141.5 },
  { x: 126.4, z: -138.5 },
  { x: 155.09, z: 112.3 },
  { x: -90.94, z: 142.1 },
  { x: -94.44, z: 142.3 },
  { x: -132.93, z: 143.7 },
];


/**
 * Projects (x, z) inside the polygon, keeping at least `margin` metres of
 * clearance from every edge. Returns the clamped point and whether it moved.
 */
export function clampInsideBarrier(
  poly: BarrierPoly,
  x: number,
  z: number,
  margin = 0.6,
): { x: number; z: number; clamped: boolean } {
  let px = x;
  let pz = z;
  let clamped = false;
  // two passes so a point pushed off one edge still resolves against the
  // neighbouring edge at a sharp corner
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len = Math.hypot(ex, ez);
      if (len < 1e-6) continue;
      // CCW winding → interior is the positive-cross side
      const cross = (ex * (pz - a.z) - ez * (px - a.x)) / len;
      if (cross >= margin) continue;
      const push = margin - cross;
      // inward unit normal for CCW winding
      px += (-ez / len) * push;
      pz += (ex / len) * push;
      moved = true;
      clamped = true;
    }
    if (!moved) break;
  }
  return { x: px, z: pz, clamped };
}

/**
 * Squad nameplates — a teammate's account name and range, floating over their head.
 *
 * Brook: "u needs to add the name of the acc at the firend head as if somone playing with 3 ppl
 * there name should show up there head and how much far they r even if u rlike 500m far u still can
 * see there name and how afr they r".
 *
 * Three decisions follow from "even if you're 500 m away", and each one is the opposite of what a
 * normal in-world label does:
 *
 *   1. `sizeAttenuation: false`. A sprite that shrinks with distance is unreadable past about 40 m,
 *      and a 500 m plate would be a single pixel. Turning attenuation off makes the scale a
 *      fraction of the VIEWPORT instead of a size in metres, so the plate is exactly as legible at
 *      500 m as at 5 m. This is why the distance readout matters at all: with constant screen size
 *      the plate no longer tells you how far away your squadmate is, so it has to say so.
 *   2. `depthTest: false` plus a high `renderOrder`. The plate draws through terrain, buildings and
 *      other fighters. A squad marker you lose the moment your friend steps behind a rock is not a
 *      squad marker, and every battle royale does this.
 *   3. Teammates only. The caller decides who gets one, but the reason is worth stating where the
 *      code is: giving enemies nameplates that ignore depth is a wallhack, not a HUD.
 *
 * The text is drawn to a canvas, so the cost is a redraw whenever what it SAYS changes — not per
 * frame. Range is quantised (see `distanceLabel`) and the state is compared before redrawing, so a
 * squadmate running straight at you repaints a 320x96 canvas a handful of times per second and a
 * stationary one never repaints at all.
 */
import * as THREE from "three";

/**
 * Plate height as a fraction of VIEWPORT height (not metres, not NDC — see the scale maths in
 * `update`). 5.5% is about 48 px on a 900 px-tall window: readable without covering the fight.
 */
const PLATE_VIEWPORT_H = 0.055;
const CANVAS_W = 320;
const CANVAS_H = 96;
const ASPECT = CANVAS_W / CANVAS_H;

/** Metres above the fighter's FEET that the plate floats at. */
const HEAD_OFFSET = 2.05;

/** Hide the plate once it is this far off to the side of the view direction (or behind it). */
const MIN_FACING = 0.15;

export type PlateState = "up" | "downed";

/**
 * Range text, quantised so the canvas is not redrawn every frame.
 *
 * Under 100 m a metre of precision is worth having — it is the difference between "he is behind
 * this wall" and "he is behind the next building". Past that nobody is reading the units digit, so
 * it steps in fives, which cuts repaints on a distant squadmate by roughly 5x.
 */
function distanceLabel(metres: number): string {
  if (metres < 100) return `${Math.round(metres)}m`;
  if (metres < 1000) return `${Math.round(metres / 5) * 5}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

/**
 * Paints one plate: chevron, name, range.
 *
 * Everything is stroked in near-black before it is filled. The plate has no panel behind it — a
 * translucent box over every squadmate is 3 more blended quads and it hides the level — so the
 * outline IS the legibility, and it has to survive both a white snowfield and a dark interior.
 */
function paint(ctx: CanvasRenderingContext2D, name: string, range: string, state: PlateState) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  const tint = state === "downed" ? "#ff8a6b" : "#8fd3ff";

  // Downward chevron pinning the plate to the head below it.
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2 - 9, 78);
  ctx.lineTo(CANVAS_W / 2, 89);
  ctx.lineTo(CANVAS_W / 2 + 9, 78);
  ctx.stroke();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = "700 34px 'Rajdhani', 'Segoe UI', system-ui, sans-serif";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.strokeText(name, CANVAS_W / 2, 26, CANVAS_W - 16);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, CANVAS_W / 2, 26, CANVAS_W - 16);

  const sub = state === "downed" ? `DOWN · ${range}` : range;
  ctx.font = "600 27px 'Rajdhani', 'Segoe UI', system-ui, sans-serif";
  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.strokeText(sub, CANVAS_W / 2, 58, CANVAS_W - 16);
  ctx.fillStyle = tint;
  ctx.fillText(sub, CANVAS_W / 2, 58, CANVAS_W - 16);
}

export type Nameplate = {
  /** Add this to the scene once; the plate never re-parents. */
  readonly object: THREE.Sprite;
  /** `feet` is the fighter's own `pos` (feet, not eye). Drives position, size and visibility. */
  update: (feet: THREE.Vector3, camera: THREE.PerspectiveCamera, state: PlateState) => void;
  /** Force-hide without removing, e.g. a dead teammate. */
  hide: () => void;
  dispose: () => void;
};

export function createNameplate(name: string): Nameplate {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // No mipmaps: the plate is a fixed pixel size, and regenerating a chain on every repaint would
  // make the one cost this design has (the repaint) several times worse for no visible gain.
  texture.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
    // The text is UI, not lit geometry: tone mapping would grey the white down under a bright sky.
    toneMapped: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 940;
  sprite.frustumCulled = false; // depth/size are faked; let the facing test below do the culling
  sprite.visible = false;
  sprite.matrixAutoUpdate = true;

  let range = "";
  let state: PlateState = "up";
  /** What the canvas currently shows. `null` means nothing has been painted yet. */
  let paintedRange: string | null = null;
  let paintedState: PlateState | null = null;
  let lastP11 = 0;

  /**
   * Redraw the canvas, but only if what it SAYS changed.
   *
   * The two fields are compared directly rather than through a composed key. This runs once per
   * squadmate per frame — building a string to decide not to use it would allocate on every one of
   * those frames, which is the same class of waste the repaint guard exists to avoid. `name` is not
   * in the comparison because it cannot change: it is the closure argument.
   */
  const repaint = () => {
    if (!ctx || (range === paintedRange && state === paintedState)) return;
    paintedRange = range;
    paintedState = state;
    paint(ctx, name, range, state);
    texture.needsUpdate = true;
  };

  const update = (feet: THREE.Vector3, camera: THREE.PerspectiveCamera, next: PlateState) => {
    sprite.position.set(feet.x, feet.y + HEAD_OFFSET, feet.z);

    const dx = sprite.position.x - camera.position.x;
    const dy = sprite.position.y - camera.position.y;
    const dz = sprite.position.z - camera.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-4) {
      sprite.visible = false;
      return;
    }

    // Camera forward is -Z of its world matrix. Read the elements directly rather than calling
    // getWorldDirection, which allocates or needs a scratch vector per plate per frame.
    const e = camera.matrixWorld.elements;
    const facing = (dx * -e[8]! + dy * -e[9]! + dz * -e[10]!) / dist;
    if (facing < MIN_FACING) {
      sprite.visible = false;
      return;
    }
    sprite.visible = true;

    // Screen-constant sizing. With sizeAttenuation off three multiplies the sprite's scale by its
    // view depth, so after projection the on-screen height is scale.y * P11 in NDC — depth cancels.
    // NDC spans 2 across the viewport, hence the doubling. P00 already carries the aspect ratio, so
    // the width needs nothing but the canvas aspect: the viewport's own aspect cancels out.
    const p11 = camera.projectionMatrix.elements[5]!;
    if (p11 !== lastP11 && p11 > 1e-6) {
      lastP11 = p11;
      const h = (2 * PLATE_VIEWPORT_H) / p11;
      sprite.scale.set(h * ASPECT, h, 1);
    }

    range = distanceLabel(dist);
    state = next;
    repaint();
  };

  return {
    object: sprite,
    update,
    hide: () => {
      sprite.visible = false;
    },
    dispose: () => {
      sprite.removeFromParent();
      material.dispose();
      texture.dispose();
    },
  };
}

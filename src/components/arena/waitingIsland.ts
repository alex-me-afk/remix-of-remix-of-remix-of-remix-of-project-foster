import * as THREE from "three";
import { acceleratedRaycast } from "three-mesh-bvh";

import { OPERATIVE_BODY_URL } from "./characters";
import { buildMergedCollider } from "./collision";
import { makeGltfLoader } from "./ktx2";
import { createOperativeRig, type OperativeRig } from "./operativeModel";
import { WAITING_ISLAND_URL } from "./preload";
import { playSfx } from "./sfx";
import { EYE_HEIGHT, createWalkPhysics } from "./walkPhysics";
import { solveViewCamera } from "./viewCamera";

/**
 * THE WAITING ISLAND — the pre-match lounge Battle Royale drops you into before the plane.
 *
 * Free Fire holds you in a room with the other players while the match fills; this is that room,
 * and it is where the match level is fetched, parsed, tiled and lit. Everything in here is
 * cosmetic — no damage, no weapons, no score — so the ONE thing it must never do is fail closed:
 * a missing GLB, a failed body, a dead GPU all have to end with the countdown still running and
 * `onFirstFrame` still fired, because `GameShell` will not leave this screen until it hears back.
 *
 * The room is 3-D and walkable rather than a rendered backdrop because the whole point of a lobby
 * is that you are IN it: you see the character you picked, from behind, standing among the players
 * you are about to fight. It reuses the arena's own walk resolver and third-person boom solve, so
 * moving around in here feels like the game rather than like a menu, and there is no second
 * movement implementation to keep in step with the first.
 */

// three-mesh-bvh's fast raycast, assigned here as well as in `LoneWolfArena`. This room is on
// screen BEFORE the arena's lazy chunk has necessarily finished importing, and it raycasts a
// merged 29k-triangle collider several times a frame — unpatched that is a linear scan per ray.
// The assignment is the same function in both places, so doing it twice is idempotent.
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/*
 * ---- the room, measured off the GLB rather than guessed ----
 *
 * The model is authored Z-up and its root node carries the -90° X matrix that converts it, so
 * every number below is POST-conversion world space: local Z became world Y, local Y became
 * world -Z. The deck is a 53 x 22 m slab sitting at y = 1.05 with a raised stage filling the
 * west end (x < 0, up to y = 3.4 — too tall to step onto, so the collider simply stops you).
 *
 * Every one of these survived Brook's retextured re-export (2026-09-06) unchanged, which was
 * checked rather than assumed: the new GLB's world bounding box matches the old one to two decimal
 * places ([-44.02, -2.93, -16.52] to [35.92, 12.51, 16.52]), and a CPU ray dropped on the spawn, on
 * all eight crowd spots and across a grid on the deck lands within 3 mm of the old heights. What DID
 * change is the materials — see `BOARD_NODE`.
 */
const FLOOR_Y = 1.05;
/** Walkable rectangle: the open deck, stopping short of the stage and the glass. */
const DECK = { minX: -1, maxX: 29, minZ: -9, maxZ: 9 };
const SPAWN = new THREE.Vector3(17, FLOOR_Y, 5);
/** Centre of the wall-screen quad on the north wall — what everyone in the room is looking at. */
const BOARD = { x: 1.1, z: -13.5 };
const WALK_SPEED = 3.4;
const LOOK_SENS = 0.0028;
const PITCH_LIMIT = 1.1;
/**
 * How the wall screen is found: the NODE whose name contains this, matched case-insensitively.
 *
 * It used to be the material name (`Screen`), and the retextured export killed that handle. Palette
 * compression merges every flat surface into two shared `PaletteMaterial` atlases, so the screen now
 * wears the same material as the 7,000-vertex mesh that is the rest of the building — a material
 * match would repaint half the room with the countdown canvas. The screen is still its own node and
 * its own four-vertex mesh, so the node name is the handle now.
 *
 * Substring, and lower-cased, because a glTF name does not arrive the way it was authored: three's
 * GLTFLoader runs node names through `PropertyBinding.sanitizeNodeName`, which strips `.`, so the
 * authored `screen.001` reaches us as `screen001`.
 */
const BOARD_NODE = "screen";

/**
 * Where the other players stand, and how far each one is turned off dead-ahead.
 *
 * Hand-placed on the open deck: nobody blocks the spawn, nobody stands in front of the screen,
 * and the small yaw offsets stop eight identical bodies from reading as a rank of soldiers.
 */
const CROWD_SPOTS = [
  { x: 5, z: -6, turn: 0.5 },
  { x: 8, z: 3.5, turn: -0.35 },
  { x: 11.5, z: -3, turn: 0.2 },
  { x: 14, z: 7.5, turn: -0.6 },
  { x: 19.5, z: -7.5, turn: 0.15 },
  { x: 22, z: 1.5, turn: -0.25 },
  { x: 25.5, z: -2, turn: 0.4 },
  { x: 27, z: 6.5, turn: -0.15 },
];

/** Yaw that points a body at the wall screen from (x, z), per the `(-sin, 0, -cos)` convention. */
const faceBoard = (x: number, z: number) => Math.atan2(x - BOARD.x, z - BOARD.z);

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * How many of the spots above actually get a body, by how much memory the device admits to.
 *
 * Every crowd body is a `SkeletonUtils` clone, so they share one geometry and one texture set and
 * cost almost nothing to *hold* — what they cost is a skeleton and an AnimationMixer ticking every
 * frame, on the same thread that is parsing the match level. Eight of those turned out to be more
 * than a 8 GB machine could carry alongside the arena, and the room reads as full at four.
 *
 * `deviceMemory` is Chrome-only and deliberately coarse (it reports 8 for anything >= 8 GB), which
 * is all this needs. Absent — Firefox, Safari — assume the middle rather than the best case.
 */
function crowdBudget() {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return mem <= 2 ? 0 : mem <= 4 ? 2 : 4;
}

/**
 * Frames of sustained stall that mean this device cannot carry the room, at which point it is
 * dropped. 20 frames of >250 ms is five seconds of unusable, which a GLB parse cannot produce (it
 * blocks for one or two long frames, not twenty) but a thrashing, near-out-of-memory tab can.
 */
const STALL_MS = 250;
const STALL_FRAMES = 20;

export type WaitingIslandOpts = {
  /** The element the canvas is appended to. Sized by its own box via ResizeObserver. */
  host: HTMLElement;
  /** The player's own operative body. The crowd always wears the shared one. */
  bodyUrl?: string | undefined;
  /** false → no crowd bodies at all. For a phone, or Quality: Low. */
  crowd?: boolean | undefined;
  /** Cap on the device pixel ratio. Lower is cheaper, and the island is parsing behind this. */
  pixelRatio?: number | undefined;
  /**
   * Fired once the room has actually been drawn, or once loading has definitively failed. The
   * screen above this holds its countdown until it hears this, so it must fire on both paths.
   */
  onFirstFrame?: (() => void) | undefined;
  /**
   * Fired when the room is fully built — GLB, collider, player body and crowd all in — or when it
   * has given up on any of them. This is the shell's cue to start building the MATCH: the two
   * loads used to run at the same time, which on an 8 GB machine took the tab down with it.
   */
  onLoaded?: (() => void) | undefined;
  /**
   * Fired when the room decides this device cannot carry it: a lost WebGL context, or seconds of
   * sustained stall. The caller is expected to drop the 3-D room and keep its own countdown — the
   * lobby is a nicety, the release into the match is not.
   */
  onBail?: (() => void) | undefined;
};

export type WaitingIsland = {
  /** Wall-screen text: the big line, and the line under it. */
  setBoard: (big: string, sub: string) => void;
  /** 0..1 — how full the room should read. Mapped onto however many bodies exist. */
  setCrowd: (fill: number) => void;
  /** Virtual stick, each axis -1..1. `y` positive is forward. */
  setStick: (x: number, y: number) => void;
  /**
   * True while the match level is still building behind this room. Halves the frame rate and drops
   * to a 1:1 pixel ratio for the duration — the room is competing with the load it exists to hide,
   * and a lobby at 30 fps that gets the player into the match sooner is the better lobby.
   */
  setBusy: (busy: boolean) => void;
  dispose: () => void;
};

/** Dispose a material and every texture hanging off it. Textures are the expensive half. */
function disposeMaterial(mat: THREE.Material, into?: Set<THREE.Texture>) {
  for (const value of Object.values(mat)) {
    if (value && (value as THREE.Texture).isTexture) {
      const tex = value as THREE.Texture;
      if (into) into.add(tex);
      else tex.dispose();
    }
  }
  mat.dispose();
}

/** Free every GPU resource under `root`. The room GLB is loaded per mount, so this is not optional. */
function disposeTree(root: THREE.Object3D) {
  // Collected rather than disposed inline: glTF materials share texture objects, and a set means a
  // 4 MB atlas used by six meshes is released once instead of six times.
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (mat) disposeMaterial(mat, textures);
    }
  });
  for (const t of textures) t.dispose();
}

export function createWaitingIsland(opts: WaitingIslandOpts): WaitingIsland {
  const { host } = opts;
  let disposed = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b13);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

  // No antialias and a capped pixel ratio on purpose: the island GLB is being parsed on this same
  // main thread while this renders, and every millisecond spent here is a millisecond the player
  // waits afterwards. A slightly soft lobby that arrives sooner is the better trade.
  //
  // `powerPreference` is deliberately left at the browser's default. Asking for high-performance
  // here means two contexts on the page both demanding the discrete GPU, and on hybrid-graphics
  // laptops that switch is what loses one of them.
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  /** Cap from the quality setting. Halved while the match level builds — see `setBusy`. */
  const ratioCap = Math.min(window.devicePixelRatio, opts.pixelRatio ?? 1.5);
  let busy = false;
  renderer.setPixelRatio(ratioCap);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const el = renderer.domElement;
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.touchAction = "none";
  el.style.cursor = "grab";

  // Interior lighting, no shadow maps — the room is lit by a glass roof and its own emissive trim,
  // and a shadow pass here would compete with the island's lighting bake for the same frame.
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x141c28, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-18, 26, 14);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7fb0ff, 0.65);
  fill.position.set(22, 10, -18);
  scene.add(fill);

  // ---- player state ----
  const walkPos = SPAWN.clone();
  const lastGroundPos = walkPos.clone();
  let yaw = faceBoard(SPAWN.x, SPAWN.z);
  let pitch = -0.05;
  let velY = 0;
  let grounded = true;
  /** Empty until the room loads. Everything that moves is gated on this being non-empty. */
  let colliders: THREE.Mesh[] = [];
  let ready = false;

  const ray = new THREE.Raycaster();
  // three-mesh-bvh honours this and stops at the closest hit, which is all `castFirst` ever wants.
  (ray as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
  const { groundAt, moveHorizontal, stepVertical } = createWalkPhysics({
    castFirst: (origin, dir, far, objects) => {
      ray.set(origin, dir);
      ray.near = 0;
      ray.far = far;
      const hits = ray.intersectObjects(objects ?? colliders, false);
      return hits.length > 0 ? hits[0]! : null;
    },
    getBounds: () => DECK,
    playSfx,
  });

  // ---- the wall screen ----
  // Drawn to a canvas and hung on the room's own `Screen` quad so the countdown is IN the world,
  // not only in the HUD. Both exist deliberately: the HUD is the one the player can always read,
  // this is the one that makes the room feel like it is running the match.
  const board = document.createElement("canvas");
  board.width = 1024;
  board.height = 448; // the quad is 10 x 4.4 m — same aspect, so nothing stretches
  const bctx = board.getContext("2d");
  const boardTex = new THREE.CanvasTexture(board);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  // glTF UVs are authored for `flipY = false`, which is what GLTFLoader sets on every texture it
  // loads. A CanvasTexture defaults to true, which would hang the sign upside down.
  boardTex.flipY = false;
  let boardBig = "--:--";
  let boardSub = "WAITING FOR PLAYERS";

  const drawBoard = () => {
    if (!bctx) return;
    const w = board.width;
    const h = board.height;
    bctx.fillStyle = "#070c14";
    bctx.fillRect(0, 0, w, h);
    bctx.fillStyle = "#0d1523";
    bctx.fillRect(18, 18, w - 36, h - 36);
    bctx.strokeStyle = "#ffcf5a";
    bctx.lineWidth = 5;
    bctx.strokeRect(18, 18, w - 36, h - 36);
    bctx.textAlign = "center";
    bctx.fillStyle = "#8fa4c4";
    bctx.font = "600 40px system-ui, sans-serif";
    bctx.fillText("MATCH STARTS IN", w / 2, 118);
    bctx.fillStyle = "#ffcf5a";
    bctx.font = "800 190px system-ui, sans-serif";
    bctx.fillText(boardBig, w / 2, 288);
    bctx.fillStyle = "#dbe6f7";
    bctx.font = "600 46px system-ui, sans-serif";
    bctx.fillText(boardSub, w / 2, 386);
    boardTex.needsUpdate = true;
  };
  drawBoard();

  // ---- input ----
  // Keyboard for desktop, one drag for the look, and a virtual stick the React HUD writes into for
  // touch. Nothing shoots in here, so there is no aim, fire or weapon state to track.
  const keys = new Set<string>();
  const stick = { x: 0, y: 0 };

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    // The room owns Space; without this the browser scrolls the page behind the canvas.
    if (e.code === "Space") e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  // Alt-tabbing away with a key held used to leave the player walking into a wall until they came
  // back and pressed it again — the keyup lands on the other window.
  const onBlur = () => keys.clear();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  // Drag to look. Pointer events cover mouse and touch in one path, and the capture means a drag
  // that wanders off the canvas still ends cleanly instead of sticking.
  let dragId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  const onPointerDown = (e: PointerEvent) => {
    if (dragId !== null) return;
    dragId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== dragId) return;
    yaw -= (e.clientX - lastX) * LOOK_SENS;
    pitch = clamp(pitch - (e.clientY - lastY) * LOOK_SENS, -PITCH_LIMIT, PITCH_LIMIT);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== dragId) return;
    dragId = null;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    el.style.cursor = "grab";
  };
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);

  // ---- the room GLB ----
  const loader = makeGltfLoader(renderer);
  /** Kept for `dispose`: this GLB is loaded per mount, so nothing else will ever free it. */
  let room: THREE.Object3D | null = null;
  let collider: THREE.Mesh | null = null;
  /** Our replacement for the model's own `Screen` material. Created once, disposed once. */
  let boardMat: THREE.MeshBasicMaterial | null = null;
  /** Materials the board swap took out of the tree — nothing else will ever free them. */
  const orphaned = new Set<THREE.Material>();

  /**
   * Re-unwrap the wall screen so the countdown covers it.
   *
   * The screen was authored as a flat colour, and its UVs cannot be trusted for a canvas. In the
   * palette-compressed export all four of its vertices carry the SAME coordinate — measured,
   * (0.2813, 0.2813) on every one of them, which is one texel of the shared palette atlas. The
   * uncompressed export before it packed them into a 15% x 34% window in the atlas's top-right
   * corner instead: u 0.846–0.996, v 0.003–0.343. Either way, hanging a canvas on the quad unchanged
   * samples one flat patch of it and nothing else, so the board reads as switched off — the text is
   * never inside the part of the texture the quad can see.
   *
   * So the UVs are rebuilt from the vertex positions instead of trusted. The quad is flat on the
   * model's local Y (the wall plane), giving local X across and local Z up, and the root's -90° X
   * matrix maps local X to world X and local Z to world Y — so `u` grows left-to-right for a player
   * facing the wall, and `v` is inverted because `flipY = false` puts the canvas's first row at
   * v = 0. Position-derived rather than UV-derived on purpose: it cannot be thrown off by however
   * the atlas window happened to be rotated, or by a palette merge collapsing it to a point.
   */
  const unwrapBoard = (mesh: THREE.Mesh) => {
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const w = maxX - minX;
    const h = maxZ - minZ;
    // A degenerate quad would divide by zero and put every vertex on one texel — leave it alone.
    if (!(w > 1e-4) || !(h > 1e-4)) return;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) - minX) / w;
      uv[i * 2 + 1] = 1 - (pos.getZ(i) - minZ) / h;
    }
    mesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  };

  const dressRoom = (root: THREE.Object3D) => {
    /**
     * How many meshes each material sits on, counted before anything is swapped.
     *
     * The board swap must not orphan a material the rest of the room is still wearing: after the
     * palette merge the screen shares `PaletteMaterial001` with the mesh that is the entire
     * building, and `orphaned` exists to free materials `disposeTree` can no longer reach.
     */
    const uses = new Map<THREE.Material, number>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (mat) uses.set(mat, (uses.get(mat) ?? 0) + 1);
      }
    });
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const isBoard = mesh.name.toLowerCase().includes(BOARD_NODE);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i];
        if (!mat) continue;
        if (isBoard) {
          // The quad is a lightbox, not a lit surface: basic + `toneMapped: false` keeps the
          // countdown the brightest thing in the room, which is where the eye should go.
          // `DoubleSide` because the model's own screen material is double-sided, and a quad whose
          // winding faces the wall would otherwise hang a blank sheet in front of the countdown.
          boardMat ??= new THREE.MeshBasicMaterial({
            map: boardTex,
            toneMapped: false,
            side: THREE.DoubleSide,
          });
          if ((uses.get(mat) ?? 0) <= 1) orphaned.add(mat);
          if (Array.isArray(mesh.material)) mesh.material[i] = boardMat;
          else mesh.material = boardMat;
          unwrapBoard(mesh);
          continue;
        }
        // Sketchfab exports mark plain opaque materials `alphaMode: BLEND`. Blending drops them out
        // of the depth buffer and sorts them against each other by distance, which indoors means
        // walls vanishing through walls as you turn. Cutout is correct for both the opaque and the
        // genuinely-cut materials here; only `Glass` keeps blending, because glass means it. The
        // palette export has no `Glass` left — its one BLEND material is a wall — but the exception
        // stays, because the name is free and a future re-export may bring the roof back.
        if (mat.transparent && mat.name !== "Glass") {
          mat.transparent = false;
          mat.alphaTest = 0.5;
          mat.depthWrite = true;
          mat.needsUpdate = true;
        }
      }
    });
  };

  const loadRoom = async () => {
    const gltf = await loader.loadAsync(WAITING_ISLAND_URL);
    if (disposed) {
      disposeTree(gltf.scene);
      return;
    }
    room = gltf.scene;
    dressRoom(room);
    scene.add(room);
    // One merged BVH proxy for the whole room. 15k triangles is small enough that tiling it would
    // cost more bookkeeping than it saves, and the player never leaves one 53 x 22 m deck.
    // Null only if the GLB held no geometry at all, in which case the room stands but nobody walks.
    const merged = buildMergedCollider(room);
    if (merged) {
      collider = merged;
      scene.add(merged);
      colliders = [merged];
    }
    // Land on the real floor instead of trusting the measured constant: if the model is ever
    // re-exported a few centimetres off, this follows it rather than dropping the camera through.
    const g = groundAt(SPAWN.x, SPAWN.z, SPAWN.y + 4, 6);
    if (g !== null) walkPos.y = g;
    lastGroundPos.copy(walkPos);
  };

  // ---- bodies ----
  // The operative the player picked, seen from behind, and the players they are about to fight.
  // Every rig is `armed: false` — that is the unarmed lobby pose; the rifle-carry clips would read
  // as eight people cupping empty air.
  const ZERO = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let selfRig: OperativeRig | null = null;
  const crowdRigs: OperativeRig[] = [];
  /** How many crowd bodies should be visible. Driven by the join counter through `setCrowd`. */
  let crowdShown = 0;

  const placeCrowd = (rig: OperativeRig, spot: (typeof CROWD_SPOTS)[number]) => {
    const g = groundAt(spot.x, spot.z, FLOOR_Y + 4, 6);
    const turn = faceBoard(spot.x, spot.z) + spot.turn;
    rig.root.position.set(spot.x, g ?? FLOOR_Y, spot.z);
    rig.root.rotation.y = turn;
    rig.setMotion({ velocity: ZERO, yaw: turn, armed: false });
    rig.root.visible = false; // revealed by `setCrowd` as the join counter fills
  };

  /**
   * Hand the browser a real frame.
   *
   * `await` on an already-cached GLB only drains microtasks, and microtasks are drained before the
   * browser will paint or dispatch a pointer event — so a run of `createOperativeRig` calls is one
   * continuous main-thread burst. That is what made the waiting room swallow taps while the crowd
   * streamed in: the room was drawn, the countdown was ticking, and the Deploy button simply did
   * not hear the press. A macrotask between rigs costs a frame each and keeps the room live.
   */
  const yieldFrame = () =>
    new Promise<void>((res) => requestAnimationFrame(() => window.setTimeout(res, 0)));

  const loadBodies = async () => {
    const url = opts.bodyUrl ?? OPERATIVE_BODY_URL;
    selfRig = await createOperativeRig({ url, renderer, castShadow: false });
    if (disposed) {
      selfRig.dispose();
      selfRig = null;
      return;
    }
    scene.add(selfRig.root);
    if (opts.crowd === false) return;
    // One at a time rather than `Promise.all`: these arrive while the 15 MB island is being parsed
    // on this same main thread, and eight simultaneous skinned-mesh clones is precisely the spike
    // that turns the parse into a visible stall. How many at all is a memory question — see
    // `crowdBudget`; the eight spots are a menu, not a quota.
    for (const spot of CROWD_SPOTS.slice(0, crowdBudget())) {
      // one macrotask of breathing room per body — see `yieldFrame`
      await yieldFrame();
      if (disposed) return;
      const rig = await createOperativeRig({
        url: OPERATIVE_BODY_URL,
        renderer,
        castShadow: false,
      });
      if (disposed) {
        rig.dispose();
        return;
      }
      placeCrowd(rig, spot);
      scene.add(rig.root);
      crowdRigs.push(rig);
      if (crowdRigs.length <= crowdShown) rig.root.visible = true;
    }
  };

  // ---- giving up ----
  /**
   * Drop the 3-D room and tell the caller to carry on without it.
   *
   * Called on a lost WebGL context or a sustained stall. It frees everything the room holds
   * IMMEDIATELY rather than waiting for the caller to unmount, because the whole reason to bail is
   * that the memory is needed elsewhere — and it fires `onFirstFrame` first, since a caller still
   * waiting on that is a caller stuck on a splash screen forever.
   */
  let bailed = false;
  const bail = () => {
    if (bailed || disposed) return;
    bailed = true;
    ready = true;
    if (!announced) {
      announced = true;
      opts.onFirstFrame?.();
    }
    opts.onLoaded?.();
    const notify = opts.onBail;
    dispose();
    notify?.();
  };

  const onContextLost = (e: Event) => {
    // Without preventDefault the context is gone for good; either way this room is finished, and
    // the point of catching it is that the countdown above is not.
    e.preventDefault();
    bail();
  };
  el.addEventListener("webglcontextlost", onContextLost);

  // ---- boot ----
  // Room first, bodies second, because the crowd is dropped onto the floor the room provides. Both
  // paths end with `ready = true`, and a watchdog covers the third case — a fetch that neither
  // resolves nor rejects — because the countdown above this has to start whatever this room manages
  // to draw. Losing the lobby is a cosmetic failure; losing the countdown strands the player.
  //
  // `onLoaded` fires at the very end, after the last body: the caller uses it to start building the
  // MATCH, and the entire point is that the two builds no longer overlap.
  const watchdog = window.setTimeout(() => {
    ready = true;
  }, 8000);
  void loadRoom()
    .catch(() => {})
    .finally(() => {
      ready = true;
      window.clearTimeout(watchdog);
      void loadBodies()
        .catch(() => {})
        .finally(() => {
          if (!disposed) opts.onLoaded?.();
        });
    });

  // ---- frame loop ----
  let raf = 0;
  let last = performance.now();
  let announced = false;
  /** Flips every frame while `busy`, so the room draws every other one. */
  let halfRate = false;
  /** Consecutive frames longer than `STALL_MS`. See `bail`. */
  let stalls = 0;
  const lookAxis = new THREE.Vector3();
  const move = new THREE.Vector3();

  const frame = () => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    // Half rate while the match level builds. The skip happens before `last` is touched, so the
    // next frame's dt covers both and the walk speed is unchanged — only the draw is halved.
    if (busy) {
      halfRate = !halfRate;
      if (halfRate) return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    // Sustained multi-hundred-millisecond frames mean the tab is thrashing, and the next thing that
    // happens on a machine in that state is the browser killing it. Drop the room instead.
    stalls = now - last > STALL_MS ? stalls + 1 : 0;
    last = now;
    if (stalls >= STALL_FRAMES) {
      bail();
      return;
    }

    // Stick and keyboard sum, then clamp: a player on a laptop with a touchscreen can use both, and
    // holding W with the stick already forward should not walk at double speed.
    let ix = stick.x;
    let iy = stick.y;
    if (keys.has("KeyW") || keys.has("ArrowUp")) iy += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) iy -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    // `(-sin, 0, -cos)` forward, `(cos, 0, -sin)` right — the arena's convention, kept identical so
    // the stick means the same thing in the lobby as it does in the match.
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const dirX = fx * iy + Math.cos(yaw) * ix;
    const dirZ = fz * iy - Math.sin(yaw) * ix;
    vel.set(dirX * WALK_SPEED, 0, dirZ * WALK_SPEED);

    if (colliders.length > 0) {
      move.set(vel.x * dt, 0, vel.z * dt);
      moveHorizontal(walkPos, move, colliders, grounded);
      const v = stepVertical({
        walkPos,
        lastGroundPos,
        velY,
        grounded,
        dt,
        jump: keys.has("Space"),
      });
      velY = v.velY;
      grounded = v.grounded;
    }

    // Eye first, then the shared boom solve — the same one the match uses, so the shot the player
    // sees here is the shot they will be looking through in ten seconds.
    camera.position.set(walkPos.x, walkPos.y + EYE_HEIGHT, walkPos.z);
    const cp = Math.cos(pitch);
    lookAxis.set(fx * cp, Math.sin(pitch), fz * cp);
    solveViewCamera({ camera, lookAxis, yaw, thirdPerson: true, colliders, groundAt });

    if (selfRig) {
      selfRig.root.position.copy(walkPos);
      selfRig.root.rotation.y = yaw;
      selfRig.setMotion({ velocity: vel, yaw, airborne: !grounded, armed: false });
      selfRig.update(dt);
    }
    // The crowd only ever idles, and it is metres away: the distance argument lets the rig throttle
    // its own sampling instead of animating eight skeletons at full rate behind a 15 MB parse.
    for (const rig of crowdRigs) {
      if (rig.root.visible) rig.update(dt, 6);
    }

    renderer.render(scene, camera);

    // Announce after the first frame that has the room in it — or after the load has definitively
    // given up. `GameShell` will not leave the deploy screen until it hears this.
    if (ready && !announced) {
      announced = true;
      opts.onFirstFrame?.();
    }
  };

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  raf = requestAnimationFrame(frame);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.clearTimeout(watchdog);
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    el.removeEventListener("webglcontextlost", onContextLost);
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    selfRig?.dispose();
    selfRig = null;
    for (const rig of crowdRigs) rig.dispose();
    crowdRigs.length = 0;
    if (room) {
      scene.remove(room);
      // A per-mount load, so this is the only chance anything gets to free it: two meshes and nine
      // embedded WebP textures, about 5 MB of GPU once they are decoded to RGBA and mipped.
      disposeTree(room);
      room = null;
    }
    if (collider) {
      scene.remove(collider);
      collider.geometry.dispose();
      (collider.material as THREE.Material).dispose();
      collider = null;
    }
    // Whatever the board swap took out of the tree, where `disposeTree` can no longer see it — the
    // model's own screen material, and only when nothing else in the room was wearing it.
    for (const mat of orphaned) disposeMaterial(mat);
    orphaned.clear();
    boardMat?.dispose();
    boardMat = null;
    boardTex.dispose();
    renderer.dispose();
    el.remove();
  };

  return {
    setBoard: (big, sub) => {
      // Guarded because this is called every frame by the HUD's countdown: redrawing 1024 x 448 and
      // re-uploading it at 60 Hz for a string that has not changed is not free.
      if (big === boardBig && sub === boardSub) return;
      boardBig = big;
      boardSub = sub;
      drawBoard();
    },
    setCrowd: (fill) => {
      // Scaled by the spots, not by the rigs: the counter means "the room is 60% full", and how many
      // bodies that turns into depends on how many this device was given.
      crowdShown = clamp(Math.round(fill * CROWD_SPOTS.length), 0, CROWD_SPOTS.length);
      for (let i = 0; i < crowdRigs.length; i++) crowdRigs[i]!.root.visible = i < crowdShown;
    },
    setStick: (x, y) => {
      stick.x = clamp(x, -1, 1);
      stick.y = clamp(y, -1, 1);
    },
    setBusy: (b) => {
      if (b === busy || disposed) return;
      busy = b;
      // A 1:1 pixel ratio while the level builds is a 2.25x fill-rate cut at a 1.5 cap, on the one
      // GPU that is also uploading the match. Restored the moment the match is ready.
      renderer.setPixelRatio(b ? 1 : ratioCap);
      resize();
    },
    dispose,
  };
}

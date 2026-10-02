/**
 * A fighter's body: the capsule proxy underneath, the animated character on top, and the props that
 * hang off it.
 *
 * Brook asked for "Weapon socket/attachment logic (attachRig, back holster, leg pocket, draw/holster
 * animation triggers) — a self-contained subsystem", and this is it, together with the primitives it
 * swaps in and out. Those two halves cannot live apart: `buildBot` builds the capsules already
 * hidden, `attachRig` is the one thing that puts them back when a model definitively fails, and the
 * weapon socket drives the placeholder gun box through its own callback. Split across two files, the
 * rule "a capsule on screen means a load error" would be enforced in two places at once.
 *
 * Lifted verbatim out of `LoneWolfArena.tsx` — no behaviour changed, only the walls around it. The
 * one shape change is that `attachRig` needs three things the giant effect used to hand it through
 * scope (the tracer parent, the renderer, and whether the effect has been torn down), so it comes
 * out of a factory that closes over them instead.
 */

import * as THREE from "three";

import { makeBlobShadowTexture } from "./bakeLighting";
import { TEAM_COLORS, type Team } from "./fighter";
import { attachHolsters, type Holsters, type HolsterSet } from "./holster";
import { createOperativeRig, type OperativeRig } from "./operativeModel";
import { createWeaponSocket, type WeaponSocket } from "./weaponModel";
import { attachWornPack } from "./wornPack";

/** shared fake-contact-shadow sprite (baked lighting leaves no shadow receiver) */
let blobShadowTex: THREE.Texture | null = null;
function blobShadow() {
  if (!blobShadowTex) blobShadowTex = makeBlobShadowTexture();
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshBasicMaterial({
      map: blobShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = -1;
  return m;
}

/**
 * Every fighter's visual+hitbox scale.
 *
 * The GLB's authored height read short next to the map's doors, crates and cover once the camera
 * came out of the eye and you could actually see him standing in the world. This is the one dial
 * for it, and it is on the fighter GROUP so the character, the capsule hitboxes, the team ring and
 * the contact shadow all grow together — a visual scale on its own would put his skull 20 cm above
 * the sphere you have to hit to land a headshot.
 *
 * What it deliberately does NOT touch is the collision capsule or `EYE_HEIGHT`: movement, step-up,
 * doorway clearance and where the bullet leaves from are all tuned around a 1.7 m walker, and
 * re-tuning those is a physics change, not a look change. The visible cost is that a tall doorway
 * is now head-height rather than comfortably clear.
 */
const FIGHTER_SCALE = 1.2;

/**
 * The primitive fighter: a capsule stack that doubles as the hitbox set.
 *
 * Since the animated character landed, the body primitives are built already hidden (see
 * `setBodyProxyVisible` at the end of this function) and they live on purely as hitboxes. They
 * are NOT dead code — raycasting the
 * skinned GLB instead would mean CPU-skinning 65 bones of vertices per bullet, which 30 fighters
 * in a battle royale cannot pay for, and it would tie the head/body split to the current pose so
 * a crouching bot's headshot box would wander off its skull. The capsules keep hit detection
 * pose-independent and free.
 */
export function buildBot(team: Team, label: string) {
  const g = new THREE.Group();
  const color = TEAM_COLORS[team];
  const meshes: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 });
  const gearMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f36,
    roughness: 0.8,
    metalness: 0.2,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc79a72, roughness: 0.9 });

  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 12), gearMat);
  legs.position.y = 0.52;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 14), bodyMat);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 14), skinMat);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.215, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 }),
  );
  helmet.position.y = 1.63;
  // The old placeholder rifle box is gone: real weapon models now hang in the hand via the weapon
  // socket. A weapon with no model yet simply shows an empty hand rather than a black box.
  for (const m of [legs, torso, head, helmet]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData["hitZone"] = m === head || m === helmet ? "head" : "body";
    g.add(m);
    meshes.push(m);
  }

  // Hidden from the outset, not once the GLB lands. The animated character is the fighter now
  // and these are hitboxes; hiding them on rig-attach instead left a window — one slow parse,
  // one 404, one fighter whose promise resolved a frame late — where a capsule stood next to
  // seven clean characters. `attachRig` puts them back on screen if the model definitively
  // fails, so the only way to see a capsule is a real load error, which it also logs.
  setBodyProxyVisible(meshes, false);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.62, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  g.add(blobShadow());

  g.name = label;
  // Uniform, on the group, so hitboxes and footprint scale with the character. Nothing else ever
  // writes `group.scale` — the skydive director only touches position/rotation/visible — so this
  // survives the whole match. See FIGHTER_SCALE.
  g.scale.setScalar(FIGHTER_SCALE);
  return { group: g, meshes };
}

/**
 * Show or hide a fighter's capsule primitives, which since the animated character landed exist
 * purely as hitboxes.
 *
 * Through `material.visible`, NEVER `object.visible`. The renderer gates the draw on the
 * material; `Raycaster` walks the object graph and `Mesh.raycast` never consults it. Hiding the
 * objects would silently make every fighter unhittable — a bug that presents as "my bullets do
 * nothing" with no error anywhere. The rifle box is exempt: the body GLB carries no weapon, so
 * that one proxy is the only thing standing in for one.
 */
function setBodyProxyVisible(meshes: THREE.Mesh[], visible: boolean) {
  for (const m of meshes) {
    if (m.userData["weaponProxy"]) continue;
    const mat = m.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) for (const x of mat) x.visible = visible;
    else mat.visible = visible;
    m.castShadow = visible;
    m.receiveShadow = visible;
  }
}

/**
 * Show or hide just the placeholder rifle box (the `weaponProxy` mesh `buildBot` bolts on).
 *
 * The counterpart to `setBodyProxyVisible`, which deliberately skips this box. Once a real weapon
 * prop lands in the hand the box has to go, and it has to come back if the prop fails to load or
 * the player switches to a gun with no model — so a weapon socket drives this through its `onProp`
 * callback. Through `material.visible`, same reason as the body proxies: the raycaster ignores it,
 * so this only hides the DRAW, never the hitbox — though this box carries no `hitZone` anyway.
 */
function setProxyGunVisible(meshes: THREE.Mesh[], visible: boolean) {
  for (const m of meshes) {
    if (!m.userData["weaponProxy"]) continue;
    const mat = m.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) for (const x of mat) x.visible = visible;
    else mat.visible = visible;
    m.castShadow = visible;
    m.receiveShadow = visible;
  }
}

/**
 * `makeTracer` and `attachRig`, bound to the scene they build into.
 *
 * `disposed` is a getter, not a boolean: both promises here land a frame or more after they are
 * started and the effect can be torn down in between, which is the whole reason for the re-checks
 * inside. Reading a captured `false` would put a rig into a scene that no longer exists.
 */
export function createRigAttacher(deps: {
  /** Where tracer lines are parented — the arena root, not a fighter's own group. */
  root: THREE.Object3D;
  /** Handed to the loaders so textures are uploaded and shaders compiled off the hot path. */
  renderer: THREE.WebGLRenderer;
  disposed: () => boolean;
}) {
  const { root, renderer, disposed } = deps;

  const makeTracer = () => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0xff9d5c, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    root.add(line);
    return { line, mat, ttl: 0 };
  };

  /**
   * Load the animated character and hang it under a fighter's group.
   *
   * Async and deliberately never awaited: the match starts the instant the map is ready and
   * a fighter is completely playable — shootable, hittable, scoring — on its capsules
   * alone. The GLB drops in a frame or two later. Same shape as the pet companion's attach
   * just below, `disposed` re-check included, because the promise can land after unmount.
   *
   * The rig root goes in as a CHILD of the fighter's group, so it inherits position and yaw
   * for free and every existing `f.group.position.copy(f.pos)` keeps working untouched. No
   * extra yaw correction belongs here either: the rig's internal `meshYaw` already points
   * the mesh down local -Z, the same forward the capsules and the player already use.
   *
   * Nor any scale: the group already carries FIGHTER_SCALE, so the rig inherits it. It is
   * still told the number, because stride rate-matching has to know how much ground a
   * footfall covers at the size it is actually drawn.
   *
   * `castShadow: false` — the arena's lighting is baked and grounding comes from the blob
   * sprite, so putting thirty skinned meshes through a shadow pass would buy nothing.
   */
  const attachRig = (
    group: THREE.Group,
    meshes: THREE.Mesh[],
    url: string,
    weaponId: string,
    carried: HolsterSet,
    assign: (rig: OperativeRig, socket: WeaponSocket | null, holsters: Holsters) => void,
  ) => {
    createOperativeRig({ url, renderer, castShadow: false, worldScale: FIGHTER_SCALE })
      .then((r) => {
        if (disposed()) {
          r.dispose();
          return;
        }
        // Armed rifle stance until the first motion update lands, so a fighter never
        // appears mid-stride on spawn.
        r.setMotion({ velocity: new THREE.Vector3(), yaw: group.rotation.y, armed: true });
        group.add(r.root);
        // Hang the real weapon in the hand. The placeholder box `buildBot` bolted on stays
        // put until the prop actually lands (see the socket's `onProp`), so a slow gun load
        // or a missing GLB just leaves the box rather than an empty hand. A weapon with no
        // model registered keeps the box for good — which is every gun but the M4 today.
        const handBone = r.bone("RightHand");
        const socket = handBone
          ? createWeaponSocket({
              bone: handBone,
              renderer,
              onProp: (hasReal) => setProxyGunVisible(meshes, !hasReal),
            })
          : null;
        socket?.set(weaponId);
        // And the pack on the spine, every fighter, every mode. No disposer is kept: the
        // pack is a child of a bone inside the rig's own graph, so `rig.dispose()` drops it
        // with everything else, and its geometry and textures belong to the shared cache.
        attachWornPack(r, renderer);
        // Then the guns they are carrying but not holding, on the same terms. Seeded here so
        // a fighter is never briefly empty-backed, and re-set later on a swap or a draft.
        const holsters = attachHolsters(r, renderer);
        holsters.set(carried);
        assign(r, socket, holsters);
      })
      .catch((err) => {
        // The capsules are hidden from birth (see `buildBot`), so a failure here would
        // otherwise leave an invisible fighter that still shoots and still kills. Put the
        // primitives back, and say so loudly: an arena of floating rifle boxes is
        // unexplainable from the outside, and the cause is almost always a missing
        // public/models/operative-body.glb or a missing KTX2 transcoder under public/basis/.
        console.error("[arena] fighter model failed to load — falling back to capsules", err);
        if (!disposed()) setBodyProxyVisible(meshes, true);
      });
  };

  return { makeTracer, attachRig };
}

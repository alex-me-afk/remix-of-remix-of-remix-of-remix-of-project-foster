import { useEffect, useRef } from "react";
import * as THREE from "three";

import { createOperativeRig, type OperativeRig } from "./operativeModel";
import { loadOperativeDances } from "./operativeAnims";
import { createWeaponSocket, WEAPON_PROPS, type WeaponSocket } from "./weaponModel";
import type { ArenaCharacter } from "./characters";

/**
 * Resting yaw that puts the character's front toward the camera.
 *
 * NOT zero, and this is the one number here worth explaining. The rig's internal `meshYaw`
 * turns the mesh to face ENGINE forward, which is -Z; the preview camera sits at +Z looking
 * back along -Z. Left at zero the panel shows the character's back. Pets are the opposite —
 * `pets.ts` documents their yaw correction as "so the pet faces +Z" — so PetViewer needs no
 * equivalent, which is exactly why this is stated here rather than assumed to be shared.
 */
const FACE_CAMERA = Math.PI;

/**
 * Vertical extent of the rig, from bone world positions.
 *
 * `Box3.setFromObject` is not an option: on a skinned mesh it reads the bind-pose
 * attribute data through the wrong matrices and returns garbage. Bones are exact once a
 * pose is applied — and unlike the pet, this rig's proportions are known, so only the Y
 * extent matters for framing. The head bone sits inside the skull, so the top gets padded.
 */
function measureHeight(root: THREE.Object3D): { min: number; max: number } {
  root.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  const seen = new Set<THREE.Skeleton>();
  root.traverse((child) => {
    const skinned = child as THREE.SkinnedMesh;
    if (!(child as { isSkinnedMesh?: boolean }).isSkinnedMesh || !skinned.skeleton) return;
    if (seen.has(skinned.skeleton)) return;
    seen.add(skinned.skeleton);
    for (const bone of skinned.skeleton.bones) {
      v.setFromMatrixPosition(bone.matrixWorld);
      min = Math.min(min, v.y);
      max = Math.max(max, v.y);
    }
  });
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1.75 };
  // Skull above the topmost joint, plus boot sole below the toe joint.
  return { min: min - 0.02, max: max + 0.12 };
}

type Props = {
  character: ArenaCharacter;
  /**
   * Weapon id to place in the character's hands. When set to a weapon that has a real model (see
   * WEAPON_PROPS), the preview switches to the armed rifle idle and hangs the gun off RightHand;
   * anything else — undefined, or a weapon with no model — stays on the unarmed breathing idle.
   */
  weaponId?: string;
  /** allow drag-to-spin (yaw only) */
  interactive?: boolean;
  /** camera distance multiplier — smaller = closer */
  zoom?: number;
  /**
   * A dance to play, by id from `DANCES`. Set it and the character loops that emote until
   * it changes; clear it (undefined) and the character returns to its idle. The dance
   * bundle lazy-loads on first use, so the first pick has a one-time hitch. Driven from a
   * ref-held rig in a separate effect so switching dances never rebuilds the scene.
   */
  danceId?: string | undefined;
  /**
   * Fired on a tap that wasn't a drag — the lobby uses it to open the emote wheel. Kept
   * separate from drag-to-turn by a small movement threshold, so spinning the character
   * never counts as a click.
   */
  onClick?: () => void;
  /**
   * Fired once the character has actually been drawn, or once loading has definitively
   * failed. The boot screen holds its Enter button on this, so it has to fire on both paths
   * or a missing asset would leave the front door permanently shut.
   */
  onReady?: () => void;
  className?: string;
};

/**
 * Live operative preview: the real character GLB on its unarmed idle, facing the player.
 * Used by the lobby stage and the character picker.
 *
 * UNARMED BY DEFAULT. The armed locomotion idle is `rifle_aiming_idle`, and with no weapon
 * rendered the hands visibly cup empty air, so an operative with no `weaponId` gets
 * `armed: false` and the `breathing_idle` set instead. Pass a `weaponId` that has a real
 * model (WEAPON_PROPS) and it flips: the rifle idle plays and that gun is hung off RightHand
 * with the SAME socket the in-match fighters use, so the shop preview is the operative
 * actually holding their weapon — the one surface where orientation is screenshot-verifiable.
 *
 * NO TURNTABLE. The character holds its facing so the player is always looking at the front
 * of what they picked; only a deliberate drag turns it, and pitch is locked so the pose stays
 * readable. An animation is free to turn the body however it likes — that is bone motion
 * inside the clip, and it returns to facing the player when the clip hands back to idle.
 */
export default function OperativeViewer({
  character,
  weaponId,
  interactive = true,
  zoom = 1,
  danceId,
  onClick,
  onReady,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const yawRef = useRef(FACE_CAMERA);
  const draggingRef = useRef(false);
  // The live rig, exposed to the dance effect below so switching emotes never tears the
  // scene down. Null until the character has loaded.
  const rigRef = useRef<OperativeRig | null>(null);
  // Held in a ref rather than the effect deps on purpose: callers pass an inline arrow, and a
  // new identity every parent render would tear the rig down and re-download the character.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // Same reasoning as onReady: the load callback fires asynchronously and must apply the
  // dance that is current *then*, not the one captured when the effect first ran.
  const danceIdRef = useRef(danceId);
  danceIdRef.current = danceId;
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const scene = new THREE.Scene();
    const FOV = 32;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    camera.position.set(0, 1.0, 4.2 * zoom);
    camera.lookAt(0, 1.0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearAlpha(0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = interactive ? "grab" : "default";

    scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x0a0f18, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 1.4);
    rim.position.set(-4, 2.5, -3);
    scene.add(rim);

    // The turntable pivot. The rig has its own internal yaw correction, so turning a parent
    // group keeps that intact instead of fighting it.
    const pivot = new THREE.Group();
    pivot.rotation.y = yawRef.current;
    scene.add(pivot);

    /**
     * Frame the character vertically. Aspect is irrelevant here — three.js's FOV is the
     * vertical one, so fitting the height fits it at any panel shape, and a standing human
     * is never the horizontal constraint.
     */
    let framed = false;
    const frameCamera = (height: number) => {
      const h = Math.max(0.5, height);
      const half = (FOV * Math.PI) / 360;
      const dist = (h / 2 / Math.tan(half)) * 1.06 * zoom;
      const mid = h / 2;
      camera.position.set(0, mid, dist);
      camera.lookAt(0, mid, 0);
      camera.near = Math.max(0.05, dist - h * 2);
      camera.far = dist + h * 4;
      camera.updateProjectionMatrix();
      framed = true;
    };

    let rig: OperativeRig | null = null;
    let socket: WeaponSocket | null = null;
    // A real gun in the hand also flips the pose from breathing_idle to the rifle stance.
    const prop = weaponId ? WEAPON_PROPS[weaponId] : undefined;
    createOperativeRig({ url: character.model, renderer, castShadow: false })
      .then((r) => {
        if (disposed) {
          r.dispose();
          return;
        }
        rig = r;
        rigRef.current = r;
        // Armed only when a weapon prop will actually be shown; otherwise breathing_idle so
        // the empty hands don't cup air.
        r.setMotion({ velocity: new THREE.Vector3(), yaw: 0, armed: !!prop });
        pivot.add(r.root);
        pivot.updateWorldMatrix(true, true);
        const { min, max } = measureHeight(r.root);
        // Soles land on y=0 even if the export's origin drifts off them.
        r.root.position.y = -min;
        frameCamera(max - min);
        // Hang the gun off the same RightHand socket the in-match fighters use. The prop is a
        // child of a bone (not a skinned mesh), so it never enters the measureHeight above.
        if (prop) {
          const hand = r.bone("RightHand");
          if (hand) {
            const s = createWeaponSocket({ bone: hand, renderer, onProp: () => {} });
            s.set(weaponId!);
            socket = s;
          }
        }
        // A dance selected before the character finished loading (or on a remount) plays as
        // soon as the rig exists. Later changes go through the danceId effect below.
        const wanted = danceIdRef.current;
        if (wanted) {
          loadOperativeDances()
            .then((clips) => {
              if (disposed) return;
              r.addClips(clips.values());
              if (danceIdRef.current) r.playDance(danceIdRef.current);
            })
            .catch((e) => console.error("[OperativeViewer] dances failed to load", e));
        }
      })
      .catch((err) => {
        // Loud, because the failure mode is an empty panel that looks like a styling bug. A
        // 404 here means public/models/operative-body.glb is missing; a decode error means
        // the KTX2 transcoder under public/basis/ is.
        console.error("[OperativeViewer] character failed to load", err);
        // Report in anyway — the boot screen is waiting on this and a broken model must not
        // be able to lock the player out of the game.
        onReadyRef.current?.();
      });

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const el = renderer.domElement;
    let lastX = 0;
    // Where the press started and whether it has travelled far enough to be a drag rather
    // than a click. A click that never crosses this threshold fires onClick on release.
    let downX = 0;
    let downY = 0;
    let moved = false;
    const CLICK_SLOP = 6;
    const down = (e: PointerEvent) => {
      if (!interactive && !onClickRef.current) return;
      draggingRef.current = true;
      lastX = e.clientX;
      downX = e.clientX;
      downY = e.clientY;
      moved = false;
      el.setPointerCapture(e.pointerId);
      if (interactive) el.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      if (Math.abs(e.clientX - downX) > CLICK_SLOP || Math.abs(e.clientY - downY) > CLICK_SLOP) {
        moved = true;
      }
      if (!interactive) return;
      yawRef.current += (e.clientX - lastX) * 0.01; // yaw only — never pitch
      lastX = e.clientX;
      pivot.rotation.y = yawRef.current;
    };
    const up = (e: PointerEvent) => {
      const wasDown = draggingRef.current;
      draggingRef.current = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = interactive ? "grab" : "default";
      if (wasDown && !moved) onClickRef.current?.();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    let raf = 0;
    let prev = performance.now();
    let announced = false;
    /*
     * Cosmetic turntable: cap it at 30 fps. The lobby keeps this and the pet viewer live at the
     * same time, each an antialiased draw at up to 2x DPR, and at 60 fps those two were the
     * largest per-frame GPU cost on the lobby screen. Nothing here needs more than 30 fps — it is
     * an idle/dance loop, not input.
     */
    const FRAME = 1 / 30;
    let acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (acc < FRAME) return;
      const dt = Math.min(0.05, acc);
      acc = 0;
      // distance 0: this is a single character filling the panel, never a distant one.
      rig?.update(dt, 0);
      if (!framed) return; // nothing to look at yet; skip the draw rather than show a guess
      renderer.render(scene, camera);
      if (!announced) {
        // After the first real draw, not after the load: the GPU upload of six transcoded
        // KTX2 textures happens inside that render call, and it is the part the player would
        // otherwise watch as an empty stage.
        announced = true;
        onReadyRef.current?.();
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      rigRef.current = null;
      // The rig's geometry, materials and textures are shared with the module-level cache
      // and must survive for the next mount, so only the clone goes.
      socket?.dispose();
      rig?.dispose();
      renderer.dispose();
      el.remove();
    };
  }, [character, weaponId, interactive, zoom]);

  // Dance changes without rebuilding the scene. When the rig isn't ready yet, the load
  // callback above applies the current dance; this handles every change after that.
  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    if (danceId) {
      loadOperativeDances()
        .then((clips) => {
          if (rigRef.current !== rig) return; // rig replaced while loading
          rig.addClips(clips.values());
          if (danceIdRef.current === danceId) rig.playDance(danceId);
        })
        .catch((e) => console.error("[OperativeViewer] dances failed to load", e));
    } else {
      rig.stopDance();
    }
  }, [danceId]);

  return <div ref={hostRef} className={className} />;
}

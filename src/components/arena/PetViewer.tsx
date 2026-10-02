import { useEffect, useRef } from "react";
import * as THREE from "three";

import { createPetRig, makeActTimer, type PetRig } from "./petModel";
import type { Pet } from "./pets";

/**
 * Extent of a loaded pet, used to frame the camera.
 *
 * `Box3.setFromObject` can't be trusted here: for a skinned mesh it returns the
 * un-posed bind box, which on these rigs collapses to near-zero. Deforming every
 * vertex is worse — the quantized attributes make `applyBoneTransform` blow up.
 * Bone world positions, on the other hand, are exact once the idle pose is
 * applied, so we measure those and pad for body thickness. Plain meshes (the
 * carrot) still measure straight off their geometry.
 */
function measureRig(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  const seen = new Set<THREE.Skeleton>();
  let bones = 0;
  root.traverse((child) => {
    const skinned = child as THREE.SkinnedMesh;
    if ((child as { isSkinnedMesh?: boolean }).isSkinnedMesh && skinned.skeleton) {
      if (seen.has(skinned.skeleton)) return;
      seen.add(skinned.skeleton);
      for (const bone of skinned.skeleton.bones) {
        v.setFromMatrixPosition(bone.matrixWorld);
        box.expandByPoint(v);
        bones++;
      }
      return;
    }
    const mesh = child as THREE.Mesh;
    if ((child as { isMesh?: boolean }).isMesh && mesh.geometry) box.expandByObject(mesh);
  });
  if (bones > 0 && !box.isEmpty()) {
    // Joints sit inside the silhouette; pad so ears/snout/tail aren't clipped.
    const size = box.getSize(new THREE.Vector3());
    box.expandByScalar(Math.max(size.x, size.y, size.z) * 0.18);
  }
  return box;
}

type Props = {
  pet: Pet;
  /** drag to spin (yaw only) */
  interactive?: boolean;
  /** camera distance multiplier — smaller = closer */
  zoom?: number;
  /**
   * Fired once the pet has actually been drawn, or once loading has definitively failed. The
   * boot screen holds its Enter button on this, so it has to fire on both paths.
   */
  onReady?: () => void;
  className?: string;
};

/**
 * Live pet preview: loads the real animated GLB, starts on its idle clip and
 * fires random flavour acts. Used by the lobby stage and the pet picker.
 *
 * NO TURNTABLE. The pet holds its facing so the player is always looking at the
 * front of it; only a deliberate drag turns it. Resting yaw is zero because
 * `pets.ts` already yaw-corrects every pet "so the pet faces +Z", which is
 * straight at the camera — the operative rig points at engine forward instead and
 * needs an explicit half-turn, so the two viewers differ here on purpose. An act
 * clip is free to turn the body however it likes; that is bone motion inside the
 * clip and it comes back to facing the player when the idle resumes.
 */
export default function PetViewer({ pet, interactive = true, zoom = 1, onReady, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const yawRef = useRef(0);
  const draggingRef = useRef(false);
  // Held in a ref rather than the effect deps: callers pass an inline arrow, and a new
  // identity every parent render would tear the rig down and re-download the pet.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const scene = new THREE.Scene();
    const FOV = 34;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
    camera.position.set(0, 0.85 * zoom, 2.6 * zoom);
    camera.lookAt(0, 0.42, 0);

    // Auto-frame: distance so the model's bounding sphere fits both axes,
    // whatever its authored scale. Set once the rig's radius is known.
    let radius = 0;
    const frameCamera = () => {
      if (radius <= 0) return;
      const half = (FOV * Math.PI) / 360;
      const vFit = radius / Math.sin(half);
      const hFov = 2 * Math.atan(Math.tan(half) * Math.max(0.0001, camera.aspect));
      const hFit = radius / Math.sin(hFov / 2);
      const dist = Math.max(vFit, hFit) * 1.28 * zoom; // padding for animation swing
      camera.position.set(0, radius * 0.12, dist);
      camera.lookAt(0, 0, 0);
      camera.near = Math.max(0.01, dist - radius * 2);
      camera.far = dist + radius * 4;
      camera.updateProjectionMatrix();
    };

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearAlpha(0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    // Positioned so it paints above the shadow ellipse below it. Both are children of the
    // same host; an absolutely-positioned sibling would otherwise sit on top of a static
    // canvas and the "shadow" would end up drawn over the pet.
    renderer.domElement.style.position = "relative";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = interactive ? "grab" : "default";

    scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x0a0f18, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 1.2);
    rim.position.set(-3, 2, -2.5);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let rig: PetRig | null = null;
    createPetRig(pet, renderer)
      .then((r) => {
        if (disposed) {
          r.dispose();
          return;
        }
        rig = r;
        pivot.add(r.root);
        // Measure in an unrotated frame, then recenter the model on the pivot
        // origin so it spins in place and sits centred at any scale.
        pivot.rotation.y = 0;
        pivot.updateWorldMatrix(true, true);
        const box = measureRig(r.root);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          r.root.position.sub(center);
          radius = box.getBoundingSphere(new THREE.Sphere()).radius || 0;
          if (!Number.isFinite(radius) || radius <= 0) radius = 1; // never trust a bad measure
          frameCamera();
        }
      })
      .catch(() => {
        // Report in anyway — the boot screen waits on this and a broken pet must not be able
        // to lock the player out of the game.
        onReadyRef.current?.();
      });

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      frameCamera();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const el = renderer.domElement;
    let lastX = 0;
    const down = (e: PointerEvent) => {
      if (!interactive) return;
      draggingRef.current = true;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      yawRef.current += (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
      pivot.rotation.y = yawRef.current;
    };
    const up = (e: PointerEvent) => {
      draggingRef.current = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = interactive ? "grab" : "default";
    };
    const tap = () => rig?.act();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", tap);

    const actTimer = makeActTimer(5, 11);
    let raf = 0;
    let prev = performance.now();
    let announced = false;
    /*
     * Cosmetic turntable: cap it at 30 fps. The lobby keeps this and the operative viewer live at
     * the same time, each an antialiased draw at up to 2x DPR, and at 60 fps those two were the
     * largest per-frame GPU cost on the lobby screen. Nothing here needs more than 30 fps — it is
     * an idle/act animation, not input.
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
      if (rig) {
        if (actTimer(dt)) rig.act();
        rig.update(dt);
      }
      renderer.render(scene, camera);
      // `radius > 0` is the framed test: the loop also runs before the GLB lands, and those
      // early frames draw an empty scene. Announcing on one of those would defeat the point.
      if (!announced && radius > 0) {
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
      el.removeEventListener("click", tap);
      rig?.dispose();
      renderer.dispose();
      el.remove();
    };
  }, [pet, interactive, zoom]);

  return (
    <div className={className}>
      <div ref={hostRef} className="relative h-full w-full">
        {/*
          Contact shadow, so the pet reads as standing on something.

          A floor plane inside the scene would be the "proper" way and it does not work here:
          `frameCamera` puts the camera at `radius * 0.12` looking at the origin, which is
          under two degrees above horizontal, so a ground ellipse foreshortens to a couple of
          pixels. A DOM ellipse behind the transparent canvas reads at any camera angle and
          costs nothing. It sits at 11% up because the pet is centred in its panel and fills
          1/1.28 of it, which puts the paws right about there.
        */}
        <span className="pointer-events-none absolute bottom-[8.5%] left-1/2 h-[5%] w-[46%] -translate-x-1/2 rounded-[50%] bg-black/60 blur-[6px]" />
      </div>
    </div>
  );
}

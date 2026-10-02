import { useEffect, useRef } from "react";
import * as THREE from "three";

import { CARS, createCarRig, type CarRig } from "./carModel";

type Props = {
  /** id into CARS / CAR_STORE */
  carId: string;
  /** drag to spin (yaw only); the turntable pauses while dragging */
  interactive?: boolean;
  /** camera distance multiplier — smaller = closer */
  zoom?: number;
  /**
   * Fired once the car has actually been drawn, or once loading has definitively
   * failed. Mirrors PetViewer so a caller can hold a spinner on the same contract.
   */
  onReady?: () => void;
  className?: string;
};

/**
 * Live car preview for the garage: loads the real GLB through the same rig the
 * game drives, parks it, and turntables it under showroom lighting.
 *
 * TWO DELIBERATE DIFFERENCES FROM PetViewer.
 *
 * 1. Framing measures with `Box3.setFromObject`, not bone world positions. Cars
 *    are plain meshes — `setFromObject` is exact for them — whereas PetViewer has
 *    to reconstruct the box from the skeleton because a skinned mesh reports its
 *    collapsed bind box. Same auto-frame maths downstream, different measurement.
 *
 * 2. There IS a turntable. A pet holds its facing so the player reads its front;
 *    a car is a shape you want to see from every angle, so the pivot rotates on
 *    its own and a drag only takes over while the pointer is down.
 *
 * The car is parked: `update` is called every frame with zero input so the rig's
 * cosmetic roll/pitch springs settle to rest, but nothing translates it, so it
 * stays centred on the pivot and the turntable spins it in place.
 */
export default function CarViewer({ carId, interactive = true, zoom = 1, onReady, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Start on a three-quarter angle so the first framed frame is a hero shot, not a flat side.
  const yawRef = useRef(-0.6);
  const draggingRef = useRef(false);
  // Held in a ref, not effect deps: callers pass an inline arrow, and a new identity every
  // parent render would tear the rig down and re-download the car.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const scene = new THREE.Scene();
    const FOV = 32;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 200);
    camera.position.set(0, 1.4 * zoom, 9 * zoom);
    camera.lookAt(0, 0, 0);

    // Auto-frame: distance so the car's bounding sphere fits both axes, whatever the
    // asset's authored scale. Set once the rig's radius is known.
    let radius = 0;
    const frameCamera = () => {
      if (radius <= 0) return;
      const half = (FOV * Math.PI) / 360;
      const vFit = radius / Math.sin(half);
      const hFov = 2 * Math.atan(Math.tan(half) * Math.max(0.0001, camera.aspect));
      const hFit = radius / Math.sin(hFov / 2);
      const dist = Math.max(vFit, hFit) * 1.22 * zoom; // a little air around the car
      // A gentle downward hero angle reads far better on a car than PetViewer's near-level shot.
      camera.position.set(0, radius * 0.55, dist);
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
    // Positioned so it paints above the shadow ellipse below it — see PetViewer for the why.
    renderer.domElement.style.position = "relative";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = interactive ? "grab" : "default";

    scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x0a0f18, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 1.2);
    rim.position.set(-5, 3, -4);
    scene.add(rim);

    const pivot = new THREE.Group();
    pivot.rotation.y = yawRef.current;
    scene.add(pivot);

    let rig: CarRig | null = null;
    createCarRig({ carId, renderer, flip: CARS[carId]?.flip ?? false })
      .then((r) => {
        if (disposed) {
          r.dispose();
          return;
        }
        rig = r;
        pivot.add(r.root);
        // Measure in an unrotated frame, then recenter the car on the pivot origin so it
        // spins in place and sits centred at any scale. setFromObject is exact here: cars
        // are not skinned, so no bind-box collapse to work around.
        pivot.rotation.y = 0;
        pivot.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(r.root);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          r.root.position.sub(center);
          radius = box.getBoundingSphere(new THREE.Sphere()).radius || 0;
          if (!Number.isFinite(radius) || radius <= 0) radius = 2.5; // never trust a bad measure
          frameCamera();
        }
        pivot.rotation.y = yawRef.current;
      })
      .catch(() => {
        // Report in anyway — a caller may be gating UI on this, and a broken car must not hang it.
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
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    const SPIN = 0.5; // turntable rate, rad/s
    let raf = 0;
    let prev = performance.now();
    let announced = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (rig) {
        // Parked: zero input settles the body springs without moving the car.
        rig.update(dt, { throttle: 0, steer: 0 });
        if (!draggingRef.current) yawRef.current += dt * SPIN;
        pivot.rotation.y = yawRef.current;
      }
      renderer.render(scene, camera);
      // `radius > 0` is the framed test: the loop runs before the GLB lands and those early
      // frames draw an empty scene — announcing on one of those would defeat the point.
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
      rig?.dispose();
      renderer.dispose();
      el.remove();
    };
  }, [carId, interactive, zoom]);

  return (
    <div className={className}>
      <div ref={hostRef} className="relative h-full w-full">
        {/*
          Contact shadow so the car reads as standing on something. A floor plane doesn't work at
          this near-level camera (see PetViewer); a DOM ellipse behind the transparent canvas reads
          at any angle. Wider than the pet's because a car is a long object seen at three-quarter.
        */}
        <span className="pointer-events-none absolute bottom-[10%] left-1/2 h-[5%] w-[58%] -translate-x-1/2 rounded-[50%] bg-black/55 blur-[7px]" />
      </div>
    </div>
  );
}

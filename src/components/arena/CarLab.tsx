import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { CAR_IDS, CARS, createCarRig, type CarInput, type CarRig } from "./carModel";

/**
 * CAR LAB — offline debug stage (route /car-lab).
 *
 * The weapon sockets were solved on /weapon-lab by eye because no amount of reasoning about
 * quaternions beats looking at the gun in the hand. Cars have the same problem twice over: the
 * assets arrive at arbitrary scale and orientation, and their wheels have to be FOUND rather than
 * read (see carModel.ts). So this stage exists to answer, per car, the three questions the code
 * cannot answer on its own:
 *
 *   1. Did the wheel detector find four wheels, and are they the right four? (bbox overlay)
 *   2. Which end is the front? (the FLIP toggle — the one fact no bounding box can tell you)
 *   3. Does it drive like a car rather than a sliding box? (drive presets + WASD)
 *
 * Nothing here ships to players.
 */

const DRIVES = ["Park", "Forward", "Reverse", "Circle L", "Circle R", "Slalom", "Manual (WASD)"] as const;
type DriveName = (typeof DRIVES)[number];

/** Camera framing presets — [yaw, pitch] in radians around the car. Positive pitch looks DOWN on it. */
const VIEWS: Record<string, [number, number]> = {
  Front: [Math.PI, 0.1],
  Back: [0, 0.1],
  Left: [Math.PI / 2, 0.1],
  Right: [-Math.PI / 2, 0.1],
  Top: [Math.PI, Math.PI / 2 - 0.05],
  "3/4": [Math.PI * 0.78, 0.22],
  Wheel: [Math.PI * 0.6, 0.04],
};

export default function CarLab() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const [carId, setCarId] = useState<string>(CAR_IDS[0] ?? "gtr");
  const [flip, setFlip] = useState(false);
  const [drive, setDrive] = useState<DriveName>("Forward");
  const [showWheels, setShowWheels] = useState(false);
  const [follow, setFollow] = useState(true);
  const [status, setStatus] = useState("loading…");
  const [info, setInfo] = useState("");
  const [hud, setHud] = useState({ speed: 0, steer: 0, yaw: 0 });
  /** Bumped once the scene exists so the car-load effect, which runs first on mount, re-fires. */
  const [sceneReady, setSceneReady] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rigRef = useRef<CarRig | null>(null);
  const helpersRef = useRef<THREE.Object3D[]>([]);
  const driveRef = useRef<DriveName>(drive);
  driveRef.current = drive;
  const followRef = useRef(follow);
  followRef.current = follow;
  const keysRef = useRef<Set<string>>(new Set());
  const camRef = useRef({ yaw: Math.PI * 0.78, pitch: 0.22, dist: 11 });

  // ---- one-time scene ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f14);
    sceneRef.current = scene;
    // 60 m of grid: at 44 m/s a car crosses a 10 m grid in a quarter second, which makes it
    // impossible to judge whether it is tracking straight.
    scene.add(new THREE.GridHelper(60, 60, 0x2a3644, 0x161d26));
    scene.add(new THREE.AxesHelper(1));

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";

    scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x0a0f18, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(6, 9, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 1.2);
    rim.position.set(-7, 4, -6);
    scene.add(rim);
    setSceneReady(true);

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
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const c = camRef.current;
      c.yaw -= (e.clientX - lx) * 0.01;
      c.pitch -= (e.clientY - ly) * 0.01;
      c.pitch = Math.max(-0.35, Math.min(Math.PI / 2 - 0.02, c.pitch));
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = (e: PointerEvent) => { dragging = false; if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); el.style.cursor = "grab"; };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = camRef.current;
      c.dist = Math.max(0.8, Math.min(80, c.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });

    const keyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === "r") rigRef.current?.reset();
      if (e.key === " ") e.preventDefault();
    };
    const keyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    // PLACEHOLDER_LOOP

    let raf = 0;
    let prev = performance.now();
    let hudAt = 0;
    const target = new THREE.Vector3();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = now / 1000;

      const rig = rigRef.current;
      if (rig) {
        const keys = keysRef.current;
        let input: CarInput = { throttle: 0, steer: 0, brake: 0 };
        switch (driveRef.current) {
          case "Park": input = { throttle: 0, steer: 0, brake: 1 }; break;
          case "Forward": input = { throttle: 0.6, steer: 0 }; break;
          case "Reverse": input = { throttle: -0.5, steer: 0 }; break;
          case "Circle L": input = { throttle: 0.45, steer: 1 }; break;
          case "Circle R": input = { throttle: 0.45, steer: -1 }; break;
          case "Slalom": input = { throttle: 0.5, steer: Math.sin(t * 1.1) }; break;
          case "Manual (WASD)":
            input = {
              throttle: (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0),
              steer: (keys.has("a") ? 1 : 0) - (keys.has("d") ? 1 : 0),
              brake: keys.has("shift") ? 1 : 0,
              handbrake: keys.has(" "),
            };
            break;
        }
        rig.update(dt, input);
        if (now - hudAt > 120) {
          hudAt = now;
          setHud({ speed: rig.speed, steer: rig.steerAngle, yaw: rig.yaw });
        }
        if (followRef.current) target.copy(rig.root.position);
        else target.set(0, 0, 0);
      }

      const c = camRef.current;
      const cp = Math.cos(c.pitch);
      camera.position.set(
        target.x + Math.sin(c.yaw) * cp * c.dist,
        target.y + 1.1 + Math.sin(c.pitch) * c.dist,
        target.z + Math.cos(c.yaw) * cp * c.dist,
      );
      camera.lookAt(target.x, target.y + 0.8, target.z);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      rigRef.current?.dispose();
      rigRef.current = null;
      renderer.dispose();
      el.remove();
    };
  }, []);

  // ---- (re)build the rig when the car or its flip changes ----
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;

    let cancelled = false;
    rigRef.current?.dispose();
    rigRef.current = null;
    for (const h of helpersRef.current) h.removeFromParent();
    helpersRef.current = [];

    setStatus(`loading ${CARS[carId]?.url ?? carId}…`);
    createCarRig({ carId, renderer, flip })
      .then((rig) => {
        if (cancelled) { rig.dispose(); return; }
        rigRef.current = rig;
        scene.add(rig.root);
        setInfo(rig.info);
        // Not `=== 4`: a merged-axle export rigs correctly with two units (see CarSide "C").
        setStatus(rig.wheels.length ? `rigged ✓ (${rig.wheels.length} units)` : "loaded, NO WHEEL RIG");
      })
      .catch((e) => {
        console.error("[CarLab] car failed", carId, e);
        if (!cancelled) { setStatus(`FAILED: ${e?.message ?? e}`); setInfo(""); }
      });

    return () => { cancelled = true; };
  }, [carId, flip, sceneReady]);

  // ---- wheel bbox overlay ----
  useEffect(() => {
    for (const h of helpersRef.current) h.removeFromParent();
    helpersRef.current = [];
    if (!showWheels) return;
    const rig = rigRef.current;
    if (!rig) return;
    // One box per detected wheel, drawn as a child of the SPIN group so it rotates with the wheel —
    // that way the overlay also shows whether the spin axis is right, not just the placement.
    for (const w of rig.wheels) {
      // Green = front axle (the one that steers), amber = rear. An axle-pair unit is drawn at its
      // own merged width so a "C" unit looks obviously different from a single wheel.
      const wide = w.side === "C" ? w.radius * 2 : w.radius * 0.9;
      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(wide, w.radius * 2, w.radius * 2),
      );
      const helper = new THREE.Box3Helper(box, new THREE.Color(w.axle === "F" ? 0x4ade80 : 0xf59e0b));
      w.spin.add(helper);
      helpersRef.current.push(helper);
    }
  }, [showWheels, info, carId, flip]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      <CarPanel
        carId={carId}
        setCarId={setCarId}
        flip={flip}
        setFlip={setFlip}
        drive={drive}
        setDrive={setDrive}
        showWheels={showWheels}
        setShowWheels={setShowWheels}
        follow={follow}
        setFollow={setFollow}
        status={status}
        info={info}
        hud={hud}
        onReset={() => rigRef.current?.reset()}
        onView={(v) => { const p = VIEWS[v]; if (!p) return; camRef.current.yaw = p[0]; camRef.current.pitch = p[1]; }}
      />
    </div>
  );
}

// ---- UI overlay ----

function Toggle(props: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded px-2 py-1 text-[11px] ${props.on ? "bg-sky-500 text-white" : "bg-white/5 text-white/80 hover:bg-white/15"}`}
    >
      {props.label}
    </button>
  );
}

function CarPanel(props: {
  carId: string;
  setCarId: (id: string) => void;
  flip: boolean;
  setFlip: (v: boolean) => void;
  drive: DriveName;
  setDrive: (d: DriveName) => void;
  showWheels: boolean;
  setShowWheels: (v: boolean) => void;
  follow: boolean;
  setFollow: (v: boolean) => void;
  status: string;
  info: string;
  hud: { speed: number; steer: number; yaw: number };
  onReset: () => void;
  onView: (v: string) => void;
}) {
  const bad = props.status.startsWith("FAILED") || props.status.includes("NO WHEEL");
  const kmh = props.hud.speed * 3.6;

  return (
    <div className="absolute right-3 top-3 flex max-h-[calc(100%-1.5rem)] w-80 flex-col gap-3 overflow-y-auto rounded-xl border border-white/10 bg-black/70 p-3 backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Car Lab</div>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wider text-white/40">Car</div>
        <select
          className="rounded bg-white/5 px-2 py-1 text-sm text-white outline-none"
          value={props.carId}
          onChange={(e) => props.setCarId(e.target.value)}
        >
          {CAR_IDS.map((id) => (
            <option key={id} value={id} className="bg-[#0b0f14]">{CARS[id]?.name ?? id} ({id})</option>
          ))}
        </select>
        <div className={`text-[10px] ${bad ? "text-rose-400" : "text-emerald-400"}`}>{props.status}</div>
        {props.info && <div className="text-[10px] leading-snug text-white/40">{props.info}</div>}
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wider text-white/40">Orientation</div>
        <Toggle label={props.flip ? "FLIP: on (nose reversed)" : "FLIP: off"} on={props.flip} onClick={() => props.setFlip(!props.flip)} />
        <div className="text-[10px] leading-snug text-white/30">
          Drive Forward and watch which end leads. If it reverses, turn FLIP on and paste
          <span className="font-mono text-white/50"> flip: true </span>
          into that car's CARS entry.
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wider text-white/40">Drive</div>
        <div className="flex flex-wrap gap-1">
          {DRIVES.map((d) => (
            <Toggle key={d} label={d} on={props.drive === d} onClick={() => props.setDrive(d)} />
          ))}
        </div>
        <div className="text-[10px] text-white/30">W/S throttle · A/D steer · Shift brake · Space handbrake · R reset</div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded bg-white/5 p-2 text-center tabular-nums">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-white/40">km/h</div>
          <div className="text-sm text-white/90">{kmh.toFixed(0)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-white/40">steer°</div>
          <div className="text-sm text-white/90">{(props.hud.steer * 180 / Math.PI).toFixed(0)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-white/40">yaw°</div>
          <div className="text-sm text-white/90">{(((props.hud.yaw * 180 / Math.PI) % 360 + 360) % 360).toFixed(0)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wider text-white/40">Camera</div>
        <div className="flex flex-wrap gap-1">
          {Object.keys(VIEWS).map((v) => (
            <button key={v} onClick={() => props.onView(v)} className="rounded bg-white/5 px-2 py-1 text-[11px] text-white/80 hover:bg-white/15">{v}</button>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Toggle label="Follow car" on={props.follow} onClick={() => props.setFollow(!props.follow)} />
          <Toggle label="Wheel boxes" on={props.showWheels} onClick={() => props.setShowWheels(!props.showWheels)} />
          <button onClick={props.onReset} className="rounded bg-white/5 px-2 py-1 text-[11px] text-white/80 hover:bg-white/15">Reset</button>
        </div>
        <div className="mt-1 text-[10px] text-white/30">drag = orbit · wheel = zoom</div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { createOperativeRig, OPERATIVE_BODY_URL, type OperativeRig } from "./operativeModel";
import { loadWeaponModel, prepareProp, WEAPON_PROPS } from "./weaponModel";
import { WEAPONS, usesBladeStance } from "./weapons";

/**
 * WEAPON LAB — offline debug stage (route /weapon-lab).
 *
 * A single operative stands in the hand-pose the match uses, holding one weapon off RightHand.
 * Unlike OperativeViewer this is a TUNING rig: full orbit (yaw + pitch) + zoom, preset camera
 * angles, a weapon switcher, a locomotion switcher, and live position/rotation/scale sliders that
 * mutate the held prop every frame. The readout prints the exact WEAPON_PROPS entry to paste back,
 * so melee orientation and the deagle scale are dialled in by eye instead of solved blind.
 *
 * Nothing here ships to players — it exists only to produce the numbers in weaponModel.ts.
 */

/** Order the switcher: fists (empty hand) first, then everything with a real prop. */
const LAB_WEAPONS = [
  { id: "fists", name: "FISTS (empty)" },
  ...WEAPONS.filter((w) => WEAPON_PROPS[w.id]).map((w) => ({ id: w.id, name: w.name })),
];

type Xform = {
  px: number; py: number; pz: number;
  // rotation as euler degrees (XYZ) — the sliders edit this, converted to a quaternion each frame
  rx: number; ry: number; rz: number;
  scale: number;
};

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Seed slider state from a WEAPON_PROPS entry (quaternion -> euler degrees). */
function xformFromProp(id: string): Xform {
  const p = WEAPON_PROPS[id];
  if (!p) return { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, scale: 1 };
  const q = new THREE.Quaternion(p.quaternion[0], p.quaternion[1], p.quaternion[2], p.quaternion[3]);
  const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
  return {
    px: p.position[0], py: p.position[1], pz: p.position[2],
    rx: e.x * DEG, ry: e.y * DEG, rz: e.z * DEG,
    scale: p.scale,
  };
}

/** Camera framing presets — [yaw, pitch] in radians around the character. */
const VIEWS: Record<string, [number, number]> = {
  Front: [Math.PI, 0],
  Back: [0, 0],
  Left: [Math.PI / 2, 0],
  Right: [-Math.PI / 2, 0],
  Top: [Math.PI, -Math.PI / 2 + 0.05],
  Bottom: [Math.PI, Math.PI / 2 - 0.05],
  "3/4": [Math.PI * 0.78, -0.28],
};

const MOTIONS = ["Idle", "Forward", "Backward", "Strafe L", "Strafe R"] as const;
type MotionName = (typeof MOTIONS)[number];

export default function WeaponLab() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const [weaponId, setWeaponId] = useState<string>("deagle");
  const [motion, setMotion] = useState<MotionName>("Idle");
  const [xform, setXform] = useState<Xform>(() => xformFromProp("deagle"));
  // Load status for the selected weapon, surfaced in the panel so a decode/404 failure is
  // visible on-screen instead of only in the console.
  const [status, setStatus] = useState<string>("");
  // Bumped once the rig (and its RightHand bone) exist, so the weapon-load effect — which runs on
  // mount before the async rig resolves — re-fires and actually hangs the initial weapon.
  const [rigReady, setRigReady] = useState(false);

  // Live channels read by the render loop / effects so UI changes never rebuild the scene.
  const xformRef = useRef(xform);
  xformRef.current = xform;
  const weaponRef = useRef(weaponId);
  const motionRef = useRef(motion);
  motionRef.current = motion;

  const rigRef = useRef<OperativeRig | null>(null);
  const propRef = useRef<THREE.Object3D | null>(null);
  const handRef = useRef<THREE.Object3D | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // Camera orbit, driven by drag + wheel and by the preset buttons.
  const camRef = useRef({ yaw: Math.PI, pitch: -0.12, dist: 4.2, target: 1.0 });

  // ---- one-time scene ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f14);
    const grid = new THREE.GridHelper(10, 20, 0x2a3644, 0x18202a);
    scene.add(grid);
    scene.add(new THREE.AxesHelper(0.5));

    const FOV = 35;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";

    scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x0a0f18, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 1.4);
    rim.position.set(-4, 2.5, -3);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);

    createOperativeRig({ url: OPERATIVE_BODY_URL, renderer, castShadow: false })
      .then((r) => {
        if (disposed) { r.dispose(); return; }
        rigRef.current = r;
        r.setMotion({ velocity: new THREE.Vector3(), yaw: 0, armed: true });
        pivot.add(r.root);
        handRef.current = r.bone("RightHand") ?? null;
        setRigReady(true);
      })
      .catch((e) => console.error("[WeaponLab] rig failed", e));

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

    // Orbit controls: drag = yaw+pitch, wheel = zoom.
    const el = renderer.domElement;
    let dragging = false;
    let lx = 0, ly = 0;
    const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const c = camRef.current;
      c.yaw -= (e.clientX - lx) * 0.01;
      c.pitch -= (e.clientY - ly) * 0.01;
      c.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, c.pitch));
      lx = e.clientX; ly = e.clientY;
    };
    const up = (e: PointerEvent) => { dragging = false; if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); el.style.cursor = "grab"; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const c = camRef.current; c.dist = Math.max(0.4, Math.min(20, c.dist * (1 + Math.sign(e.deltaY) * 0.1))); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });

    let raf = 0;
    let prev = performance.now();
    const vtmp = new THREE.Vector3();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      // Drive locomotion so the weapon can be judged while the body moves.
      const rig = rigRef.current;
      if (rig) {
        const speed = 1.6;
        const m = motionRef.current;
        vtmp.set(0, 0, 0);
        if (m === "Forward") vtmp.set(0, 0, -speed);
        else if (m === "Backward") vtmp.set(0, 0, speed);
        else if (m === "Strafe L") vtmp.set(-speed, 0, 0);
        else if (m === "Strafe R") vtmp.set(speed, 0, 0);
        const id = weaponRef.current;
        const w = WEAPONS.find((x) => x.id === id);
        rig.setMotion({
          velocity: vtmp,
          yaw: 0,
          armed: id !== "fists",
          pistol: w?.cls === "Pistol",
          blade: usesBladeStance(id),
        });
        rig.update(dt, 0);
      }

      // Apply live slider transform to the held prop every frame.
      const prop = propRef.current;
      if (prop) {
        const x = xformRef.current;
        prop.position.set(x.px, x.py, x.pz);
        prop.quaternion.setFromEuler(new THREE.Euler(x.rx * RAD, x.ry * RAD, x.rz * RAD, "XYZ"));
        prop.scale.setScalar(x.scale);
      }

      // Orbit camera around the character.
      const c = camRef.current;
      const cp = Math.cos(c.pitch);
      camera.position.set(
        Math.sin(c.yaw) * cp * c.dist,
        c.target + Math.sin(c.pitch) * c.dist,
        Math.cos(c.yaw) * cp * c.dist,
      );
      camera.lookAt(0, c.target, 0);
      renderer.render(scene, camera);
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
      el.removeEventListener("wheel", wheel);
      propRef.current?.removeFromParent();
      propRef.current = null;
      rigRef.current?.dispose();
      rigRef.current = null;
      renderer.dispose();
      el.remove();
    };
  }, []);

  // ---- swap the held weapon when weaponId changes (no scene rebuild) ----
  useEffect(() => {
    weaponRef.current = weaponId;
    // reset sliders to this weapon's stored transform
    setXform(xformFromProp(weaponId));

    let cancelled = false;
    propRef.current?.removeFromParent();
    propRef.current = null;

    const prop = WEAPON_PROPS[weaponId];
    const hand = handRef.current;
    const renderer = rendererRef.current;
    if (!prop) { setStatus(weaponId === "fists" ? "empty hands (no prop)" : "no WEAPON_PROPS entry"); return; }
    if (!hand || !renderer) { setStatus("waiting for rig…"); return; }

    setStatus(`loading ${prop.url}…`);
    loadWeaponModel(prop.url, renderer)
      .then(({ scene }) => {
        if (cancelled) return;
        const g = prepareProp(scene.clone(true), prop);
        hand.add(g);
        propRef.current = g; // transform applied by the render loop from xformRef
        // A model that parses but contains no drawable mesh is its own failure — flag it.
        let meshes = 0;
        g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
        setStatus(meshes ? `loaded ✓ (${meshes} mesh${meshes > 1 ? "es" : ""})` : "loaded but NO MESH in file");
      })
      .catch((e) => {
        console.error("[WeaponLab] weapon failed", prop.url, e);
        if (!cancelled) setStatus(`FAILED: ${e?.message ?? e}`);
      });

    return () => { cancelled = true; };
  }, [weaponId, rigReady]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      <LabPanel
        weaponId={weaponId}
        setWeaponId={setWeaponId}
        motion={motion}
        setMotion={setMotion}
        xform={xform}
        setXform={setXform}
        status={status}
        onView={(v) => { const p = VIEWS[v]; if (!p) return; camRef.current.yaw = p[0]; camRef.current.pitch = p[1]; }}
      />
    </div>
  );
}

// ---- UI overlay (sliders + readout) ----

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-white/70">
      <span className="w-6 shrink-0 uppercase tracking-wider">{props.label}</span>
      <input
        type="range"
        className="flex-1 accent-sky-400"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
      <input
        type="number"
        className="w-16 shrink-0 rounded bg-white/5 px-1 py-0.5 text-right tabular-nums text-white/90 outline-none"
        step={props.step}
        value={Number(props.value.toFixed(4))}
        onChange={(e) => props.onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

function LabPanel(props: {
  weaponId: string;
  setWeaponId: (id: string) => void;
  motion: MotionName;
  setMotion: (m: MotionName) => void;
  xform: Xform;
  setXform: (x: Xform) => void;
  status: string;
  onView: (v: string) => void;
}) {
  const { weaponId, setWeaponId, motion, setMotion, xform, setXform, status, onView } = props;
  const set = (patch: Partial<Xform>) => setXform({ ...xform, ...patch });

  // Live WEAPON_PROPS snippet — euler sliders back to a quaternion so it can be pasted verbatim.
  const snippet = useMemo(() => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(xform.rx * RAD, xform.ry * RAD, xform.rz * RAD, "XYZ"));
    const r = (n: number) => Number(n.toFixed(4));
    const src = WEAPON_PROPS[weaponId];
    const muzzle = src ? src.muzzle : [0, 0, 0];
    const url = src ? src.url : `/models/weapons/${weaponId}.glb`;
    return `${weaponId}: { url: "${url}", position: [${r(xform.px)}, ${r(xform.py)}, ${r(xform.pz)}], quaternion: [${r(q.x)}, ${r(q.y)}, ${r(q.z)}, ${r(q.w)}], scale: ${r(xform.scale)}, muzzle: [${muzzle.join(", ")}] },`;
  }, [xform, weaponId]);

  return (
    <div className="absolute right-3 top-3 flex max-h-[calc(100%-1.5rem)] w-80 flex-col gap-3 overflow-y-auto rounded-xl border border-white/10 bg-black/70 p-3 backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Weapon Lab</div>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wider text-white/40">Weapon</div>
        <select
          className="rounded bg-white/5 px-2 py-1 text-sm text-white outline-none"
          value={weaponId}
          onChange={(e) => setWeaponId(e.target.value)}
        >
          {LAB_WEAPONS.map((w) => (
            <option key={w.id} value={w.id} className="bg-[#0b0f14]">{w.name}</option>
          ))}
        </select>
        <div className={`text-[10px] ${status.startsWith("FAILED") || status.includes("NO MESH") ? "text-rose-400" : "text-white/40"}`}>
          {status}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wider text-white/40">Camera</div>
        <div className="flex flex-wrap gap-1">
          {Object.keys(VIEWS).map((v) => (
            <button key={v} onClick={() => onView(v)} className="rounded bg-white/5 px-2 py-1 text-[11px] text-white/80 hover:bg-white/15">{v}</button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-white/30">drag = orbit · wheel = zoom</div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wider text-white/40">Motion</div>
        <div className="flex flex-wrap gap-1">
          {MOTIONS.map((m) => (
            <button key={m} onClick={() => setMotion(m)} className={`rounded px-2 py-1 text-[11px] ${motion === m ? "bg-sky-500 text-white" : "bg-white/5 text-white/80 hover:bg-white/15"}`}>{m}</button>
          ))}
        </div>
      </div>

      {WEAPON_PROPS[weaponId] && (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Position (bone units)</div>
            <Slider label="X" value={xform.px} min={-20} max={20} step={0.001} onChange={(v) => set({ px: v })} />
            <Slider label="Y" value={xform.py} min={-20} max={20} step={0.001} onChange={(v) => set({ py: v })} />
            <Slider label="Z" value={xform.pz} min={-20} max={20} step={0.001} onChange={(v) => set({ pz: v })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Rotation (deg)</div>
            <Slider label="X" value={xform.rx} min={-180} max={180} step={0.5} onChange={(v) => set({ rx: v })} />
            <Slider label="Y" value={xform.ry} min={-180} max={180} step={0.5} onChange={(v) => set({ ry: v })} />
            <Slider label="Z" value={xform.rz} min={-180} max={180} step={0.5} onChange={(v) => set({ rz: v })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Scale</div>
            <Slider label="S" value={xform.scale} min={0} max={150} step={0.1} onChange={(v) => set({ scale: v })} />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-wider text-white/40">WEAPON_PROPS entry</div>
            <textarea
              readOnly
              className="h-24 w-full resize-none rounded bg-white/5 p-2 font-mono text-[10px] leading-snug text-emerald-300 outline-none"
              value={snippet}
            />
            <button
              onClick={() => navigator.clipboard?.writeText(snippet)}
              className="rounded bg-sky-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-400"
            >
              Copy
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Online Hangout — live presence on Lovable Cloud realtime.
 *
 * Every player in Hangout mode joins a shared channel per map, broadcasts their
 * position ~10x/second, and sees everyone else as a smoothed avatar with a name tag.
 * Guests are allowed: identity is the local guest profile id + callsign.
 */
import * as THREE from "three";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { createNameplate, type Nameplate } from "./nameplate";
import { createOperativeRig, OPERATIVE_BODY_URL, type OperativeRig } from "./operativeModel";

const RIG_SCALE = 1.2;

type PosMsg = { id: string; name: string; x: number; y: number; z: number; yaw: number };

type Remote = {
  name: string;
  group: THREE.Group;
  plate: Nameplate;
  target: THREE.Vector3;
  targetYaw: number;
  lastSeen: number;
  rig: OperativeRig | null;
  placeholder: THREE.Object3D;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
};

const SEND_INTERVAL = 0.1;
const STALE_MS = 8000;

export type ChatMsg = { id: string; name: string; text: string; at: number };

export type OnlineHangout = {
  update: (dt: number, self: { x: number; y: number; z: number; yaw: number }, camera: THREE.PerspectiveCamera) => void;
  count: () => number;
  /** send a chat line to everyone on this map */
  chat: (text: string) => void;
  dispose: () => void;
};

function buildAvatar(color: number) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 10), mat);
  body.position.y = 0.85;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.2 }),
  );
  visor.position.set(0, 1.45, -0.32);
  g.add(body, visor);
  return g;
}

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.6, 0.55).getHex();
}

export function joinOnlineHangout(
  scene: THREE.Scene,
  mapId: string,
  me: { id: string; name: string },
  onCount?: (n: number) => void,
  onChat?: (m: ChatMsg) => void,
): OnlineHangout {
  const remotes = new Map<string, Remote>();
  let sendTimer = 0;
  let ready = false;
  let disposed = false;

  const removeRemote = (id: string) => {
    const r = remotes.get(id);
    if (!r) return;
    scene.remove(r.group);
    scene.remove(r.plate.object);
    r.plate.dispose();
    r.rig?.dispose();
    r.rig = null;
    r.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    remotes.delete(id);
    onCount?.(remotes.size + 1);
  };

  const upsert = (m: PosMsg) => {
    if (m.id === me.id || disposed) return;
    let r = remotes.get(m.id);
    if (!r) {
      const group = buildAvatar(colorFor(m.id));
      group.position.set(m.x, m.y, m.z);
      const plate = createNameplate(m.name);
      scene.add(group);
      scene.add(plate.object);
      const placeholder = new THREE.Group();
      while (group.children.length) placeholder.add(group.children[0]!);
      group.add(placeholder);
      const fresh: Remote = {
        name: m.name, group, plate, target: new THREE.Vector3(m.x, m.y, m.z), targetYaw: m.yaw, lastSeen: 0,
        rig: null, placeholder, prev: new THREE.Vector3(m.x, m.y, m.z), vel: new THREE.Vector3(),
      };
      r = fresh;
      remotes.set(m.id, r);
      const id = m.id;
      void createOperativeRig({ url: OPERATIVE_BODY_URL, castShadow: false, worldScale: RIG_SCALE })
        .then((rig) => {
          if (disposed || remotes.get(id) !== fresh) {
            rig.dispose();
            return;
          }
          rig.root.scale.setScalar(RIG_SCALE);
          fresh.group.add(rig.root);
          fresh.placeholder.visible = false;
          fresh.rig = rig;
        })
        .catch(() => {
          /* keep the placeholder figure */
        });
      onCount?.(remotes.size + 1);
    }
    r.target.set(m.x, m.y, m.z);
    r.targetYaw = m.yaw;
    r.lastSeen = Date.now();
  };

  const channel: RealtimeChannel = supabase.channel(`hangout:${mapId}`, {
    config: { broadcast: { self: false }, presence: { key: me.id } },
  });
  channel
    .on("broadcast", { event: "pos" }, ({ payload }) => upsert(payload as PosMsg))
    .on("broadcast", { event: "chat" }, ({ payload }) => {
      const m = payload as ChatMsg;
      if (!m || typeof m.text !== "string" || disposed) return;
      onChat?.({ id: String(m.id), name: String(m.name).slice(0, 24), text: m.text.slice(0, 160), at: Date.now() });
    })
    .on("presence", { event: "leave" }, ({ key }) => key && removeRemote(key))
    .subscribe((status) => {
      if (status === "SUBSCRIBED" && !disposed) {
        ready = true;
        void channel.track({ name: me.name, joinedAt: Date.now() });
      }
    });

  return {
    update(dt, self, camera) {
      sendTimer += dt;
      if (ready && sendTimer >= SEND_INTERVAL) {
        sendTimer = 0;
        const msg: PosMsg = { id: me.id, name: me.name, ...self };
        void channel.send({ type: "broadcast", event: "pos", payload: msg });
      }
      const now = Date.now();
      const k = 1 - Math.exp(-dt * 12);
      for (const [id, r] of remotes) {
        if (now - r.lastSeen > STALE_MS) {
          removeRemote(id);
          continue;
        }
        r.group.position.lerp(r.target, k);
        let d = r.targetYaw - r.group.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        r.group.rotation.y += d * k;
        if (dt > 0) {
          const inst = r.group.position.clone().sub(r.prev).divideScalar(dt);
          r.vel.lerp(inst, 1 - Math.exp(-dt * 8));
        }
        r.prev.copy(r.group.position);
        if (r.rig) {
          r.rig.setMotion({ velocity: r.vel, yaw: r.group.rotation.y, armed: false });
          r.rig.update(dt, r.group.position.distanceTo(camera.position));
        }
        r.plate.update(r.group.position, camera, "up");
      }
    },
    count: () => remotes.size + 1,
    chat(text) {
      const clean = text.trim().slice(0, 160);
      if (!clean) return;
      const msg: ChatMsg = { id: me.id, name: me.name, text: clean, at: Date.now() };
      onChat?.(msg);
      if (ready) void channel.send({ type: "broadcast", event: "chat", payload: msg });
    },
    dispose() {
      disposed = true;
      for (const id of [...remotes.keys()]) removeRemote(id);
      void supabase.removeChannel(channel);
    },
  };
}

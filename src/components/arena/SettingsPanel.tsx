import { useEffect, useState } from "react";
import { BOT_PROFILES } from "./botAi";
import {
  Crosshair,
  Gauge,
  Keyboard,
  LayoutGrid,
  MonitorCog,
  Swords,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import ControlsEditor from "./ControlsEditor";
import { initKeyboardLayout, isNonQwertyLayout, layoutKeyLabel, onKeyboardLayout } from "./keyboardLayout";
import {
  AIM_ASSIST_LABELS,
  BIND_ACTIONS,
  BIND_LABELS,
  CROSSHAIR_COLORS,
  QUALITY_LABELS,
  defaultBinds,
  defaultSettings,
  type AimAssist,
  type ArenaSettings,
  type BindAction,
  type CrosshairStyle,
  type Quality,
} from "./settings";

type Props = {
  settings: ArenaSettings;
  onChange: (next: ArenaSettings) => void;
  onClose: () => void;
};

const slider =
  "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-[var(--hud-accent)]";

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
        {value !== undefined && <span className="tabular-nums text-[var(--hud-accent)]">{value}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-[11px] font-bold uppercase tracking-[0.15em] transition ${
        on
          ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/20 text-foreground"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums text-[10px]">{on ? "On" : "Off"}</span>
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onSelect,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onSelect: (v: T) => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0,1fr))` }}>
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`rounded-lg border px-2 py-3 text-[10px] font-bold uppercase tracking-[0.1em] transition ${
            value === id
              ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/20 text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-secondary"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type TabId = "aim" | "crosshair" | "interface" | "audio" | "video" | "gameplay" | "keyboard" | "controls";

const TABS: { id: TabId; label: string; icon: typeof Crosshair }[] = [
  { id: "aim", label: "Aim", icon: Crosshair },
  { id: "crosshair", label: "Crosshair", icon: Crosshair },
  { id: "interface", label: "Interface", icon: MonitorCog },
  { id: "audio", label: "Audio", icon: Volume2 },
  { id: "video", label: "Video", icon: Gauge },
  { id: "gameplay", label: "Gameplay", icon: Swords },
  { id: "keyboard", label: "Keyboard", icon: Keyboard },
  { id: "controls", label: "Touch HUD", icon: LayoutGrid },
];

export default function SettingsPanel({ settings, onChange, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("aim");
  const [rebinding, setRebinding] = useState<BindAction | null>(null);
  const [, setLayoutTick] = useState(0);

  useEffect(() => {
    void initKeyboardLayout();
    return onKeyboardLayout(() => setLayoutTick((t) => t + 1));
  }, []);

  const set = <K extends keyof ArenaSettings>(key: K, value: ArenaSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const captureKey = (action: BindAction) => (e: React.KeyboardEvent) => {
    if (rebinding !== action) return;
    e.preventDefault();
    if (e.code === "Escape") {
      setRebinding(null);
      return;
    }
    const next = { ...settings.keybinds, [action]: e.code };
    for (const a of BIND_ACTIONS) if (a !== action && next[a] === e.code) next[a] = "";
    onChange({ ...settings, keybinds: next });
    setRebinding(null);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border/70 bg-card/95 p-5 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.35em] text-foreground">Settings</h2>
          <button aria-label="Close settings" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ---- tabs ---- */}
        <div role="tablist" className="mt-4 flex flex-wrap gap-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex min-w-[104px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                tab === id
                  ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/20 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 min-h-[320px]">
          {tab === "aim" && (
            <section className="space-y-4">
              <Row label="Mouse sensitivity" value={(settings.mouseSensitivity * 1000).toFixed(1)}>
                <input
                  type="range"
                  min={0.4}
                  max={8}
                  step={0.1}
                  value={settings.mouseSensitivity * 1000}
                  onChange={(e) => set("mouseSensitivity", Number(e.target.value) / 1000)}
                  className={slider}
                />
              </Row>
              <Row label="Touch sensitivity" value={(settings.touchSensitivity * 1000).toFixed(1)}>
                <input
                  type="range"
                  min={1.5}
                  max={20}
                  step={0.5}
                  value={settings.touchSensitivity * 1000}
                  onChange={(e) => set("touchSensitivity", Number(e.target.value) / 1000)}
                  className={slider}
                />
              </Row>
              <Row label="Scoped sensitivity" value={`${Math.round(settings.adsMultiplier * 100)}%`}>
                <input
                  type="range"
                  min={20}
                  max={120}
                  step={5}
                  value={settings.adsMultiplier * 100}
                  onChange={(e) => set("adsMultiplier", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Row label="Field of view" value={`${Math.round(settings.fov)}°`}>
                <input
                  type="range"
                  min={55}
                  max={110}
                  step={1}
                  value={settings.fov}
                  onChange={(e) => set("fov", Number(e.target.value))}
                  className={slider}
                />
              </Row>
              <Row label="Aim assist">
                <Segmented
                  value={settings.aimAssist}
                  options={(["off", "light", "standard", "strong"] as AimAssist[]).map(
                    (a) => [a, AIM_ASSIST_LABELS[a]] as const,
                  )}
                  onSelect={(v) => set("aimAssist", v)}
                />
              </Row>
              <Row label="Aim down sights">
                <Segmented
                  value={settings.adsMode}
                  options={[
                    ["hold", "Hold"],
                    ["toggle", "Toggle"],
                  ] as const}
                  onSelect={(v) => set("adsMode", v)}
                />
              </Row>
              <Toggle
                on={settings.invertY}
                label="Invert vertical look"
                onClick={() => set("invertY", !settings.invertY)}
              />
            </section>
          )}

          {tab === "crosshair" && (
            <section className="space-y-4">
              <Row label="Style">
                <Segmented
                  value={settings.crosshairStyle}
                  options={(
                    [
                      ["cross", "Cross"],
                      ["circle", "Circle"],
                      ["dot", "Dot"],
                      ["none", "None"],
                    ] as const
                  ).map((o) => o as readonly [CrosshairStyle, string])}
                  onSelect={(v) => set("crosshairStyle", v)}
                />
              </Row>
              <Row label="Colour">
                <div className="flex flex-wrap gap-2">
                  {CROSSHAIR_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={`Crosshair colour ${c}`}
                      onClick={() => set("crosshairColor", c)}
                      style={{ background: c }}
                      className={`h-9 w-9 rounded-lg border-2 transition ${
                        settings.crosshairColor === c ? "border-[var(--hud-accent)] scale-105" : "border-border"
                      }`}
                    />
                  ))}
                </div>
              </Row>
              <Row label="Size" value={`${Math.round(settings.crosshairSize * 100)}%`}>
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={settings.crosshairSize * 100}
                  onChange={(e) => set("crosshairSize", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Row label="Thickness" value={`${settings.crosshairThickness}px`}>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={settings.crosshairThickness}
                  onChange={(e) => set("crosshairThickness", Number(e.target.value))}
                  className={slider}
                />
              </Row>
              <Row label="Opacity" value={`${Math.round(settings.crosshairOpacity * 100)}%`}>
                <input
                  type="range"
                  min={20}
                  max={100}
                  step={5}
                  value={settings.crosshairOpacity * 100}
                  onChange={(e) => set("crosshairOpacity", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Toggle
                on={settings.crosshairDynamic}
                label="Dynamic spread"
                onClick={() => set("crosshairDynamic", !settings.crosshairDynamic)}
              />
              <Toggle on={settings.centerDot} label="Centre dot" onClick={() => set("centerDot", !settings.centerDot)} />
              <Toggle
                on={settings.showHitMarkers}
                label="Hit markers"
                onClick={() => set("showHitMarkers", !settings.showHitMarkers)}
              />
            </section>
          )}

          {tab === "interface" && (
            <section className="space-y-3">
              <Row label="HUD opacity" value={`${Math.round(settings.hudOpacity * 100)}%`}>
                <input
                  type="range"
                  min={30}
                  max={100}
                  step={5}
                  value={settings.hudOpacity * 100}
                  onChange={(e) => set("hudOpacity", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Row label="HUD size" value={`${Math.round(settings.hudScale * 100)}%`}>
                <input
                  type="range"
                  min={70}
                  max={130}
                  step={5}
                  value={settings.hudScale * 100}
                  onChange={(e) => set("hudScale", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Row label="Screen shake" value={`${Math.round(settings.screenShake * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={150}
                  step={10}
                  value={settings.screenShake * 100}
                  onChange={(e) => set("screenShake", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Toggle on={settings.showMinimap} label="Minimap" onClick={() => set("showMinimap", !settings.showMinimap)} />
              <Toggle
                on={settings.showKillFeed}
                label="Kill feed"
                onClick={() => set("showKillFeed", !settings.showKillFeed)}
              />
              <Toggle
                on={settings.showDamageNumbers}
                label="Damage numbers"
                onClick={() => set("showDamageNumbers", !settings.showDamageNumbers)}
              />
              <Toggle
                on={settings.damageFlash}
                label="Damage vignette"
                onClick={() => set("damageFlash", !settings.damageFlash)}
              />
              <Toggle on={settings.showFps} label="FPS counter" onClick={() => set("showFps", !settings.showFps)} />
            </section>
          )}

          {tab === "audio" && (
            <section className="space-y-4">
              <Row label="Master volume" value={`${Math.round(settings.masterVolume * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.masterVolume * 100}
                  onChange={(e) => set("masterVolume", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Row label="Effects volume" value={`${Math.round(settings.sfxVolume * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.sfxVolume * 100}
                  onChange={(e) => set("sfxVolume", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Toggle on={settings.hitSounds} label="Hit sounds" onClick={() => set("hitSounds", !settings.hitSounds)} />
              <button
                onClick={() => set("muted", !settings.muted)}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-3 text-[11px] font-bold uppercase tracking-[0.2em] transition ${
                  settings.muted
                    ? "border-destructive bg-destructive/20 text-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {settings.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {settings.muted ? "Muted" : "Sound on"}
              </button>
            </section>
          )}

          {tab === "video" && (
            <section className="space-y-4">
              <Row label="Quality preset">
                <Segmented
                  value={settings.quality}
                  options={(["low", "medium", "high"] as Quality[]).map((q) => [q, QUALITY_LABELS[q]] as const)}
                  onSelect={(v) => set("quality", v)}
                />
              </Row>
              <Row label="Render resolution" value={`${Math.round(settings.renderScale * 100)}%`}>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={settings.renderScale * 100}
                  onChange={(e) => set("renderScale", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Row label="Effects density" value={`${Math.round(settings.particles * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={150}
                  step={10}
                  value={settings.particles * 100}
                  onChange={(e) => set("particles", Number(e.target.value) / 100)}
                  className={slider}
                />
              </Row>
              <Toggle on={settings.shadows} label="Shadows" onClick={() => set("shadows", !settings.shadows)} />
              <Toggle
                on={settings.bakedLight}
                label="Baked lighting (fast)"
                onClick={() => set("bakedLight", !settings.bakedLight)}
              />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Quality, shadows and render resolution apply after reloading the page. Lower values keep phones and older
                laptops smooth. Baked lighting pre-computes map light and shade once at load — much faster, but map
                shadows stop moving.
              </p>

              <div className="space-y-4 rounded-xl border border-border/70 bg-card/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Atmosphere — 4v4 outdoor map
                </p>
                <Row label="Sky brightness" value={`${Math.round(settings.skyBrightness * 100)}%`}>
                  <input
                    type="range"
                    min={50}
                    max={180}
                    step={2}
                    value={Math.round(settings.skyBrightness * 100)}
                    onChange={(e) => set("skyBrightness", Number(e.target.value) / 100)}
                    className={slider}
                  />
                </Row>
                <Row label="Fog intensity" value={settings.fogIntensity <= 0.02 ? "Off" : `${Math.round(settings.fogIntensity * 100)}%`}>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={Math.round(settings.fogIntensity * 100)}
                    onChange={(e) => set("fogIntensity", Number(e.target.value) / 100)}
                    className={slider}
                  />
                </Row>
                <Row label="Cloud drift" value={settings.cloudMotion <= 0 ? "Static" : `${Math.round(settings.cloudMotion * 100)}%`}>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={10}
                    value={Math.round(settings.cloudMotion * 100)}
                    onChange={(e) => set("cloudMotion", Number(e.target.value) / 100)}
                    className={slider}
                  />
                </Row>
                <Row label="Ground light (baked)" value={`${Math.round(settings.groundBrightness * 100)}%`}>
                  <input
                    type="range"
                    min={60}
                    max={180}
                    step={5}
                    value={Math.round(settings.groundBrightness * 100)}
                    onChange={(e) => set("groundBrightness", Number(e.target.value) / 100)}
                    className={slider}
                  />
                </Row>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Sky, fog and clouds update live. Ground light is folded into the light bake, so it applies on the next
                  match / reload — none of these change the map's real lighting rig.
                </p>
              </div>
            </section>
          )}

          {tab === "gameplay" && (
            <section className="space-y-3">
              <Toggle on={settings.autoFire} label="Auto-fire" onClick={() => set("autoFire", !settings.autoFire)} />
              <Toggle
                on={settings.autoReload}
                label="Auto reload when empty"
                onClick={() => set("autoReload", !settings.autoReload)}
              />
              <div className="space-y-1.5">
                <Row label="Enemy skill">
                  <Segmented
                    value={settings.botDifficulty}
                    options={[
                      ["recruit", "Recruit"],
                      ["regular", "Regular"],
                      ["veteran", "Veteran"],
                      ["nightmare", "Nightmare"],
                    ] as const}
                    onSelect={(v) => set("botDifficulty", v)}
                  />
                </Row>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {BOT_PROFILES[settings.botDifficulty].blurb} Applies to enemies as they respawn.
                </p>
              </div>
              <Row label="Camera">
                <Segmented
                  value={settings.cameraView}
                  options={[
                    ["third", "Third person"],
                    ["first", "First person"],
                  ] as const}
                  onSelect={(v) => set("cameraView", v)}
                />
              </Row>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Third person shows the operative you picked. Aiming down sights drops to first
                person either way, so scopes still work.
              </p>
              <Row label="Sprint">
                <Segmented
                  value={settings.sprintMode}
                  options={[
                    ["hold", "Hold"],
                    ["toggle", "Toggle"],
                  ] as const}
                  onSelect={(v) => set("sprintMode", v)}
                />
              </Row>
              <Row label="Frost wall">
                <Segmented
                  value={settings.wallPlacement}
                  options={[
                    ["aim", "Aim & place"],
                    ["instant", "Instant drop"],
                  ] as const}
                  onSelect={(v) => set("wallPlacement", v)}
                />
              </Row>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Aim &amp; place shows a ghost wall you position first — tap the frost button (or fire) again to lock it in,
                right-click / Esc to cancel. Instant drop slams it onto the nearest surface next to you straight away.
              </p>
            </section>
          )}

          {tab === "keyboard" && (
            <section className="space-y-2">
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Click a binding, then press the key you want. Esc cancels.
              </p>
              {isNonQwertyLayout() && (
                <p className="text-[10px] leading-relaxed text-[var(--hud-accent)]">
                  Non-QWERTY layout detected — bindings keep their physical position and are labelled
                  with the characters printed on your keyboard.
                </p>
              )}
              {BIND_ACTIONS.map((action) => (
                <div key={action} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {BIND_LABELS[action]}
                  </span>
                  <button
                    onClick={() => setRebinding(action)}
                    onKeyDown={captureKey(action)}
                    className={`min-w-[92px] rounded-md border px-3 py-1.5 text-[11px] font-bold tabular-nums transition ${
                      rebinding === action
                        ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/20 text-foreground"
                        : "border-border bg-background/60 text-foreground"
                    }`}
                  >
                    {rebinding === action ? "Press a key…" : layoutKeyLabel(settings.keybinds[action])}
                  </button>
                </div>
              ))}
              <button
                onClick={() => onChange({ ...settings, keybinds: defaultBinds() })}
                className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition hover:bg-secondary"
              >
                Reset keybinds
              </button>
            </section>
          )}

          {tab === "controls" && (
            <section className="space-y-4">
              <Toggle
                on={settings.showTouchControls}
                label="Touch controls"
                onClick={() => set("showTouchControls", !settings.showTouchControls)}
              />
              <ControlsEditor settings={settings} onChange={onChange} />
            </section>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => onChange(defaultSettings())}
            className="flex-1 rounded-lg border border-border bg-card px-3 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition hover:bg-secondary"
          >
            Reset all
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-[var(--hud-accent)] px-3 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--hud-accent-foreground)] transition hover:brightness-110"
          >
            Back to match
          </button>
        </div>
      </div>
    </div>
  );
}

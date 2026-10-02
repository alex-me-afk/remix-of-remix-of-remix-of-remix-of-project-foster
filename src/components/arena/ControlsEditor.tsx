import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, RotateCcw } from "lucide-react";

import TouchControls from "./TouchControls";
import { CONTROL_IDS, CONTROL_LABELS, type ArenaSettings, type ControlId } from "./settings";

type Props = {
  settings: ArenaSettings;
  onChange: (next: ArenaSettings) => void;
};

/**
 * In-place HUD layout editor: a live, scaled-down preview of the touch HUD that
 * can be dragged around, plus inline size / visibility controls for whichever
 * button is currently selected. Works outside a match too.
 */
export default function ControlsEditor({ settings, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [selected, setSelected] = useState<ControlId>("fire");

  useEffect(() => {
    const measure = () => {
      const el = boxRef.current;
      if (!el) return;
      const reference = Math.max(window.innerWidth, 900);
      setScale(Math.max(0.2, el.clientWidth / reference));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const setControl = (id: ControlId, patch: Partial<ArenaSettings["controls"][ControlId]>) =>
    onChange({ ...settings, controls: { ...settings.controls, [id]: { ...settings.controls[id], ...patch } } });

  const moveControl = (id: ControlId, dx: number, dy: number) => setControl(id, { dx, dy });

  const current = settings.controls[selected];

  const nudge = (dx: number, dy: number) =>
    setControl(selected, { dx: current.dx + dx, dy: current.dy + dy });

  return (
    <div className="space-y-3">
      <div
        ref={boxRef}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-[radial-gradient(circle_at_50%_20%,oklch(0.32_0.03_255),oklch(0.16_0.02_260))]"
      >
        <TouchControls
          settings={settings}
          editing
          hideEditHint
          selected={selected}
          onSelectControl={setSelected}
          onMoveControl={moveControl}
          scale={scale}
          press={() => {}}
          release={() => {}}
          onShootStart={() => {}}
          onShootEnd={() => {}}
          onScopeToggle={() => {}}
          scoped={false}
          onJump={() => {}}
          onReload={() => {}}
          onCrouchToggle={() => {}}
          crouch={false}
          onProneToggle={() => {}}
          prone={false}
          kits={2}
          onHeal={() => {}}
          bombs={3}
          onThrowBomb={() => {}}
          walls={2}
          onThrowWall={() => {}}
          slots={[]}
          onDropWeapon={() => {}}
        />
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white">
          Drag a button to move it
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {CONTROL_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className={`rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
              selected === id
                ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/25 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary"
            } ${settings.controls[id].hidden ? "line-through opacity-60" : ""}`}
          >
            {CONTROL_LABELS[id]}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border/70 bg-background/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">
            {CONTROL_LABELS[selected]}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setControl(selected, { hidden: !current.hidden })}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] transition ${
                current.hidden
                  ? "border-destructive bg-destructive/20 text-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {current.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {current.hidden ? "Hidden" : "Visible"}
            </button>
            <button
              onClick={() => setControl(selected, { dx: 0, dy: 0, scale: 1 })}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground transition hover:bg-secondary"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Size
            <span className="tabular-nums text-[var(--hud-accent)]">{Math.round(current.scale * 100)}%</span>
          </span>
          <input
            aria-label={`${CONTROL_LABELS[selected]} size`}
            type="range"
            min={60}
            max={180}
            step={5}
            value={current.scale * 100}
            onChange={(e) => setControl(selected, { scale: Number(e.target.value) / 100 })}
            className="mt-2 h-2.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-[var(--hud-accent)]"
          />
        </label>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {([
            ["◀", -16, 0],
            ["▶", 16, 0],
            ["▲", 0, -16],
            ["▼", 0, 16],
          ] as const).map(([glyph, dx, dy]) => (
            <button
              key={glyph}
              aria-label={`Nudge ${CONTROL_LABELS[selected]} ${glyph}`}
              onClick={() => nudge(dx, dy)}
              className="rounded-lg border border-border bg-card py-2.5 text-sm text-foreground transition hover:bg-secondary active:scale-95"
            >
              {glyph}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

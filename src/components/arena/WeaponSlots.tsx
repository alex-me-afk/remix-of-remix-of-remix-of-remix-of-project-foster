import { familyOf, type AmmoPools } from "./ammoFamily";
import { getWeapon } from "./weapons";
import fistIcon from "@/assets/hud/fist.png";

type Props = {
  /** [heavy 1, heavy 2, sidearm, fists] — nulls render as empty slots */
  slots: (string | null)[];
  activeSlot: number;
  onSelect: (index: number) => void;
  /** Magazines only. The spare rounds behind them are shared per calibre, so they live in `pool`. */
  ammo?: Record<string, { mag: number }>;
  /** The five shared reserves. A gun's `/N` is its FAMILY's pool, not its own private stack. */
  pool?: AmmoPools;
};

/**
 * Free Fire–style 2x2 weapon box.
 * Four large tap targets: two primaries on top, sidearm + melee below.
 * The active cell shows a red border, big mag count and reserve.
 */
export default function WeaponSlots({ slots, activeSlot, onSelect, ammo, pool }: Props) {
  const cell = (index: number, opts?: { melee?: boolean }) => {
    const id = slots[index] ?? null;
    const w = getWeapon(id);
    const active = index === activeSlot;
    const mag = w && ammo?.[w.id]?.mag;
    const fam = w ? familyOf(w.id) : null;
    const reserve = fam && pool ? pool[fam] : null;
    const hasAmmo = mag != null && reserve != null;
    const isMelee = Boolean(opts?.melee);

    return (
      <button
        key={index}
        type="button"
        // pointerdown (not click) so the slot still swaps while another finger
        // is holding the movement stick
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect(index);
        }}
        onContextMenu={(e) => e.preventDefault()}
        disabled={!w && !isMelee}
        aria-label={w ? `Select ${w.name}` : isMelee ? "Select melee" : "Empty weapon slot"}
        className={`pointer-events-auto relative h-[68px] w-[104px] touch-none overflow-hidden transition-transform duration-100 active:scale-[0.97] sm:h-[76px] sm:w-[120px] ${
          active ? "z-10" : "z-0"
        } ${!w && !isMelee ? "opacity-40" : ""}`}
      >
        {/* plate */}
        <div
          className={`absolute inset-0 ${
            active
              ? "bg-gradient-to-br from-[#ff4d3d]/20 via-black/80 to-black/90"
              : "bg-black/55"
          }`}
        />
        {/* border */}
        <div
          className={`absolute inset-0 ${
            active
              ? "border-2 border-[#ff4d3d] shadow-[inset_0_0_20px_-6px_rgba(255,77,61,0.6)]"
              : "border border-white/15"
          }`}
        />
        {/* slot number */}
        <span
          className={`absolute left-0 top-0 px-1.5 py-0.5 text-[9px] font-black leading-none ${
            active ? "bg-[#ff4d3d] text-white" : "bg-white/15 text-white/70"
          }`}
        >
          {index + 1}
        </span>

        {isMelee ? (
          <img
            src={fistIcon}
            alt=""
            width={512}
            height={512}
            loading="lazy"
            className="absolute inset-0 m-auto h-8 w-8 object-contain opacity-90 [filter:invert(1)]"
          />
        ) : w ? (
          <>
            <img
              src={w.image}
              alt={w.name}
              width={512}
              height={512}
              loading="lazy"
              className="absolute inset-x-2 top-2 h-8 w-[calc(100%-16px)] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]"
            />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-1.5 pb-1">
              <span className="text-[18px] font-black tabular-nums leading-none text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {hasAmmo ? mag : "—"}
              </span>
              <span className="mb-[3px] text-[10px] font-bold tabular-nums text-white/70">
                {hasAmmo ? `/${reserve}` : ""}
              </span>
            </div>
            {active && hasAmmo && mag === 0 ? (
              <span className="absolute inset-x-0 bottom-1 text-center text-[9px] font-bold uppercase tracking-widest text-[#ff4d3d]">
                Reload
              </span>
            ) : null}
          </>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[8px] uppercase tracking-widest text-white/40">
            Empty
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 sm:right-4 sm:top-4">
      <div className="grid grid-cols-2 gap-[3px] rounded-sm bg-white/10 p-[3px] backdrop-blur-sm">
        {cell(0)}
        {cell(1)}
        {cell(2)}
        {cell(3, { melee: true })}
      </div>
    </div>
  );
}

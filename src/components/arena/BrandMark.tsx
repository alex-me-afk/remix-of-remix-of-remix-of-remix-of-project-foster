/** Ironhowl wordmark — thin tracking, amber rule, used across splash and lobby. */
export default function BrandMark({ size = "lg" }: { size?: "sm" | "lg" }) {
  const big = size === "lg";
  return (
    <div className="flex flex-col items-center">
      <p
        className={`font-black uppercase leading-none text-foreground ${
          big ? "text-5xl tracking-[0.22em] sm:text-7xl" : "text-2xl tracking-[0.3em]"
        }`}
        style={{ textShadow: "0 0 32px color-mix(in oklab, var(--hud-accent) 45%, transparent)" }}
      >
        Iron<span className="text-[var(--hud-accent)]">howl</span>
      </p>
      <div
        className={`mt-3 h-px w-full ${big ? "max-w-[22rem]" : "max-w-[10rem]"}`}
        style={{ background: "var(--gradient-hud)", opacity: 0.8 }}
      />
      <p
        className={`mt-3 uppercase text-muted-foreground ${
          big ? "text-[11px] tracking-[0.6em]" : "text-[9px] tracking-[0.45em]"
        }`}
      >
        Frostline Arena
      </p>
    </div>
  );
}

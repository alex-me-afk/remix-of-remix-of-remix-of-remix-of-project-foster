import { Users, X } from "lucide-react";

import { MAP_LIST, type MapId } from "./maps";
import keyArt from "@/assets/splash-key-art.jpg";
import outpostCard from "@/assets/map-outpost-card.jpg";
import islandCard from "@/assets/map-island-card.jpg";
import whiteoutCard from "@/assets/map-whiteout-card.jpg";
import friendIslandCard from "@/assets/map-friend-island-card.jpg";

const CARD_ART: Record<MapId, string> = {
  frostline: keyArt,
  outpost: outpostCard,
  island: islandCard,
  ice: whiteoutCard,
  "friend-island": friendIslandCard,
};

type Props = {
  onSelect: (id: MapId) => void;
  onClose: () => void;
};

export default function MapSelect({ onSelect, onClose }: Props) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-md">
      <div className="w-full max-w-3xl rounded-3xl border border-border/60 bg-card/70 p-6 shadow-[var(--shadow-hud)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.35em] text-foreground">Select mode</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              Pick a map to deploy into
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mode select"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 text-foreground transition hover:bg-card active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {MAP_LIST.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className="group overflow-hidden rounded-2xl border border-border/60 bg-background/40 text-left transition hover:border-[var(--hud-accent)]/70 active:scale-[0.98]"
            >
              <div className="relative h-36 w-full overflow-hidden">
                <img
                  src={CARD_ART[m.id]}
                  alt={`${m.name} map preview`}
                  loading="lazy"
                  width={1024}
                  height={640}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(4,7,12,0.92),transparent_70%)]" />
                <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.25em] text-foreground backdrop-blur">
                  <Users className="h-3 w-3 text-[var(--hud-accent)]" />
                  {m.mode}
                </span>
              </div>
              <div className="p-4">
                <p className="text-[12px] font-black uppercase tracking-[0.28em] text-foreground">{m.name}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{m.tagline}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

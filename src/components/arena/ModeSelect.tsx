/**
 * Pre-match mode selector.
 *
 * Replaces the old map-only picker with a full lobby where the player picks
 * a game mode, ranked/casual, and a compatible map before deploying.
 */

import { useState } from "react";
import { Download, Users, X, Trophy, Swords, Map as MapIcon, PartyPopper } from "lucide-react";

import { MAP_LIST, type MapId } from "./maps";
import { downloadMap, useMapDownload } from "./mapDownloads";
import { MODES, MATCH_TYPES, MODE_IDS, DEFAULT_MODE, DEFAULT_MATCH_TYPE, type GameMode, type MatchType } from "./modes";
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

const MODE_ICONS: Record<GameMode, typeof Swords> = {
  fangDuel: Swords,
  ironclash: Users,
  lastHowl: MapIcon,
  hangout: PartyPopper,
};

type Props = {
  onDeploy: (mode: GameMode, type: MatchType, mapId: MapId) => void;
  onClose: () => void;
};

export default function ModeSelect({ onDeploy, onClose }: Props) {
  const [mode, setMode] = useState<GameMode>("hangout");
  const [matchType, setMatchType] = useState<MatchType>(DEFAULT_MATCH_TYPE);
  const modeInfo = MODES[mode];
  const availableMaps = MAP_LIST.filter((m) => modeInfo.maps.includes(m.id));
  const [mapId, setMapId] = useState<MapId>(availableMaps[0]?.id ?? "frostline");

  const selectedMap = MAP_LIST.find((m) => m.id === mapId)!;
  const selectedReady = useMapDownload(mapId).status === "ready";

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-md sm:p-6">
      <div className="flex w-full max-w-4xl flex-col gap-5 rounded-3xl border border-border/60 bg-card/70 p-5 shadow-[var(--shadow-hud)] sm:p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.35em] text-foreground">Select mode</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              Choose how you want to play
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

        {/* mode tabs */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {MODE_IDS.map((id) => {
            const info = MODES[id];
            const Icon = MODE_ICONS[id];
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                disabled={!info.live}
                onClick={() => {
                  setMode(id);
                  const maps = MAP_LIST.filter((m) => info.maps.includes(m.id));
                  if (!info.maps.includes(mapId)) setMapId(maps[0]?.id ?? "frostline");
                }}
                className={`relative rounded-2xl border px-3 py-3 text-left transition sm:px-4 sm:py-4 ${
                  active
                    ? "border-[var(--hud-accent)]/70 bg-[var(--hud-accent)]/10"
                    : "border-border/60 bg-background/40 hover:border-[var(--hud-accent)]/40"
                } ${!info.live ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${active ? "text-[var(--hud-accent)]" : "text-white/60"}`} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
                    {info.name}
                  </span>
                </div>
                <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground sm:text-[10px]">
                  {info.blurb}
                </p>
                {!info.live && (
                  <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/60">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ranked toggle */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/40 p-3 sm:p-4">
          {( ["casual", "ranked"] as MatchType[] ).map((type) => {
            const active = matchType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setMatchType(type)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] transition sm:text-[11px] ${
                  active
                    ? "bg-[var(--hud-accent)] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)]"
                    : "text-muted-foreground hover:bg-card/60"
                }`}
              >
                {type === "ranked" && <Trophy className="h-4 w-4" />}
                {MATCH_TYPES[type].name}
              </button>
            );
          })}
          <p className="hidden max-w-[16rem] text-[9px] leading-relaxed text-muted-foreground sm:block">
            {MATCH_TYPES[matchType].blurb}
          </p>
        </div>

        {/* map cards */}
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">Map</p>
          <div className={`grid gap-3 ${availableMaps.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {availableMaps.map((m) => (
              <div key={m.id} className="relative">
              <button
                type="button"
                onClick={() => setMapId(m.id)}
                className={`group overflow-hidden rounded-2xl border text-left transition active:scale-[0.98] ${
                  mapId === m.id
                    ? "border-[var(--hud-accent)]/70 ring-1 ring-[var(--hud-accent)]/30"
                    : "border-border/60 bg-background/40 hover:border-[var(--hud-accent)]/40"
                }`}
              >
                <div className="relative h-28 w-full overflow-hidden sm:h-32">
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
                    {modeInfo.players}
                  </span>
                </div>
                <div className="p-3 sm:p-4">
                  <p className="text-[12px] font-black uppercase tracking-[0.28em] text-foreground">{m.name}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{m.tagline}</p>
                </div>
              </button>
                <MapDownloadOverlay id={m.id} />
              </div>
            ))}
          </div>
        </div>

        {/* deploy */}
        <button
          type="button"
          disabled={!modeInfo.live || !selectedReady}
          onClick={() => onDeploy(mode, matchType, mapId)}
          className="w-full rounded-2xl bg-[var(--hud-accent)] py-3.5 text-sm font-black uppercase tracking-[0.35em] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
        >
          Select · {modeInfo.name} · {MATCH_TYPES[matchType].name} · {selectedMap.name}
        </button>
      </div>
    </div>
  );
}


/** Covers a map card until that map has been downloaded. */
function MapDownloadOverlay({ id }: { id: MapId }) {
  const dl = useMapDownload(id);
  if (dl.status === "ready") return null;
  const busy = dl.status === "downloading";
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background/75 backdrop-blur-sm">
      <button
        type="button"
        disabled={busy}
        onClick={() => void downloadMap(id)}
        className="flex items-center gap-2 rounded-xl bg-[var(--hud-accent)] px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.25em] text-[var(--hud-accent-foreground)] shadow-[var(--shadow-hud)] transition active:scale-95 disabled:opacity-80"
      >
        <Download className="h-4 w-4" />
        {busy ? `Downloading ${Math.round(dl.progress * 100)}%` : "Download map"}
      </button>
      {busy && (
        <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-border/60">
          <div className="h-full bg-[var(--hud-accent)] transition-[width]" style={{ width: `${dl.progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Check, X, Lock, Unlock } from "lucide-react";

import OperativeViewer from "./OperativeViewer";
import BannerArt from "./BannerArt";
import { CHARACTERS, hexCss, type ArenaCharacter } from "./characters";
import { POWERS } from "./powers";
import { POWER_ICON } from "./icons";
import { type PlayerProfile, isCharacterUnlocked } from "./playerProfile";
import { playUiClick, playUiSelect, speakLobbyGreeting } from "./sfx";

type Props = {
  selected: ArenaCharacter;
  profile: PlayerProfile;
  onSelect: (c: ArenaCharacter) => void;
  onClose: () => void;
};

export default function CharacterPicker({ selected, profile, onSelect, onClose }: Props) {
  const [preview, setPreview] = useState<ArenaCharacter>(selected);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-md">
      <div className="flex h-full max-h-[42rem] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.4em] text-foreground">Operatives</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              Drag to turn · tap a name to preview
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-foreground transition hover:bg-card active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-4 p-5 sm:grid-cols-[1.1fr_1fr] sm:grid-rows-1">
          {/* preview */}
          <div className="relative min-h-[14rem] overflow-hidden rounded-2xl border border-border/50 bg-[radial-gradient(ellipse_at_50%_120%,color-mix(in_oklab,var(--hud-accent)_20%,transparent),transparent_65%)]">
            <OperativeViewer character={preview} className="h-full w-full" />
            <div className="pointer-events-none absolute bottom-4 left-5 right-5">
              <p className="text-lg font-black uppercase tracking-[0.25em] text-foreground">{preview.name}</p>
              <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">{preview.tagline}</p>
              <div
                className="mt-2 flex items-start gap-3 rounded-xl border bg-background/70 px-3 py-2 backdrop-blur"
                style={{ borderColor: hexCss(POWERS[preview.power].color) }}
              >
                <img
                  src={POWER_ICON[preview.power]}
                  alt=""
                  draggable={false}
                  className="mt-0.5 h-10 w-10 shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p
                    className="text-[10px] font-black uppercase tracking-[0.3em]"
                    style={{ color: hexCss(POWERS[preview.power].color) }}
                  >
                    {POWERS[preview.power].name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{POWERS[preview.power].blurb}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                    {POWERS[preview.power].duration}s · {POWERS[preview.power].cooldown}s cooldown
                  </p>
                </div>
              </div>
            </div>
            <p className="pointer-events-none absolute right-4 top-4 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              Drag to turn
            </p>
          </div>


          {/* roster */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {CHARACTERS.map((c) => {
                const active = c.id === preview.id;
                const unlocked = isCharacterUnlocked(profile, c);
                
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setPreview(c);
                      playUiClick("high");
                      speakLobbyGreeting(c.id);
                    }}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition active:scale-95 ${
                      active
                        ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/10"
                        : "border-border/50 bg-card/40 hover:bg-card/70"
                    } ${!unlocked ? "opacity-70" : ""}`}
                  >
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background/50"
                      style={{ borderColor: `${hexCss(c.color)}55`, boxShadow: `0 0 12px ${hexCss(c.color)}33` }}
                    >
                      <BannerArt
                        src={c.banner}
                        alt={c.name}
                        className="h-full w-full object-cover"
                        fallback={
                          <span
                            className="h-8 w-5 rounded-full"
                            style={{ background: hexCss(c.color), boxShadow: `0 0 12px ${hexCss(c.color)}66` }}
                          />
                        }
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
                        {c.name}
                      </span>
                      <span className="block truncate text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                        {unlocked ? c.tagline : "Locked"}
                      </span>
                    </span>
                    {c.id === selected.id ? (
                      <Check className="ml-auto h-4 w-4 text-[var(--hud-accent)]" />
                    ) : unlocked ? (
                      <Unlock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!isCharacterUnlocked(profile, preview)}
              onClick={() => {
                playUiSelect();
                onSelect(preview);
                onClose();
              }}
              className="h-12 shrink-0 rounded-2xl bg-[var(--hud-accent)] text-sm font-black uppercase tracking-[0.4em] text-[var(--hud-accent-foreground)] transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            >
              {isCharacterUnlocked(profile, preview)
                ? "Select"
                : "Locked"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

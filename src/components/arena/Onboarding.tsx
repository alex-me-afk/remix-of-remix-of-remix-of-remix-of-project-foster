import { useState } from "react";
import { Check, ChevronLeft, Lock, PartyPopper } from "lucide-react";

import OperativeViewer from "./OperativeViewer";
import BannerArt from "./BannerArt";
import { CHARACTERS, hexCss, type ArenaCharacter } from "./characters";
import { DANCE_STORE, DANCE_RARITY_COLORS, DANCE_RARITY_LABELS } from "./danceStore";
import { POWERS } from "./powers";
import { playUiClick, playUiSelect } from "./sfx";

type Props = {
  initialName: string;
  onDone: (choice: { name: string; character: ArenaCharacter; danceId: string }) => void;
};

/**
 * First-run setup: callsign -> one free operative (the rest stay locked) -> one free dance.
 * Every choice is permanent, so the last step reviews them before entering the lobby.
 */
export default function Onboarding({ initialName, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [character, setCharacter] = useState<ArenaCharacter>(CHARACTERS[0]!);
  const [danceId, setDanceId] = useState<string>(DANCE_STORE[0]!.id);

  const trimmed = name.trim();
  const nameOk = /^[A-Za-z0-9_ ]{3,16}$/.test(trimmed);
  const steps = ["Callsign", "Operative", "Dance"];

  const next = () => {
    playUiClick();
    setStep((s) => s + 1);
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-background/90 p-4 backdrop-blur-md">
      <div className="flex h-full max-h-[44rem] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/85 shadow-[var(--shadow-hud)]">
        {/* header + steps */}
        <div className="flex items-center gap-3 border-b border-border/50 px-6 py-4">
          {step > 0 && (
            <button aria-label="Back" onClick={() => setStep((s) => s - 1)} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <h2 className="text-xs font-bold uppercase tracking-[0.4em] text-foreground">Welcome, recruit</h2>
          <div className="ml-auto flex gap-2">
            {steps.map((s, i) => (
              <span
                key={s}
                className={`rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.25em] ${
                  i === step ? "bg-[var(--hud-accent)] text-[var(--hud-accent-foreground)]" : i < step ? "bg-[var(--hud-panel)] text-foreground" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {i + 1}. {s}
              </span>
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            <p className="text-sm text-muted-foreground">Pick the name other players will see.</p>
            <input
              autoFocus
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && nameOk && next()}
              className="w-full max-w-sm rounded-2xl border border-border bg-background/60 px-5 py-4 text-center text-lg font-bold tracking-wider text-foreground outline-none focus:border-[var(--hud-accent)]"
              placeholder="Your callsign"
            />
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">3-16 letters, numbers, spaces or _</p>
            <button
              disabled={!nameOk}
              onClick={next}
              className="h-12 w-full max-w-sm rounded-2xl bg-[var(--hud-accent)] text-sm font-black uppercase tracking-[0.4em] text-[var(--hud-accent-foreground)] transition hover:brightness-110 disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 md:flex-row">
            <div className="relative h-56 shrink-0 overflow-hidden rounded-2xl border border-border/60 md:h-auto md:flex-1">
              <OperativeViewer key={character.id} character={character} interactive className="h-full w-full" />
              <div className="absolute bottom-3 left-4">
                <p className="text-xl font-black uppercase tracking-[0.2em]" style={{ color: hexCss(character.color) }}>{character.name}</p>
                <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {character.tagline} · {POWERS[character.power]?.name ?? character.power}
                </p>
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-3 md:w-80">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                <Lock className="h-3 w-3" /> Choose one — the others will be locked
              </p>
              <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto">
                {CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      playUiClick();
                      setCharacter(c);
                    }}
                    className={`relative aspect-square overflow-hidden rounded-xl border-2 transition ${
                      c.id === character.id ? "border-[var(--hud-accent)]" : "border-transparent opacity-80 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: hexCss(c.color) + "33" }}
                  >
                    <BannerArt src={c.banner} alt={c.name} className="h-full w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-background/70 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-foreground">{c.name}</span>
                    {c.id === character.id && <Check className="absolute right-1 top-1 h-4 w-4 text-[var(--hud-accent)]" />}
                  </button>
                ))}
              </div>
              <button
                onClick={next}
                className="h-12 shrink-0 rounded-2xl bg-[var(--hud-accent)] text-sm font-black uppercase tracking-[0.4em] text-[var(--hud-accent-foreground)] transition hover:brightness-110"
              >
                Choose {character.name}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 md:flex-row">
            <div className="h-56 shrink-0 overflow-hidden rounded-2xl border border-border/60 md:h-auto md:flex-1">
              <OperativeViewer key={character.id} character={character} danceId={danceId} interactive className="h-full w-full" />
            </div>
            <div className="flex min-h-0 flex-col gap-3 md:w-80">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                <PartyPopper className="h-3 w-3" /> Pick one dance for free
              </p>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                {DANCE_STORE.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      playUiClick();
                      setDanceId(d.id);
                    }}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                      d.id === danceId ? "border-[var(--hud-accent)] bg-[var(--hud-panel)]/70" : "border-border/60 hover:bg-muted/30"
                    }`}
                  >
                    <span className="text-sm font-bold text-foreground">{d.label}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: DANCE_RARITY_COLORS[d.rarity] }}>
                      {DANCE_RARITY_LABELS[d.rarity]}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  playUiSelect();
                  onDone({ name: trimmed, character, danceId });
                }}
                className="h-12 shrink-0 rounded-2xl bg-[var(--hud-accent)] text-sm font-black uppercase tracking-[0.4em] text-[var(--hud-accent-foreground)] transition hover:brightness-110"
              >
                Enter lobby
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

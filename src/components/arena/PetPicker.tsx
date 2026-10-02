import { useState } from "react";
import { Check, X, Lock, Unlock, PawPrint } from "lucide-react";

import PetViewer from "./PetViewer";
import BannerArt from "./BannerArt";
import { PETS, PET_LIST, type PetId, isPetUnlocked, petPriceLabel } from "./pets";
import { type PlayerProfile } from "./playerProfile";
import { hexCss } from "./characters";

type Props = {
  selected: PetId;
  profile: PlayerProfile;
  onSelect: (id: PetId) => void;
  onClose: () => void;
};

export default function PetPicker({ selected, profile, onSelect, onClose }: Props) {
  const [preview, setPreview] = useState<PetId>(selected);

  const previewPet = PETS[preview];
  const unlocked = isPetUnlocked(profile, previewPet);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-md">
      <div className="flex h-full max-h-[42rem] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.4em] text-foreground">Companions</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              Pets grant a passive bonus during matches
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
            <PetViewer key={previewPet.id} pet={previewPet} className="absolute inset-0" />
            <div className="pointer-events-none absolute bottom-4 left-5 right-5">
              <p className="text-lg font-black uppercase tracking-[0.25em] text-foreground">{previewPet.name}</p>
              <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">{previewPet.species}</p>
              <div
                className="mt-2 rounded-xl border bg-background/70 px-3 py-2 backdrop-blur"
                style={{ borderColor: hexCss(previewPet.color) }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground">
                  {previewPet.ability.name}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{previewPet.ability.text}</p>
              </div>
            </div>
            <PawPrint className="pointer-events-none absolute right-4 top-4 h-4 w-4 text-muted-foreground" />
          </div>

          {/* roster */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {PET_LIST.map((pet) => {
                const active = pet.id === preview;
                const unlocked = isPetUnlocked(profile, pet);
                return (
                  <button
                    key={pet.id}
                    type="button"
                    onClick={() => setPreview(pet.id)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition active:scale-95 ${
                      active
                        ? "border-[var(--hud-accent)] bg-[var(--hud-accent)]/10"
                        : "border-border/50 bg-card/40 hover:bg-card/70"
                    } ${!unlocked ? "opacity-70" : ""}`}
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border"
                      style={{
                        borderColor: `${hexCss(pet.color)}55`,
                        background: `${hexCss(pet.color)}1f`,
                        boxShadow: `0 0 12px ${hexCss(pet.color)}44`,
                      }}
                    >
                      {/* Portrait lives in `public/`, so a pet with no art yet falls back to the
                          old colour pill rather than breaking the build. */}
                      <BannerArt
                        src={`/pets/${pet.id}.png`}
                        alt={pet.name}
                        className="h-full w-full object-contain"
                        fallback={
                          <span
                            className="h-6 w-3.5 rounded-full"
                            style={{ background: hexCss(pet.color) }}
                          />
                        }
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
                        {pet.name}
                      </span>
                      <span className="block truncate text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                        {unlocked ? pet.ability.name : petPriceLabel(pet)}
                      </span>
                    </span>
                    {pet.id === selected ? (
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
              disabled={!unlocked}
              onClick={() => {
                onSelect(preview);
                onClose();
              }}
              className="h-12 shrink-0 rounded-2xl bg-[var(--hud-accent)] text-sm font-black uppercase tracking-[0.4em] text-[var(--hud-accent-foreground)] transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            >
              {unlocked ? "Select companion" : petPriceLabel(previewPet)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

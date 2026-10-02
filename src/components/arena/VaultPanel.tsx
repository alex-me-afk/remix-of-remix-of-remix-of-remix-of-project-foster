import { X, Shirt, PawPrint, Zap, Gem } from "lucide-react";
import { WEAPON_SKINS, SKIN_RARITY_COLORS, rarityLabel, getSkin } from "./weaponSkins";
import { PASSIVE_SKILLS } from "./skills";
import { PETS } from "./pets";
import { type PlayerProfile } from "./playerProfile";
import { getWeapon } from "./weapons";
import { hexCss } from "./characters";

type Props = {
  profile: PlayerProfile;
  onClose: () => void;
};

export default function VaultPanel({ profile, onClose }: Props) {
  const skins = profile.ownedSkins.map(getSkin).filter(Boolean);
  const passives = profile.vault
    .filter((id) => id.startsWith("passive-"))
    .map((id) => PASSIVE_SKILLS[id.replace("passive-", "") as keyof typeof PASSIVE_SKILLS])
    .filter(Boolean);
  const pets = profile.vault
    .filter((id) => id.startsWith("pet-"))
    .map((id) => PETS[id.replace("pet-", "") as keyof typeof PETS])
    .filter(Boolean);

  return (
    <div className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-md">
      <div className="flex h-full max-h-[42rem] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.4em] text-foreground">Vault</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              Your inventory of skins, skills and pets
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

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* skins */}
          <Section icon={Shirt} title="Weapon skins" count={skins.length}>
            {skins.length === 0 ? (
              <Empty message="No weapon skins yet. Earn them from the store or rewards." />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {skins.map((s) => {
                  const w = getWeapon(s!.weaponId);
                  const rarityColor = SKIN_RARITY_COLORS[s!.rarity];
                  return (
                    <div
                      key={s!.id}
                      className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-3"
                    >
                      <div
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                        style={{ background: `${hexCss(rarityColor)}20`, color: hexCss(rarityColor) }}
                      >
                        <Gem className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-foreground">
                          {s!.name}
                        </p>
                        <p className="truncate text-[9px] uppercase tracking-widest text-muted-foreground">
                          {w?.name} · {rarityLabel(s!.rarity)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* passives */}
          <Section icon={Zap} title="Passive skills" count={passives.length}>
            {passives.length === 0 ? (
              <Empty message="No passive skill tokens yet. Unlock them by playing matches." />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {passives.map((p) => (
                  <div
                    key={p!.id}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-3"
                  >
                    <div
                      className="h-10 w-10 shrink-0 rounded-lg"
                      style={{ background: hexCss(p!.color), boxShadow: `0 0 12px ${hexCss(p!.color)}66` }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-foreground">{p!.name}</p>
                      <p className="truncate text-[9px] uppercase tracking-widest text-muted-foreground">{p!.blurb}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* pets */}
          <Section icon={PawPrint} title="Pet companions" count={pets.length}>
            {pets.length === 0 ? (
              <Empty message="No pet companions yet. Unlock them by playing matches." />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {pets.map((p) => (
                  <div
                    key={p!.id}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-3"
                  >
                    <div
                      className="h-10 w-10 shrink-0 rounded-full"
                      style={{ background: hexCss(p!.color), boxShadow: `0 0 12px ${hexCss(p!.color)}66` }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-foreground">{p!.name}</p>
                      <p className="truncate text-[9px] uppercase tracking-widest text-muted-foreground">{p!.blurb}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Shirt;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--hud-accent)]" />
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-foreground">{title}</p>
        <span className="ml-auto rounded-full bg-card/60 px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-4 text-center">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{message}</p>
    </div>
  );
}

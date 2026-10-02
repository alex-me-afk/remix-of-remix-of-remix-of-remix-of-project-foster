/**
 * Lobby social scaffolding — team roster, friends rail and chat.
 *
 * There is no backend / database yet, so this is deliberately UI-only: the
 * team is a local party list (just YOU until invites exist), the friends list
 * is empty with an "add friend" affordance, and chat is a non-sending stub with
 * World / Team / Friends tabs. It exists to polish the lobby and to lock in the
 * shape the real networked version will slot into later.
 */

import { useState } from "react";
import { UserCircle, UserPlus, X, MessageSquare, Globe, Users, User } from "lucide-react";

import type { GameMode } from "./modes";
import { variantLabel } from "./modes";

export type PartyMember = { id: string; name: string; you?: boolean };

/** A single roster tile — either a filled member or an empty invite slot. */
function RosterTile({ member, onInvite }: { member: PartyMember | null; onInvite: () => void }) {
  if (!member) {
    return (
      <button
        type="button"
        onClick={onInvite}
        className="flex w-16 flex-col items-center gap-1 rounded-xl border border-dashed border-border/60 bg-card/30 px-1 py-2 text-muted-foreground backdrop-blur-md transition hover:border-[var(--hud-accent)]/50 hover:text-[var(--hud-accent)]"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-current">
          <UserPlus className="h-4 w-4" />
        </div>
        <span className="text-[8px] font-bold uppercase tracking-widest">Invite</span>
      </button>
    );
  }
  return (
    <div
      className={`flex w-16 flex-col items-center gap-1 rounded-xl border px-1 py-2 backdrop-blur-md ${
        member.you ? "border-[var(--hud-accent)]/70 bg-[var(--hud-accent)]/10" : "border-border/60 bg-card/60"
      }`}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--hud-accent)]/15 text-[var(--hud-accent)]">
        <UserCircle className="h-5 w-5" />
      </div>
      <span className="max-w-full truncate text-[8px] font-bold uppercase tracking-widest text-foreground">
        {member.you ? "You" : member.name}
      </span>
    </div>
  );
}

/**
 * Team roster that flanks the lobby character instead of stacking over its
 * nameplate: the seats are split evenly to the left and right of centre (2 + 2
 * for a 4-stack), leaving the middle clear for the operative and its name.
 */
export function TeamRoster({
  members,
  maxTeam,
  mode,
  variant,
  onInvite,
}: {
  members: PartyMember[];
  maxTeam: number;
  mode: GameMode;
  variant: number;
  onInvite: () => void;
}) {
  // Solo formats have no team — nothing to show.
  if (maxTeam <= 1) return null;
  // One slot per seat: real members first, then empty invite slots.
  const slots: (PartyMember | null)[] = [
    ...members,
    ...Array.from({ length: Math.max(0, maxTeam - members.length) }, () => null),
  ];
  const half = Math.ceil(slots.length / 2);
  const left = slots.slice(0, half);
  const right = slots.slice(half);

  return (
    <>
      <span className="pointer-events-none absolute bottom-[22%] left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-0.5 text-[8px] font-bold uppercase tracking-[0.3em] text-white/70 backdrop-blur">
        {variantLabel(mode, variant)} · Team {members.length}/{maxTeam}
      </span>
      {/* left flank — seats sit to the left of the character */}
      <div className="pointer-events-auto absolute bottom-[14%] left-1/2 flex -translate-x-[calc(100%+7rem)] items-end gap-2">
        {left.map((m, i) => (
          <RosterTile key={m?.id ?? `l-empty-${i}`} member={m} onInvite={onInvite} />
        ))}
      </div>
      {/* right flank — seats sit to the right of the character */}
      <div className="pointer-events-auto absolute bottom-[14%] left-1/2 flex translate-x-[7rem] items-end gap-2">
        {right.map((m, i) => (
          <RosterTile key={m?.id ?? `r-empty-${i}`} member={m} onInvite={onInvite} />
        ))}
      </div>
    </>
  );
}

/** Right-side slide-in friends list. Empty for now, with an add-friend field stub. */
export function FriendsPanel({ onClose, onInvite }: { onClose: () => void; onInvite: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="absolute inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xs flex-col border-l border-border/60 bg-card/95 p-5 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-foreground">Friends</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close friends"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 text-foreground transition hover:bg-card active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add friend by name"
            className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-[var(--hud-accent)]/60 focus:outline-none"
          />
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              if (name.trim()) {
                onInvite(name.trim());
                setName("");
              }
            }}
            className="flex items-center justify-center rounded-lg bg-[var(--hud-accent)] px-3 text-[var(--hud-accent-foreground)] transition hover:brightness-110 disabled:opacity-40"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Users className="h-8 w-8 opacity-40" />
          <p className="text-[10px] uppercase tracking-[0.25em]">No friends online</p>
          <p className="max-w-[14rem] text-[9px] leading-relaxed opacity-70">
            Friends and invites go live with online play. For now this is a preview of where your squad list will live.
          </p>
        </div>
      </div>
    </div>
  );
}

type ChatTab = "world" | "team" | "friends";

/** Left-side chat window with World / Team / Friends tabs. Non-sending stub. */
export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<ChatTab>("world");
  const [draft, setDraft] = useState("");
  const tabs: { id: ChatTab; label: string; icon: typeof Globe }[] = [
    { id: "world", label: "World", icon: Globe },
    { id: "team", label: "Team", icon: Users },
    { id: "friends", label: "Friends", icon: User },
  ];
  return (
    <div className="absolute inset-0 z-50 flex bg-background/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-sm flex-col border-r border-border/60 bg-card/95 p-5 shadow-[var(--shadow-hud)]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-foreground">Chat</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 text-foreground transition hover:bg-card active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-1 rounded-xl border border-border/60 bg-background/40 p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[9px] font-bold uppercase tracking-[0.2em] transition ${
                  active ? "bg-[var(--hud-accent)] text-[var(--hud-accent-foreground)]" : "text-muted-foreground hover:bg-card/60"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 opacity-40" />
          <p className="text-[10px] uppercase tracking-[0.25em]">{tab} chat</p>
          <p className="max-w-[16rem] text-[9px] leading-relaxed opacity-70">
            Messaging turns on with online play. This is a preview of the {tab} channel.
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${tab}…`}
            className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-[var(--hud-accent)]/60 focus:outline-none"
          />
          <button
            type="button"
            disabled
            className="rounded-lg bg-[var(--hud-accent)] px-4 text-[10px] font-bold uppercase tracking-widest text-[var(--hud-accent-foreground)] opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

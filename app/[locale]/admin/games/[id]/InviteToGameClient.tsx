'use client';

import { useMemo, useState } from 'react';
import {
  addExistingPlayerToGame,
  inviteEmailToGame,
} from './inviteToGameActions';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Candidate = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  hcpIndex: number;
};

type Props = {
  gameId: string;
  candidates: Candidate[];
  disabled: boolean;
};

function displayName(c: Candidate): string {
  const base = c.name ?? c.email;
  return c.nickname ? `${base} «${c.nickname}»` : base;
}

/**
 * Klient-komponenten for invite-card-en. Eier kun lokal-state for søk og
 * e-post-input; selve add/invite-handlingene går via server-actions bundet
 * til formene under. Begge actions returnerer void og redirecter — vi
 * trenger ingen useTransition eller optimistic state-håndtering.
 */
export function InviteToGameClient({ gameId, candidates, disabled }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates.slice(0, 25);
    return candidates.filter((c) => {
      const hay = `${c.name ?? ''} ${c.nickname ?? ''} ${c.email}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 25);
  }, [candidates, search]);

  const addAction = addExistingPlayerToGame.bind(null, gameId);
  const inviteAction = inviteEmailToGame.bind(null, gameId);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Velg fra registrerte
        </h3>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søk i registrerte brukere…"
          disabled={disabled}
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-text placeholder-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
          aria-label="Søk i registrerte brukere"
        />
        {candidates.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Alle registrerte spillere er allerede på rosteren.
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Ingen treff på «{search}».
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {displayName(c)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted">
                    HCP {c.hcpIndex.toFixed(1)}
                  </p>
                </div>
                <form action={addAction}>
                  <input type="hidden" name="recipient_user_id" value={c.id} />
                  <SubmitButton
                    disabled={disabled}
                    className="px-4 py-2 text-sm"
                    pendingLabel="Inviterer …"
                  >
                    + Legg til
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-muted">
          eller
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div>
        <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Inviter ny spiller på e-post
        </h3>
        <form action={inviteAction} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            name="email"
            required
            placeholder="eksempel@gmail.no"
            disabled={disabled}
            className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-text placeholder-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            aria-label="E-post"
          />
          <SubmitButton
            disabled={disabled}
            className="px-4 py-3"
            pendingLabel="Sender …"
          >
            Send invitasjon
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

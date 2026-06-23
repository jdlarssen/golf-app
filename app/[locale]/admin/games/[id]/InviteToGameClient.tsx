'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  addExistingPlayerToGame,
  inviteEmailToGame,
} from './inviteToGameActions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import {
  filterRosterCandidates,
  rosterDisplayName,
  type RosterCandidate,
} from '@/lib/games/rosterCandidates';

type Candidate = RosterCandidate & { hcpIndex: number };

type Props = {
  gameId: string;
  candidates: Candidate[];
  disabled: boolean;
};

/**
 * Klient-komponenten for invite-card-en. Eier kun lokal-state for søk og
 * e-post-input; selve add/invite-handlingene går via server-actions bundet
 * til formene under. Begge actions returnerer void og redirecter — vi
 * trenger ingen useTransition eller optimistic state-håndtering.
 */
export function InviteToGameClient({ gameId, candidates, disabled }: Props) {
  const t = useTranslations('admin.game.invite');
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () => filterRosterCandidates(candidates, search),
    [candidates, search],
  );

  const addAction = addExistingPlayerToGame.bind(null, gameId);
  const inviteAction = inviteEmailToGame.bind(null, gameId);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {t('registeredHeading')}
        </h3>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          disabled={disabled}
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-text placeholder-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
          aria-label={t('searchAriaLabel')}
        />
        {candidates.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {t('allOnRoster')}
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {t('noResults', { query: search })}
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
                    {rosterDisplayName(c)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted">
                    HCP {c.hcpIndex.toFixed(1)}
                  </p>
                </div>
                <form action={addAction} className="shrink-0">
                  <input type="hidden" name="recipient_user_id" value={c.id} />
                  <SubmitButton
                    disabled={disabled}
                    className="whitespace-nowrap px-4 py-2 text-sm"
                    pendingLabel={t('addingBusy')}
                  >
                    {t('addButton')}
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
          {t('orSeparator')}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div>
        <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {t('emailHeading')}
        </h3>
        <form action={inviteAction} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            name="email"
            required
            placeholder={t('emailPlaceholder')}
            disabled={disabled}
            className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-text placeholder-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            aria-label={t('emailAriaLabel')}
          />
          <SubmitButton
            disabled={disabled}
            className="px-4 py-3"
            pendingLabel={t('sendingBusy')}
          >
            {t('sendInviteButton')}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

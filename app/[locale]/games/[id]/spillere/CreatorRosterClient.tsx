'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';
import {
  addExistingPlayerToGame,
  inviteEmailToGame,
} from '@/app/[locale]/admin/games/[id]/inviteToGameActions';
import {
  filterRosterCandidates,
  rosterDisplayName,
  type RosterCandidate,
} from '@/lib/games/rosterCandidates';

type Props = {
  gameId: string;
  candidates: RosterCandidate[];
  disabled: boolean;
};

/**
 * Creator-facing roster picker (#429). Mirrors the admin InviteToGameClient,
 * but the candidate list is the creator's own co-player network
 * (getTeamCandidates, #362) rather than every registered user — the same
 * privacy model as team signup. People outside that network are reached via
 * the e-post field. Both forms bind the shared server actions (now open to
 * creators) which redirect, so no local transition state is needed.
 */
export function CreatorRosterClient({ gameId, candidates, disabled }: Props) {
  const t = useTranslations('game.players');
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () => filterRosterCandidates(candidates, search),
    [candidates, search],
  );

  const addAction = addExistingPlayerToGame.bind(null, gameId);
  const inviteAction = inviteEmailToGame.bind(null, gameId);

  return (
    <div className="space-y-5">
      {candidates.length > 0 && (
        <div>
          <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('rosterSearch')}
          </h3>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('rosterSearchPlaceholder')}
            disabled={disabled}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-text placeholder-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            aria-label={t('rosterSearchAriaLabel')}
          />
          {filtered.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t('rosterNoResults', { query: search })}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {filtered.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg px-3 py-2.5"
                >
                  <p className="min-w-0 truncate text-sm font-medium text-text">
                    {rosterDisplayName(c)}
                  </p>
                  <form action={addAction}>
                    <input type="hidden" name="recipient_user_id" value={c.id} />
                    <SubmitButton
                      disabled={disabled}
                      pendingLabel={t('rosterAddPending')}
                      className="min-h-[44px] rounded-full bg-primary px-4 py-2 text-sm font-medium tracking-tight text-white transition-colors hover:bg-primary-hover disabled:opacity-50 dark:text-bg"
                    >
                      {t('rosterAddButton')}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-muted">
            {t('rosterOr')}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      <div>
        <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {t('inviteByEmail')}
        </h3>
        <form action={inviteAction} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            name="email"
            required
            placeholder={t('inviteEmailPlaceholder')}
            disabled={disabled}
            className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-text placeholder-muted/70 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            aria-label={t('inviteEmailAriaLabel')}
          />
          <SubmitButton
            disabled={disabled}
            pendingLabel={t('invitePending')}
            className="min-h-[44px] rounded-full bg-primary px-4 py-3 font-medium tracking-tight text-white transition-colors hover:bg-primary-hover disabled:opacity-50 dark:text-bg"
          >
            {t('inviteButton')}
          </SubmitButton>
        </form>
        <p className="mt-2 text-xs text-muted">
          {t('inviteHint')}
        </p>
      </div>
    </div>
  );
}

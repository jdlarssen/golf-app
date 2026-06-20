'use client';

import { useActionState, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { addLeaguePlayers, type LeagueActionError } from '@/lib/league/actions';
import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';

type Props = {
  leagueId: string;
  players: PlayerOption[];
  participantIds: Set<string>;
  /** #483: klubb-liga → kilden er klubbmedlemmer (ellers vennene dine). */
  isClubLeague?: boolean;
};

const INITIAL: LeagueActionError = { error: '' };

function preferredName(p: PlayerOption, unknownLabel: string): string {
  return p.nickname?.trim() || p.name?.trim() || unknownLabel;
}

export function LigaAddPlayers({ leagueId, players, participantIds, isClubLeague }: Props) {
  const t = useTranslations('liga.addPlayers');

  const [state, formAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      addLeaguePlayers(formData) as Promise<LeagueActionError>,
    INITIAL,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const eligible = players.filter((p) => !participantIds.has(p.id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (eligible.length === 0) {
    // #483: klubb-liga sourcer fra klubbmedlemmer; ellers (#464) fra vennene dine.
    if (isClubLeague) {
      return (
        <p className="font-sans text-[12px] text-muted">
          {players.length === 0
            ? t('noClubMembersYet')
            : t('allClubMembersAdded')}
        </p>
      );
    }
    // Skill «ingen venner ennå» (vis lenke til vennegrafen) fra «alle er med».
    return players.length === 0 ? (
      <p className="font-sans text-[12px] text-muted">
        {t('noFriendsYet')}{' '}
        <Link href="/profile/venner" className="text-primary underline">
          {t('addFriendsLink')}
        </Link>{' '}
        {t('addFriendsSuffix')}
      </p>
    ) : (
      <p className="font-sans text-[12px] text-muted">
        {t('allFriendsAdded')}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="league_id" value={leagueId} />
      <input
        type="hidden"
        name="player_ids"
        value={JSON.stringify(Array.from(selectedIds))}
      />

      <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
        {eligible.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-transparent px-3 py-2 hover:border-border hover:bg-bg min-h-[44px]">
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggle(p.id)}
                className="accent-primary"
              />
              <span className="flex-1 min-w-0">
                <span className="block font-sans text-[14px] text-text truncate">
                  {preferredName(p, t('unknownPlayer'))}
                  {p.pending && (
                    <span className="ml-1.5 font-sans text-[10px] text-muted">{t('pendingLabel')}</span>
                  )}
                </span>
                <span className="block font-sans text-[11px] tabular-nums text-muted">
                  hcp {Number(p.hcp_index).toFixed(1)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {(() => {
        const error = state.error
          ? (['missing', 'players', 'players_failed'] as const).includes(
              state.error as 'missing' | 'players' | 'players_failed',
            )
            ? t(`errors.${state.error as 'missing' | 'players' | 'players_failed'}`)
            : t('errors.fallback')
          : null;
        return error ? (
          <p className="font-sans text-[12px] text-danger">{error}</p>
        ) : null;
      })()}

      <SubmitButton
        variant="secondary"
        className="w-full text-sm min-h-[44px]"
        disabled={selectedIds.size === 0}
        pendingLabel={t('addPending')}
      >
        {selectedIds.size > 0
          ? t('addButton', { count: selectedIds.size })
          : t('addButtonEmpty')}
      </SubmitButton>
    </form>
  );
}

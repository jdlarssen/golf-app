'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { removeLeaguePlayer, type LeagueActionError } from '@/lib/league/actions';

type Props = {
  leagueId: string;
  userId: string;
};

const INITIAL: LeagueActionError = { error: '' };

export function LigaRemovePlayer({ leagueId, userId }: Props) {
  const t = useTranslations('liga.removePlayer');

  const [state, formAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      removeLeaguePlayer(formData) as Promise<LeagueActionError>,
    INITIAL,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="league_id" value={leagueId} />
      <input type="hidden" name="user_id" value={userId} />
      {state.error && state.error !== '' && (
        <span className="font-sans text-[11px] text-danger mr-1">{state.error}</span>
      )}
      <SubmitButton
        variant="ghost"
        className="text-danger text-[12px] px-2 py-1 min-h-[44px] rounded-lg"
        pendingLabel={t('removePending')}
      >
        {t('removeButton')}
      </SubmitButton>
    </form>
  );
}

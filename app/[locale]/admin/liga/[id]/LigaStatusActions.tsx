'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Banner } from '@/components/ui/Banner';
import { startLeague, finishLeague, type LeagueActionError } from '@/lib/league/actions';

type Props = {
  leagueId: string;
  status: 'draft' | 'active' | 'finished';
  canStart: boolean;
  canFinish: boolean;
  startHint?: string;
};

const INITIAL: LeagueActionError = { error: '' };

export function LigaStatusActions({ leagueId, status, canStart, canFinish, startHint }: Props) {
  const t = useTranslations('liga.statusActions');

  const [startState, startAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      startLeague(formData) as Promise<LeagueActionError>,
    INITIAL,
  );
  const [finishState, finishAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      finishLeague(formData) as Promise<LeagueActionError>,
    INITIAL,
  );

  return (
    <div className="space-y-3">
      {status === 'draft' && (
        <>
          {startHint && !canStart && (
            <Banner tone="info">{startHint}</Banner>
          )}
          {startState.error && startState.error !== '' && (
            <Banner tone="error">{t('startError')}</Banner>
          )}
          <form action={startAction}>
            <input type="hidden" name="league_id" value={leagueId} />
            <SubmitButton
              className="w-full"
              disabled={!canStart}
              pendingLabel={t('startPending')}
            >
              {t('startButton')}
            </SubmitButton>
          </form>
        </>
      )}

      {status === 'active' && (
        <>
          {finishState.error && finishState.error !== '' && (
            <Banner tone="error">{t('finishError')}</Banner>
          )}
          <form action={finishAction}>
            <input type="hidden" name="league_id" value={leagueId} />
            <SubmitButton
              className="w-full"
              disabled={!canFinish}
              pendingLabel={t('finishPending')}
            >
              {t('finishButton')}
            </SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}

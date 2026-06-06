'use client';

import { useActionState } from 'react';
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
            <Banner tone="error">Klarte ikke å starte ligaen.</Banner>
          )}
          <form action={startAction}>
            <input type="hidden" name="league_id" value={leagueId} />
            <SubmitButton
              className="w-full"
              disabled={!canStart}
              pendingLabel="Starter …"
            >
              Start ligaen
            </SubmitButton>
          </form>
        </>
      )}

      {status === 'active' && (
        <>
          {finishState.error && finishState.error !== '' && (
            <Banner tone="error">Klarte ikke å avslutte ligaen.</Banner>
          )}
          <form action={finishAction}>
            <input type="hidden" name="league_id" value={leagueId} />
            <SubmitButton
              className="w-full"
              disabled={!canFinish}
              pendingLabel="Avslutter …"
            >
              Avslutt ligaen
            </SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}

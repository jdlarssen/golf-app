import { getTranslations } from 'next-intl/server';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { startTournament, finishTournament } from '@/lib/cup/actions';

/**
 * «Cup-handlinger»-seksjonen på cup-styringsflata — start-/avslutt-skjemaene,
 * sidepoeng-gate-bannerne, uleverte-/feilede-kamp-grenene og slett-lenken.
 * Trukket ut av `CupManagement` for å holde komponentens cyclomatic complexity
 * nede; grenene her deler samme status-/gate-beslutning.
 */
export async function CupActionsSection({
  tournament,
  canStart,
  showStartHint,
  canFinish,
  sideAwardsRegistered,
  missingAwardsList,
  notSubmittedMatchesList,
  failedMatchesList,
  errorCode,
  deleteHref,
}: {
  tournament: { id: string; status: 'draft' | 'active' | 'finished' };
  canStart: boolean;
  showStartHint: boolean;
  canFinish: boolean;
  sideAwardsRegistered: boolean;
  missingAwardsList: string;
  notSubmittedMatchesList: string;
  failedMatchesList: string;
  errorCode?: string;
  deleteHref: string;
}) {
  const t = await getTranslations('cup');

  return (
    <section className="space-y-3 mt-6">
      {tournament.status === 'draft' && (
        <>
          {showStartHint && (
            <Banner tone="info">
              {t('manage.startHint')}
            </Banner>
          )}
          <form action={startTournament}>
            <input type="hidden" name="id" value={tournament.id} />
            <SubmitButton className="w-full" disabled={!canStart} pendingLabel={t('manage.startPending')}>
              {t('manage.startButton')}
            </SubmitButton>
          </form>
        </>
      )}

      {tournament.status === 'active' && (
        <>
          {/* #1501: sidepoeng-gate — hint navngir hva som mangler; knappen
              er disabled til alt er registrert. */}
          {!sideAwardsRegistered && (
            <Banner tone="info" testId="cup-finish-gate-hint">
              {t('manage.finishSideAwardsHint', { awards: missingAwardsList })}
            </Banner>
          )}

          {/* #1501: uleverte kort — stopp med kampliste + «Avslutt likevel».
              Peer-godkjenning relaxes aldri; likevel-varianten kjører kun
              allowMissing per kamp. */}
          {errorCode === 'matches_not_submitted' && (
            <div className="space-y-3">
              <Banner tone="warning" testId="cup-finish-not-submitted">
                {t('manage.finishNotSubmitted', { matches: notSubmittedMatchesList })}
              </Banner>
              <form action={finishTournament} data-testid="cup-finish-anyway-form">
                <input type="hidden" name="id" value={tournament.id} />
                <input type="hidden" name="allow_missing" value="true" />
                <SubmitButton
                  className="w-full"
                  variant="secondary"
                  disabled={!sideAwardsRegistered}
                  data-testid="cup-finish-anyway"
                  pendingLabel={t('manage.finishAnywayPending')}
                >
                  {t('manage.finishAnywayButton')}
                </SubmitButton>
              </form>
            </div>
          )}

          {/* #1501: en kamp lot seg ikke avslutte — cupen står, re-trykk er
              trygt. Banneret navngir de gjenværende aktive kampene. */}
          {errorCode === 'match_finish_failed' && (
            <Banner tone="error" testId="cup-finish-failed">
              {t('manage.finishFailed', { matches: failedMatchesList })}
            </Banner>
          )}

          <form action={finishTournament} data-testid="cup-finish-form">
            <input type="hidden" name="id" value={tournament.id} />
            <SubmitButton
              className="w-full"
              disabled={!canFinish}
              data-testid="cup-finish-submit"
              pendingLabel={t('manage.finishPending')}
            >
              {t('manage.finishButton')}
            </SubmitButton>
          </form>
        </>
      )}

      <SmartLink
        href={deleteHref}
        className="block text-center text-xs text-danger underline-offset-2 hover:underline pt-2"
      >
        {t('manage.deleteLink')}
      </SmartLink>
    </section>
  );
}

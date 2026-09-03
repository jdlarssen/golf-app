'use client';

import { startTransition, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import {
  setFourballWithdrawalChoice,
  type CupWithdrawalError,
} from '@/lib/cup/withdrawalActions';

type Props = {
  tournamentId: string;
  gameId: string;
  /** Arrangørens registrerte valg akkurat nå. */
  playOn: boolean;
  /** Hvem som står igjen alene på den trukne siden. */
  partnerName: string;
};

const INITIAL_STATE: CupWithdrawalError = { error: '' };

/**
 * «Makkeren spiller alene»-valget på et fourball-kort i cup-styringen (#1814,
 * eierbeslutning E4).
 *
 * Makkeren bestemmer i praksis, men det er ARRANGØREN som registrerer valget —
 * og hen kan snu det helt fram til kampen starter. Panelet står derfor åpent på
 * kortet (ikke bak en knapp som byttet): finnes det et trekk i en fourball, ER
 * det et valg som venter, og et skjult valg er et valg ingen tar.
 *
 * Foursomes, greensome, chapman og gruesome deler ball og har ingen
 * alene-variant — `CupMatchList` monterer dette kun for fourball.
 */
export function FourballPlayOnPanel({
  tournamentId,
  gameId,
  playOn,
  partnerName,
}: Props) {
  const t = useTranslations('cup');

  const [state, dispatch, isPending] = useActionState(
    async (_prev: CupWithdrawalError, formData: FormData) =>
      setFourballWithdrawalChoice(formData),
    INITIAL_STATE,
  );

  const errorMessage = (() => {
    if (!state.error) return null;
    const key = `manage.errors.${state.error}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('manage.errors.withdraw_failed');
  })();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return (
    <div className="mt-3 space-y-2" data-testid={`cup-playon-panel-${gameId}`}>
      {errorMessage && (
        <Banner tone="error" testId={`cup-playon-error-${gameId}`}>
          {errorMessage}
        </Banner>
      )}
      <p className="font-sans text-[12px] text-muted">
        {t('withdraw.playOnLegend', { partner: partnerName })}
      </p>
      <form onSubmit={submit}>
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="game_id" value={gameId} />
        {/* Én knapp som slår valget den andre veien — to radio-knapper og en
            lagre-knapp ville vært tre trykk for én bit informasjon. */}
        <input type="hidden" name="play_on" value={playOn ? '0' : '1'} />
        <Button
          type="submit"
          variant="secondary"
          pending={isPending}
          pendingLabel={t('withdraw.withdrawPending')}
          data-testid={`cup-playon-toggle-${gameId}`}
          className="text-sm"
        >
          {playOn
            ? t('withdraw.playOnNo')
            : t('withdraw.playOnYes', { partner: partnerName })}
        </Button>
      </form>
    </div>
  );
}

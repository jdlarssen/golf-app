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
  /**
   * Ingen har tatt valget ennå (`mode_config.withdrawal_play_on` mangler helt).
   * Da vises begge svarene som hver sin knapp — en enslig veksleknapp kunne
   * bare sende «spiller alene», så venter-banneret var umulig å besvare med
   * regelen.
   */
  choicePending: boolean;
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
 * Har ingen svart ennå, står begge svarene som hver sin knapp. Er valget tatt,
 * er det én knapp som slår det andre veien.
 *
 * Foursomes, greensome, chapman og gruesome deler ball og har ingen
 * alene-variant — `CupMatchList` monterer dette kun for fourball.
 */
export function FourballPlayOnPanel({
  tournamentId,
  gameId,
  playOn,
  choicePending,
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

  /** Ett svar = ett skjema. Knappens `kind` bærer test-id-en. */
  function choiceForm(value: '0' | '1', label: string, kind: 'yes' | 'no' | 'toggle') {
    return (
      <form onSubmit={submit}>
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="game_id" value={gameId} />
        <input type="hidden" name="play_on" value={value} />
        <Button
          type="submit"
          variant="secondary"
          pending={isPending}
          pendingLabel={t('withdraw.withdrawPending')}
          data-testid={`cup-playon-${kind}-${gameId}`}
          className="text-sm"
        >
          {label}
        </Button>
      </form>
    );
  }

  return (
    // `id`-en er hoppmålet for venter-banneret øverst på cup-styringen (#1814).
    <div
      id={`playon-${gameId}`}
      className="mt-3 scroll-mt-4 space-y-2"
      data-testid={`cup-playon-panel-${gameId}`}
    >
      {errorMessage && (
        <Banner tone="error" testId={`cup-playon-error-${gameId}`}>
          {errorMessage}
        </Banner>
      )}
      <p className="font-sans text-[12px] text-muted">
        {t('withdraw.playOnLegend', { partner: partnerName })}
      </p>
      {choicePending ? (
        // Ingen har svart ennå: begge svarene må være ett trykk unna. Med bare
        // veksleknappen under kunne arrangøren kun sende «spiller alene» —
        // «etter regelen» var det samme som å la være, og banneret ble stående.
        <div className="flex flex-wrap gap-2">
          {choiceForm('1', t('withdraw.playOnYes', { partner: partnerName }), 'yes')}
          {choiceForm('0', t('withdraw.playOnNo'), 'no')}
        </div>
      ) : (
        // Valget er tatt: én knapp som slår det andre veien — to knapper der
        // den ene bekrefter det som allerede gjelder er én knapp for mye.
        choiceForm(
          playOn ? '0' : '1',
          playOn
            ? t('withdraw.playOnNo')
            : t('withdraw.playOnYes', { partner: partnerName }),
          'toggle',
        )
      )}
    </div>
  );
}

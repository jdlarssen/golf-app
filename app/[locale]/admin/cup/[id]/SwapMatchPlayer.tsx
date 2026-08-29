'use client';

import { startTransition, useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { swapCupMatchPlayer, type CupActionError } from '@/lib/cup/actions';
import { MAX_PERSONAL_CUP_PLAYERS } from '@/lib/cup/limits';

/** Én valgbar spiller i byttet — `label` er ferdig formatert av serveren. */
export type SwapPlayerOption = { userId: string; label: string };

type Props = {
  tournamentId: string;
  /** Matchen arrangøren trykket på; server-action-en løser bunten selv. */
  gameId: string;
  /** Spillerne i bunten — den som melder forfall velges her. */
  outOptions: SwapPlayerOption[];
  /** Påmeldte som IKKE er i bunten fra før — reserven som går inn. */
  inOptions: SwapPlayerOption[];
};

const INITIAL_STATE: CupActionError = { error: '' };

const SELECT_CLASSES =
  'w-full min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text';

/**
 * «Bytt spiller» på et match-kort i cup-styringen (#1473). Vises kun på
 * matcher som ennå ikke er startet — etter start er handicapene frosset og
 * byttet er et annet problem (walkover, utenfor scope).
 *
 * Skjult bak en knapp: de fleste kampene byttes aldri, og to nedtrekk per
 * kort ville druknet kamplista. Feil kommer tilbake som `{ error }` (#1397-
 * mønsteret) og rendres i panelet — en redirect ville unmontert valgene.
 * Suksess redirecter server-side, og server-komponenten monterer denne på
 * nytt med ferske lister, så et gammelt feilbanner aldri henger igjen.
 */
export function SwapMatchPlayer({
  tournamentId,
  gameId,
  outOptions,
  inOptions,
}: Props) {
  const t = useTranslations('cup.swap');
  const [open, setOpen] = useState(false);

  const [state, dispatch, isPending] = useActionState(
    async (_prev: CupActionError, formData: FormData) =>
      swapCupMatchPlayer(formData),
    INITIAL_STATE,
  );

  const errorMessage = (() => {
    if (!state.error) return null;
    // `too_many_players`-strengen har en {cap}-plass; capet er regelens ene
    // hjem (lib/cup/limits), ikke en tekst-hardkodet 24 (samme grep som
    // CupParticipantsList).
    if (state.error === 'too_many_players') {
      return t('errors.too_many_players', { cap: MAX_PERSONAL_CUP_PLAYERS });
    }
    const key = `errors.${state.error}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('errors.unexpected', { code: state.error });
  })();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  }

  if (outOptions.length === 0) return null;

  if (!open) {
    return (
      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          data-testid={`cup-swap-open-${gameId}`}
          className="text-sm"
        >
          {t('openButton')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3" data-testid={`cup-swap-panel-${gameId}`}>
      {errorMessage && (
        <Banner tone="error" testId={`cup-swap-error-${gameId}`}>
          {errorMessage}
        </Banner>
      )}

      {inOptions.length === 0 ? (
        <>
          <p className="text-sm text-muted">{t('noReserves')}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            className="text-sm"
          >
            {t('cancelButton')}
          </Button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <input type="hidden" name="game_id" value={gameId} />

          <label className="block">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {t('outLabel')}
            </span>
            <select
              name="out_user_id"
              defaultValue={outOptions[0].userId}
              data-testid={`cup-swap-out-${gameId}`}
              className={`mt-1 ${SELECT_CLASSES}`}
            >
              {outOptions.map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {t('inLabel')}
            </span>
            <select
              name="in_user_id"
              defaultValue={inOptions[0].userId}
              data-testid={`cup-swap-in-${gameId}`}
              className={`mt-1 ${SELECT_CLASSES}`}
            >
              {inOptions.map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <Button
              type="submit"
              pending={isPending}
              pendingLabel={t('submitPending')}
              data-testid={`cup-swap-submit-${gameId}`}
              className="text-sm"
            >
              {t('submitButton')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setOpen(false)}
              className="text-sm"
            >
              {t('cancelButton')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

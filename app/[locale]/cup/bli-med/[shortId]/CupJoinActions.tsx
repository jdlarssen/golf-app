'use client';

import { startTransition, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { MAX_PERSONAL_CUP_PLAYERS } from '@/lib/cup/limits';
import { joinCup, leaveCup, type CupJoinActionError } from './actions';

const INITIAL_STATE: CupJoinActionError = { error: '' };

/**
 * Knappen på spillerens bli-med-side (#1490) — «Meld meg på» eller «Meld meg av»
 * avhengig av `mode`.
 *
 * `useActionState` + `startTransition` framfor en ren `action`-form: en vellykket
 * handling redirecter server-side, mens en avvist én returnerer `{ error }` som
 * skal rendres HER (#1397 — en form-redirect ville unmontert komponenten før
 * banneret fikk vises). Server-siden er fasit for hvilken knapp som finnes;
 * dette er bare måten svaret kommer tilbake på.
 */
export function CupJoinActions({
  shortId,
  mode,
}: {
  shortId: string;
  mode: 'join' | 'leave';
}) {
  const t = useTranslations('cup.join');

  const [state, dispatch, isPending] = useActionState(
    async (_prev: CupJoinActionError, formData: FormData) =>
      mode === 'leave' ? leaveCup(formData) : joinCup(formData),
    INITIAL_STATE,
  );

  const errorMessage = (() => {
    if (!state.error) return null;
    // Taket bor i lib/cup/limits (#526) — teksten interpolerer det, den
    // gjentar det ikke.
    if (state.error === 'full') {
      return t('errors.full', { cap: MAX_PERSONAL_CUP_PLAYERS });
    }
    const key = `errors.${state.error}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('errors.unexpected', { code: state.error });
  })();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <Banner tone="error" testId="cup-join-error">
          {errorMessage}
        </Banner>
      )}
      <form onSubmit={submit}>
        <input type="hidden" name="short_id" value={shortId} />
        <Button
          type="submit"
          variant={mode === 'leave' ? 'secondary' : 'primary'}
          disabled={isPending}
          className="w-full"
          data-testid={mode === 'leave' ? 'cup-join-leave' : 'cup-join-submit'}
        >
          {mode === 'leave' ? t('leaveButton') : t('joinButton')}
        </Button>
      </form>
    </div>
  );
}

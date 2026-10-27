'use client';

import { startTransition, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { joinLeagueByCode, type LeagueJoinActionError } from './actions';

const INITIAL_STATE: LeagueJoinActionError = { error: '' };

/**
 * «Bli med» on the shareable league link (#2662). Same shape as the cup's
 * `CupJoinActions`: a successful join redirects server-side, while a refused
 * one returns `{ error }` that is rendered HERE (#1397: a form redirect would
 * unmount the component before the banner could show).
 */
export function LeagueJoinActions({ code }: { code: string }) {
  const t = useTranslations('liga.join');

  const [state, dispatch, isPending] = useActionState(
    async (_prev: LeagueJoinActionError, formData: FormData) => joinLeagueByCode(formData),
    INITIAL_STATE,
  );

  const errorMessage = (() => {
    if (!state.error) return null;
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
        <Banner tone="error" testId="liga-join-error">
          {errorMessage}
        </Banner>
      )}
      <form onSubmit={submit}>
        <input type="hidden" name="code" value={code} />
        <Button
          type="submit"
          disabled={isPending}
          className="w-full"
          data-testid="liga-join-submit"
        >
          {t('joinButton')}
        </Button>
      </form>
    </div>
  );
}

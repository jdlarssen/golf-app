'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { addLeagueRound, type LeagueActionError } from '@/lib/league/actions';

const INITIAL: LeagueActionError = { error: '' };

/**
 * Manual "add round" control — complements the frequency-generated rounds and
 * is the way to populate a 'custom' frequency league. Course/tee inherit from
 * the league per scope; refine the tee on the round afterwards.
 */
export function LigaAddRound({ leagueId }: { leagueId: string }) {
  const t = useTranslations('liga.addRound');

  const [state, action] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      addLeagueRound(formData) as Promise<LeagueActionError>,
    INITIAL,
  );

  const errorKey = state.error as keyof ReturnType<typeof useTranslations<'liga.addRound'>> | '';
  const error = state.error
    ? (['missing', 'window', 'not_found', 'insert_failed'] as const).includes(
        state.error as 'missing' | 'window' | 'not_found' | 'insert_failed',
      )
      ? t(`errors.${state.error as 'missing' | 'window' | 'not_found' | 'insert_failed'}`)
      : t('errors.fallback')
    : null;
  void errorKey;

  return (
    <details className="rounded-xl border border-dashed border-border bg-surface/50 p-4">
      <summary className="cursor-pointer font-sans text-[13px] font-medium text-primary list-none">
        {t('summaryLabel')}
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="league_id" value={leagueId} />
        <div>
          <label className="block font-sans text-[12px] font-medium text-text mb-1">
            {t('nameLabel')}
          </label>
          <input
            type="text"
            name="label"
            maxLength={80}
            placeholder={t('namePlaceholder')}
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
          />
        </div>
        {/* iOS: native datetime-local ignorerer width:100% og strekker seg
            utenfor kortet. appearance-none + min-w-0 (på input + grid-cell)
            krymper kontrollen til containeren (samme fiks som #453). */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block font-sans text-[12px] font-medium text-text mb-1">
              {t('opensLabel')}
            </label>
            <input
              type="datetime-local"
              name="opens_at"
              required
              className="w-full min-w-0 appearance-none rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>
          <div className="min-w-0">
            <label className="block font-sans text-[12px] font-medium text-text mb-1">
              {t('closesLabel')}
            </label>
            <input
              type="datetime-local"
              name="closes_at"
              required
              className="w-full min-w-0 appearance-none rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>
        </div>
        {error && <p className="font-sans text-[12px] text-danger">{error}</p>}
        <SubmitButton variant="secondary" className="text-sm px-4 py-2 min-h-[44px]" pendingLabel={t('addPending')}>
          {t('addButton')}
        </SubmitButton>
      </form>
    </details>
  );
}

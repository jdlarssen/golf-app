import { getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import type { DeliveryCounts } from '@/lib/games/organizerDesk';
import { ElapsedPill } from './ElapsedPill';

/**
 * The desk's green header (#2268): back arrow, the elapsed-time pill, the
 * kicker, the game's name and «Levert scorekort X av Y» with its bar. Full
 * bleed like `TopBar` (`-mx-5 -mt-8` cancels `AdminShell`'s padding), so it
 * must be the first element on the page.
 */
export async function PultHeader({
  gameName,
  counts,
  startedAt,
  renderedAt,
}: {
  gameName: string;
  counts: DeliveryCounts;
  startedAt: string | null;
  renderedAt: string;
}) {
  const t = await getTranslations('admin.game.pult');
  const pct = counts.total === 0 ? 0 : Math.round((counts.submitted / counts.total) * 100);

  return (
    <header
      data-testid="pult-header"
      data-focus-surface="strong"
      className="-mx-5 -mt-8 bg-surface-strong px-2 pt-2 pb-4 leading-[normal] text-on-strong"
    >
      <div className="flex items-center justify-between">
        <SmartLink
          href="/admin/games"
          aria-label={t('back')}
          className="flex size-11 items-center justify-center text-on-strong"
        >
          <svg
            aria-hidden
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </SmartLink>
        <ElapsedPill startedAt={startedAt} renderedAt={renderedAt} />
        <span aria-hidden className="w-11" />
      </div>
      <div className="px-3 pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-on-strong/80">
          {t('kicker')}
        </p>
        <h1 className="mt-0.5 font-serif text-[28px] font-medium">{gameName}</h1>
        <div
          data-testid="pult-delivered"
          data-submitted={counts.submitted}
          data-total={counts.total}
          className="mt-3 flex items-baseline justify-between"
        >
          <span className="text-[13px]">{t('deliveredLabel')}</span>
          <span className="font-serif text-[22px] font-semibold tabular-nums">
            {counts.submitted}{' '}
            <span className="text-[14px] font-medium text-on-strong/80">
              {t('deliveredOf', { total: counts.total })}
            </span>
          </span>
        </div>
        <div aria-hidden className="mt-1.5 h-2 rounded-full bg-on-strong/18">
          <div className="h-2 rounded-full bg-on-strong" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </header>
  );
}

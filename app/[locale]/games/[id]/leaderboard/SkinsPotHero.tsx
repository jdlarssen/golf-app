import type { JSX } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatListLocale } from '@/lib/i18n/format';
import type { SkinsPotNow } from '@/lib/leaderboard/skinsPot';

export interface SkinsPotHeroProps {
  gameName: string;
  scoring: 'gross' | 'net';
  /** From `skinsPotNow` (`lib/leaderboard/skinsPot.ts`). */
  pot: SkinsPotNow;
}

/**
 * The forest card on top of a live Skins board (#2317): how many skins are at
 * stake and on which hole, why the pot has grown, and whether the hole waits
 * for the rest of the scores. It replaces the «Leaderboard» title while the
 * round is on; a finished board keeps the title and has no card.
 */
export function SkinsPotHero({ gameName, scoring, pot }: SkinsPotHeroProps): JSX.Element {
  const t = useTranslations('leaderboard.skins');
  const tc = useTranslations('leaderboard.common');
  const locale = useLocale() as AppLocale;
  const kicker = [gameName, 'Skins', scoring === 'net' ? tc('netto') : tc('brutto')].join(' · ');

  return (
    <section
      data-testid="skins-pot-hero"
      data-focus-surface="strong"
      className="rounded-2xl bg-surface-strong px-5 pt-[18px] pb-5 text-on-strong"
    >
      <div className="flex items-center justify-between gap-3 text-xs font-semibold leading-[normal]">
        <span className="min-w-0 truncate text-on-strong/80">{kicker}</span>
        <span className="shrink-0">{tc('live')}</span>
      </div>
      <div className="mt-3.5 flex items-center gap-4">
        <CoinStack />
        <div className="min-w-0">
          {pot.kind === 'pending' ? (
            <>
              <h1>
                <span className="score-num block text-[34px] leading-none">
                  {t('skinCount', { count: pot.atStake })}
                </span>
                <span className="mt-1 block text-[14px] leading-[normal]">
                  {t('pot.onHole', { hole: pot.holeNumber })}
                </span>
              </h1>
              {pot.carriedFrom.length > 0 && (
                <p className="mt-0.5 text-xs leading-[normal] text-on-strong/80">
                  {t('pot.carriedFrom', {
                    holes: formatListLocale(pot.carriedFrom.map(String), locale),
                  })}
                </p>
              )}
              {pot.waiting && (
                <p className="mt-0.5 text-xs leading-[normal] text-on-strong/80">
                  {t('pot.waiting', { hole: pot.holeNumber })}
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="font-serif text-[22px] font-semibold leading-[1.1]">
                {t('pot.settled')}
              </h1>
              {pot.hanging > 0 && (
                <p className="mt-1 text-xs leading-[normal] text-on-strong/80">
                  {t('carriedNote', { count: pot.hanging })}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The artboard's stack of three coins. The rims take the deep gold, the faces
 * the gold that reads on the forest card, and the top face a linen sheen.
 */
function CoinStack(): JSX.Element {
  return (
    <svg width="74" height="64" viewBox="0 0 74 64" aria-hidden className="shrink-0">
      <ellipse cx="37" cy="54" rx="26" ry="7" className="fill-accent-deep" />
      <rect x="11" y="47" width="52" height="7" className="fill-accent-deep" />
      <ellipse cx="37" cy="47" rx="26" ry="7" className="fill-accent-on-strong" />
      <ellipse cx="37" cy="40" rx="26" ry="7" className="fill-accent-deep" />
      <rect x="11" y="33" width="52" height="7" className="fill-accent-deep" />
      <ellipse cx="37" cy="33" rx="26" ry="7" className="fill-accent-on-strong" />
      <ellipse cx="37" cy="26" rx="26" ry="7" className="fill-accent-deep" />
      <rect x="11" y="19" width="52" height="7" className="fill-accent-deep" />
      <ellipse cx="37" cy="19" rx="26" ry="7" className="fill-accent-on-strong" />
      <ellipse cx="37" cy="19" rx="26" ry="7" className="fill-on-strong" fillOpacity={0.3} />
    </svg>
  );
}

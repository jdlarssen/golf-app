import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Kicker } from '@/components/ui/Kicker';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { nameInitials } from '@/lib/names/initials';
import { coinRows, coinState, type CoinState } from '@/lib/leaderboard/skinsPot';
import type { SkinsHoleRow } from '@/lib/scoring/modes/types';
import type { SkinsPlayerInfo } from './SkinsView';

export interface SkinsCoinGridProps {
  holes: SkinsHoleRow[];
  /** The hole the pot stands on, or null when every hole is decided. */
  currentHoleNumber: number | null;
  playersById: Map<string, SkinsPlayerInfo>;
}

// Coins are not buttons, so the 44 px tap floor does not apply: nine 28 px
// coins fit a 390 px screen. Each coin is aria-hidden and carries its own
// sr-only sentence, so the legend is hidden too.
const COIN_CLASS: Record<CoinState, string> = {
  won: 'bg-surface-strong text-[9px] font-semibold text-on-strong',
  potWon:
    'bg-surface-strong text-[9px] font-semibold text-on-strong ring-[1.5px] ring-accent ring-offset-2 ring-offset-surface',
  carried: 'border-[1.5px] border-dashed border-dashed-cta text-[12px] text-muted',
  current: 'bg-accent-on-strong font-serif text-[13px] font-semibold text-on-accent',
  future: 'bg-meter-track',
};

const NUMBER_CLASS: Record<CoinState, string> = {
  won: 'text-muted',
  potWon: 'text-muted',
  carried: 'text-muted',
  current: 'font-semibold text-text',
  future: 'text-disabled-fg',
};

/**
 * «Hull for hull» on the Skins board (#2317): one coin per hole, nine to a
 * row. A won hole shows the winner's initials (a gold ring when the win took
 * a rolled-in pot), a halved hole a dashed coin with «→», the hole the pot
 * stands on a gold coin with the skins at stake, and later holes an empty disc.
 */
export function SkinsCoinGrid({
  holes,
  currentHoleNumber,
  playersById,
}: SkinsCoinGridProps): JSX.Element {
  const t = useTranslations('leaderboard.skins.coins');
  const tc = useTranslations('leaderboard.common');

  const winnerName = (userId: string | null): string => {
    const info = userId ? playersById.get(userId) : undefined;
    return info ? formatRevealName(info.name, info.nickname) : tc('unknownPlayerFull');
  };

  return (
    <section aria-labelledby="skins-coins-title" data-testid="skins-coins">
      <Kicker as="h2" id="skins-coins-title" className="px-1 pt-4 pb-2 leading-[normal]">
        {t('title')}
      </Kicker>
      <div className="rounded-2xl border border-border bg-surface px-2.5 py-3">
        {coinRows(holes).map((row, r) => (
          <ol key={row[0].holeNumber} className={`grid grid-cols-9 gap-1 text-center ${r > 0 ? 'mt-2.5' : ''}`}>
            {row.map((hole) => {
              const state = coinState(hole, currentHoleNumber);
              let face: string | null = null;
              let sentence: string;
              if (state === 'won' || state === 'potWon') {
                const info = hole.winnerUserId ? playersById.get(hole.winnerUserId) : undefined;
                face = nameInitials(info?.name);
                sentence = t('won', {
                  hole: hole.holeNumber,
                  name: winnerName(hole.winnerUserId),
                  count: hole.skinsAwarded,
                });
              } else if (state === 'carried') {
                sentence = t('carried', { hole: hole.holeNumber, count: hole.atStake });
              } else if (state === 'current') {
                face = String(hole.atStake);
                sentence = t('current', { hole: hole.holeNumber, count: hole.atStake });
              } else {
                sentence = t('future', { hole: hole.holeNumber });
              }
              return (
                <li key={hole.holeNumber} data-coin={state}>
                  <span aria-hidden className={`block text-[10px] leading-[normal] ${NUMBER_CLASS[state]}`}>
                    {hole.holeNumber}
                  </span>
                  <span
                    aria-hidden
                    className={`mx-auto mt-[3px] flex h-7 w-7 items-center justify-center rounded-full leading-none ${COIN_CLASS[state]}`}
                  >
                    {state === 'carried' ? <span className="font-[system-ui]">→</span> : face}
                  </span>
                  <span className="sr-only">{sentence}</span>
                </li>
              );
            })}
          </ol>
        ))}
        <p
          aria-hidden
          className="mt-3 flex flex-wrap justify-center gap-x-3.5 gap-y-1 text-[11px] leading-[normal] text-muted"
        >
          <span>{t('legendWon')}</span>
          <span>
            <span className="font-[system-ui]">→</span> {t('legendCarried')}
          </span>
          <span>{t('legendPot')}</span>
        </p>
      </div>
    </section>
  );
}

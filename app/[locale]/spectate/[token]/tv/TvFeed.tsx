'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { firstName } from '@/lib/firstName';
import type { LiveBoardRow } from '@/lib/leaderboard/liveBoard';
import type { TvFeedEvent } from '@/lib/leaderboard/tvBoard';
import { boardDisplayName } from '@/app/[locale]/games/[id]/leaderboard/boardText';

const KEY = {
  lead: 'feedLead',
  holeInOne: 'feedHoleInOne',
  albatross: 'feedAlbatross',
  eagle: 'feedEagle',
  birdie: 'feedBirdie',
} as const;

const bold = (chunks: ReactNode) => <span className="font-semibold">{chunks}</span>;

/** «Siste nytt» on the big screen (#2275): the events from `buildTvFeed`, newest first. */
export function TvFeed({ events, rows }: { events: TvFeedEvent[]; rows: LiveBoardRow[] }) {
  const ts = useTranslations('spectate.tv');
  const tc = useTranslations('leaderboard.common');
  const nameOf = (userId: string) => {
    const row = rows.find((r) => r.userId === userId);
    return row ? (firstName(row.name) ?? boardDisplayName(row, tc)) : '';
  };

  return (
    <section
      data-testid="tv-feed"
      className="flex grow flex-col gap-3.5 rounded-[18px] bg-tv-text/8 p-[18px]"
    >
      <h2 className="text-[12px] font-semibold tracking-[0.24em] text-tv-text/75 uppercase">
        {ts('feedTitle')}
      </h2>
      {events.length === 0 ? (
        <p className="text-[18px] leading-[1.35] text-tv-text/70">{ts('feedEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-3.5">
          {events.map((e, i) => (
            <li
              key={`${e.kind}-${'userId' in e ? e.userId : e.flight}-${'hole' in e ? e.hole : ''}`}
              data-kind={e.kind}
              className={`text-[18px] leading-[1.35] ${i > 0 ? 'border-t border-tv-text/15 pt-3' : ''}`}
            >
              {e.kind === 'flightDone'
                ? ts.rich('feedFlightDone', { flight: e.flight, b: bold })
                : ts.rich(KEY[e.kind], { name: nameOf(e.userId), hole: e.hole, b: bold })}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

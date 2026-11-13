'use client';

import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import type { StrokeTerm } from '@/lib/scorecard/scoreRail';

/**
 * «Ditt lag på hull N» (#2316), after the artboard the app is built on: the
 * scramble family says what the team hit («3 slag, birdie», gross), best ball
 * whose ball counted («Ballen til Kristian talte · netto 6, bogey», net).
 * Shamble and team stableford have no card. The numbers come ready from
 * `scrambleHoleCard` / `bestBallHoleCard` (`lib/leaderboard/teamLiveBoard.ts`).
 */
export type TeamHoleCardData =
  | { kind: 'scramble'; holeNumber: number; strokes: number; term: StrokeTerm; overPar: number }
  | {
      kind: 'bestBall';
      holeNumber: number;
      net: number;
      term: StrokeTerm;
      overPar: number;
      /** The names of the ball(s) that counted, as a list («Marte og Jonas»; «deg» for the viewer). */
      names: string;
    };

export function TeamHoleCard(card: TeamHoleCardData): JSX.Element {
  const tt = useTranslations('leaderboard.teamBoard');
  const th = useTranslations('holes');
  // The same words as the score rail on the hole page, in lower case inside a sentence.
  const term = th(`scoreRail.term.${card.term}`, { n: card.overPar }).toLowerCase();
  return (
    <section
      data-testid="team-hole-card"
      data-variant={card.kind}
      className="mt-3 rounded-2xl border border-border bg-surface px-3.5 py-3"
    >
      <h2 className="text-xs font-semibold text-muted">
        {tt('holeCardHeading', { hole: card.holeNumber })}
      </h2>
      <p className="mt-1.5 text-[14px] text-text">
        {card.kind === 'bestBall'
          ? tt.rich('bestBallBall', {
              names: card.names,
              b: (chunks) => <span className="font-semibold">{chunks}</span>,
            })
          : null}
        {card.kind === 'bestBall' ? ' · ' : null}
        {card.kind === 'bestBall'
          ? tt('bestBallScore', { net: card.net, term })
          : tt('scrambleScore', { strokes: card.strokes, term })}
      </p>
    </section>
  );
}

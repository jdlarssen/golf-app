import { useTranslations } from 'next-intl';
import { formatPoints } from '@/lib/cup/formatPoints';
import type { CupPlayerPointsRow } from '@/lib/cup/computeCupPlayerPoints';

/**
 * Per-spiller-poengregnskap på cup-resultatsiden (#1497). Ren, ikke-async
 * server-komponent — ingen `'use client'`, ingen klient-JS. Utbrettbare rader
 * bruker native `<details>` (husets mønster, reduced-motion-trygt).
 *
 * Spillertotalene summerer bevisst IKKE til lagtotalen: begge spillerne i et
 * par får hele sidens kamppoeng (Ryder Cup-full-kreditt, #1497). Aggregeringen
 * bor i `computeCupPlayerPoints` — her er det ren visning.
 */

// Champagne-tint for den innloggede deltakerens egen rad (samme palett som
// GOLD_CARD_STYLE på resultatsiden).
const OWN_ROW_STYLE = {
  background: 'linear-gradient(180deg, rgba(201, 169, 97, 0.12), rgba(201, 169, 97, 0.04))',
  borderColor: 'rgba(201, 169, 97, 0.45)',
} as const;

export type CupPlayerPointsGroup = {
  team: 1 | 2;
  teamName: string;
  rows: CupPlayerPointsRow[];
};

export function CupPlayerPoints({
  groups,
  currentUserId,
}: {
  groups: CupPlayerPointsGroup[];
  currentUserId: string | null;
}) {
  const t = useTranslations('cup');

  function contributionLabel(c: CupPlayerPointsRow['contributions'][number]): string {
    if (c.type === 'match') {
      return t(c.outcome === 'tied' ? 'results.tiedWith' : 'results.wonAgainst', {
        opponent: c.opponentLabel,
        points: formatPoints(c.points),
      });
    }
    return t('results.sideContribution', {
      kind: t(c.type === 'ctp' ? 'sideAwards.kindCtp' : 'sideAwards.kindLd'),
      hole: t('sideAwards.holeShort', { n: c.holeNumber }),
      points: formatPoints(c.points),
    });
  }

  return (
    <section className="mb-8" data-testid="cup-player-points">
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
        {t('results.playerPointsHeading')}
      </h2>
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.team}>
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted mb-2">
              {group.teamName}
            </h3>
            <ul className="space-y-2">
              {group.rows.map((row) => {
                const isMe = currentUserId != null && row.userId === currentUserId;
                const expandable = row.contributions.length > 0;

                const name = (
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-serif text-[15px] text-text">{row.displayName}</span>
                    {isMe && (
                      <span
                        className="ml-2 align-middle text-[11px] font-medium"
                        style={{ color: 'var(--accent-text)' }}
                      >
                        {t('results.yourPoints')}
                      </span>
                    )}
                  </span>
                );
                const points = (
                  <span className="shrink-0 font-serif text-base tabular-nums text-primary">
                    {formatPoints(row.points)}
                  </span>
                );

                return (
                  <li key={row.userId} data-testid="cup-player-row" data-userid={row.userId}>
                    {expandable ? (
                      <details
                        className="group rounded-2xl border bg-surface"
                        style={isMe ? OWN_ROW_STYLE : { borderColor: 'var(--border)' }}
                        data-testid={isMe ? 'cup-player-points-me' : undefined}
                      >
                        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                          {name}
                          {points}
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </summary>
                        <ul className="space-y-1 border-t border-border px-4 py-3">
                          {row.contributions.map((c, i) => (
                            <li key={i} className="text-xs text-muted tabular-nums">
                              {contributionLabel(c)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <div
                        className="flex min-h-[44px] items-center gap-3 rounded-2xl border bg-surface px-4 py-2.5"
                        style={isMe ? OWN_ROW_STYLE : { borderColor: 'var(--border)' }}
                        data-testid={isMe ? 'cup-player-points-me' : undefined}
                      >
                        {name}
                        {points}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

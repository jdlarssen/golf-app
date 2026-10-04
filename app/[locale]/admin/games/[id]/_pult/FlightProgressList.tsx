import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import type { HoleSegment } from '@/lib/scoring';
import type { FlightProgress } from '@/lib/games/organizerDesk';

/** A group from `flightProgress`, with its label already translated. */
export type FlightProgressRow = FlightProgress & { name: string };

/**
 * «Flightene» on the desk's «Live» tab (#2268): how far each group has come.
 * Where the text names a hole it is the real hole number, and the bar is the
 * position in the segment, so the two always agree (a back9 group on hole 12
 * reads «hull 12 · 3 av 9»). A shotgun group shows how many holes it has
 * played, since the order it plays them in is unknown.
 */
export async function FlightProgressList({
  groups,
  holeSegment,
}: {
  groups: readonly FlightProgressRow[];
  holeSegment: HoleSegment;
}) {
  if (groups.length === 0) return null;
  const t = await getTranslations('admin.game.pult');
  const tDetail = await getTranslations('admin.game.detail');
  const num = (chunks: ReactNode) => (
    <span className="font-serif font-semibold text-text">{chunks}</span>
  );

  return (
    <section data-testid="pult-flights" className="leading-[normal]">
      <h2 className="px-1 pt-[18px] pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('flightsHeading')}
      </h2>
      <ul className="divide-y divide-row-divider-warm overflow-hidden rounded-2xl border border-border bg-surface">
        {groups.map((g) => {
          const pct = g.allSubmitted ? 100 : Math.round((g.played / g.holeCount) * 100);
          let status: ReactNode;
          if (g.allSubmitted) {
            status = (
              <span className="text-[13px] font-semibold text-success-text">{t('allSubmitted')}</span>
            );
          } else if (g.played === 0) {
            status = <span className="text-[13px] text-muted">{tDetail('notStarted')}</span>;
          } else {
            status = (
              <span className="text-[13px] tabular-nums text-muted">
                {g.startType === 'shotgun' || g.maxHole == null
                  ? t.rich('holesPlayed', { played: g.played, count: g.holeCount, num })
                  : holeSegment === 'back9'
                    ? t.rich('holeOfSegment', {
                        hole: g.maxHole,
                        position: g.position,
                        count: g.holeCount,
                        num,
                      })
                    : t.rich('holeOf', { hole: g.maxHole, count: g.holeCount, num })}
              </span>
            );
          }
          return (
            <li
              key={g.name}
              data-testid="pult-flight-row"
              data-played={g.played}
              data-hole-count={g.holeCount}
              className="px-3.5 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold text-text">{g.name}</span>
                {status}
              </div>
              <div aria-hidden className="mt-2 h-1.5 rounded-full bg-meter-track">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

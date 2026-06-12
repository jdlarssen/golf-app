'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SegmentedField } from '@/components/ui/SegmentedField';
import { LeagueStandingsTable } from './LeagueStandingsTable';
import type { LeagueStandingsByScoring, StandingsMetric } from '@/lib/league/types';
import type { LeagueRoundView, LeagueParticipant } from '@/lib/league/getLigaSnapshot';

/**
 * Wraps the (presentational) standings table with the Netto/Brutto switch (#452
 * Fase 2a). When the league scores `both`, a segmented toggle flips between the
 * two parallel tables (default Netto). A net- or gross-only league shows a single
 * table — gross-only gets a small caption so the column isn't mistaken for net.
 */
export function LeagueStandingsPanel({
  standings,
  rounds,
  participants,
  standingsModel,
  bestNCount,
  pointsBased = false,
}: {
  standings: LeagueStandingsByScoring;
  rounds: LeagueRoundView[];
  participants: LeagueParticipant[];
  standingsModel: string;
  bestNCount: number | null;
  /** #452 Fase 4: stableford-formater viser rå poeng (ikke mot-par) i cellene. */
  pointsBased?: boolean;
}) {
  const t = useTranslations('liga.standings');
  const both = standings.net !== null && standings.gross !== null;
  const [metric, setMetric] = useState<StandingsMetric>(standings.net !== null ? 'net' : 'gross');

  const active = metric === 'gross' ? standings.gross : standings.net;
  const shown = active ?? standings.net ?? standings.gross;
  if (!shown) return null;

  return (
    <div>
      {both ? (
        <div className="mb-3">
          <SegmentedField
            legend={t('toggleLegend')}
            options={[
              { value: 'net', label: t('net') },
              { value: 'gross', label: t('gross') },
            ]}
            value={metric}
            onChange={(v) => setMetric(v as StandingsMetric)}
          />
        </div>
      ) : standings.gross !== null ? (
        <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {t('grossOnlyCaption')}
        </p>
      ) : null}

      <LeagueStandingsTable
        rows={shown.rows}
        rounds={rounds}
        participants={participants}
        standingsModel={standingsModel}
        bestNCount={bestNCount}
        pointsBased={pointsBased}
      />
    </div>
  );
}

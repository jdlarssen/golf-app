import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { formatPoints } from '@/lib/cup/formatPoints';
import type {
  CupSideAwardGirRow,
  CupSideAwardHoleGroup,
  CupSideAwardWinnerRow,
} from '@/lib/cup/sideAwardDetails';

/**
 * Sidepoengene hull for hull på cup-resultatsiden (#1496). Ren, ikke-async
 * server-komponent — ingen `'use client'`, ingen klient-JS.
 *
 * Bevisst dobbel presentasjon: de samme ctp/ld-poengene står også som kvittering
 * per spiller i `CupPlayerPoints`. Der er spørsmålet «hva samlet jeg inn», her
 * «hva skjedde på hullet» — hint-linja under overskriften sier eksplisitt at det
 * ikke er ekstra poeng.
 *
 * All gruppering og klassifisering bor i `buildSideAwardDetails` — her er det
 * ren visning, og ingen poeng regnes ut på nytt.
 */

export function SideAwardDetails({
  groups,
  team1Name,
  team2Name,
}: {
  groups: CupSideAwardHoleGroup[];
  team1Name: string;
  team2Name: string;
}) {
  const t = useTranslations('cup');

  if (groups.length === 0) return null;

  const teamName = (team: 1 | 2) => (team === 1 ? team1Name : team2Name);

  function winnerLine(row: CupSideAwardWinnerRow): string {
    if (row.outcome === 'noWinner') return t('results.sideAwardNoWinner');
    if (row.outcome === 'unregistered') return t('results.sideAwardUnregistered');
    return row.winnerTeam
      ? t('results.sideAwardWinnerOnTeam', {
          name: row.winnerName ?? '',
          team: teamName(row.winnerTeam),
        })
      : (row.winnerName ?? '');
  }

  return (
    <section className="mb-8" data-testid="cup-side-award-details">
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
        {t('results.sideAwardsHeading')}
      </h2>
      <p className="text-xs text-muted mb-2">{t('results.sideAwardsHint')}</p>

      <ul className="space-y-2">
        {groups.map((group) => (
          <li key={group.holeNumber}>
            <Card>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted tabular-nums">
                {t('sideAwards.holeShort', { n: group.holeNumber })}
              </p>
              <ul className="mt-2 space-y-2">
                {group.rows.map((row) => (
                  <li
                    key={row.id}
                    data-testid="cup-side-award-row"
                    data-kind={row.kind}
                    data-outcome={row.kind === 'gir' ? undefined : row.outcome}
                  >
                    {row.kind === 'gir' ? (
                      <GirRow row={row} teamName={teamName} />
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-sans text-sm text-text">
                            {t(row.kind === 'ctp' ? 'sideAwards.kindCtp' : 'sideAwards.kindLd')}
                            {/* «(1 av 3)» kun når plassen har søsken (#1489) —
                                gamle cuper ser ut som før. */}
                            {row.showSlot && (
                              <>
                                {' '}
                                <span className="text-muted tabular-nums">
                                  {t('sideAwards.slotOfCount', { slot: row.slot, count: row.slotCount })}
                                </span>
                              </>
                            )}
                          </p>
                          <p className="text-xs text-muted mt-0.5">{winnerLine(row)}</p>
                        </div>
                        {row.outcome === 'won' && (
                          <p className="shrink-0 font-serif text-base tabular-nums text-primary">
                            {t('results.sideAwardPoints', { points: formatPoints(row.points) })}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GirRow({
  row,
  teamName,
}: {
  row: CupSideAwardGirRow;
  teamName: (team: 1 | 2) => string;
}) {
  const t = useTranslations('cup');

  return (
    <div>
      <p className="font-sans text-sm text-text">{t('sideAwards.kindGir')}</p>
      {row.registered ? (
        <ul className="mt-0.5">
          {row.teams.map((team) => (
            <li key={team.team} className="text-xs text-muted tabular-nums">
              {t('results.sideAwardGirTeam', {
                team: teamName(team.team),
                count: team.count ?? 0,
                max: row.maxPerTeam,
                points: formatPoints(team.points),
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted mt-0.5">{t('results.sideAwardUnregistered')}</p>
      )}
    </div>
  );
}

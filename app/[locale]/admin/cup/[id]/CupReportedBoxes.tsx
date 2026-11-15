import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatDistance } from '@/lib/i18n/format';
import type { CupGirReport, CupReportMatch, CupSlotReports } from '@/lib/cup/cupSideReports';

/**
 * «Meldt inn fra kampene» in the cup's «Etter runden» (#2283, drawing V4): what
 * the matches reported, read-only, under the organiser's own select and
 * counters. The same box as the finish page's «Meldt inn fra flightene»
 * (`SideWinnersForm`), with the match as the sender, and on `bg-bg` because it
 * sits inside a white card. Nothing here picks a winner or fills a counter in.
 *
 * The data is `buildCupSideReports` (`lib/cup/cupSideReports.ts`), the one the
 * app's manage view carries too.
 */

/** Under a closest-to-pin or longest-drive select: one line per match, then the matches that have not reported. */
export function SlotReportedBox({
  id,
  testKey,
  kind,
  reports,
}: {
  id: string;
  testKey: string;
  kind: 'ctp' | 'ld';
  reports: CupSlotReports | 'failed';
}) {
  const t = useTranslations('cup.sideAwards');
  const tCup = useTranslations('cup');
  const locale = useLocale() as AppLocale;
  const matchName = (match: CupReportMatch) => match.matchLabel ?? tCup('matchFallback');

  const rows: { key: string; node: ReactNode; className: string }[] = [];
  if (reports !== 'failed') {
    for (const line of reports.lines) {
      rows.push({
        key: `line-${line.gameId}`,
        className: 'flex items-baseline gap-2.5 py-2',
        node: (
          <>
            <span className="w-[84px] shrink-0 text-[13px] leading-[18px] text-muted">{matchName(line)}</span>
            {line.name === null ? (
              <span className="min-w-0 flex-1 text-[15px] leading-5 text-muted">
                {t(kind === 'ctp' ? 'reportedNoOneClosestToPin' : 'reportedNoOneLongestDrive')}
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-[15px] font-semibold leading-5 text-text">{line.name}</span>
            )}
            {line.distanceM !== null && (
              <span className="shrink-0 text-[15px] leading-5 tabular-nums text-text">
                {t('reportedDistance', { distance: formatDistance(line.distanceM, locale) })}
              </span>
            )}
          </>
        ),
      });
    }
    // A match that has not reported is only worth naming once some match has.
    if (reports.lines.length > 0) {
      for (const match of reports.missing) {
        rows.push({
          key: `missing-${match.gameId}`,
          className: 'py-2 text-sm leading-5 text-muted',
          node: t('reportedMissing', { match: matchName(match) }),
        });
      }
    }
  }
  const empty = reports === 'failed' ? t('reportedReadFailed') : rows.length === 0 ? t('reportedNone') : null;

  return (
    <div
      id={id}
      role="group"
      aria-label={t('reportedHeading')}
      data-testid={`side-reports-${testKey}`}
      className="mt-2 rounded-xl bg-bg px-3 pb-1 pt-2.5"
    >
      <div className="text-xs font-semibold leading-[15px] text-muted">{t('reportedHeading')}</div>
      {empty !== null ? (
        <p className="pt-2 text-sm leading-5 text-muted">{empty}</p>
      ) : (
        <ul>
          {rows.map((row, index) => (
            <li
              key={row.key}
              className={index > 0 ? `border-t border-row-divider-warm ${row.className}` : row.className}
            >
              {row.node}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Under both GIR counters: one line per team with the sum over every match and
 * who hit, then the matches that have not reported. Over «maks per lag» the
 * actual count stands with the max beside it, in the warning colour: the
 * counters are the organiser's own and still stop at the max.
 */
export function GirReportedBox({
  id,
  testKey,
  reports,
  team1Name,
  team2Name,
}: {
  id: string;
  testKey: string;
  reports: CupGirReport | 'failed';
  team1Name: string;
  team2Name: string;
}) {
  const t = useTranslations('cup.sideAwards');
  const tCup = useTranslations('cup');
  const matchName = (match: CupReportMatch) => match.matchLabel ?? tCup('matchFallback');

  const lineClass = 'text-[13px] leading-[18px]';
  let body: ReactNode;
  if (reports === 'failed') {
    body = <p className={`${lineClass} text-muted`}>{t('reportedReadFailed')}</p>;
  } else if (reports.reportedMatches === 0) {
    body = <p className={`${lineClass} text-muted`}>{t('reportedNone')}</p>;
  } else {
    const teams = [
      { key: 'team1', name: team1Name, sum: reports.team1 },
      { key: 'team2', name: team2Name, sum: reports.team2 },
    ];
    body = (
      <>
        {teams.map(({ key, name, sum }) => {
          const over = sum.count > reports.maxPerTeam;
          const who = sum.names.length > 0 ? ` (${sum.names.join(', ')})` : '';
          const max = over ? ` · ${t('reportedGirMax', { max: reports.maxPerTeam })}` : '';
          return (
            <p key={key} data-testid={`side-reports-gir-${key}`} className={`${lineClass} ${over ? 'text-warning-text' : 'text-muted'}`}>
              <span className="font-semibold text-text">{name}:</span> {sum.count}
              {who}
              {max}
            </p>
          );
        })}
        {reports.missing.map((match) => (
          <p key={match.gameId} className={`${lineClass} text-muted`}>
            {t('reportedMissing', { match: matchName(match) })}
          </p>
        ))}
      </>
    );
  }

  return (
    <div
      id={id}
      role="group"
      aria-label={t('reportedHeading')}
      data-testid={`side-reports-${testKey}`}
      className="flex flex-col gap-1 rounded-xl bg-bg px-3 py-2.5"
    >
      <div className="text-xs font-semibold leading-[15px] text-muted">{t('reportedHeading')}</div>
      {body}
    </div>
  );
}

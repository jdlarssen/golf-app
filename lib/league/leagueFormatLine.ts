import type { LeagueFormat, LeagueScoring, StandingsModel } from './types';

/**
 * The league's format line on the web's league page (#2660): «Stableford
 * netto 75 % · maks 32 slag · beste 5 av 7». The app draws the same line from
 * its own copy (`native/app/src/lib/leagueCopy.ts` `formatLine`), and both
 * tests hold the two to the same words.
 *
 * The handicap share stands after «netto», also at 100 %, so a full-handicap
 * league is as plain as a 95 % one. A gross league plays on raw strokes and
 * shows neither the share nor the cap.
 *
 * Pure: the page passes the `liga.player.formatLine` translator and the
 * format's name (`liga.manage.formatLabel`).
 */
export type FormatLineT = (key: string, values?: Record<string, string | number>) => string;

export type FormatLineLeague = {
  format: LeagueFormat;
  scoring: LeagueScoring;
  standingsModel: StandingsModel;
  bestN: number | null;
  hcpAllowancePct: number;
  hcpMaxStrokes: number | null;
};

function modelPhrase(t: FormatLineT, league: FormatLineLeague, roundCount: number): string {
  if (league.standingsModel === 'best_n') {
    return league.bestN
      ? t('model.best_n', { n: league.bestN, count: roundCount })
      : t('model.best_nFallback');
  }
  return t(`model.${league.standingsModel}`);
}

export function leagueFormatLine(
  t: FormatLineT,
  formatLabel: string,
  league: FormatLineLeague,
  roundCount: number,
): string {
  const gross = league.scoring === 'gross';
  const head = gross
    ? `${formatLabel} ${t('scoring.gross')}`
    : `${formatLabel} ${t('scoring.net')} ${t('allowance', { pct: league.hcpAllowancePct })}`;
  const cap = !gross && league.hcpMaxStrokes !== null ? t('maxStrokes', { max: league.hcpMaxStrokes }) : null;
  return [head, cap, modelPhrase(t, league, roundCount)].filter((part) => part !== null).join(' · ');
}

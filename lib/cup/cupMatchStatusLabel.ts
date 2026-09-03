/**
 * Delt status-label for et cup-matchkort (#1502). Ett hjem for regelen som før
 * lå duplisert som en ternary i BÅDE `CupManagement.tsx` og
 * `app/[locale]/cup/[id]/page.tsx` (#1468-evaluatoren flagget duplikatet):
 *
 *  - finished                      → «Spilt»            (resultatet bor på resultatsiden)
 *  - active + alle kort levert     → «Scorekort levert» (ny mellomtilstand, #1502)
 *  - active                        → «Pågår»
 *  - avgjort ved trekk             → «Halvert …» / «Walkover til …» (#1814)
 *  - ellers (draft/scheduled)      → «Ikke startet» (dagens matchDraft-nøkkel)
 *
 * «Scorekort levert» er IKKE resultatbærende — det signaliserer bare til
 * arrangøren at kampen er klar for avslutning. `allScorecardsSubmitted` regnes
 * i `getCupSnapshot` (alle ikke-trukne spillere har levert; withdrawn ekskludert).
 *
 * #1814: de to avgjort-nøklene kommer FØR `notStarted` — en kamp avgjort ved
 * trekk står fortsatt `scheduled` i DB-en (utfallet lagres aldri), så uten dem
 * ville den vist «Ikke startet» for alltid. De er de eneste nøklene med
 * plassholdere; `cupMatchStatusValues` fyller dem.
 */

import type { CupMatchWithdrawal } from './cupWithdrawalOutcome';

export type CupMatchStatusKey =
  | 'played'
  | 'scorecardsSubmitted'
  | 'inProgress'
  | 'decidedHalved'
  | 'decidedWalkover'
  | 'notStarted';

export function cupMatchStatusKey(match: {
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  allScorecardsSubmitted: boolean;
  /** #1814 — `null`/utelatt for alle kamper som skal spilles. */
  withdrawal?: CupMatchWithdrawal | null;
}): CupMatchStatusKey {
  if (match.status === 'finished') return 'played';
  if (match.status === 'active') {
    return match.allScorecardsSubmitted ? 'scorecardsSubmitted' : 'inProgress';
  }
  if (match.withdrawal) {
    return match.withdrawal.outcome === 'halved' ? 'decidedHalved' : 'decidedWalkover';
  }
  return 'notStarted';
}

/**
 * Status-key → message-key under `cup`-navnerommet. Konsumeres av begge flater
 * via `t(CUP_MATCH_STATUS_MESSAGE_KEY[cupMatchStatusKey(m)], cupMatchStatusValues(m, …))`.
 */
export const CUP_MATCH_STATUS_MESSAGE_KEY = {
  played: 'public.matchPlayed',
  scorecardsSubmitted: 'public.matchScorecardsSubmitted',
  inProgress: 'public.matchInProgress',
  decidedHalved: 'public.matchDecidedHalved',
  decidedWalkover: 'public.matchDecidedWalkover',
  notStarted: 'public.matchDraft',
} as const satisfies Record<CupMatchStatusKey, string>;

/**
 * Plassholderne de to avgjort-nøklene trenger: hvem som trakk seg, og hvilket
 * lag som eventuelt fikk kampen. Alltid trygg å sende — next-intl ignorerer
 * verdier en melding ikke bruker, så kallstedene kan sende dem uansett nøkkel.
 *
 * Flere trukne på samme kamp joines med «/», samme form som side-labelen.
 */
export function cupMatchStatusValues(
  match: {
    withdrawal?: CupMatchWithdrawal | null;
  },
  opts: {
    nameOf: (userId: string) => string;
    team1Name: string;
    team2Name: string;
  },
): { name: string; team: string } {
  const w = match.withdrawal;
  if (!w) return { name: '', team: '' };
  return {
    name: w.withdrawnUserIds.map(opts.nameOf).join('/'),
    team: w.winnerSide === 1 ? opts.team1Name : w.winnerSide === 2 ? opts.team2Name : '',
  };
}

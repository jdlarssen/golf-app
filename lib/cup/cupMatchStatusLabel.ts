/**
 * Delt status-label for et cup-matchkort (#1502). Ett hjem for regelen som før
 * lå duplisert som en ternary i BÅDE `CupManagement.tsx` og
 * `app/[locale]/cup/[id]/page.tsx` (#1468-evaluatoren flagget duplikatet):
 *
 *  - finished                      → «Spilt»            (resultatet bor på resultatsiden)
 *  - active + alle kort levert     → «Scorekort levert» (ny mellomtilstand, #1502)
 *  - active                        → «Pågår»
 *  - ellers (draft/scheduled)      → «Ikke startet» (dagens matchDraft-nøkkel)
 *
 * «Scorekort levert» er IKKE resultatbærende — det signaliserer bare til
 * arrangøren at kampen er klar for avslutning. `allScorecardsSubmitted` regnes
 * i `getCupSnapshot` (alle ikke-trukne spillere har levert; withdrawn ekskludert).
 */

export type CupMatchStatusKey =
  | 'played'
  | 'scorecardsSubmitted'
  | 'inProgress'
  | 'notStarted';

export function cupMatchStatusKey(match: {
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  allScorecardsSubmitted: boolean;
}): CupMatchStatusKey {
  if (match.status === 'finished') return 'played';
  if (match.status === 'active') {
    return match.allScorecardsSubmitted ? 'scorecardsSubmitted' : 'inProgress';
  }
  return 'notStarted';
}

/**
 * Status-key → message-key under `cup`-navnerommet. Konsumeres av begge flater
 * via `t(CUP_MATCH_STATUS_MESSAGE_KEY[cupMatchStatusKey(m)])`.
 */
export const CUP_MATCH_STATUS_MESSAGE_KEY = {
  played: 'public.matchPlayed',
  scorecardsSubmitted: 'public.matchScorecardsSubmitted',
  inProgress: 'public.matchInProgress',
  notStarted: 'public.matchDraft',
} as const satisfies Record<CupMatchStatusKey, string>;

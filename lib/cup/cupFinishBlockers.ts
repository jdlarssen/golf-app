import type { GameStatus } from '@/lib/games/status';

export type CupFinishMatch = {
  status: GameStatus;
  sourceGameId?: string | null;
  allScorecardsSubmitted?: boolean;
};

/**
 * Host-kamper som blokkerer ett-trykks-avslutningen av cupen (#1501): hver
 * host-kamp må være `finished`, eller `active` med alle ikke-trukne scorekort
 * levert. Aldri startede kamper (`scheduled`/`draft`) blokkerer også —
 * evaluator-funn MAJOR-1: de gled ellers stille forbi begge gatene, og cupen
 * kunne avsluttes med uspilte kamper (samme feilklasse som prod-funnet i
 * #1501). Avledede kamper (`sourceGameId` satt) følger verten og blokkerer
 * aldri selv.
 *
 * Regelen har ett hjem: `finishTournament`-gaten og styringssidens
 * stopp-banner bruker BEGGE denne funksjonen — UI-en kan aldri love noe
 * serveren avviser.
 */
export function blockingHostMatches<T extends CupFinishMatch>(
  matches: T[],
): T[] {
  return matches.filter((m) => {
    if ((m.sourceGameId ?? null) !== null) return false;
    if (m.status === 'finished') return false;
    return !(m.status === 'active' && (m.allScorecardsSubmitted ?? false));
  });
}

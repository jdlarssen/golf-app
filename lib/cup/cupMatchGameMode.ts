import type { CupMatchInput } from './computeCupLeaderboard';

/**
 * Mapper `games.game_mode` (fri tekst fra DB) til cup-leaderboardets smale
 * game-mode-union (#1522, utdrag fra `getCupSnapshot`s ternær-kjede).
 *
 * Oppslagskartet er identitets-mappet med vilje: `satisfies Record<
 * CupMatchGameMode, ...>` binder det til unionen, så en ny modus i
 * `CupMatchInput['gameMode']` gir kompileringsfeil her i stedet for en stille
 * fallback til singles. `best_ball` (#1441 D4-hostens back9-match) er med:
 * `isTeamMatchGameMode` styrer spiller- vs. lagnavn i UI-en (#1441, F5).
 *
 * Ukjent modus → `'singles_matchplay'`. Det er en typesikker fallback, ikke en
 * påstand om at spillet ER singles: en framtidig modus som skulle dukke opp i
 * en cup rendres da med spiller-navn i stedet for å krasje visningen.
 */
export type CupMatchGameMode = NonNullable<CupMatchInput['gameMode']>;

const CUP_MATCH_GAME_MODES = {
  singles_matchplay: 'singles_matchplay',
  fourball_matchplay: 'fourball_matchplay',
  foursomes_matchplay: 'foursomes_matchplay',
  greensome_matchplay: 'greensome_matchplay',
  chapman_matchplay: 'chapman_matchplay',
  gruesome_matchplay: 'gruesome_matchplay',
  best_ball: 'best_ball',
} as const satisfies Record<CupMatchGameMode, CupMatchGameMode>;

/**
 * `Map`, ikke rå objekt-oppslag: `games.game_mode` er fri tekst fra DB, og et
 * objekt-oppslag på f.eks. `'toString'` ville truffet `Object.prototype` og
 * gitt en funksjon i stedet for å falle gjennom til fallbacken.
 */
const BY_NAME: ReadonlyMap<string, CupMatchGameMode> = new Map(
  Object.entries(CUP_MATCH_GAME_MODES),
);

export function toCupMatchGameMode(gameMode: string): CupMatchGameMode {
  return BY_NAME.get(gameMode) ?? 'singles_matchplay';
}

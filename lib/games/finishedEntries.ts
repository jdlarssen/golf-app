import type { FinishedGame } from './getFinishedGamesForUser';
import {
  pairSplitDayGames,
  splitDayAnchor,
  type PairableGame,
} from './splitDayPairing';

/**
 * Finished-list entries (#1449): the raw finished games fold into ONE cup-day
 * entry per split cup day, while everything else passes through as a plain
 * game. Shared by the home «Avsluttede spill» list and /spill-arkiv so the two
 * surfaces can't drift on what a cup day looks like.
 */
export type FinishedEntry =
  | { kind: 'game'; ended_at: string | null; game: FinishedGame }
  | {
      kind: 'cupDay';
      ended_at: string | null;
      tournamentId: string;
      cupName: string;
      /** Persisted tournament status ('draft'|'active'|'finished'). */
      status: string;
      /** Persisted winning side (1|2), `null` while unfinished or tied. */
      winnerTeam: number | null;
      /** The viewer's own cup side (1|2), or `null` if unknown. */
      teamNumber: number | null;
      courseName: string | null;
      front9: FinishedGame;
      back9: FinishedGame;
    };

/**
 * Groups a user's finished games into entries. Both host halves of a split cup
 * day → one `cupDay` entry (linking to the cup page). A LONE finished split-day
 * host — its sibling isn't finished yet — is suppressed here: that day still
 * shows as an active card on Home, and no day may appear in both lists (contract
 * guardrail). Plain games pass straight through.
 *
 * #1449 round-1 deviation (from the contract's «same Oslo day of `ended_at`»):
 * pairing anchors on `scheduled_tee_off_at ?? ended_at`, the PHYSICAL-day
 * identity both halves share — matching the active list. Anchoring on `ended_at`
 * (the admin's avslutt-click moment) broke when the two hosts were finished
 * across midnight or the next morning: they landed in different day-buckets,
 * never paired, and the lone-host suppression then hid BOTH halves from every
 * finished surface forever (#877 class). A belt below hardens that further.
 *
 * Assumes `games` is already sorted newest-`ended_at`-first; pairing preserves
 * order (the pair anchors at its first-seen half), so entries stay newest-first.
 */
export function toFinishedEntries(games: FinishedGame[]): FinishedEntry[] {
  const pairable: PairableGame<FinishedGame>[] = games.map((game) => ({
    gameId: game.id,
    tournamentId: game.tournament_id,
    holeSegment: game.hole_segment,
    // Physical-day identity, not the finish moment (round-1 deviation).
    dayAnchor: splitDayAnchor({
      scheduled_tee_off_at: game.scheduled_tee_off_at,
      created_at: game.ended_at,
    }),
    data: game,
  }));

  // Belt: does the finished set already contain the OPPOSITE-half host of a
  // split cup day? If so, both halves are finished — a lone entry then means the
  // anchor above failed to bucket them together (should be impossible after the
  // scheduled-tee-off anchor). Rather than suppress and vanish the day from BOTH
  // lists, degrade to showing the single card. (A sibling that is genuinely
  // still ACTIVE is not in this finished set → correctly suppressed, since that
  // day shows in the active list. "Sibling active" vs "sibling missing entirely"
  // are indistinguishable from the finished set alone; suppressing optimizes for
  // the dominant sibling-active case and the anchor fix removes the real
  // vanish-from-both bug.)
  const finishedOppositeHostExists = (game: FinishedGame): boolean => {
    if (game.tournament_id == null) return false;
    const opposite = game.hole_segment === 'front9' ? 'back9' : 'front9';
    return games.some(
      (g) =>
        g.id !== game.id &&
        g.tournament_id === game.tournament_id &&
        g.hole_segment === opposite,
    );
  };

  const entries: FinishedEntry[] = [];
  for (const entry of pairSplitDayGames(pairable)) {
    if (entry.kind === 'pair') {
      const front9 = entry.front9.data;
      const back9 = entry.back9.data;
      const tournament = front9.tournament ?? back9.tournament;
      entries.push({
        kind: 'cupDay',
        ended_at: front9.ended_at ?? back9.ended_at,
        tournamentId: entry.tournamentId,
        cupName: tournament?.name ?? front9.name,
        // Fail-closed: a null embed defaults to the neutral/unfinished path so a
        // missing tournament can never wear a false «Cupen endte»-badge.
        status: tournament?.status ?? 'active',
        winnerTeam: tournament?.winner_team ?? null,
        teamNumber: front9.team_number ?? back9.team_number,
        courseName: front9.courses?.name ?? back9.courses?.name ?? null,
        front9,
        back9,
      });
      continue;
    }
    const game = entry.game.data;
    const isSplitHost =
      game.tournament_id != null &&
      (game.hole_segment === 'front9' || game.hole_segment === 'back9');
    // Suppress a lone finished split host only when its sibling is NOT itself a
    // finished host in this set (sibling still active → lives in the active
    // list). If a finished opposite host exists yet didn't pair (belt), show the
    // single card instead of hiding the day.
    if (isSplitHost && !finishedOppositeHostExists(game)) continue;
    entries.push({ kind: 'game', ended_at: game.ended_at, game });
  }
  return entries;
}

export type CupDayBadge = { key: string; isWin: boolean };

/**
 * The finished cup-day badge (#1449, owner decision 4): NO result while the cup
 * is unfinished (neutral card); once finished, «Laget ditt vant/tapte cupen»
 * from the persisted `winnerTeam` + the viewer's `teamNumber` — a tie
 * (`winnerTeam` null) reuses the «Delt»-voice. When the side is unknown, a
 * neutral «ferdigspilt». Returns a `finishedCard.cup.*` key + gold-accent flag;
 * `null` = render no badge.
 */
export function cupDayFinishedBadge(entry: {
  status: string;
  winnerTeam: number | null;
  teamNumber: number | null;
}): CupDayBadge | null {
  if (entry.status !== 'finished') return null;
  if (entry.winnerTeam == null) return { key: 'cup.tied', isWin: false };
  if (entry.teamNumber == null) return { key: 'cup.finished', isWin: false };
  return entry.winnerTeam === entry.teamNumber
    ? { key: 'cup.won', isWin: true }
    : { key: 'cup.lost', isWin: false };
}

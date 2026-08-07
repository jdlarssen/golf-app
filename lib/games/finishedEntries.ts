import type { FinishedGame } from './getFinishedGamesForUser';
import { pairSplitDayGames, type PairableGame } from './splitDayPairing';

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
 * Assumes `games` is already sorted newest-`ended_at`-first; pairing preserves
 * order (the pair anchors at its first-seen half), so entries stay newest-first.
 */
export function toFinishedEntries(games: FinishedGame[]): FinishedEntry[] {
  const pairable: PairableGame<FinishedGame>[] = games.map((game) => ({
    gameId: game.id,
    tournamentId: game.tournament_id,
    holeSegment: game.hole_segment,
    dayAnchor: game.ended_at ? new Date(game.ended_at) : null,
    data: game,
  }));

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
        status: tournament?.status ?? 'finished',
        winnerTeam: tournament?.winner_team ?? null,
        teamNumber: front9.team_number ?? back9.team_number,
        courseName: front9.courses?.name ?? back9.courses?.name ?? null,
        front9,
        back9,
      });
      continue;
    }
    const game = entry.game.data;
    // A lone finished split-day host means its sibling is still active — that
    // day lives in the ACTIVE list; drop it here to avoid a day in both lists.
    const isLoneSplitHost =
      game.tournament_id != null &&
      (game.hole_segment === 'front9' || game.hole_segment === 'back9');
    if (isLoneSplitHost) continue;
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

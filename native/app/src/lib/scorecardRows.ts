// Native N4 (#1828): radene og summene i scorekortet (Layout A).
//
// Skilt ut fra skjermen fordi det er regnestykker, ikke tegning — og fordi det
// samme kortet nå viser to ulike ting: mine egne slag i de vanlige formatene,
// og LAGETS slag i formatene som deler én ball.
//
// Én ting bærer fila: **et ukjent tall er `null`, aldri 0.** Kan motoren ikke
// si hvor mange slag laget får på et hull, står netto som «—». Å fylle inn 0 i
// stedet gir et scorekort der netto er lik brutto og alt ser riktig ut. Samme
// grunn til at én ukjent rad gjør hele netto-summen ukjent: en sum av halve
// tildelinger er et tall ingen kan bruke til noe.
import { scoreOwnerForHole } from '../../../../lib/games/scoreOwner';
import { parForPlayer } from '../../../../lib/games/parDisplay';
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import { modeCollapsesToTeamCard } from '../../../../lib/scoring/modes/types';
import { strokesForHole } from '../../../../lib/scoring/strokeAllocation';
import type { LocalScore } from '../data/db';
import type { BundleHole } from '../data/gameBundle';
import type { LeaderboardOutcome } from './scoringContext';
import { teamExtraForHole } from './teamPlay';

export interface ScorecardRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  strokes: number | null;
  /** Tildelte slag. `null` = ukjent (lagkort uten svar fra motoren). */
  extra: number | null;
  /** `strokes − extra`, eller `null` når ett av dem mangler. */
  netto: number | null;
}

export interface ScorecardTotals {
  playedHoles: number;
  totalGross: number;
  /** `null` når minst ett spilt hull har ukjent tildeling. */
  totalExtra: number | null;
  totalNet: number | null;
}

/**
 * Bygg tabellen og summene for ett scorekort.
 *
 * `teamOwnerId` er kapteinen når runden deler ett kort, ellers `null`. Hvem som
 * eier hvilket hull spørres per rad via delt `scoreOwnerForHole` — patsome
 * bytter halvveis, og en flat «hele runden tilhører kapteinen»-antakelse ville
 * lest feil rader på den ene halvdelen.
 */
export function buildScorecardRows(opts: {
  holes: readonly BundleHole[];
  scores: readonly LocalScore[];
  mode: GameMode;
  viewerId: string;
  teamOwnerId: string | null;
  teeGender: ScoringGender;
  courseHandicap: number;
  /** Lagnummeret mitt — nøkkelen motoren kjenner laget på. */
  teamNumber: number | null;
  /** Motor-resultatet, eller `null` når runden ikke er et lagkort. */
  leaderboard: LeaderboardOutcome | null;
}): { rows: ScorecardRow[]; totals: ScorecardTotals } {
  const byUserHole = new Map(
    opts.scores.map((row) => [`${row.userId}#${row.holeNumber}`, row]),
  );

  const rows: ScorecardRow[] = opts.holes.map((hole) => {
    const ownerId = scoreOwnerForHole(
      opts.mode,
      hole.holeNumber,
      opts.viewerId,
      opts.teamOwnerId,
    );
    const collapsed =
      opts.teamOwnerId != null && modeCollapsesToTeamCard(opts.mode, hole.holeNumber);
    const strokes = byUserHole.get(`${ownerId}#${hole.holeNumber}`)?.strokes ?? null;
    const extra = collapsed
      ? opts.leaderboard != null && opts.teamNumber != null
        ? teamExtraForHole(
            opts.leaderboard,
            opts.teamNumber,
            hole.holeNumber,
            hole.strokeIndex,
          )
        : null
      : strokesForHole(opts.courseHandicap, hole.strokeIndex);

    return {
      holeNumber: hole.holeNumber,
      par: parForPlayer(
        { mens: hole.parMens, ladies: hole.parLadies, juniors: hole.parJuniors },
        opts.teeGender,
      ),
      strokeIndex: hole.strokeIndex,
      strokes,
      extra,
      netto: strokes != null && extra != null ? strokes - extra : null,
    };
  });

  const played = rows.filter((row) => row.strokes != null);
  const totalGross = played.reduce((sum, row) => sum + (row.strokes ?? 0), 0);
  const totalExtra = played.every((row) => row.extra != null)
    ? played.reduce((sum, row) => sum + (row.extra ?? 0), 0)
    : null;

  return {
    rows,
    totals: {
      playedHoles: played.length,
      totalGross,
      totalExtra,
      totalNet: totalExtra != null ? totalGross - totalExtra : null,
    },
  };
}

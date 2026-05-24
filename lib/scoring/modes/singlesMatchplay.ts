// Singles matchplay-scoring (epic #45): 1v1 hull-for-hull W/L/T.
//
// Matchplay er fundamentalt ulikt poeng-baserte modi: ingen totaler, men
// hull-for-hull-sammenligning. Per hull regner vi netto per side
// (gross − extra strokes fra HCP-fordelingen). Laveste netto vinner hullet;
// lik netto = tied. Match-status = (antall hull side 1 vant) − (antall hull
// side 2 vant). Matchen er mat-em når |holesUp| > holesRemaining.
//
// Resultat-formater (golf-standard):
//   - 'AS'   — all square etter 18 hull (tied)
//   - 'Nup'  — N hull foran etter 18 hull spilt
//   - 'N&M'  — N hull foran med M hull igjen (mat-em før hull 18)

import { strokesForHole } from '../strokeAllocation';
import type {
  ScoringContext,
  SinglesMatchplayResult,
  MatchplayHoleRow,
  MatchplaySide,
  MatchplayMatchResult,
  MatchplayHoleResult,
} from './types';

/**
 * Empty-shell fallback for defensive returns når matchen mangler nøyaktig
 * to sider. Validatoren i `lib/games/gamePayload.ts` håndhever 2-sider-
 * regelen ved publish, men scoring-laget må fortsatt være trygt for
 * call-sites som leser draft-state eller halvferdige rader.
 */
function emptyShell(sides: [MatchplaySide, MatchplaySide]): SinglesMatchplayResult {
  return {
    kind: 'singles_matchplay',
    sides,
    holes: [],
    holesUp: 0,
    holesPlayed: 0,
    holesRemaining: 18,
    result: null,
  };
}

/**
 * Bygger en defensiv "tom" tuple når vi ikke har to gyldige sider å returnere.
 * Brukes kun i emptyShell-stien — kalles ikke når validatoren har gjort
 * jobben sin.
 */
function placeholderSides(): [MatchplaySide, MatchplaySide] {
  return [
    { sideNumber: 1, userId: '', courseHandicap: 0 },
    { sideNumber: 2, userId: '', courseHandicap: 0 },
  ];
}

/**
 * Avgjør match-resultatet basert på løpende status. Returnerer `null`
 * mens matchen er live (ikke 18 hull spilt og ikke mat-em).
 *
 * Regler (golf-standard):
 *  - Mat-em (decided before 18): `|holesUp| > holesRemaining` —
 *    matematisk umulig for tapende side å innhente.
 *    Format: `${marginUp}&${remainingAtDecision}` (f.eks. «3&2»).
 *  - Spilt ferdig 18 hull + holesUp != 0:
 *    Format: `${marginUp}up` (f.eks. «2up»).
 *  - Spilt ferdig 18 hull + holesUp === 0:
 *    Format: `'AS'` (all square).
 *  - Ellers (live midt i runden): `null`.
 */
export function computeMatchResult(
  holesUp: number,
  holesPlayed: number,
  holesRemaining: number,
): MatchplayMatchResult | null {
  const absUp = Math.abs(holesUp);

  // Mat-em: ledende side har flere hull foran enn det er igjen.
  // Kun relevant hvis matchen ikke allerede er ferdig spilt (holesPlayed < 18).
  if (holesPlayed < 18 && absUp > holesRemaining) {
    const winner: 'side1' | 'side2' = holesUp > 0 ? 'side1' : 'side2';
    return {
      winner,
      marginUp: absUp,
      decidedAtHole: holesPlayed,
      remainingAtDecision: holesRemaining,
      formatted: `${absUp}&${holesRemaining}`,
    };
  }

  // Ferdig spilt 18 hull.
  if (holesPlayed === 18) {
    if (holesUp === 0) {
      return {
        winner: 'tied',
        marginUp: 0,
        decidedAtHole: 18,
        remainingAtDecision: 0,
        formatted: 'AS',
      };
    }
    const winner: 'side1' | 'side2' = holesUp > 0 ? 'side1' : 'side2';
    return {
      winner,
      marginUp: absUp,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: `${absUp}up`,
    };
  }

  // Live: ikke avgjort ennå.
  return null;
}

/**
 * Beregner singles matchplay-resultatet fra en ScoringContext.
 *
 * Forutsetninger:
 *  - Nøyaktig 2 spillere med `teamNumber === 1` og `teamNumber === 2`
 *    (én på hver side). Håndheves av validatoren i `lib/games/gamePayload.ts`.
 *  - Hvis disse forutsetningene brytes returnerer vi en defensiv tom shell
 *    (holesUp=0, holesPlayed=0, result=null) — scoring-laget skal ikke kaste
 *    selv om payload-validatoren har feilet eller draft-state leses tidlig.
 */
export function compute(ctx: ScoringContext): SinglesMatchplayResult {
  const side1Players = ctx.players.filter((p) => p.teamNumber === 1);
  const side2Players = ctx.players.filter((p) => p.teamNumber === 2);

  // Defensiv fallback: matchplay krever nøyaktig én spiller per side.
  if (side1Players.length !== 1 || side2Players.length !== 1) {
    return emptyShell(placeholderSides());
  }

  const side1Player = side1Players[0];
  const side2Player = side2Players[0];

  const sides: [MatchplaySide, MatchplaySide] = [
    {
      sideNumber: 1,
      userId: side1Player.userId,
      courseHandicap: side1Player.courseHandicap,
    },
    {
      sideNumber: 2,
      userId: side2Player.userId,
      courseHandicap: side2Player.courseHandicap,
    },
  ];

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  let side1Wins = 0;
  let side2Wins = 0;
  let holesPlayed = 0;

  const holes: MatchplayHoleRow[] = holesSorted.map((hole) => {
    const side1Gross = grossByKey.get(`${side1Player.userId}#${hole.number}`) ?? null;
    const side2Gross = grossByKey.get(`${side2Player.userId}#${hole.number}`) ?? null;

    const side1Extra = strokesForHole(side1Player.courseHandicap, hole.strokeIndex);
    const side2Extra = strokesForHole(side2Player.courseHandicap, hole.strokeIndex);

    const side1Net = side1Gross === null ? null : side1Gross - side1Extra;
    const side2Net = side2Gross === null ? null : side2Gross - side2Extra;

    // Matchplay krever begge sider for å avgjøre hullet. Hvis én side mangler
    // gross er hullet 'unplayed' og bidrar IKKE til match-status.
    let result: MatchplayHoleResult;
    if (side1Net === null || side2Net === null) {
      result = 'unplayed';
    } else if (side1Net < side2Net) {
      result = 'side1_wins';
      side1Wins += 1;
      holesPlayed += 1;
    } else if (side2Net < side1Net) {
      result = 'side2_wins';
      side2Wins += 1;
      holesPlayed += 1;
    } else {
      result = 'tied';
      holesPlayed += 1;
    }

    return {
      holeNumber: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      side1Gross,
      side2Gross,
      side1Net,
      side2Net,
      side1Extra,
      side2Extra,
      result,
    };
  });

  const holesUp = side1Wins - side2Wins;
  // holesRemaining = 18 − holesPlayed: hullene som faktisk kan bidra til
  // match-utfallet. Hull der bare én side har spilt teller IKKE som spilt
  // (matchplay krever begge), men de "blokkerer" heller ikke matematisk —
  // de telles fortsatt som remaining inntil begge har levert.
  const holesRemaining = Math.max(0, 18 - holesPlayed);
  const result = computeMatchResult(holesUp, holesPlayed, holesRemaining);

  return {
    kind: 'singles_matchplay',
    sides,
    holes,
    holesUp,
    holesPlayed,
    holesRemaining,
    result,
  };
}

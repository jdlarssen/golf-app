// Four-ball matchplay-scoring (issue #217, fase 2 av #47).
//
// 2v2 matchplay der hver spiller har egen ball. Lag-best per hull = laveste
// netto av de to partnerne, deretter sammenlikner vi side 1-best mot
// side 2-best som matchplay. Algoritmen er en composition av:
//
//   - `applyAllowance(ch, mode_config.allowance_pct)`  → per-spiller effektiv HCP
//   - `strokesForHole(effective, hole.SI)`             → per-spiller per-hull extra
//   - `bestBallForHole(players)`                       → lag-best netto + contributors
//   - `classifyMatchplayHole(side1Best, side2Best)`    → 'side1_wins'|'side2_wins'|'tied'|'unplayed'
//   - `computeMatchResult(holesUp, holesPlayed, ...)`  → MatchplayMatchResult ("3&2"/"AS"/"2up")
//
// Format-strenger og match-resultat-shape gjenbrukes fra singles via import.
// Eneste reelle forskjell fra singles er aggregeringen per side (2 partnere
// → best netto) og at empty-shell-stien sjekker 2+2-fordeling i stedet for 1+1.

import { applyAllowance } from '../courseHandicap';
import { strokesForHole } from '../strokeAllocation';
import { bestBallForHole } from './bestBallNetto';
import { parFor } from './parResolver';
import {
  classifyMatchplayHole,
  computeMatchResult,
} from './singlesMatchplay';
import type {
  ScoringContext,
  ScoringPlayer,
  FourballMatchplayResult,
  FourballHoleRow,
  FourballSide,
  FourballSidePlayer,
  FourballPlayerCell,
} from './types';

/**
 * Defensiv tom shell-tuple når vi ikke har 2+2-spillere. Validatoren i
 * `lib/games/gamePayload.ts` (fase 4) håndhever 2+2 ved publish, men
 * draft-state kan ha 0/1/3 — scoring-laget kaster ikke.
 */
function placeholderSides(): [FourballSide, FourballSide] {
  return [
    {
      sideNumber: 1,
      players: [
        { userId: '', courseHandicap: 0, effectiveHandicap: 0 },
        { userId: '', courseHandicap: 0, effectiveHandicap: 0 },
      ],
    },
    {
      sideNumber: 2,
      players: [
        { userId: '', courseHandicap: 0, effectiveHandicap: 0 },
        { userId: '', courseHandicap: 0, effectiveHandicap: 0 },
      ],
    },
  ];
}

function emptyShell(): FourballMatchplayResult {
  return {
    kind: 'fourball_matchplay',
    sides: placeholderSides(),
    holes: [],
    holesUp: 0,
    holesPlayed: 0,
    holesRemaining: 18,
    result: null,
  };
}

/**
 * Trekker `allowance_pct` ut av mode_config. Defensivt fallback til 100 hvis
 * feltet mangler — draft-state kan ha en buggy config. Validatoren håndhever
 * range 0..100 ved publish.
 */
function readAllowancePct(ctx: ScoringContext): number {
  const config = ctx.game.mode_config;
  if (config.kind !== 'fourball_matchplay') return 100;
  // Defensivt mot draft-state som mangler feltet.
  const raw = (config as { allowance_pct?: number }).allowance_pct;
  return typeof raw === 'number' ? raw : 100;
}

/**
 * Bygger en `FourballSide` fra 2 sorterte spillere. Sortering på userId skjer
 * i `compute()` før kall, så vi kan trygt anta tuple-rekkefølge her.
 */
function buildSide(
  sideNumber: 1 | 2,
  partners: ScoringPlayer[],
  allowancePct: number,
): FourballSide {
  const players: FourballSidePlayer[] = partners.map((p) => ({
    userId: p.userId,
    courseHandicap: p.courseHandicap,
    effectiveHandicap: applyAllowance(p.courseHandicap, allowancePct),
    teeGender: p.teeGender,
  }));
  return {
    sideNumber,
    players: [players[0], players[1]],
  };
}

export function compute(ctx: ScoringContext): FourballMatchplayResult {
  const side1Players = ctx.players
    .filter((p) => p.teamNumber === 1)
    .slice()
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const side2Players = ctx.players
    .filter((p) => p.teamNumber === 2)
    .slice()
    .sort((a, b) => a.userId.localeCompare(b.userId));

  // Fourball krever EKSAKT 2 spillere per side. Avvik → defensiv empty shell.
  if (side1Players.length !== 2 || side2Players.length !== 2) {
    return emptyShell();
  }

  const allowancePct = readAllowancePct(ctx);

  const sides: [FourballSide, FourballSide] = [
    buildSide(1, side1Players, allowancePct),
    buildSide(2, side2Players, allowancePct),
  ];

  // Pre-beregn effektiv HCP per spiller for raskt oppslag under hull-loop.
  const effectiveByUser = new Map<string, number>();
  for (const sp of sides[0].players) effectiveByUser.set(sp.userId, sp.effectiveHandicap);
  for (const sp of sides[1].players) effectiveByUser.set(sp.userId, sp.effectiveHandicap);

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  let side1Wins = 0;
  let side2Wins = 0;
  let holesPlayed = 0;

  const holes: FourballHoleRow[] = holesSorted.map((hole) => {
    // Bygg per-spiller-celler for hver side via samme mønster som bestBallNetto:
    // gross → extra (via SI + effektiv HCP) → net.
    const buildCells = (partners: ScoringPlayer[]): FourballPlayerCell[] =>
      partners.map((p) => {
        const grossVal = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
        const effective = effectiveByUser.get(p.userId) ?? 0;
        const extraStrokes = strokesForHole(effective, hole.strokeIndex);
        const net = grossVal === null ? null : grossVal - extraStrokes;
        return {
          userId: p.userId,
          gross: grossVal,
          extraStrokes,
          net,
          isContributor: false,
          par: parFor(hole, p.teeGender),
        };
      });

    const side1Cells = buildCells(side1Players);
    const side2Cells = buildCells(side2Players);

    // Lag-best via gjenbrukt bestBallForHole — én partner med gross holder.
    const bb1 = bestBallForHole(
      side1Cells.map((c) => ({
        userId: c.userId,
        gross: c.gross,
        extraStrokes: c.extraStrokes,
      })),
    );
    const bb2 = bestBallForHole(
      side2Cells.map((c) => ({
        userId: c.userId,
        gross: c.gross,
        extraStrokes: c.extraStrokes,
      })),
    );

    // Markér contributors på per-spiller-celle.
    for (const c of side1Cells) c.isContributor = bb1.contributors.includes(c.userId);
    for (const c of side2Cells) c.isContributor = bb2.contributors.includes(c.userId);

    // Per-hull-utfall basert på lag-best-netto (gjenbrukt singles-helper).
    const result = classifyMatchplayHole(bb1.teamNet, bb2.teamNet);
    if (result === 'side1_wins') {
      side1Wins += 1;
      holesPlayed += 1;
    } else if (result === 'side2_wins') {
      side2Wins += 1;
      holesPlayed += 1;
    } else if (result === 'tied') {
      holesPlayed += 1;
    }

    // Per-side par: bruker første partner som side-representant (samme mønster
    // som bestBallNetto for lag-rad). Når begge partnere har samme teeGender
    // (det normale) er resultatet identisk uansett. #240.
    const side1Par = parFor(hole, side1Players[0].teeGender);
    const side2Par = parFor(hole, side2Players[0].teeGender);

    return {
      holeNumber: hole.number,
      par: side1Par, // backward-compat: speiler side1Par
      side1Par,
      side2Par,
      strokeIndex: hole.strokeIndex,
      side1Players: side1Cells,
      side2Players: side2Cells,
      side1BestNet: bb1.teamNet,
      side2BestNet: bb2.teamNet,
      side1ContributorIds: bb1.contributors,
      side2ContributorIds: bb2.contributors,
      result,
    };
  });

  const holesUp = side1Wins - side2Wins;
  const holesRemaining = Math.max(0, 18 - holesPlayed);
  const matchResult = computeMatchResult(holesUp, holesPlayed, holesRemaining);

  return {
    kind: 'fourball_matchplay',
    sides,
    holes,
    holesUp,
    holesPlayed,
    holesRemaining,
    result: matchResult,
  };
}

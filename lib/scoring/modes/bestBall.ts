export interface PlayerHoleScore {
  userId: string;
  gross: number | null;
  extraStrokes: number;
}

export interface BestBallHole {
  teamNet: number | null;
  contributors: string[];
}

export function netScore(input: { gross: number | null; extraStrokes: number }): number | null {
  if (input.gross === null) return null;
  return input.gross - input.extraStrokes;
}

export function bestBallForHole(players: PlayerHoleScore[]): BestBallHole {
  const nets = players
    .map((p) => ({ userId: p.userId, net: netScore({ gross: p.gross, extraStrokes: p.extraStrokes }) }))
    .filter((p): p is { userId: string; net: number } => p.net !== null);

  if (nets.length === 0) {
    return { teamNet: null, contributors: [] };
  }

  const min = Math.min(...nets.map((n) => n.net));
  const contributors = nets.filter((n) => n.net === min).map((n) => n.userId);
  return { teamNet: min, contributors };
}

export interface HoleTeamScore {
  holeNumber: number;
  teamNet: number | null;
}

/**
 * Sums team scores across holes that have a non-null teamNet.
 *
 * - `total` is the sum of the holes that have a score. If `missingHoles` is non-empty,
 *   `total` is a PARTIAL sum — comparing it directly against another team's `total`
 *   is only meaningful when both have empty `missingHoles`.
 * - `missingHoles` lists hole numbers where teamNet was null (both players had null gross).
 *
 * Callers that compare team totals (e.g. a leaderboard) MUST check missingHoles
 * is empty for both teams or treat the comparison as invalid.
 */
export function teamTotal(holes: HoleTeamScore[]): { total: number; missingHoles: number[] } {
  const missingHoles: number[] = [];
  let total = 0;
  for (const h of holes) {
    if (h.teamNet === null) {
      missingHoles.push(h.holeNumber);
    } else {
      total += h.teamNet;
    }
  }
  return { total, missingHoles };
}

// -----------------------------------------------------------------------------
// Mode-router-vennlig API.
//
// `compute(ctx)` wrapper de eksisterende per-hull-funksjonene over et team-/
// flight-oppsett og returnerer en discriminated-union-shape som mode-router-en
// (lib/scoring/index.ts) kan delegere til. Eksisterende eksporter
// (netScore, bestBallForHole, teamTotal, etc.) beholdes uendret slik at
// dagens konsumenter (lib/leaderboard.ts m.fl.) ikke berøres.
// -----------------------------------------------------------------------------

import { strokesForHole } from '../strokeAllocation';
import { rankTeams, UNPLAYED_PADDING } from '../tiebreaker';
import { parFor } from './parResolver';
import type {
  ScoringContext,
  BestBallResult,
  BestBallTeamLine,
  BestBallHoleRow,
  BestBallPlayerCell,
} from './types';

/**
 * Beregner best-ball-netto-leaderboard fra en ScoringContext. Bruker
 * eksisterende `bestBallForHole` + `rankTeams` under hetten — ingen
 * scoring-endring, kun shape-wrapping.
 *
 * Forutsetning: alle spillere har `teamNumber !== null`. Spillere uten
 * teamNumber blir hoppet over (best-ball-modus krever lag-tilordning,
 * håndhevet i validation-laget — se fase 3).
 */
export function compute(ctx: ScoringContext): BestBallResult {
  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossKey = (userId: string, holeNumber: number) => `${userId}#${holeNumber}`;
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(grossKey(s.userId, s.holeNumber), s.gross);
  }

  const teamPlayers = new Map<number, typeof ctx.players>();
  for (const p of ctx.players) {
    if (p.teamNumber === null) continue;
    const arr = teamPlayers.get(p.teamNumber) ?? [];
    arr.push(p);
    teamPlayers.set(p.teamNumber, arr);
  }

  const teamNumbers = [...teamPlayers.keys()].sort((a, b) => a - b);

  const baseLines = teamNumbers.map((teamNumber): Omit<BestBallTeamLine, 'rank' | 'tiedWith'> => {
    const members = teamPlayers.get(teamNumber) ?? [];

    const holes: BestBallHoleRow[] = holesSorted.map((hole) => {
      const players: BestBallPlayerCell[] = members.map((p) => {
        const grossVal = grossByKey.get(grossKey(p.userId, hole.number)) ?? null;
        const extraStrokes = strokesForHole(p.courseHandicap, hole.strokeIndex);
        const net = grossVal === null ? null : grossVal - extraStrokes;
        return {
          userId: p.userId,
          gross: grossVal,
          extraStrokes,
          net,
          isContributor: false,
          // Per-spiller-par via parFor — bærer riktig par for blandet-kjønn-
          // lag på hull med per-kjønn-overstyring. Faller tilbake til hole.par
          // når parByGender ikke er satt. #240.
          par: parFor(hole, p.teeGender),
        };
      });

      const bb = bestBallForHole(
        players.map((pc) => ({
          userId: pc.userId,
          gross: pc.gross,
          extraStrokes: pc.extraStrokes,
        })),
      );

      for (const pc of players) {
        pc.isContributor = bb.contributors.includes(pc.userId);
      }

      // Lag-rad-par for UI: bruker første medlem som lag-representant
      // (samme mønster som stableford-team). Tomme lag faller til hole.par
      // som defensiv edge-case. #240.
      const teamPar = members.length === 0 ? hole.par : parFor(hole, members[0].teeGender);

      return {
        holeNumber: hole.number,
        par: teamPar,
        strokeIndex: hole.strokeIndex,
        teamNet: bb.teamNet,
        contributorIds: bb.contributors,
        players,
      };
    });

    const { total, missingHoles } = teamTotal(holes);

    return {
      teamNumber,
      playerIds: members.map((m) => m.userId),
      holes,
      total,
      missingHoles,
    };
  });

  // Bygg 18-lange poeng-arrays for ranking. Et lag som har spilt minst ett
  // hull teller manglende hull som 0 (flagges via missingHoles for UI-warning).
  // Et lag uten ETT eneste registrert hull paddes med UNPLAYED_PADDING på alle
  // hull — ellers ville sum 0 tolkes som beste netto og laget kåret som vinner (#635).
  const ranked = rankTeams(
    baseLines.map((l) => {
      const teamPlayedAny = l.holes.some((h) => h?.teamNet != null);
      const arr: number[] = [];
      for (let i = 0; i < 18; i++) {
        const h = l.holes[i];
        arr.push(h?.teamNet ?? (teamPlayedAny ? 0 : UNPLAYED_PADDING));
      }
      return { id: l.teamNumber, holes: arr };
    }),
  );
  const rankById = new Map(ranked.map((r) => [r.id, r]));

  const teams: BestBallTeamLine[] = baseLines.map((l) => {
    const r = rankById.get(l.teamNumber);
    return {
      ...l,
      rank: r?.rank ?? 0,
      tiedWith: r?.tiedWith ?? [],
    };
  });

  return { kind: 'best_ball', teams };
}

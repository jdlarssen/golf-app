import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { bestBallForHole } from '@/lib/scoring/modes/bestBall';
import { parFor } from '@/lib/scoring/modes/parResolver';
import type { ScoringGender, ScoringHole } from '@/lib/scoring/modes/types';
import { rankTeams, type RankedTeam } from '@/lib/scoring/tiebreaker';

export type LeaderboardMode = 'netto' | 'brutto';

export type LbPlayer = {
  userId: string;
  name: string;
  nickname: string | null;
  teamNumber: number;
  courseHandicap: number;
  /**
   * Spillerens tee-gender. Brukes til å velge riktig par via `parFor()`
   * når hullet har per-kjønn-overstyring. Optional — defaultes til `'mens'`
   * av `parFor` når feltet ikke er satt. #240.
   */
  teeGender?: ScoringGender;
};

export type LbHole = {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /**
   * Valgfri per-kjønn-overstyring fra `course_holes.par_<gender>`. Når satt,
   * leser legacy-leaderboarden riktig par per spiller (via spillerens
   * `teeGender`); når NULL, faller alle spillere tilbake til `par`. #240.
   */
  parByGender?: { mens: number; ladies: number; juniors: number };
};

export type LbScore = {
  userId: string;
  holeNumber: number;
  strokes: number | null;
};

export type PlayerHoleCell = {
  userId: string;
  gross: number | null;
  extraStrokes: number;
  net: number | null;
  isContributor: boolean;
  /**
   * Spillerens par for hullet (`parFor(hole, player.teeGender)`). Eksponert
   * slik at blandet-kjønn-lag kan vise individuell par-referanse i hull-rad-
   * cell uten å gå tilbake til LbHole. Speilet `BestBallPlayerCell.par`
   * i mode-router. #240.
   */
  par: number;
};

export type TeamHoleRow = {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  teamNet: number | null;
  contributorIds: string[];
  players: PlayerHoleCell[];
  /**
   * Per-kjønn-par for hullet, propagert fra `LbHole.parByGender`. UI-laget
   * bruker dette til å vise avvik-indikator i hull-drill-down når hullet har
   * annerledes par for medspillere av andre kjønn. Optional — fraværende når
   * hullet ikke har per-kjønn-overstyring. #240.
   */
  parByGender?: { mens: number; ladies: number; juniors: number };
};

export type TeamLine = {
  teamNumber: number;
  players: LbPlayer[];
  holes: TeamHoleRow[];
  total: number;
  missingHoles: number[];
  rank: number;
  tiedWith: number[];
};

/**
 * Compute the full leaderboard view for one mode. We do every hole for every
 * team so callers can render either the summary card or the hole-by-hole
 * drill-down without recomputing anything.
 *
 * In brutto mode, every player's extraStrokes is forced to 0 so the lowest
 * gross-best-ball wins.
 *
 * Ranking uses the actual played total. Teams with missing holes are still
 * ranked, but flagged via `missingHoles` so the UI can warn.
 */
export function computeLeaderboard(opts: {
  mode: LeaderboardMode;
  players: LbPlayer[];
  holes: LbHole[];
  scores: LbScore[];
}): TeamLine[] {
  const { mode, players, holes, scores } = opts;

  // Index gross strokes by (userId, holeNumber).
  const grossKey = (userId: string, holeNumber: number) =>
    `${userId}#${holeNumber}`;
  const grossByKey = new Map<string, number | null>();
  for (const s of scores) {
    grossByKey.set(grossKey(s.userId, s.holeNumber), s.strokes);
  }

  // Index holes for fast lookup.
  const holesSorted = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);

  // Group players by team number.
  const teamNumbers = Array.from(
    new Set(players.map((p) => p.teamNumber)),
  ).sort((a, b) => a - b);

  const lines: Omit<TeamLine, 'rank' | 'tiedWith'>[] = teamNumbers.map(
    (teamNumber) => {
      const teamPlayers = players.filter((p) => p.teamNumber === teamNumber);

      const teamHoles: TeamHoleRow[] = holesSorted.map((hole) => {
        // Adapter til ScoringHole-shape for parFor — parResolver er definert
        // mot mode-router-typen, og LbHole er en (mindre) supersettet.
        const holeAsScoring: ScoringHole = {
          number: hole.holeNumber,
          par: hole.par,
          parByGender: hole.parByGender,
          strokeIndex: hole.strokeIndex,
        };
        const playerCells: PlayerHoleCell[] = teamPlayers.map((p) => {
          const gross = grossByKey.get(grossKey(p.userId, hole.holeNumber));
          const grossVal = gross == null ? null : gross;
          const extraStrokes =
            mode === 'netto'
              ? strokesForHole(p.courseHandicap, hole.strokeIndex)
              : 0;
          const net = grossVal === null ? null : grossVal - extraStrokes;
          return {
            userId: p.userId,
            gross: grossVal,
            extraStrokes,
            net,
            isContributor: false,
            par: parFor(holeAsScoring, p.teeGender),
          };
        });

        const bb = bestBallForHole(
          playerCells.map((pc) => ({
            userId: pc.userId,
            gross: pc.gross,
            extraStrokes: pc.extraStrokes,
          })),
        );

        // Flag contributors.
        for (const pc of playerCells) {
          pc.isContributor = bb.contributors.includes(pc.userId);
        }

        // Lag-rad-par: bruk første medlems tee-gender som lag-representant.
        // Speilet BestBallHoleRow.par i mode-router. Ved tom lag faller vi
        // tilbake til hole.par (defensiv).
        const teamPar = parFor(holeAsScoring, teamPlayers[0]?.teeGender);

        return {
          holeNumber: hole.holeNumber,
          par: teamPar,
          strokeIndex: hole.strokeIndex,
          teamNet: bb.teamNet,
          contributorIds: bb.contributors,
          players: playerCells,
          parByGender: hole.parByGender,
        };
      });

      const missingHoles = teamHoles
        .filter((h) => h.teamNet === null)
        .map((h) => h.holeNumber);
      const total = teamHoles.reduce(
        (sum, h) => sum + (h.teamNet ?? 0),
        0,
      );

      return {
        teamNumber,
        players: teamPlayers,
        holes: teamHoles,
        total,
        missingHoles,
      };
    },
  );

  // For ranking: build an 18-length array per team. Missing holes get the
  // team's average so partial totals are compared fairly without crushing
  // the team's rank. Per spec, don't algorithmically penalize.
  const teamsForRanking = lines.map((l) => {
    const arr: number[] = [];
    for (let i = 0; i < 18; i++) {
      const h = l.holes[i];
      arr.push(h?.teamNet ?? 0);
    }
    return { id: l.teamNumber, holes: arr };
  });

  const ranked: RankedTeam[] = rankTeams(teamsForRanking);
  const rankById = new Map(ranked.map((r) => [r.id, r]));

  return lines.map((l) => {
    const r = rankById.get(l.teamNumber);
    return {
      ...l,
      rank: r?.rank ?? 0,
      tiedWith: r?.tiedWith ?? [],
    };
  });
}

export function playerDisplayName(p: {
  name: string;
  nickname: string | null;
}): string {
  return p.nickname ? `${p.name} «${p.nickname}»` : p.name;
}

export function teamMembersLabel(players: LbPlayer[]): string {
  const names = players.map((p) =>
    p.nickname && p.nickname.length > 0 ? p.nickname : p.name.split(' ')[0],
  );
  return names.join(' & ');
}

export function positionBadge(rank: number): string {
  if (rank === 1) return '🥇 1.';
  if (rank === 2) return '🥈 2.';
  if (rank === 3) return '🥉 3.';
  return `${rank}.`;
}

export function parseMode(value: unknown): LeaderboardMode {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'brutto' ? 'brutto' : 'netto';
}

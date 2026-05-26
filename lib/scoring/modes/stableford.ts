// Stableford-scoring per Tørny-spec: standard poeng-tabell etter netto-score.
//
// Standard-tabellen er den vanligste internasjonalt og brukes som default
// for solo-stableford. Modifikatorer (modified, stableford-quota etc) kan
// legges på som egne `points_table`-varianter senere.

import { strokesForHole } from '../strokeAllocation';
import { rankTeams } from '../tiebreaker';
import { parFor } from './parResolver';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  StablefordResult,
  StablefordSoloResult,
  StablefordTeamResult,
  StablefordPlayerLine,
  StablefordPlayerCell,
  StablefordTeamHoleRow,
  StablefordTeamLine,
} from './types';

export interface StablefordPointsInput {
  par: number;
  /** Netto strokes (gross minus extra strokes fra handicap-fordelingen). Null = hull ikke spilt. */
  netStrokes: number | null;
}

/**
 * Konverterer ett hull-resultat til stableford-poeng etter standard-tabellen:
 *   diff (netto − par)    poeng
 *   ≤ −3 (double eagle+)    5
 *   −2 (eagle)              4
 *   −1 (birdie)             3
 *    0 (par)                2
 *   +1 (bogey)              1
 *   ≥ +2 (double-bogey+)    0
 *
 * Null netStrokes (hull ikke spilt) returnerer 0 — samme behandling som
 * "pick up" eller blank på papir-scorekortet.
 */
export function computeStablefordPoints(input: StablefordPointsInput): number {
  if (input.netStrokes === null) return 0;
  const diff = input.netStrokes - input.par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

interface PlayerHolePoints {
  userId: string;
  /** Poeng per hull, indeksert på `holeNumber - 1` (lengde = holes.length). */
  perHole: number[];
  totalPoints: number;
  holesPlayed: number;
}

function computePlayerHolePoints(
  player: ScoringPlayer,
  holesSorted: ScoringHole[],
  grossByKey: Map<string, number | null>,
): PlayerHolePoints {
  const perHole: number[] = [];
  let totalPoints = 0;
  let holesPlayed = 0;

  for (const hole of holesSorted) {
    const gross = grossByKey.get(`${player.userId}#${hole.number}`) ?? null;
    if (gross === null) {
      perHole.push(0);
      continue;
    }
    const extra = strokesForHole(player.courseHandicap, hole.strokeIndex);
    const net = gross - extra;
    const points = computeStablefordPoints({
      par: parFor(hole, player.teeGender),
      netStrokes: net,
    });
    perHole.push(points);
    totalPoints += points;
    holesPlayed += 1;
  }

  return { userId: player.userId, perHole, totalPoints, holesPlayed };
}

/**
 * Padder per-hull-array til 18 elementer (med 0) slik at rankTeams sin
 * back-9/back-6/back-3/hole-18 indeksering alltid har posisjoner — også
 * for 9-hulls-baner eller partial rounds.
 */
function padTo18(perHole: number[]): number[] {
  if (perHole.length >= 18) return perHole.slice(0, 18);
  return [...perHole, ...Array(18 - perHole.length).fill(0)];
}

/**
 * Beregner stableford-leaderboard fra en ScoringContext. Switcher på
 * `mode_config.team_size`:
 *   - 1 → solo (én rad per spiller)
 *   - 2 → team / par-stableford / 4BBB (én rad per lag, lag-hull-poeng
 *         = MAX av partnernes individuelle poeng)
 *
 * Begge variantene bruker 5-tier tie-break-cascaden fra
 * `tiebreaker.rankTeams` med invertert sammenligning: punkt-arrays negeres
 * slik at "lavest vinner"-rangeringen blir "høyest stableford-poeng vinner".
 * Cascade-rekkefølge:
 *   1) total poeng (høyest)
 *   2) back-9 poeng (høyest)
 *   3) back-6 poeng
 *   4) back-3 poeng
 *   5) hole-18 poeng
 */
export function compute(ctx: ScoringContext): StablefordResult {
  // Defaulter til solo for å bevare tidligere oppførsel hvis mode_config
  // mangler team_size (skal ikke skje etter 0030-backfill, men solo er den
  // tryggere defaulten her siden den ikke krever team-assignment).
  const teamSize =
    ctx.game.mode_config.kind === 'stableford'
      ? ctx.game.mode_config.team_size
      : 1;

  if (teamSize === 2) return computeTeam(ctx);
  return computeSolo(ctx);
}

function computeSolo(ctx: ScoringContext): StablefordSoloResult {
  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  const playerPoints = ctx.players.map((p) => computePlayerHolePoints(p, holesSorted, grossByKey));

  // index-basert id slik at vi kan mappe tilbake til userId etterpå
  const teamsForRanking = playerPoints.map((p, i) => ({
    id: i,
    holes: padTo18(p.perHole).map((pts) => -pts),
  }));

  const ranked = rankTeams(teamsForRanking);
  // ranked er nå sortert "lavest negert total først" = "høyest poeng først".
  // Map tilbake til userIds og bygg StablefordPlayerLine.

  const players: StablefordPlayerLine[] = ranked.map((r) => {
    const source = playerPoints[r.id];
    const tiedWithUserIds = r.tiedWith.map((idx) => playerPoints[idx].userId);
    return {
      userId: source.userId,
      totalPoints: source.totalPoints,
      holesPlayed: source.holesPlayed,
      rank: r.rank,
      tiedWith: tiedWithUserIds,
    };
  });

  return { kind: 'stableford', variant: 'solo', players };
}

/**
 * Team-stien — 4BBB / par-stableford. Hver spiller spiller egen ball og fører
 * eget stableford-kort. For hvert hull tar laget MAX av partnernes individuelle
 * stableford-poeng (ikke sum), og lag-totalen er summen av hull-poengene.
 *
 * Forutsetning: alle spillere har `teamNumber !== null`. Spillere uten
 * teamNumber blir hoppet over (par-stableford krever lag-tilordning,
 * håndhevet i validation-laget i `lib/games/gamePayload.ts`).
 *
 * Lag-poeng-arrays brukes i rankTeams med negert sammenligning slik at
 * "høyest vinner". Tie-break-cascaden er identisk med solo og best-ball
 * (5-tier på lag-poeng-arrays).
 */
function computeTeam(ctx: ScoringContext): StablefordTeamResult {
  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  // Grupper spillere på teamNumber (filtrer ut null — validering håndhever
  // dette i payload-laget, men vi forsvarer scoring-laget mot dårlige rader).
  const teamPlayers = new Map<number, typeof ctx.players>();
  for (const p of ctx.players) {
    if (p.teamNumber === null) continue;
    const arr = teamPlayers.get(p.teamNumber) ?? [];
    arr.push(p);
    teamPlayers.set(p.teamNumber, arr);
  }

  const teamNumbers = [...teamPlayers.keys()].sort((a, b) => a - b);

  const baseLines = teamNumbers.map((teamNumber): Omit<StablefordTeamLine, 'rank' | 'tiedWith'> => {
    const members = teamPlayers.get(teamNumber) ?? [];

    const holes: StablefordTeamHoleRow[] = holesSorted.map((hole) => {
      const players: StablefordPlayerCell[] = members.map((p) => {
        const grossVal = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
        const extra = strokesForHole(p.courseHandicap, hole.strokeIndex);
        const netStrokes = grossVal === null ? null : grossVal - extra;
        const points = computeStablefordPoints({
          par: parFor(hole, p.teeGender),
          netStrokes,
        });
        return {
          userId: p.userId,
          gross: grossVal,
          netStrokes,
          points,
          isContributor: false,
        };
      });

      // Lag-hull-poeng = MAX av partnernes individuelle poeng. Ved tomt lag
      // (ingen members) defaulter teamPoints til 0 — defensivt mot edge-case.
      const teamPoints =
        players.length === 0 ? 0 : Math.max(...players.map((pc) => pc.points));

      // contributorIds = spillere som hadde MAX-poeng. Hvis teamPoints er 0
      // (alle har 0 poeng, double-bogey-or-worse) er det ingen reell "best
      // ball" på hullet — vi markerer ingen contributor i den situasjonen
      // slik at view-laget kan skille en aktiv 0-er fra en passiv 0-er.
      const hasRealContribution = teamPoints > 0;
      const contributorIds = hasRealContribution
        ? players.filter((pc) => pc.points === teamPoints).map((pc) => pc.userId)
        : [];

      for (const pc of players) {
        pc.isContributor = hasRealContribution && pc.points === teamPoints;
      }

      // StablefordTeamHoleRow.par representerer hullets par for display.
      // For blandet-kjønn-lag bruker vi første medlem som lag-representant
      // (parFor() faller tilbake til hole.par når parByGender ikke er satt).
      // Tomme lag (defensiv edge-case) får hole.par direkte. #240.
      const teamPar = members.length === 0 ? hole.par : parFor(hole, members[0].teeGender);

      return {
        holeNumber: hole.number,
        par: teamPar,
        strokeIndex: hole.strokeIndex,
        teamPoints,
        contributorIds,
        players,
      };
    });

    const totalPoints = holes.reduce((sum, h) => sum + h.teamPoints, 0);

    return {
      teamNumber,
      playerIds: members.map((m) => m.userId),
      holes,
      totalPoints,
    };
  });

  // Bygg 18-lange poeng-arrays for ranking. Negér slik at rankTeams sin
  // "lavest vinner"-cascade fungerer som "høyest vinner" på lag-poeng.
  const ranked = rankTeams(
    baseLines.map((l) => ({
      id: l.teamNumber,
      holes: padTo18(l.holes.map((h) => h.teamPoints)).map((pts) => -pts),
    })),
  );
  const rankById = new Map(ranked.map((r) => [r.id, r]));

  const teams: StablefordTeamLine[] = baseLines.map((l) => {
    const r = rankById.get(l.teamNumber);
    return {
      ...l,
      rank: r?.rank ?? 0,
      tiedWith: r?.tiedWith ?? [],
    };
  });

  return { kind: 'stableford', variant: 'team', teams };
}

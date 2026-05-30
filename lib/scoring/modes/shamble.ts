// Shamble / Champagne Scramble (issue #285): lag-format, best N av M per hull.
//
// Delt drive, så alle spiller sin egen ball til hull. Hver spiller eier sin
// egen score-rad (som best ball / nines — INGEN captain-rad, ingen ny tabell).
// Lagets hull-score = summen av de `count` laveste individuelle effective-
// scorene på hullet:
//
//   - Shamble:            count låst til 2 ("best 2").
//   - Champagne Scramble: count ∈ {1,2,3}, valgt av arrangør.
//
// Net vs gross (effectiveFor — identisk mønster som nines/skins):
//   - 'gross': effectiveScore = gross (HCP ignoreres).
//   - 'net':   effectiveScore = gross − strokesForHole(courseHandicap, SI).
//
// Pending: < count teammedlemmer har gross på hullet → teamScore null, hullet
// teller ikke i total. Hvert hull er uavhengig (ingen carryover).
//
// Ranking: lavest totalScore vinner (strokeplay), med 5-tier tie-break-cascade
// fra `rankTeams` på per-hull teamScore-arrays (0-padding for pending/missing
// hull — samme strategi som texasScramble / bestBall; UI flagger ufullstendige
// sammenligninger via holesCounted).

import { strokesForHole } from '../strokeAllocation';
import { rankTeams } from '../tiebreaker';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ShambleResult,
  ShambleHoleRow,
  ShambleHoleTeamCell,
  ShambleTeamLine,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function effectiveFor(
  scoringMode: 'gross' | 'net',
  gross: number,
  courseHandicap: number,
  strokeIndex: number,
): number {
  if (scoringMode === 'gross') return gross;
  return gross - strokesForHole(courseHandicap, strokeIndex);
}

interface MemberCell {
  userId: string;
  gross: number | null;
  effectiveScore: number | null;
}

/**
 * Beregner ett lags cell for ett hull: best-`count`-sum + counted-markering.
 * Pending når < `count` medlemmer har gross.
 */
function computeTeamCell(
  teamNumber: number,
  members: ScoringPlayer[],
  hole: ScoringHole,
  grossByKey: Map<string, number | null>,
  scoring: 'gross' | 'net',
  count: number,
): ShambleHoleTeamCell {
  const cells: MemberCell[] = members.map((p) => {
    const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
    const effectiveScore =
      gross === null
        ? null
        : effectiveFor(scoring, gross, p.courseHandicap, hole.strokeIndex);
    return { userId: p.userId, gross, effectiveScore };
  });

  const scored = cells.filter((c) => c.effectiveScore !== null);

  if (scored.length < count) {
    return {
      teamNumber,
      teamScore: null,
      pending: true,
      perPlayer: cells.map((c) => ({
        userId: c.userId,
        gross: c.gross,
        effectiveScore: c.effectiveScore,
        counted: false,
      })),
    };
  }

  // Deterministisk sortering: effective ASC, så gross ASC, så userId ASC.
  // Garanterer at "hvilken av to like scorer som telles" alltid er stabil
  // (påvirker kun counted-flagget, ikke teamScore-summen).
  const ranked = [...scored].sort((a, b) => {
    const ea = a.effectiveScore ?? 0;
    const eb = b.effectiveScore ?? 0;
    if (ea !== eb) return ea - eb;
    const ga = a.gross ?? 0;
    const gb = b.gross ?? 0;
    if (ga !== gb) return ga - gb;
    return a.userId.localeCompare(b.userId);
  });

  const countedSlice = ranked.slice(0, count);
  const countedIds = new Set(countedSlice.map((c) => c.userId));
  let teamScore = 0;
  for (const c of countedSlice) teamScore += c.effectiveScore ?? 0;

  return {
    teamNumber,
    teamScore,
    pending: false,
    perPlayer: cells.map((c) => ({
      userId: c.userId,
      gross: c.gross,
      effectiveScore: c.effectiveScore,
      counted: countedIds.has(c.userId),
    })),
  };
}

// ---------------------------------------------------------------------------
// Main compute
// ---------------------------------------------------------------------------

/**
 * Beregner Shamble / Champagne-Scramble-leaderboard fra en ScoringContext.
 * Returnerer per-hull-rader (visning) + per-lag-rader (rangering).
 *
 * Defensive fallback: manglende/feil `mode_config` → variant='shamble'
 * (låser count=2), scoring='net', team_size=4. `count` klampes til
 * [1, team_size] slik at draft-state med < count spillere aldri krasjer.
 * Validatoren i `lib/games/gamePayload.ts` håndhever lag-tilordning +
 * team_size ved publish.
 */
export function compute(ctx: ScoringContext): ShambleResult {
  const cfg = ctx.game.mode_config as {
    shamble_variant?: 'shamble' | 'champagne';
    shamble_count?: number;
    shamble_scoring?: 'gross' | 'net';
    team_size?: number;
  };

  const variant: 'shamble' | 'champagne' =
    cfg.shamble_variant === 'champagne' ? 'champagne' : 'shamble';
  const scoring: 'gross' | 'net' =
    cfg.shamble_scoring === 'gross' || cfg.shamble_scoring === 'net'
      ? cfg.shamble_scoring
      : 'net';
  const teamSize: 3 | 4 = cfg.team_size === 3 ? 3 : 4;

  // Shamble-preset låser count til 2. Champagne leser config (default 2).
  const rawCount =
    variant === 'shamble'
      ? 2
      : cfg.shamble_count === 1 ||
          cfg.shamble_count === 2 ||
          cfg.shamble_count === 3
        ? cfg.shamble_count
        : 2;
  const count = Math.max(1, Math.min(rawCount, teamSize)) as 1 | 2 | 3;

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  // Gruppér spillere på teamNumber. Spillere uten team hoppes over (validatoren
  // håndhever lag-tilordning ved publish).
  const teamPlayers = new Map<number, ScoringPlayer[]>();
  for (const p of ctx.players) {
    if (p.teamNumber === null) continue;
    const arr = teamPlayers.get(p.teamNumber) ?? [];
    arr.push(p);
    teamPlayers.set(p.teamNumber, arr);
  }
  const teamNumbers = [...teamPlayers.keys()].sort((a, b) => a - b);

  // Per lag: per-hull cells (i holesSorted-rekkefølge) + totaler.
  const cellsByTeam = new Map<number, ShambleHoleTeamCell[]>();
  const totalsByTeam = new Map<
    number,
    { totalScore: number; holesCounted: number }
  >();

  for (const teamNumber of teamNumbers) {
    const members = teamPlayers.get(teamNumber) ?? [];
    const cells = holesSorted.map((hole) =>
      computeTeamCell(teamNumber, members, hole, grossByKey, scoring, count),
    );
    let totalScore = 0;
    let holesCounted = 0;
    for (const c of cells) {
      if (!c.pending && c.teamScore !== null) {
        totalScore += c.teamScore;
        holesCounted += 1;
      }
    }
    cellsByTeam.set(teamNumber, cells);
    totalsByTeam.set(teamNumber, { totalScore, holesCounted });
  }

  // Hull-major rader for visning — én cell per lag, sortert teamNumber ASC.
  const holes: ShambleHoleRow[] = holesSorted.map((hole, idx) => ({
    holeNumber: hole.number,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    teams: teamNumbers.map(
      (tn) => (cellsByTeam.get(tn) as ShambleHoleTeamCell[])[idx],
    ),
  }));

  // Ranking: 18-langt teamScore-array per lag (0-padding for pending/missing,
  // samme behandling som texasScramble). Lavest sum vinner.
  const ranked = rankTeams(
    teamNumbers.map((tn) => {
      const cells = cellsByTeam.get(tn) ?? [];
      const arr: number[] = [];
      for (let i = 0; i < 18; i++) {
        arr.push(cells[i]?.teamScore ?? 0);
      }
      return { id: tn, holes: arr };
    }),
  );
  const rankById = new Map(ranked.map((r) => [r.id, r]));

  const teams: ShambleTeamLine[] = teamNumbers.map((tn) => {
    const members = (teamPlayers.get(tn) ?? [])
      .map((m) => m.userId)
      .sort((a, b) => a.localeCompare(b));
    const totals = totalsByTeam.get(tn) ?? { totalScore: 0, holesCounted: 0 };
    const r = rankById.get(tn);
    return {
      teamNumber: tn,
      members,
      totalScore: totals.totalScore,
      holesCounted: totals.holesCounted,
      rank: r?.rank ?? 0,
      tiedWith: r?.tiedWith ?? [],
    };
  });

  // Teams-array sortert på rank ASC (lavest totalScore = rank 1), teamNumber
  // som deterministisk fallback.
  teams.sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : a.teamNumber - b.teamNumber,
  );

  return {
    kind: 'shamble',
    variant,
    count,
    scoring,
    teamSize,
    holes,
    teams,
  };
}

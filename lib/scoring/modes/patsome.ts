// Patsome-scoring (issue #286): 6 hull 4BBB → 6 hull greensome → 6 hull foursomes.
//
// Rotasjons-format: 18 hull delt i tre like 6-hulls-segmenter, hvert med sin
// lagspill-form. Felles valuta = stableford-poeng per lag per hull — eneste
// valutaen som forener 2-ball-segmentet (4BBB) og 1-ball-segmentene
// (greensome/foursomes) samt pickups/uspilte hull (→ 0 poeng).
//
//   Hull 1–6:   4BBB       — begge spiller, teamPoints = MAX av partner-poeng.
//                            Allowance: full individuell CH per spiller.
//   Hull 7–12:  Greensome  — én lagball, kaptein-eide scores-rad.
//                            Allowance (net): round(0.6×minCH + 0.4×maxCH).
//   Hull 13–18: Foursomes  — én lagball, kaptein-eide scores-rad.
//                            Allowance (net): round(0.5×(chA + chB)).
//
// Kaptein = lex-min userId på laget (via `pickTeamCaptain`). Kapteinen eier
// scores-radene for hull 7–18 (samme mønster som Texas scramble og foursomes
// matchplay). Kapteinens teeGender representerer laget i 1-ball-segmentene.
//
// Ranking: høyest totalPoints vinner. Gjenbruker `rankTeams` med negerte per-
// hull-poeng slik at "lavest vinner"-cascaden fungerer som "høyest vinner".
// Cascade: total → back-9 → back-6 → back-3 → hull-18 (5-tier, gratis).
//
// Forutsetning: 18 hull. Degraderer trygt på kortere baner (manglende hull = 0
// poeng per segment). Validatoren håndhever 18 hull og 2 spillere per lag ved
// publish; scoring-laget forsvarer seg mot draft-state (n≠2, null-team).

import { pickTeamCaptain } from '@/lib/games/teamCaptain';
import { strokesForHole } from '../strokeAllocation';
import { rankTeams } from '../tiebreaker';
import { parFor } from './parResolver';
import { computeStablefordPoints } from './stableford';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  PatsomeResult,
  PatsomeTeamLine,
  PatsomeHoleRow,
  PatsomePlayerCell,
  PatsomeSegment,
  PatsomeSegmentSubtotal,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Padder per-hull-poeng-array til 18 elementer (med 0) for `rankTeams` sin
 * back-9/back-6/back-3/hull-18-indeksering. Speiler padTo18 i stableford.ts.
 */
function padTo18(perHole: number[]): number[] {
  if (perHole.length >= 18) return perHole.slice(0, 18);
  return [...perHole, ...Array(18 - perHole.length).fill(0)];
}

/** Bestemmer segment fra hull-nummer. Hardkodet 6/6/6. */
function segmentFor(holeNumber: number): PatsomeSegment {
  if (holeNumber <= 6) return 'fourball';
  if (holeNumber <= 12) return 'greensome';
  return 'foursomes';
}

// ---------------------------------------------------------------------------
// Main compute
// ---------------------------------------------------------------------------

/**
 * Beregner Patsome-leaderboard fra en ScoringContext.
 *
 * Returnerer én rad per lag (sortert på teamNumber stigende). Ranking-feltet
 * `rank` reflekterer 1.-plass-finish (høyest totalPoints vinner). `tiedWith`
 * lister lag-nummer for lag med eksakt samme tie-break-cascade.
 *
 * Defensive fallback: hvis `mode_config.patsome_scoring` mangler eller
 * `mode_config.kind` ikke er 'patsome' → scoring='net'. Speiler nines.ts-mønstret.
 */
export function compute(ctx: ScoringContext): PatsomeResult {
  // Defensiv lesning av scoring-flag — speiler skins/nines-mønstret.
  const cfg = ctx.game.mode_config as {
    kind?: string;
    patsome_scoring?: 'gross' | 'net';
  };
  const scoring: 'gross' | 'net' =
    cfg.patsome_scoring === 'gross' || cfg.patsome_scoring === 'net'
      ? cfg.patsome_scoring
      : 'net';

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);

  // Indekser alle scores for O(1)-lookup per (userId, holeNumber).
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  // Grupper spillere på teamNumber. Filtrer ut spillere uten team —
  // validatoren håndhever lag-tilordning ved publish, men scoring-laget
  // forsvarer seg mot draft-state.
  const teamPlayers = new Map<number, ScoringPlayer[]>();
  for (const p of ctx.players) {
    if (p.teamNumber === null) continue;
    const arr = teamPlayers.get(p.teamNumber) ?? [];
    arr.push(p);
    teamPlayers.set(p.teamNumber, arr);
  }

  const teamNumbers = [...teamPlayers.keys()].sort((a, b) => a - b);

  const baseLines = teamNumbers.map(
    (teamNumber): Omit<PatsomeTeamLine, 'rank' | 'tiedWith'> => {
      const members = teamPlayers.get(teamNumber) ?? [];

      // Kaptein = lex-min userId. Kaster kun ved tomt lag (defensivt fanget med fallback).
      const captainUserId =
        members.length > 0 ? pickTeamCaptain(members.map((m) => m.userId)) : '';
      const captainMember = members.find((m) => m.userId === captainUserId);

      // Lag-handicap-verdier for 1-ball-segmentene.
      const courseHandicaps = members.map((m) => m.courseHandicap);
      const minCH = courseHandicaps.length > 0 ? Math.min(...courseHandicaps) : 0;
      const maxCH = courseHandicaps.length > 0 ? Math.max(...courseHandicaps) : 0;
      const sumCH = courseHandicaps.reduce((s, ch) => s + ch, 0);

      // Greensome allowance: round(0.6×min + 0.4×max). 0 i gross-modus.
      const greensomeHandicap =
        scoring === 'net' ? Math.round(0.6 * minCH + 0.4 * maxCH) : 0;

      // Foursomes allowance: round(0.5×sum). 0 i gross-modus.
      const foursomesHandicap =
        scoring === 'net' ? Math.round(0.5 * sumCH) : 0;

      const holes: PatsomeHoleRow[] = holesSorted.map(
        (hole): PatsomeHoleRow => {
          const segment = segmentFor(hole.number);

          if (segment === 'fourball') {
            return computeFourballHole(
              hole,
              members,
              grossByKey,
              scoring,
            );
          } else {
            // greensome eller foursomes: én lagball, kaptein-eid rad.
            const teamHandicap =
              segment === 'greensome' ? greensomeHandicap : foursomesHandicap;
            return computeOneBallHole(
              hole,
              segment,
              captainUserId,
              captainMember?.teeGender,
              teamHandicap,
              grossByKey,
            );
          }
        },
      );

      // Segment-delsummer.
      const segmentSubtotals = buildSegmentSubtotals(holes);

      const totalPoints = holes.reduce((sum, h) => sum + h.teamPoints, 0);

      return {
        teamNumber,
        playerIds: members.map((m) => m.userId),
        captainUserId,
        holes,
        segments: segmentSubtotals,
        totalPoints,
      };
    },
  );

  // Ranking: negér per-hull-poeng slik at rankTeams sin "lavest vinner"-cascade
  // fungerer som "høyest vinner" på stableford-poeng. Speiler stableford.ts.
  const ranked = rankTeams(
    baseLines.map((l) => ({
      id: l.teamNumber,
      holes: padTo18(l.holes.map((h) => h.teamPoints)).map((pts) => -pts),
    })),
  );
  const rankById = new Map(ranked.map((r) => [r.id, r]));

  const teams: PatsomeTeamLine[] = baseLines.map((l) => {
    const r = rankById.get(l.teamNumber);
    return {
      ...l,
      rank: r?.rank ?? 0,
      tiedWith: r?.tiedWith ?? [],
    };
  });

  return { kind: 'patsome', scoring, teams };
}

// ---------------------------------------------------------------------------
// Fourball hull (1–6): begge spiller, MAX av partnernes poeng.
// ---------------------------------------------------------------------------

function computeFourballHole(
  hole: ScoringHole,
  members: ScoringPlayer[],
  grossByKey: Map<string, number | null>,
  scoring: 'gross' | 'net',
): PatsomeHoleRow {
  const players: PatsomePlayerCell[] = members.map((p): PatsomePlayerCell => {
    const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;

    let netStrokes: number | null;
    if (gross === null) {
      netStrokes = null;
    } else if (scoring === 'net') {
      netStrokes = gross - strokesForHole(p.courseHandicap, hole.strokeIndex);
    } else {
      netStrokes = gross;
    }

    const points = computeStablefordPoints({
      par: parFor(hole, p.teeGender),
      netStrokes,
    });

    return {
      userId: p.userId,
      gross,
      netStrokes,
      points,
      isContributor: false, // settes nedenfor
    };
  });

  // teamPoints = MAX av partnernes individuelle poeng. Tom lag → 0.
  const teamPoints =
    players.length === 0 ? 0 : Math.max(...players.map((pc) => pc.points));

  // contributorIds: standard-stableford contributor-regel — kun når teamPoints > 0.
  // Spillere med MAX-poeng OG faktisk spilt (gross !== null).
  const hasRealContribution = teamPoints > 0;
  const contributorIds = hasRealContribution
    ? players
        .filter((pc) => pc.points === teamPoints && pc.gross !== null)
        .map((pc) => pc.userId)
    : [];

  for (const pc of players) {
    pc.isContributor =
      hasRealContribution && pc.points === teamPoints && pc.gross !== null;
  }

  // par for hullet: bruk første members teeGender som lag-representant (samme
  // mønster som stableford.ts computeTeam). Tomt lag → hole.par.
  const teamPar =
    members.length === 0 ? hole.par : parFor(hole, members[0].teeGender);

  return {
    holeNumber: hole.number,
    par: teamPar,
    strokeIndex: hole.strokeIndex,
    segment: 'fourball',
    players,
    contributorIds,
    teamGross: null,
    teamExtraStrokes: 0,
    teamNetStrokes: null,
    teamPoints,
  };
}

// ---------------------------------------------------------------------------
// Greensome / Foursomes hull (7–12 / 13–18): én lagball, kaptein-eid rad.
// ---------------------------------------------------------------------------

function computeOneBallHole(
  hole: ScoringHole,
  segment: 'greensome' | 'foursomes',
  captainUserId: string,
  captainTeeGender: import('./types').ScoringGender | undefined,
  teamHandicap: number,
  grossByKey: Map<string, number | null>,
): PatsomeHoleRow {
  const teamGross = grossByKey.get(`${captainUserId}#${hole.number}`) ?? null;

  let teamExtraStrokes: number;
  let teamNetStrokes: number | null;

  if (teamGross === null) {
    teamExtraStrokes = 0;
    teamNetStrokes = null;
  } else {
    teamExtraStrokes = strokesForHole(teamHandicap, hole.strokeIndex);
    teamNetStrokes = teamGross - teamExtraStrokes;
  }

  const teamPoints = computeStablefordPoints({
    par: parFor(hole, captainTeeGender),
    netStrokes: teamNetStrokes,
  });

  const teamPar = parFor(hole, captainTeeGender);

  return {
    holeNumber: hole.number,
    par: teamPar,
    strokeIndex: hole.strokeIndex,
    segment,
    players: [],
    contributorIds: [],
    teamGross,
    teamExtraStrokes,
    teamNetStrokes,
    teamPoints,
  };
}

// ---------------------------------------------------------------------------
// Segment-delsummer
// ---------------------------------------------------------------------------

function buildSegmentSubtotals(holes: PatsomeHoleRow[]): {
  fourball: PatsomeSegmentSubtotal;
  greensome: PatsomeSegmentSubtotal;
  foursomes: PatsomeSegmentSubtotal;
} {
  const init = (): { points: number; holesPlayed: number } => ({
    points: 0,
    holesPlayed: 0,
  });

  const fb = init();
  const gs = init();
  const fs = init();

  for (const h of holes) {
    const bucket = h.segment === 'fourball' ? fb : h.segment === 'greensome' ? gs : fs;
    bucket.points += h.teamPoints;

    // holesPlayed: et hull telles som spilt dersom laget faktisk spilte det —
    // 4BBB: minst én spiller har gross; greensome/foursomes: teamGross !== null.
    // Et hull med 0 teamPoints men spilt teller fortsatt.
    let played: boolean;
    if (h.segment === 'fourball') {
      played = h.players.some((p) => p.gross !== null);
    } else {
      played = h.teamGross !== null;
    }
    if (played) bucket.holesPlayed += 1;
  }

  return {
    fourball: { segment: 'fourball', points: fb.points, holesPlayed: fb.holesPlayed },
    greensome: { segment: 'greensome', points: gs.points, holesPlayed: gs.holesPlayed },
    foursomes: { segment: 'foursomes', points: fs.points, holesPlayed: fs.holesPlayed },
  };
}

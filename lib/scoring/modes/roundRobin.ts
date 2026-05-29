// Round Robin-scoring (issue #280): 4-spiller roterende-partner 4BBB-matchplay.
//
// Format: runden deles i tre 6-hulls-segmenter. Partner-konstellasjonen roterer
// deterministisk slik at hver spiller spiller med + mot alle andre nøyaktig én gang:
//   Seg1 (hull 1–6):   side1 = [slot1, slot2]   vs side2 = [slot3, slot4]
//   Seg2 (hull 7–12):  side1 = [slot1, slot3]   vs side2 = [slot2, slot4]
//   Seg3 (hull 13–18): side1 = [slot1, slot4]   vs side2 = [slot2, slot3]
//
// Per hull: samme 4BBB-matchplay-motor som fourball_matchplay:
//   - `applyAllowance(courseHandicap, allowance_pct)` → effektiv HCP per spiller
//   - `strokesForHole(effective, SI)` → extra strokes per spiller per hull
//   - `bestBallForHole(side)` → lag-best netto + contributors
//   - `classifyMatchplayHole(side1Net, side2Net)` → 'side1_wins' | 'side2_wins' | 'tied' | 'unplayed'
//
// Hull-seire-modell (kanonisk kilde: golfcompendium.com):
//   - Vinnende side: +1 hull-seire til HVER spiller på vinnende side
//   - Delt hull: 0 til alle (rangerings-invariant vs ½-alternativet)
//   - Unplayed hull: 0 til alle
//
// Rangering: totalHoleWins DESC → totalHolesLost ASC → teamNumber ASC.
// (Full 5-tier-cascade gjelder ikke — Round Robin er ikke slag-basert.)
//
// Ingen mat-em — alle 18 hull spilles og teller. Speiler fourball-kommentaren:
// `computeMatchResult` brukes IKKE (Round Robin har ikke «3&2»-avgjørelse).
//
// Arkitektonisk valg: Round Robin er et eget format (eget `game_mode`-slug),
// men `compute()` er en tynn rotasjons-+aggregerings-wrapper rundt fourball-motoren.
// Se «Key Architectural Decision 2» i .forge/contracts/280-round-robin.md.

import { applyAllowance } from '../courseHandicap';
import { strokesForHole } from '../strokeAllocation';
import { bestBallForHole } from './bestBall';
import { parFor } from './parResolver';
import { classifyMatchplayHole } from './singlesMatchplay';
import type {
  ScoringContext,
  ScoringPlayer,
  RoundRobinResult,
  RoundRobinHoleRow,
  RoundRobinPlayerCell,
  RoundRobinPlayerLine,
  RoundRobinSegmentLine,
} from './types';

// ---------------------------------------------------------------------------
// Rotasjons-tabell (ren deterministisk funksjon av segment)
// ---------------------------------------------------------------------------

/**
 * Segmentnummer for et hull (1–3). Hardkodet 6-6-6-struktur i v1.
 * segmentForHole(1) = 1, segmentForHole(6) = 1, segmentForHole(7) = 2, osv.
 */
function segmentForHole(holeNumber: number): 1 | 2 | 3 {
  return (Math.floor((holeNumber - 1) / 6) + 1) as 1 | 2 | 3;
}

/**
 * Returner [side1SlotIds, side2SlotIds] for en gitt segment.
 * Slot-tall 1-4 matcher spillerens `teamNumber`.
 *
 * Seg1: [1,2] vs [3,4]
 * Seg2: [1,3] vs [2,4]
 * Seg3: [1,4] vs [2,3]
 */
function slotPairingsForSegment(
  segment: 1 | 2 | 3,
): [[number, number], [number, number]] {
  switch (segment) {
    case 1:
      return [[1, 2], [3, 4]];
    case 2:
      return [[1, 3], [2, 4]];
    case 3:
      return [[1, 4], [2, 3]];
  }
}

/**
 * Finner partneren til en spiller i et gitt segment.
 * Returnerer den andre userId-en fra slot-paret spilleren befinner seg i.
 */
function partnerInSegment(
  segment: 1 | 2 | 3,
  playerSlot: number,
  slotToUserId: Map<number, string>,
): string {
  const [side1, side2] = slotPairingsForSegment(segment);
  const sameSide = side1.includes(playerSlot) ? side1 : side2;
  const partnerSlot = sameSide.find((s) => s !== playerSlot)!;
  return slotToUserId.get(partnerSlot) ?? '';
}

/**
 * Finner motstanderne til en spiller i et gitt segment.
 * Returnerer [userId1, userId2] fra den andre siden.
 */
function opponentsInSegment(
  segment: 1 | 2 | 3,
  playerSlot: number,
  slotToUserId: Map<number, string>,
): [string, string] {
  const [side1, side2] = slotPairingsForSegment(segment);
  const oppSide = side1.includes(playerSlot) ? side2 : side1;
  return [slotToUserId.get(oppSide[0]) ?? '', slotToUserId.get(oppSide[1]) ?? ''];
}

// ---------------------------------------------------------------------------
// Defensiv empty-shell
// ---------------------------------------------------------------------------

/**
 * Returneres defensivt når vi ikke har nøyaktig 4 spillere med unike slots 1-4.
 * Validatoren i `lib/games/gamePayload.ts` håndhever dette ved publish; men
 * draft-state kan ha ugyldig oppsett, og scoring-laget kaster ikke.
 */
function emptyShell(allowancePct: number): RoundRobinResult {
  return {
    kind: 'round_robin',
    allowancePct,
    holes: [],
    players: [],
  };
}

// ---------------------------------------------------------------------------
// Allowance-lesing
// ---------------------------------------------------------------------------

/**
 * Leser `allowance_pct` fra mode_config. Defensivt fallback til 85 hvis
 * config-kind ikke stemmer eller feltet mangler — draft-state kan ha
 * delvis konfigurert config. Validatoren håndhever range 0..100 ved publish.
 */
function readAllowancePct(ctx: ScoringContext): number {
  const config = ctx.game.mode_config;
  if (config.kind !== 'round_robin') return 85;
  const raw = (config as { allowance_pct?: number }).allowance_pct;
  return typeof raw === 'number' ? raw : 85;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

interface PlayerAccumulator {
  userId: string;
  teamNumber: number;
  totalHoleWins: number;
  totalHolesLost: number;
  totalHolesHalved: number;
  segmentAccum: Map<
    1 | 2 | 3,
    { holesWon: number; holesLost: number; holesHalved: number }
  >;
}

/**
 * Ranger spillerne per Round Robin-tiebreak-kaskade:
 *   1. totalHoleWins DESC
 *   2. totalHolesLost ASC (færre tap er bedre)
 *   3. teamNumber ASC (deterministisk siste tiebreak)
 *
 * `tiedWith` lister userIds med EKSAKT samme (totalHoleWins, totalHolesLost).
 * Full 5-tier-cascade gjelder ikke (Round Robin er ikke slag-basert).
 */
function rankPlayers(
  accumulators: PlayerAccumulator[],
  slotToUserId: Map<number, string>,
): RoundRobinPlayerLine[] {
  const sorted = [...accumulators].sort((a, b) => {
    if (b.totalHoleWins !== a.totalHoleWins) {
      return b.totalHoleWins - a.totalHoleWins;
    }
    if (a.totalHolesLost !== b.totalHolesLost) {
      return a.totalHolesLost - b.totalHolesLost;
    }
    return a.teamNumber - b.teamNumber;
  });

  return sorted.map((acc, idx) => {
    // shared rank: første index med lik (wins, losses)
    const firstTiedIndex = sorted.findIndex(
      (other) =>
        other.totalHoleWins === acc.totalHoleWins &&
        other.totalHolesLost === acc.totalHolesLost,
    );

    const tiedWith = sorted
      .filter(
        (other, j) =>
          j !== idx &&
          other.totalHoleWins === acc.totalHoleWins &&
          other.totalHolesLost === acc.totalHolesLost,
      )
      .map((o) => o.userId);

    // Bygg segment-linjer
    const segments: RoundRobinSegmentLine[] = ([1, 2, 3] as const).map((seg) => {
      const segAcc = acc.segmentAccum.get(seg) ?? { holesWon: 0, holesLost: 0, holesHalved: 0 };
      return {
        segment: seg,
        holeNumbers: Array.from({ length: 6 }, (_, i) => (seg - 1) * 6 + i + 1),
        partnerUserId: partnerInSegment(seg, acc.teamNumber, slotToUserId),
        opponentUserIds: opponentsInSegment(seg, acc.teamNumber, slotToUserId),
        holesWon: segAcc.holesWon,
        holesLost: segAcc.holesLost,
        holesHalved: segAcc.holesHalved,
      };
    });

    return {
      userId: acc.userId,
      teamNumber: acc.teamNumber,
      totalHoleWins: acc.totalHoleWins,
      totalHolesLost: acc.totalHolesLost,
      totalHolesHalved: acc.totalHolesHalved,
      segments,
      rank: firstTiedIndex + 1,
      tiedWith,
    };
  });
}

// ---------------------------------------------------------------------------
// Hoved-compute
// ---------------------------------------------------------------------------

export function compute(ctx: ScoringContext): RoundRobinResult {
  const allowancePct = readAllowancePct(ctx);

  // Valider: EKSAKT 4 spillere med unike teamNumber-slots 1-4
  const slots = new Set(
    ctx.players
      .map((p) => p.teamNumber)
      .filter((n): n is number => n !== null && n >= 1 && n <= 4),
  );
  if (ctx.players.length !== 4 || slots.size !== 4) {
    return emptyShell(allowancePct);
  }

  // Bygg slot → userId-mapping
  const slotToPlayer = new Map<number, ScoringPlayer>();
  for (const p of ctx.players) {
    if (p.teamNumber !== null) slotToPlayer.set(p.teamNumber, p);
  }
  const slotToUserId = new Map<number, string>();
  for (const [slot, player] of slotToPlayer) {
    slotToUserId.set(slot, player.userId);
  }

  // Pre-beregn effektiv HCP per spiller
  const effectiveByUser = new Map<string, number>();
  for (const p of ctx.players) {
    effectiveByUser.set(p.userId, applyAllowance(p.courseHandicap, allowancePct));
  }

  // Bygg gross-lookup
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  // Initialiser akkumulatorer
  const accumByUser = new Map<string, PlayerAccumulator>();
  for (const p of ctx.players) {
    const segmentAccum = new Map<1 | 2 | 3, { holesWon: number; holesLost: number; holesHalved: number }>();
    segmentAccum.set(1, { holesWon: 0, holesLost: 0, holesHalved: 0 });
    segmentAccum.set(2, { holesWon: 0, holesLost: 0, holesHalved: 0 });
    segmentAccum.set(3, { holesWon: 0, holesLost: 0, holesHalved: 0 });
    accumByUser.set(p.userId, {
      userId: p.userId,
      teamNumber: p.teamNumber ?? 0,
      totalHoleWins: 0,
      totalHolesLost: 0,
      totalHolesHalved: 0,
      segmentAccum,
    });
  }

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const holeRows: RoundRobinHoleRow[] = [];

  for (const hole of holesSorted) {
    const seg = segmentForHole(hole.number);
    const [[s1a, s1b], [s2a, s2b]] = slotPairingsForSegment(seg);

    const side1Slots = [s1a, s1b];
    const side2Slots = [s2a, s2b];

    const side1Players = side1Slots.map((slot) => slotToPlayer.get(slot)!);
    const side2Players = side2Slots.map((slot) => slotToPlayer.get(slot)!);

    // Bygg per-spiller-celler (speiler fourball-mønsteret)
    const buildCells = (sidePlayerList: ScoringPlayer[]): RoundRobinPlayerCell[] =>
      sidePlayerList.map((p) => {
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

    // Lag-best via gjenbrukt bestBallForHole
    const bb1 = bestBallForHole(
      side1Cells.map((c) => ({ userId: c.userId, gross: c.gross, extraStrokes: c.extraStrokes })),
    );
    const bb2 = bestBallForHole(
      side2Cells.map((c) => ({ userId: c.userId, gross: c.gross, extraStrokes: c.extraStrokes })),
    );

    // Markér contributors
    for (const c of side1Cells) c.isContributor = bb1.contributors.includes(c.userId);
    for (const c of side2Cells) c.isContributor = bb2.contributors.includes(c.userId);

    // Per-hull-utfall
    const result = classifyMatchplayHole(bb1.teamNet, bb2.teamNet);

    // Hull-seire-modell: +1 til vinnende side, 0 til alle ellers
    const holeWinByPlayer: Record<string, number> = {};
    for (const p of ctx.players) {
      holeWinByPlayer[p.userId] = 0;
    }

    const side1UserIds = side1Players.map((p) => p.userId);
    const side2UserIds = side2Players.map((p) => p.userId);

    if (result === 'side1_wins') {
      for (const uid of side1UserIds) holeWinByPlayer[uid] = 1;
    } else if (result === 'side2_wins') {
      for (const uid of side2UserIds) holeWinByPlayer[uid] = 1;
    }
    // 'tied' og 'unplayed': alle forblir 0

    // Akkumulér i working-state
    const allUserIds = [...side1UserIds, ...side2UserIds];
    for (const uid of allUserIds) {
      const accum = accumByUser.get(uid);
      if (!accum) continue;
      const segAccum = accum.segmentAccum.get(seg)!;
      if (result === 'side1_wins') {
        if (side1UserIds.includes(uid)) {
          accum.totalHoleWins += 1;
          segAccum.holesWon += 1;
        } else {
          accum.totalHolesLost += 1;
          segAccum.holesLost += 1;
        }
      } else if (result === 'side2_wins') {
        if (side2UserIds.includes(uid)) {
          accum.totalHoleWins += 1;
          segAccum.holesWon += 1;
        } else {
          accum.totalHolesLost += 1;
          segAccum.holesLost += 1;
        }
      } else if (result === 'tied') {
        accum.totalHolesHalved += 1;
        segAccum.holesHalved += 1;
      }
      // 'unplayed': ingen akkumulering (teller verken som seier, tap eller delt)
    }

    // Per-side par (speiler fourball-mønster: første partner som representant)
    const side1Par = parFor(hole, side1Players[0].teeGender);
    const side2Par = parFor(hole, side2Players[0].teeGender);

    holeRows.push({
      holeNumber: hole.number,
      segment: seg,
      par: side1Par, // backward-compat
      side1Par,
      side2Par,
      strokeIndex: hole.strokeIndex,
      side1PlayerIds: [side1Players[0].userId, side1Players[1].userId],
      side2PlayerIds: [side2Players[0].userId, side2Players[1].userId],
      side1Players: side1Cells,
      side2Players: side2Cells,
      side1BestNet: bb1.teamNet,
      side2BestNet: bb2.teamNet,
      side1ContributorIds: bb1.contributors,
      side2ContributorIds: bb2.contributors,
      result,
      holeWinByPlayer,
    });
  }

  const accumulators = [...accumByUser.values()];
  const playerLines = rankPlayers(accumulators, slotToUserId);

  return {
    kind: 'round_robin',
    allowancePct,
    holes: holeRows,
    players: playerLines,
  };
}

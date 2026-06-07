// Wolf-scoring (issue #274; #465: 3–5 spillere): rotating partner-format.
//
// Wolf er den eneste modus i Tørny i dag der lag-tildelingen er dynamisk
// per hull. Spilleren med riktig `team_number` for hullet (= Wolf) velger
// hvert hull en av tre strategier (n = antall spillere, 3–5):
//
//   - 'partner': Wolf + valgt partner mot resten. Vinner-side får
//     2 × stake til hver av sine to.
//   - 'lone':    Wolf alene mot de andre. Wolf vinner → n × stake;
//     opp vinner → 1 × stake til hver motstander.
//   - 'blind':   alene, deklarert FØR tee shots. Wolf vinner → (n+2) × stake;
//     opp vinner → 2 × stake til hver motstander.
//
// Stake-mekanikk: base = 1. Tied hull bærer stake +1 til neste hull. Avgjort
// hull resetter stake til 1 for neste. Pending hull (ikke spilt/ikke valgt)
// bevarer stake uendret. Gevinsten (n for lone, n+2 for blind) ER stake-
// uavhengig — selve choice-en på det aktuelle hullet bestemmer beløpet.
//
// Rotasjon (rotation: 'random_with_trailing'). La R = floor(18/n)*n:
//   - Hull 1..R: Wolf = player.find(p => p.teamNumber === ((hole-1) % n) + 1).
//     `team_number` er random permutasjon satt av wizard, lagret i DB.
//   - Hull R+1..18: Wolf = spilleren med lavest totalPoints etter forrige hull.
//     Tiebreak: team_number ASC (deterministisk). n=3 → R=18, ingen trailing.
//
// Når `wolf_hole_choices`-tabellen har en eksplisitt `wolf_user_id` for et
// hull, leses den direkte (kanonisk kilde). Rotasjons-regelen brukes som
// fallback når et hull ikke ennå har lagret choice.
//
// Net vs gross:
//   - 'gross': effectiveScore = gross direkte (HCP ignoreres).
//   - 'net':   effectiveScore = gross − strokesForHole(courseHandicap, SI).
// Allowance-pct på `games`-tabellen brukes IKKE — Wolf bruker enten full
// HCP eller ingen.
//
// Ranking: høyest totalPoints vinner. V1-tiebreak (simpler enn andre modi):
//   1. Poeng på siste hull spilleren var Wolf
//   2. team_number ASC
// Full 5-tier cascade kan legges til senere ved behov.

import { strokesForHole } from '../strokeAllocation';
import type {
  ScoringContext,
  ScoringPlayer,
  WolfResult,
  WolfHoleRow,
  WolfHoleChoice,
  WolfPlayerCell,
  WolfPlayerLine,
  WolfChoice,
  WolfHoleOutcome,
} from './types';

interface PlayerWorkingState {
  totalPoints: number;
  wolfHolesPlayed: number;
  blindWolfWins: number;
  /**
   * Poeng på siste hull spilleren var Wolf (uansett outcome). Brukt som
   * tiebreaker i ranking. Default 0 hvis spilleren aldri var Wolf eller
   * tjente 0 poeng på sitt siste Wolf-hull.
   */
  lastWolfHolePoints: number;
}

function makeWorkingState(): PlayerWorkingState {
  return {
    totalPoints: 0,
    wolfHolesPlayed: 0,
    blindWolfWins: 0,
    lastWolfHolePoints: 0,
  };
}

/**
 * Bestemmer Wolf-spilleren for et hull.
 *
 *  - Hvis `wolfChoices`-entry har eksplisitt `wolfUserId`, returner den.
 *  - Ellers hull 1..R: lineær rotasjon på `team_number` (R = floor(18/n)*n).
 *  - Hull R+1..18: lavest totalPoints i `working`, tiebreak team_number ASC.
 *
 * Returnerer null hvis vi ikke kan finne en gyldig wolf (defensive — bør
 * ikke skje når validatoren har gjort jobben sin med n distinct team_numbers).
 */
function determineWolf(
  holeNumber: number,
  players: ScoringPlayer[],
  working: Map<string, PlayerWorkingState>,
  explicitWolfFromChoice: string | undefined,
): ScoringPlayer | null {
  if (explicitWolfFromChoice) {
    const explicit = players.find((p) => p.userId === explicitWolfFromChoice);
    if (explicit) return explicit;
  }

  // #465: generalisert til n ∈ {3,4,5}. R = største multiplum av n ≤ 18 er
  // siste rotasjons-hull; resten (R+1..18) er trailing. n=3 → R=18 (ingen
  // trailing); n=4 → R=16 (trailing 17-18, = dagens); n=5 → R=15.
  const n = players.length;
  const R = Math.floor(18 / n) * n;
  if (holeNumber >= 1 && holeNumber <= R) {
    const slot = ((holeNumber - 1) % n) + 1;
    return players.find((p) => p.teamNumber === slot) ?? null;
  }

  // Hull R+1..18: trailing-wolf. Sorter på (totalPoints ASC, team_number ASC).
  // Vi sorterer en kopi for å unngå å mutere caller-array.
  const sorted = [...players].sort((a, b) => {
    const ta = working.get(a.userId)?.totalPoints ?? 0;
    const tb = working.get(b.userId)?.totalPoints ?? 0;
    if (ta !== tb) return ta - tb;
    return (a.teamNumber ?? 0) - (b.teamNumber ?? 0);
  });
  return sorted[0] ?? null;
}

/**
 * Beregner effektiv score for én spiller på ett hull. Returner null hvis
 * gross er null (hullet ikke spilt for denne spilleren).
 */
function effectiveScoreFor(
  player: ScoringPlayer,
  gross: number | null,
  strokeIndex: number,
  scoring: 'gross' | 'net',
): number | null {
  if (gross === null) return null;
  if (scoring === 'gross') return gross;
  return gross - strokesForHole(player.courseHandicap, strokeIndex);
}

/**
 * Bygger hull-rad og oppdaterer working-state for spillerne.
 *
 * Returnerer både den ferdige `WolfHoleRow` og `nextStake` — stake-en som
 * skal brukes på NESTE hull (caller setter den inn i loopen).
 */
function buildHoleRow(
  hole: { number: number; par: number; strokeIndex: number },
  players: ScoringPlayer[],
  grossByKey: Map<string, number | null>,
  choice: WolfHoleChoice | undefined,
  wolfPlayer: ScoringPlayer,
  stake: number,
  scoring: 'gross' | 'net',
  working: Map<string, PlayerWorkingState>,
): { row: WolfHoleRow; nextStake: number } {
  const cells: WolfPlayerCell[] = players.map((p) => {
    const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
    const eff = effectiveScoreFor(p, gross, hole.strokeIndex, scoring);
    return {
      userId: p.userId,
      gross,
      effectiveScore: eff,
      side: null,
      isContributor: false,
    };
  });

  // Default: pending. Vi overstyrer hvis vi har choice + komplette scores.
  let outcome: WolfHoleOutcome = 'pending';
  const pointsByPlayer: Record<string, number> = {};

  // Wolf-spilleren teller i wolfHolesPlayed uavhengig av outcome.
  const wolfState = working.get(wolfPlayer.userId);
  if (wolfState) {
    wolfState.wolfHolesPlayed += 1;
  }

  if (!choice) {
    // Ingen choice = pending. Stake bevart for neste hull (uendret).
    return {
      row: {
        holeNumber: hole.number,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        wolfUserId: wolfPlayer.userId,
        choice: null,
        partnerUserId: null,
        stake,
        outcome,
        players: cells,
        pointsByPlayer,
      },
      nextStake: stake,
    };
  }

  // Identifiser wolf-side vs opp-side basert på choice.
  const wolfSideIds = new Set<string>([wolfPlayer.userId]);
  if (choice.choice === 'partner' && choice.partnerUserId) {
    wolfSideIds.add(choice.partnerUserId);
  }
  const oppSideIds = new Set<string>(
    players.map((p) => p.userId).filter((id) => !wolfSideIds.has(id)),
  );

  // Annoter side per cell.
  for (const cell of cells) {
    if (wolfSideIds.has(cell.userId)) cell.side = 'wolf';
    else if (oppSideIds.has(cell.userId)) cell.side = 'opp';
  }

  // Sjekk om alle spillere på begge sider har effectiveScore. Mangler en
  // → outcome forblir 'pending', stake bevart, ingen poeng.
  const allScored = cells.every((c) => c.effectiveScore !== null);

  if (!allScored) {
    // Pending — clear side på cells siden hullet ikke ble scorable.
    for (const cell of cells) {
      cell.side = null;
    }
    return {
      row: {
        holeNumber: hole.number,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        wolfUserId: wolfPlayer.userId,
        choice: choice.choice,
        partnerUserId: choice.partnerUserId,
        stake,
        outcome,
        players: cells,
        pointsByPlayer,
      },
      nextStake: stake,
    };
  }

  // Alle har effectiveScore — bestem best per side.
  const wolfScores = cells.filter((c) => c.side === 'wolf');
  const oppScores = cells.filter((c) => c.side === 'opp');
  const wolfBest = Math.min(
    ...wolfScores.map((c) => c.effectiveScore as number),
  );
  const oppBest = Math.min(
    ...oppScores.map((c) => c.effectiveScore as number),
  );

  // Markér contributors (alle på sin side med best score).
  for (const c of wolfScores) {
    if (c.effectiveScore === wolfBest) c.isContributor = true;
  }
  for (const c of oppScores) {
    if (c.effectiveScore === oppBest) c.isContributor = true;
  }

  // Bestem outcome.
  if (wolfBest < oppBest) outcome = 'wolf_side_wins';
  else if (oppBest < wolfBest) outcome = 'opp_side_wins';
  else outcome = 'tied';

  // Distribuer poeng per choice + outcome.
  let nextStake = 1;
  if (outcome === 'tied') {
    // Ingen poeng. Stake bærer +1.
    nextStake = stake + 1;
  } else if (outcome === 'wolf_side_wins') {
    if (choice.choice === 'partner') {
      // +2 × stake til hver av wolf + partner.
      for (const id of wolfSideIds) {
        pointsByPlayer[id] = 2 * stake;
      }
    } else if (choice.choice === 'lone') {
      // #465: lone-gevinst = n (= antall spillere). n=4 → 4 (uendret).
      pointsByPlayer[wolfPlayer.userId] = players.length * stake;
    } else if (choice.choice === 'blind') {
      // #465: blind-gevinst = n+2. n=4 → 6 (uendret).
      pointsByPlayer[wolfPlayer.userId] = (players.length + 2) * stake;
      const blindState = working.get(wolfPlayer.userId);
      if (blindState) blindState.blindWolfWins += 1;
    }
    nextStake = 1;
  } else {
    // opp_side_wins
    if (choice.choice === 'partner') {
      // +1 × stake til hver av 2 motstandere.
      for (const id of oppSideIds) {
        pointsByPlayer[id] = 1 * stake;
      }
    } else if (choice.choice === 'lone') {
      // +1 × stake til hver av 3 motstandere.
      for (const id of oppSideIds) {
        pointsByPlayer[id] = 1 * stake;
      }
    } else if (choice.choice === 'blind') {
      // +2 × stake til hver av 3 motstandere.
      for (const id of oppSideIds) {
        pointsByPlayer[id] = 2 * stake;
      }
    }
    nextStake = 1;
  }

  // Akkumulér i working-state og oppdater lastWolfHolePoints for wolf.
  for (const [userId, pts] of Object.entries(pointsByPlayer)) {
    const state = working.get(userId);
    if (state) {
      state.totalPoints += pts;
    }
  }
  // Wolf får tracket sin lastWolfHolePoints (kan være 0).
  const wState = working.get(wolfPlayer.userId);
  if (wState) {
    wState.lastWolfHolePoints = pointsByPlayer[wolfPlayer.userId] ?? 0;
  }

  return {
    row: {
      holeNumber: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      wolfUserId: wolfPlayer.userId,
      choice: choice.choice,
      partnerUserId: choice.partnerUserId,
      stake,
      outcome,
      players: cells,
      pointsByPlayer,
    },
    nextStake,
  };
}

/**
 * Rank-en spillerne per Wolf-tiebreak-kaskade:
 *   1. totalPoints DESC
 *   2. lastWolfHolePoints DESC
 *   3. team_number ASC
 *
 * Returnerer shared rank for spillere med EKSAKT samme cascade-verdier.
 * `tiedWith` lister userIds som har akkurat samme rank.
 */
function rankPlayers(
  players: ScoringPlayer[],
  working: Map<string, PlayerWorkingState>,
): WolfPlayerLine[] {
  type Row = {
    player: ScoringPlayer;
    state: PlayerWorkingState;
  };
  const rows: Row[] = players.map((p) => ({
    player: p,
    state: working.get(p.userId) ?? makeWorkingState(),
  }));

  rows.sort((a, b) => {
    if (b.state.totalPoints !== a.state.totalPoints) {
      return b.state.totalPoints - a.state.totalPoints;
    }
    if (b.state.lastWolfHolePoints !== a.state.lastWolfHolePoints) {
      return b.state.lastWolfHolePoints - a.state.lastWolfHolePoints;
    }
    return (a.player.teamNumber ?? 0) - (b.player.teamNumber ?? 0);
  });

  return rows.map((row, idx) => {
    const tiedWith = rows
      .filter(
        (other, j) =>
          j !== idx &&
          other.state.totalPoints === row.state.totalPoints &&
          other.state.lastWolfHolePoints === row.state.lastWolfHolePoints,
      )
      .map((o) => o.player.userId);

    // Shared rank: første index hvor cascade matcher denne raden.
    const firstTiedIndex = rows.findIndex(
      (other) =>
        other.state.totalPoints === row.state.totalPoints &&
        other.state.lastWolfHolePoints === row.state.lastWolfHolePoints,
    );

    return {
      userId: row.player.userId,
      teamNumber: row.player.teamNumber ?? 0,
      totalPoints: row.state.totalPoints,
      wolfHolesPlayed: row.state.wolfHolesPlayed,
      blindWolfWins: row.state.blindWolfWins,
      rank: firstTiedIndex + 1,
      tiedWith,
    };
  });
}

export function compute(ctx: ScoringContext): WolfResult {
  const scoring: 'gross' | 'net' =
    ctx.game.mode_config.kind === 'wolf'
      ? ctx.game.mode_config.wolf_scoring
      : 'net';

  // Indekser scores for O(1)-lookup per (userId, holeNumber).
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  // Indekser choices per holeNumber.
  const choicesByHole = new Map<number, WolfHoleChoice>();
  for (const c of ctx.wolfChoices ?? []) {
    choicesByHole.set(c.holeNumber, c);
  }

  // Working-state per spiller. Akkumuleres etter hvert som hull beregnes.
  const working = new Map<string, PlayerWorkingState>();
  for (const p of ctx.players) {
    working.set(p.userId, makeWorkingState());
  }

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);

  let stake = 1;
  const holeRows: WolfHoleRow[] = [];

  for (const hole of holesSorted) {
    const choice = choicesByHole.get(hole.number);
    const wolfPlayer = determineWolf(
      hole.number,
      ctx.players,
      working,
      choice?.wolfUserId,
    );

    if (!wolfPlayer) {
      // Defensiv: ingen gyldig wolf — bygg pending-rad og bevar stake.
      holeRows.push({
        holeNumber: hole.number,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        wolfUserId: '',
        choice: null,
        partnerUserId: null,
        stake,
        outcome: 'pending',
        players: ctx.players.map((p) => ({
          userId: p.userId,
          gross: grossByKey.get(`${p.userId}#${hole.number}`) ?? null,
          effectiveScore: null,
          side: null,
          isContributor: false,
        })),
        pointsByPlayer: {},
      });
      continue;
    }

    const { row, nextStake } = buildHoleRow(
      hole,
      ctx.players,
      grossByKey,
      choice,
      wolfPlayer,
      stake,
      scoring,
      working,
    );
    holeRows.push(row);
    stake = nextStake;
  }

  const playerLines = rankPlayers(ctx.players, working);

  return {
    kind: 'wolf',
    scoring,
    rotation: 'random_with_trailing',
    holes: holeRows,
    players: playerLines,
  };
}

// Re-eksporter `WolfChoice`-typen så modulen kan brukes som single source
// for konsumenter som tar valgene som input.
export type { WolfChoice, WolfHoleOutcome };

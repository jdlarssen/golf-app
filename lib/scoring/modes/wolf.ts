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
// bevarer stake uendret. Gevinsten ganges med innsatsen på hullet: 2 × stake
// (partner), n × stake (lone), (n+2) × stake (blind). Visningen (Wolf-valget
// og kontekstlinja) leser regelen fra `lib/wolf/wolfPayout.ts`; enighetstesten
// i `wolf.test.ts` holder den og `buildHoleRow` like (#2313).
//
// Rotasjon: hvem som er ulv på hullet, bor i `wolfTurn.ts` (#2314), og
// motoren, hull-sidene og rosteret leser den derfra. To regler, valgt av
// `mode_config.wolf_rotation`:
//   - Uten flagget (rotation: 'random_with_trailing', spill fra før #2314):
//     rundgang på `team_number` til hull R = floor(18/n)*n, og hull R+1..18
//     går til den som ligger sist etter forrige hull, uansett avstand.
//   - `wolf_rotation: 'catch_up'` (rotation: 'catch_up', nye spill): fra hull
//     16 (tre eller fem spillere) eller 17 (fire) er den som ligger sist ulv
//     bare når den ligger minst n poeng bak lederen. Ellers går rundgangen
//     videre. `catchUp` på hull-raden sier at regelen ga hullet til den.
// Stillingen er poengene før hullet, slik loopen under har summert dem.
// Tiebreak for sisteplassen: team_number ASC.
//
// Når `wolf_hole_choices`-tabellen har en eksplisitt `wolf_user_id` for et
// hull, leses den direkte (kanonisk kilde). Regelen brukes når et hull ikke
// ennå har lagret choice.
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
import { wolfForHole, wolfRotationRule } from './wolfTurn';
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
  catchUp: boolean,
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
        catchUp,
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
        catchUp,
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
      catchUp,
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
  const rule = wolfRotationRule(ctx.game.mode_config);
  const turnPlayers = ctx.players.map((p) => ({
    userId: p.userId,
    teamNumber: p.teamNumber ?? 0,
  }));

  let stake = 1;
  const holeRows: WolfHoleRow[] = [];

  for (const hole of holesSorted) {
    const choice = choicesByHole.get(hole.number);
    // Stillingen før hullet: totalene loopen har summert så langt.
    const pointsBefore = new Map<string, number>();
    for (const [userId, state] of working) pointsBefore.set(userId, state.totalPoints);
    const turn = wolfForHole({
      holeNumber: hole.number,
      players: turnPlayers,
      pointsBefore,
      explicitWolf: choice?.wolfUserId,
      rule,
    });
    const wolfPlayer = turn
      ? (ctx.players.find((p) => p.userId === turn.userId) ?? null)
      : null;

    if (!wolfPlayer) {
      // Defensiv: ingen gyldig wolf — bygg pending-rad og bevar stake.
      holeRows.push({
        holeNumber: hole.number,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        wolfUserId: '',
        catchUp: false,
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
      turn?.catchUp ?? false,
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
    rotation: rule === 'catch_up' ? 'catch_up' : 'random_with_trailing',
    holes: holeRows,
    players: playerLines,
  };
}

// Re-eksporter `WolfChoice`-typen så modulen kan brukes som single source
// for konsumenter som tar valgene som input.
export type { WolfChoice, WolfHoleOutcome };

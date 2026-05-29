// Skins med carryover (issue #275): hull-basert sosialt point-game.
//
// Hvert hull er verdt 1 skin. Lavest effective-score på hullet vinner skinnet
// alene. Blir hullet delt (≥2 spillere på laveste score), ruller skinnet videre
// (carryover) til neste hull — som da er verdt 2, så 3, osv. — til noen vinner
// alene og scooper hele potten.
//
// Skin-regnskap (sekvensielt over hull i sortert rekkefølge):
//
//   carriedPot = 0
//   for hole in sortedHoles:
//     if not alle spillere har gross på hullet:
//       outcome = 'pending'; STOPP resolving — alle senere hull også pending
//       (carriedPot fryses)
//     atStake = carriedPot + 1
//     winners = spillere med min effective-score
//     if winners.length === 1:
//       outcome = 'won'; award atStake til vinneren; carriedPot = 0
//     else:
//       outcome = 'carryover'; carriedPot = atStake
//
// Rundeslutt: etter siste resolverte hull eksponeres `carriedPot` rå — den
// hengende potten (standard Skins, ingen omspill i Tørny). Pending fryser potten
// på freeze-punktet. SkinsView avgjør label fra gameStatus: «i potten» under
// aktivt spill vs «ikke vunnet» når ferdig (issue #303).
//
// Net vs gross (gjenbruk av effectiveFor-mønsteret fra nassau.ts):
//   - 'gross': effectiveScore = gross direkte (HCP ignoreres).
//   - 'net':   effectiveScore = gross − strokesForHole(courseHandicap, SI).
// Allowance-pct på `games`-tabellen brukes IKKE — Skins bruker enten full HCP
// eller ingen.
//
// Ranking: totalSkins DESC, tiebreak holesWon DESC, deretter tied (samme rank,
// fyll tiedWith). Full 5-tier cascade kan legges til senere (samme avgjørelse
// som Wolf v1).

import { strokesForHole } from '../strokeAllocation';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  SkinsHoleRow,
  SkinsPlayerLine,
  SkinsResult,
  SkinsHoleOutcome,
} from './types';

function effectiveFor(
  scoringMode: 'gross' | 'net',
  gross: number,
  courseHandicap: number,
  strokeIndex: number,
): number {
  if (scoringMode === 'gross') return gross;
  return gross - strokesForHole(courseHandicap, strokeIndex);
}

interface PlayerWorkingState {
  totalSkins: number;
  holesWon: number;
}

/**
 * Rank-en spillerne per Skins-tiebreak-kaskade:
 *   1. totalSkins DESC
 *   2. holesWon DESC
 *
 * Returnerer shared rank for spillere med EKSAKT samme (totalSkins, holesWon).
 * `tiedWith` lister userIds som har akkurat samme rank.
 */
function rankPlayers(
  players: ScoringPlayer[],
  working: Map<string, PlayerWorkingState>,
): SkinsPlayerLine[] {
  type Row = { player: ScoringPlayer; state: PlayerWorkingState };
  const rows: Row[] = players.map((p) => ({
    player: p,
    state: working.get(p.userId) ?? { totalSkins: 0, holesWon: 0 },
  }));

  rows.sort((a, b) => {
    if (b.state.totalSkins !== a.state.totalSkins) {
      return b.state.totalSkins - a.state.totalSkins;
    }
    if (b.state.holesWon !== a.state.holesWon) {
      return b.state.holesWon - a.state.holesWon;
    }
    // Deterministisk fallback når alt annet er likt.
    return a.player.userId.localeCompare(b.player.userId);
  });

  return rows.map((row, idx) => {
    const tiedWith = rows
      .filter(
        (other, j) =>
          j !== idx &&
          other.state.totalSkins === row.state.totalSkins &&
          other.state.holesWon === row.state.holesWon,
      )
      .map((o) => o.player.userId);

    const firstTiedIndex = rows.findIndex(
      (other) =>
        other.state.totalSkins === row.state.totalSkins &&
        other.state.holesWon === row.state.holesWon,
    );

    return {
      userId: row.player.userId,
      totalSkins: row.state.totalSkins,
      holesWon: row.state.holesWon,
      rank: firstTiedIndex + 1,
      tiedWith,
    };
  });
}

/**
 * Beregner Skins-leaderboard fra en ScoringContext. Sekvensiell carryover-state
 * over hull i sortert rekkefølge.
 *
 * Defensive fallback: hvis `mode_config.skins_scoring` mangler/feil shape →
 * fall til 'net'. Speiler nassau/wolf-mønstret. Validatoren i
 * `lib/games/gamePayload.ts` håndhever feltet ved publish, men draft-state
 * eller migrerte data kan mangle det.
 */
export function compute(ctx: ScoringContext): SkinsResult {
  const cfg = ctx.game.mode_config as { skins_scoring?: 'gross' | 'net' };
  const scoring: 'gross' | 'net' =
    cfg.skins_scoring === 'gross' || cfg.skins_scoring === 'net'
      ? cfg.skins_scoring
      : 'net';

  // Indekser scores for O(1)-lookup per (userId, holeNumber).
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  const working = new Map<string, PlayerWorkingState>();
  for (const p of ctx.players) {
    working.set(p.userId, { totalSkins: 0, holesWon: 0 });
  }

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);

  let carriedPot = 0;
  // Når et hull blir pending stopper vi resolving — alle senere hull er også
  // pending (carryover er sekvensielt). Potten fryses og markeres ikke som
  // rundeslutt-uvunnet.
  let frozen = false;
  const rows: SkinsHoleRow[] = [];

  for (const hole of holesSorted) {
    const cells = buildCells(hole, ctx.players, grossByKey, scoring);

    const allScored = cells.every((c) => c.gross !== null);

    if (frozen || !allScored) {
      // Pending — potten fryses (carriedIn vises, men ingen award).
      frozen = true;
      rows.push({
        holeNumber: hole.number,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        carriedIn: carriedPot,
        atStake: carriedPot + 1,
        outcome: 'pending',
        winnerUserId: null,
        skinsAwarded: 0,
        perPlayer: cells.map((c) => ({ ...c, isWinner: false })),
      });
      continue;
    }

    const carriedIn = carriedPot;
    const atStake = carriedPot + 1;

    // Bestem laveste effective-score og vinnerne (kan være flere ved tie).
    const effScores = cells.map((c) => c.effectiveScore as number);
    const minScore = Math.min(...effScores);
    const winnerIds = cells
      .filter((c) => c.effectiveScore === minScore)
      .map((c) => c.userId);

    const perPlayer = cells.map((c) => ({
      ...c,
      isWinner: c.effectiveScore === minScore,
    }));

    let outcome: SkinsHoleOutcome;
    let winnerUserId: string | null;
    let skinsAwarded: number;

    if (winnerIds.length === 1) {
      outcome = 'won';
      winnerUserId = winnerIds[0];
      skinsAwarded = atStake;
      const state = working.get(winnerUserId);
      if (state) {
        state.totalSkins += atStake;
        state.holesWon += 1;
      }
      carriedPot = 0;
    } else {
      outcome = 'carryover';
      winnerUserId = null;
      skinsAwarded = 0;
      carriedPot = atStake;
    }

    rows.push({
      holeNumber: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      carriedIn,
      atStake,
      outcome,
      winnerUserId,
      skinsAwarded,
      perPlayer,
    });
  }

  // Rundeslutt: `carriedPot` holder den rå hengende potten ved siste resolverte
  // hull i begge tilfeller — etter en komplett runde med delt siste hull, OG
  // frozen ved freeze-punktet når et pending-gap stoppet resolving. Modulen
  // kjenner ikke `gameStatus`, så den eksponerer den rå verdien og lar SkinsView
  // avgjøre om potten er «i potten» (aktivt spill) eller «ikke vunnet» (ferdig
  // spill, evt. avsluttet tidlig med gap etter et delt hull — issue #303).

  const players = rankPlayers(ctx.players, working);

  return {
    kind: 'skins',
    scoring,
    holes: rows,
    players,
    carriedPot,
  };
}

/**
 * Bygger per-spiller-celler for ett hull (gross + effective). `isWinner`
 * settes av caller etter at min-score er kjent.
 */
function buildCells(
  hole: ScoringHole,
  players: ScoringPlayer[],
  grossByKey: Map<string, number | null>,
  scoring: 'gross' | 'net',
): Array<{ userId: string; gross: number | null; effectiveScore: number | null }> {
  return players.map((p) => {
    const gross = grossByKey.get(`${p.userId}#${hole.number}`) ?? null;
    const effectiveScore =
      gross === null
        ? null
        : effectiveFor(scoring, gross, p.courseHandicap, hole.strokeIndex);
    return { userId: p.userId, gross, effectiveScore };
  });
}

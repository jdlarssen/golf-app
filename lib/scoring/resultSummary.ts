import type { ModeResult } from './modes/types';

/**
 * Kompakt, strukturert per-spiller-utfall for et avsluttet spill (#572).
 *
 * Lagres som `game_players.result_summary` (jsonb) ved `endGame` og leses billig
 * på avsluttede-spill-kortene. **Strukturert, ikke ferdig streng** — kortet
 * formaterer per locale via next-intl (i18n #60), så engelsk-flaten får oversatt
 * copy. Tre former dekker alle 20+ modi mode-naturlig:
 *
 *  - `placement` — individ- og lag-strokeplay + poeng-modi (wolf/nassau/nines/
 *    acey/round_robin/bbb). `isTeam` skiller «Du vant» fra «Laget vant».
 *  - `matchplay` — singles/fourball/foursomes-familien. `margin` = golf-format
 *    («3&2», «2 up»), `null` ved uavgjort (AS).
 *  - `skins`     — skins, der «N skins» er mer naturlig enn plassering.
 */
export type ResultSummary =
  | { kind: 'placement'; rank: number; fieldSize: number; isTeam: boolean }
  | { kind: 'matchplay'; outcome: 'win' | 'loss' | 'tie'; margin: string | null }
  | { kind: 'skins'; skins: number; rank: number; fieldSize: number };

/**
 * Utleder per-spiller-`ResultSummary` fra et `ModeResult` (resultatet av
 * `computeLeaderboard(ctx)`). Eneste sannhetskilde — ingen ny per-modus-
 * mattelogikk; vi plukker rank/utfall fra de allerede-beregnede linjene.
 *
 * Returnerer en `Map<userId, ResultSummary>`. Spillere uten et meningsfullt
 * utfall utelates (f.eks. matchplay som ikke ble avgjort → tom for de sidene),
 * slik at kortet faller tilbake til den generiske 🏆-emojien.
 */
export function computeResultSummaries(
  result: ModeResult,
): Map<string, ResultSummary> {
  const map = new Map<string, ResultSummary>();

  switch (result.kind) {
    // --- Individuell strokeplay / stableford / poeng-modi → placement ---------
    case 'stableford': {
      if (result.variant === 'solo') {
        emitPlacements(map, result.players, false);
      } else {
        emitTeamPlacements(
          map,
          result.teams.map((t) => ({ rank: t.rank, members: t.playerIds })),
        );
      }
      break;
    }
    case 'solo_strokeplay':
    case 'wolf':
    case 'nassau':
    case 'bingo_bango_bongo':
    case 'nines':
    case 'round_robin':
    case 'acey_deucey': {
      emitPlacements(map, result.players, false);
      break;
    }

    // --- Lag-strokeplay → placement, isTeam=true ------------------------------
    case 'best_ball': {
      emitTeamPlacements(
        map,
        result.teams.map((t) => ({ rank: t.rank, members: t.playerIds })),
      );
      break;
    }
    case 'texas_scramble': {
      emitTeamPlacements(
        map,
        result.teams.map((t) => ({
          rank: t.rank,
          members: t.members.map((m) => m.userId),
        })),
      );
      break;
    }
    case 'shamble': {
      emitTeamPlacements(
        map,
        result.teams.map((t) => ({ rank: t.rank, members: t.members })),
      );
      break;
    }
    case 'patsome': {
      emitTeamPlacements(
        map,
        result.teams.map((t) => ({ rank: t.rank, members: t.playerIds })),
      );
      break;
    }

    // --- Matchplay-familien → win/loss/tie ------------------------------------
    case 'singles_matchplay': {
      emitMatchplay(
        map,
        result.result,
        [result.sides[0].userId],
        [result.sides[1].userId],
      );
      break;
    }
    case 'fourball_matchplay':
    case 'foursomes_matchplay': {
      emitMatchplay(
        map,
        result.result,
        result.sides[0].players.map((p) => p.userId),
        result.sides[1].players.map((p) => p.userId),
      );
      break;
    }

    // --- Skins → «N skins» ----------------------------------------------------
    case 'skins': {
      const fieldSize = result.players.length;
      for (const p of result.players) {
        map.set(p.userId, {
          kind: 'skins',
          skins: p.totalSkins,
          rank: p.rank,
          fieldSize,
        });
      }
      break;
    }

    default:
      assertNever(result);
  }

  return map;
}

/** Individ-rader → `placement`-summary, fieldSize = antall spillere. */
function emitPlacements(
  map: Map<string, ResultSummary>,
  players: ReadonlyArray<{ userId: string; rank: number }>,
  isTeam: boolean,
): void {
  const fieldSize = players.length;
  for (const p of players) {
    map.set(p.userId, { kind: 'placement', rank: p.rank, fieldSize, isTeam });
  }
}

/** Lag-rader → hvert medlem arver lagets `placement`, fieldSize = antall lag. */
function emitTeamPlacements(
  map: Map<string, ResultSummary>,
  teams: ReadonlyArray<{ rank: number; members: ReadonlyArray<string> }>,
): void {
  const fieldSize = teams.length;
  for (const team of teams) {
    for (const userId of team.members) {
      map.set(userId, {
        kind: 'placement',
        rank: team.rank,
        fieldSize,
        isTeam: true,
      });
    }
  }
}

/**
 * Matchplay-utfall per side. `result === null` (ikke avgjort) → ingen
 * oppføringer, så kortet faller tilbake til 🏆.
 */
function emitMatchplay(
  map: Map<string, ResultSummary>,
  result: { winner: 'side1' | 'side2' | 'tied'; formatted: string } | null,
  side1UserIds: ReadonlyArray<string>,
  side2UserIds: ReadonlyArray<string>,
): void {
  if (result === null) return;

  if (result.winner === 'tied') {
    for (const userId of [...side1UserIds, ...side2UserIds]) {
      map.set(userId, { kind: 'matchplay', outcome: 'tie', margin: null });
    }
    return;
  }

  const margin = result.formatted;
  const side1Outcome = result.winner === 'side1' ? 'win' : 'loss';
  const side2Outcome = result.winner === 'side2' ? 'win' : 'loss';
  for (const userId of side1UserIds) {
    map.set(userId, { kind: 'matchplay', outcome: side1Outcome, margin });
  }
  for (const userId of side2UserIds) {
    map.set(userId, { kind: 'matchplay', outcome: side2Outcome, margin });
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled ModeResult kind: ${JSON.stringify(x)}`);
}

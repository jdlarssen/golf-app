import type { GameMode, ModeResult } from '@/lib/scoring/modes/types';

/**
 * The prize-giving on the big screen (#2298): the organiser turns one card a
 * tap on the phone, and the TV follows. Pure — no React, no next-intl, no
 * server import — so the phone, the TV and the action share one set of rules.
 *
 * The step is `games.ceremony_step`: `null` = off, `k` = steps shown. The
 * steps are the side prizes (when anyone won one) and then the podium places
 * from the lowest up to the winner.
 */

/** Side prizes + three places. Mirrors the CHECK in migration 0211. */
export const CEREMONY_MAX_STEP = 4;

/**
 * The formats with a ranked podium. The matchplay family has no podium, and
 * the single-player points games (Wolf, Nassau, Skins …) are not in the first
 * version: their TV keeps «Ferdig spilt».
 */
export function ceremonySupported(mode: GameMode): boolean {
  switch (mode) {
    case 'solo_strokeplay':
    case 'stableford':
    case 'modified_stableford':
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
    case 'shamble':
    case 'best_ball':
    case 'patsome':
      return true;
    case 'singles_matchplay':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
    case 'wolf':
    case 'nassau':
    case 'skins':
    case 'bingo_bango_bongo':
    case 'nines':
    case 'round_robin':
    case 'acey_deucey':
      return false;
    default: {
      const unplaced: never = mode;
      return unplaced;
    }
  }
}

/** «poeng», «mot par» or «slag» — the unit the podium shows the number in. */
export type CeremonyUnit = 'points' | 'toPar' | 'net';

/** One row on the podium: a player, or a team with its members. */
export interface CeremonyLine {
  key: string;
  rank: number;
  total: number;
  unit: CeremonyUnit;
  /** userIds — the player alone, or the team's members in the engine's order. */
  members: string[];
  /** `null` for a player. */
  teamNumber: number | null;
}

const teamKey = (teamNumber: number) => `team-${teamNumber}`;

/**
 * The engine's result as podium rows, with the same number the podium in the
 * app shows. Rows with nothing played are left out: a player with no hole,
 * and a shamble team with no counted hole (the engine has no total for it).
 * Any other format gives `[]`.
 */
export function ceremonyLines(result: ModeResult): CeremonyLine[] {
  switch (result.kind) {
    case 'solo_strokeplay': {
      const toPar = result.ranking === 'net_to_par';
      return result.players.flatMap((p) => {
        const total = toPar ? p.netToPar : p.totalNetStrokes;
        if (p.holesPlayed === 0 || total === null) return [];
        return [
          { key: p.userId, rank: p.rank, total, unit: toPar ? 'toPar' : 'net', members: [p.userId], teamNumber: null },
        ];
      });
    }
    case 'stableford':
      if (result.variant === 'solo') {
        return result.players
          .filter((p) => p.holesPlayed > 0)
          .map((p) => ({
            key: p.userId,
            rank: p.rank,
            total: p.totalPoints,
            unit: 'points',
            members: [p.userId],
            teamNumber: null,
          }));
      }
      return result.teams.map((t) => ({
        key: teamKey(t.teamNumber),
        rank: t.rank,
        total: t.totalPoints,
        unit: 'points',
        members: t.playerIds,
        teamNumber: t.teamNumber,
      }));
    case 'texas_scramble':
      return result.teams.map((t) => ({
        key: teamKey(t.teamNumber),
        rank: t.rank,
        total: t.totalNet,
        unit: 'net',
        members: t.members.map((m) => m.userId),
        teamNumber: t.teamNumber,
      }));
    case 'shamble':
      return result.teams
        .filter((t) => t.holesCounted > 0)
        .map((t) => ({
          key: teamKey(t.teamNumber),
          rank: t.rank,
          total: t.totalScore,
          unit: 'net',
          members: t.members,
          teamNumber: t.teamNumber,
        }));
    case 'best_ball':
      return result.teams.map((t) => ({
        key: teamKey(t.teamNumber),
        rank: t.rank,
        total: t.total,
        unit: 'net',
        members: t.playerIds,
        teamNumber: t.teamNumber,
      }));
    case 'patsome':
      return result.teams.map((t) => ({
        key: teamKey(t.teamNumber),
        rank: t.rank,
        total: t.totalPoints,
        unit: 'points',
        members: t.playerIds,
        teamNumber: t.teamNumber,
      }));
    default:
      return [];
  }
}

/** One podium place: everyone on that rank. Two or more = a shared place. */
export interface CeremonyPlace {
  rank: number;
  lines: CeremonyLine[];
}

/** The podium: ranks 1–3 grouped, in the engine's order. */
export function ceremonyPlaces(lines: CeremonyLine[]): CeremonyPlace[] {
  const places: CeremonyPlace[] = [];
  for (const line of lines) {
    if (line.rank > 3) continue;
    const place = places.find((p) => p.rank === line.rank);
    if (place) place.lines.push(line);
    else places.push({ rank: line.rank, lines: [line] });
  }
  return places.sort((a, b) => a.rank - b.rank);
}

export type CeremonyStep = 'side' | CeremonyPlace;

/**
 * The order the cards turn: the side prizes first when anyone won one, then
 * the places from the lowest rank up to 1. Ranks {1, 1, 3} give 3 → 1: the
 * 2nd place does not exist.
 */
export function ceremonySteps(places: CeremonyPlace[], hasSidePrizes: boolean): CeremonyStep[] {
  const descending = [...places].sort((a, b) => b.rank - a.rank);
  return hasSidePrizes ? ['side', ...descending] : descending;
}

export interface CeremonyView<T = CeremonyStep> {
  /** The step, clamped to 0…steps.length. */
  step: number;
  shown: T[];
  /** The step shown last — the highlighted card. */
  current: T | null;
  /** What the next tap shows, for the phone to read out. */
  next: T | null;
  done: boolean;
}

/**
 * What a step shows, for the TV's podium and the phone's remote alike (any
 * list of steps): the one place the stored step is clamped. RLS lets the
 * column hold 0–4, so a step beyond this podium, or below 0, must read as the
 * end or the start, never throw.
 */
export function ceremonyView<T>(steps: T[], step: number): CeremonyView<T> {
  const k = Math.min(Math.max(Math.trunc(step), 0), steps.length);
  return {
    step: k,
    shown: steps.slice(0, k),
    current: k > 0 ? steps[k - 1]! : null,
    next: k < steps.length ? steps[k]! : null,
    done: k === steps.length,
  };
}

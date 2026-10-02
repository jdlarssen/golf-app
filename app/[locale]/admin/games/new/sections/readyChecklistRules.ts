import type { MissingForPublishCode } from '../useGameFormState';
import type { Intent } from '@/lib/wizard/intent';
import type { GameMode } from '@/lib/scoring/modes/types';
import { usesGameHcpAllowance } from '@/lib/games/hcpAllowance';
import { parseOsloDateTimeLocal } from '@/lib/games/gamePayload';

/**
 * The «Klar?» checklist on step 5 (#2282): four rows, each with a status and
 * where «Endre» leads. A projection of the publish gate in `useGameFormState`
 * (`missingForPublish` + its parallel `missingForPublishCodes`, and
 * `teeOffInPast`), never a second copy of the rules: the publish button still
 * reads only `canPublish`. No translator here; the caller passes the messages
 * already translated.
 */

export type ReadyRowKey = 'course' | 'format' | 'teeOff' | 'players';
export type ReadyRowStatus = 'ok' | 'warn' | 'block';
/** A wizard step, the advanced settings on step 5, or no «Endre» at all. */
export type ReadyRowTarget = 2 | 3 | 4 | 'advanced' | null;

export type ReadyRow = {
  key: ReadyRowKey;
  status: ReadyRowStatus;
  /** The translated messages behind a `block`, in the gate's order. */
  messages: string[];
  target: ReadyRowTarget;
};

/**
 * Exhaustive: a new missing-code fails to compile here until it has a row,
 * so the checklist can never drop a reason the button is grey.
 */
const ROW_FOR_CODE: Record<MissingForPublishCode, ReadyRowKey> = {
  // #2439: the club is chosen on step 2, above the format list.
  club: 'format',
  course: 'course',
  tee_box: 'course',
  tee_off: 'teeOff',
  players: 'players',
  allowance: 'format',
};

const ROW_ORDER: readonly ReadyRowKey[] = ['course', 'format', 'teeOff', 'players'];

export function readyChecklist({
  codes,
  messages,
  teeOffPastMessage,
  intent,
  expectedPlayerCount,
  selectedCount,
  lockGameMode,
}: {
  codes: readonly MissingForPublishCode[];
  /** `missingForPublish`: same length and order as `codes`. */
  messages: readonly string[];
  /** The translated past-tee-off error when `teeOffInPast`, else `null`. */
  teeOffPastMessage: string | null;
  intent: Intent | undefined;
  expectedPlayerCount: number | undefined;
  selectedCount: number;
  lockGameMode: boolean;
}): ReadyRow[] {
  const byRow: Record<ReadyRowKey, string[]> = {
    course: [],
    format: [],
    teeOff: [],
    players: [],
  };
  codes.forEach((code, i) => {
    byRow[ROW_FOR_CODE[code]].push(messages[i]);
  });
  // A past tee-off is deliberately not in `missingForPublish` (it is invalid,
  // not missing), so it gets its own line here: without it the grey button
  // had no explanation at all.
  if (teeOffPastMessage) byRow.teeOff.push(teeOffPastMessage);

  // A broken percentage must stay reachable even when the format is locked,
  // or the row would be red with no way on.
  const hasAllowanceCode = codes.includes('allowance');
  const target: Record<ReadyRowKey, ReadyRowTarget> = {
    course: 3,
    format: hasAllowanceCode ? 'advanced' : lockGameMode ? null : 2,
    teeOff: 3,
    players: 4,
  };

  return ROW_ORDER.map((key) => {
    let status: ReadyRowStatus = byRow[key].length > 0 ? 'block' : 'ok';
    if (
      key === 'players' &&
      status === 'ok' &&
      intent === 'kompis' &&
      expectedPlayerCount !== undefined &&
      selectedCount < expectedPlayerCount
    ) {
      status = 'warn';
    }
    return { key, status, messages: byRow[key], target: target[key] };
  });
}

/**
 * The tee-off field's Oslo wall time as an ISO instant, the same conversion
 * `createAndPublishGame` stores. `null` for an empty or unreadable value
 * (`parseOsloDateTimeLocal` throws for both).
 */
export function teeOffIso(scheduledTeeOffAt: string): string | null {
  if (scheduledTeeOffAt === '') return null;
  try {
    return parseOsloDateTimeLocal(scheduledTeeOffAt);
  } catch {
    return null;
  }
}

export type PlayersSummary =
  | { key: 'playersSolo' | 'playersPlural' | 'playersUnassigned'; values: { count: number } }
  | { key: 'players1v1' | 'playersUnassignedMatchplay'; values: Record<string, never> }
  | { key: 'teamsBestBall' | 'teamsParStableford'; values: { teams: number } }
  | { key: 'teamsScramble'; values: { teams: number; size: number } };

/**
 * The Spillere row's value as a `wizard.ready.*` key: «4 spillere», «2 lag à
 * 2 spillere», «1 v 1». Formats without teams (Wolf, Nassau, Skins …) give
 * only the count; they have nothing to split, so never «(ikke fordelt)».
 */
export function playersSummary({
  count,
  isSolo,
  isMatchplay,
  requiresTeams,
  side1,
  side2,
  teamsCount,
  isBestBall,
  isParStableford,
  isScramble,
  teamSize,
}: {
  count: number;
  isSolo: boolean;
  isMatchplay: boolean;
  requiresTeams: boolean;
  /** Players on side 1 and 2 (singles matchplay). */
  side1: number;
  side2: number;
  /** Teams with at least one player. */
  teamsCount: number;
  isBestBall: boolean;
  isParStableford: boolean;
  /** Texas, Ambrose or Shamble. */
  isScramble: boolean;
  teamSize: number;
}): PlayersSummary {
  const players: PlayersSummary = {
    key: count === 1 ? 'playersSolo' : 'playersPlural',
    values: { count },
  };
  if (isSolo) return players;
  if (isMatchplay) {
    return side1 === 1 && side2 === 1
      ? { key: 'players1v1', values: {} }
      : { key: 'playersUnassignedMatchplay', values: {} };
  }
  if (!requiresTeams) return players;
  if (teamsCount === 0) return { key: 'playersUnassigned', values: { count } };
  if (isBestBall) return { key: 'teamsBestBall', values: { teams: teamsCount } };
  if (isParStableford) return { key: 'teamsParStableford', values: { teams: teamsCount } };
  if (isScramble) return { key: 'teamsScramble', values: { teams: teamsCount, size: teamSize } };
  return players;
}

/**
 * Which parts the Format row has after the format's name: the team size when
 * teams are bigger than one, and the game's handicap share for formats that
 * use it («85 % handicap», or «brutto» for 0). Formats with their own
 * percentage in `mode_config` show none.
 */
export function formatRowParts({
  gameMode,
  teamSize,
  hcpAllowance,
}: {
  gameMode: GameMode;
  teamSize: number;
  hcpAllowance: number;
}): {
  teamSize: number | null;
  allowance: { kind: 'pct'; pct: number } | { kind: 'gross' } | null;
} {
  return {
    teamSize: teamSize > 1 ? teamSize : null,
    allowance: usesGameHcpAllowance(gameMode)
      ? hcpAllowance === 0
        ? { kind: 'gross' }
        : { kind: 'pct', pct: hcpAllowance }
      : null,
  };
}

/**
 * How many players step 4 of the wizard is aiming for, and where it stops
 * (#2321). Pure logic: the picker grid, the tray and the e-mail form read it,
 * and the native app can later.
 *
 * The limits themselves keep their homes: a fixed count is whatever
 * `fitsPlayerCount` accepts, the fixed-count formats' ceiling is
 * `soloPlayerCap` (`START_COUNT_RANGES`), and the team formats' ceiling is
 * `teamFormatPlayerCap`. Nothing here restates a number.
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import type { Intent } from '@/lib/wizard/intent';
import { fitsPlayerCount, soloPlayerCap } from '@/lib/wizard/fitsPlayerCount';
import { TEAM_FORMAT_PLAYER_CAP, teamFormatPlayerCap } from '@/lib/games/teamFormatLimits';
import { MAX_WIZARD_INVITE_EMAILS } from '@/lib/games/inviteEmail';

/** The one count in 1..40 the format accepts, or `null` when it accepts several (or none). */
export function exactPlayerCount(mode: GameMode): number | null {
  let found: number | null = null;
  for (let n = 1; n <= TEAM_FORMAT_PLAYER_CAP; n++) {
    if (!fitsPlayerCount(mode, n)) continue;
    if (found !== null) return null;
    found = n;
  }
  return found;
}

/**
 * The count the tray counts towards: the format's fixed count, else the
 * kompis count from step 2. Klubb and solo have no target.
 */
export function playerTarget({
  gameMode,
  intent,
  expectedPlayerCount,
}: {
  gameMode: GameMode;
  intent: Intent | undefined;
  expectedPlayerCount: number | undefined;
}): number | null {
  return exactPlayerCount(gameMode) ?? (intent === 'kompis' ? (expectedPlayerCount ?? null) : null);
}

/**
 * Where the picker greys out the rest of the cards: the fixed count, else the
 * fixed-count formats' ceiling (Wolf 5, Nassau/Skins/BBB 16), else the team
 * grid's cap, else the solo cap. `null` = no ceiling.
 */
export function pickerCap({
  gameMode,
  requiresTeams,
  isSolo,
  teamSize,
}: {
  gameMode: GameMode;
  requiresTeams: boolean;
  isSolo: boolean;
  teamSize: number;
}): number | null {
  return (
    exactPlayerCount(gameMode) ??
    soloPlayerCap(gameMode) ??
    (requiresTeams ? teamFormatPlayerCap(teamSize) : isSolo ? TEAM_FORMAT_PLAYER_CAP : null)
  );
}

/** What the tray's counter says, before translation. */
export type TrayCount =
  | { kind: 'noTarget'; selected: number }
  | { kind: 'missing'; selected: number; target: number; missing: number }
  | { kind: 'reached'; selected: number; target: number }
  | { kind: 'over'; selected: number; target: number; over: number };

export function trayCount({ selected, target }: { selected: number; target: number | null }): TrayCount {
  if (target === null) return { kind: 'noTarget', selected };
  if (selected < target) return { kind: 'missing', selected, target, missing: target - selected };
  if (selected === target) return { kind: 'reached', selected, target };
  return { kind: 'over', selected, target, over: selected - target };
}

/**
 * How many e-mail addresses still fit: the places the format has left after
 * the selected players, never below 0, at most ten. The players come first; an
 * address past this many is marked «Ikke plass» and not sent.
 */
export function inviteEmailRoom({ cap, selected }: { cap: number | null; selected: number }): number {
  if (cap === null) return MAX_WIZARD_INVITE_EMAILS;
  return Math.min(MAX_WIZARD_INVITE_EMAILS, Math.max(0, cap - selected));
}

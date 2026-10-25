/**
 * parseFormatDeepLink — reads `?format=<slug>&antall=<n>` on /opprett-spill,
 * the link «Lag en runde med dette» on /spillformater sends (#2328).
 *
 *  - `format` must be in the Kompis catalog (the slugs the caller passes from
 *    `getFormatsForIntent('kompis')`); anything else → `null`, a plain wizard.
 *  - `antall` counts only as a whole number from 1 to `TEAM_FORMAT_PLAYER_CAP`
 *    that the format fits (`fitsPlayerCount`). Anything else → `null`, the
 *    wizard without a count.
 *
 * Pure logic, no server import.
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import { fitsPlayerCount } from '@/lib/wizard/fitsPlayerCount';
import { TEAM_FORMAT_PLAYER_CAP } from '@/lib/games/teamFormatLimits';

export type FormatDeepLink = { gameMode: GameMode; expectedPlayerCount: number | null };

export function parseFormatDeepLink(
  { format, antall }: { format: string | undefined; antall: string | undefined },
  kompisSlugs: readonly string[],
): FormatDeepLink | null {
  if (!format || !kompisSlugs.includes(format)) return null;
  const gameMode = format as GameMode;
  const n = antall !== undefined && /^\d+$/.test(antall) ? Number(antall) : NaN;
  const counts = n >= 1 && n <= TEAM_FORMAT_PLAYER_CAP && fitsPlayerCount(gameMode, n);
  return { gameMode, expectedPlayerCount: counts ? n : null };
}

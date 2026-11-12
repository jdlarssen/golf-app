import { formatDisplayLabel } from '@/lib/games/formatLabel';
import { registrationSeatTeamSize } from '@/lib/games/teamFormatLimits';
import type { PendingRequest } from '@/lib/games/discoverableGameTypes';
import type { GameSocialProof } from '@/lib/games/socialProof';
import {
  buildTerminEntries,
  type GameSeats,
  type TerminEntry,
} from '@/lib/games/terminliste';

/**
 * The terminliste as the app reads it (#2838): the wire shape of
 * `GET /api/terminliste`. The server builds it from the same three reads and
 * the same `buildTerminEntries` as the website's /finn-turneringer, so a row,
 * its button and its seats are the website's. The app groups the rows into days
 * and filters them on the phone (`groupTerminByDate`, `filterTermin`).
 *
 * No import of anything that reads: the native app imports this file by
 * relative path.
 */

/** One row: the website's `TerminEntry` plus what its row prints. */
export type AppTerminEntry = TerminEntry & {
  /** «Stableford», «4BBB Stableford» … the website's `formatDisplayLabel`. */
  modeLabel: string;
  /** Players per team (1 outside the team formats): «lag på N» when above 1. */
  teamSize: number;
  /**
   * Who is in already: a count and, for a mutual friend only, a formatted
   * public name (`getGamesSocialProof`). Never an address or a user id.
   */
  socialProof: GameSocialProof | null;
  /**
   * The club a club round belongs to (#2753): the app's «Klubbturneringer» on
   * Home names it, since a member can be in several clubs. `null` outside the
   * club source.
   */
  clubName: string | null;
};

export type AppTerminView = {
  entries: AppTerminEntry[];
  pendingRequests: PendingRequest[];
};

export function buildAppTerminView(
  data: Parameters<typeof buildTerminEntries>[0] & { pendingRequests: readonly PendingRequest[] },
  seats: ReadonlyMap<string, GameSeats>,
  socialProof: Readonly<Record<string, GameSocialProof>>,
): AppTerminView {
  const clubNames = new Map((data.clubGames ?? []).map((game) => [game.id, game.group_name]));
  return {
    entries: buildTerminEntries(data, seats).map((entry) => ({
      ...entry,
      modeLabel: formatDisplayLabel(entry.game_mode, entry.mode_config),
      teamSize: registrationSeatTeamSize(
        entry.game_mode,
        (entry.mode_config as { team_size?: number } | null)?.team_size,
      ),
      socialProof: socialProof[entry.id] ?? null,
      clubName: entry.source === 'club' ? (clubNames.get(entry.id) ?? null) : null,
    })),
    pendingRequests: [...data.pendingRequests],
  };
}

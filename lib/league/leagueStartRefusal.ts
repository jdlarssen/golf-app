import type { StartScheduledGameFailure } from '../games/startScheduledGameCore';

/**
 * Why a player could not start a flight. One union for the web action, the
 * app route (`POST /api/liga/rounds/[roundId]/start`) and the app's copy; the
 * route maps every member to an HTTP status in a `Record` without a default,
 * so a new code fails tsc there.
 *
 * Types only, in its own file: the native app imports it by relative path,
 * and `startLeagueRoundFlightCore` (server-only) re-exports it.
 */
export type LeagueStartRefusal =
  | 'round_not_found'
  | 'round_read_failed'
  | 'league_not_found'
  | 'league_read_failed'
  | 'league_not_active'
  | 'outside_window'
  | 'round_not_ready'
  | 'need_marker'
  | 'flight_too_large'
  | 'members_failed'
  | 'not_member'
  | 'already_played'
  | 'flight_in_progress'
  | 'co_player_locked'
  | 'round_check_failed'
  | 'settings_freeze_failed'
  | 'insert_failed'
  | `start_${StartScheduledGameFailure['reason']}`;

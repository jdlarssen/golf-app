import type { Database } from '@/lib/database.types';
import { formatOsloDateTimeLocal, parseOsloDateTimeLocal } from '@/lib/games/gamePayload';
import { acceptedAtForActor } from '@/lib/games/participantAcceptance';
import { NO_ROTATION_MODES } from '@/lib/games/assignRotationSlots';
import { isAutoGameName, suggestGameName } from '@/lib/games/autoGameName';
import { addDaysLocal } from '@/lib/games/weeklyRepeatRule';

export {
  canRepeatWeekly,
  nextWeeklyLocal,
  type CanRepeatWeeklyInput,
} from '@/lib/games/weeklyRepeatRule';

/**
 * #2460 «Gjenta hver uke»: the server half of the pure code. The date of the
 * next round in Oslo time and the rows the finish tail inserts
 * (`spawnWeeklyRepeat`). The rule itself and the wall-clock arithmetic live in
 * `weeklyRepeatRule.ts` (re-exported here), which is all the app imports: this
 * file reaches the Oslo `Intl` helpers and the game-name code, which Hermes
 * cannot run.
 */

type GamesRow = Database['public']['Tables']['games']['Row'];
type GamesInsert = Database['public']['Tables']['games']['Insert'];
type GamePlayersInsert = Database['public']['Tables']['game_players']['Insert'];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The next round's tee-off: the same weekday and Oslo time as `prevIso`, in
 * the first week that is still after `nowIso`. Normally that is one week
 * later; a round finished more than a week after its tee-off gets the next
 * future week instead, never a tee-off in the past (#902). The step is taken
 * on the Oslo wall clock (`formatOsloDateTimeLocal` → seven days →
 * `parseOsloDateTimeLocal`), so 09:00 stays 09:00 across summer time.
 *
 * Null when there is no usable tee-off to repeat.
 */
export function nextWeeklyTeeOff(prevIso: string | null, nowIso: string): string | null {
  if (!prevIso) return null;
  const prevMs = new Date(prevIso).getTime();
  const nowMs = new Date(nowIso).getTime();
  if (Number.isNaN(prevMs) || Number.isNaN(nowMs)) return null;
  const local = formatOsloDateTimeLocal(prevIso);

  // Start one week short of the elapsed span so an hour of summer time either
  // way is covered; the loop then needs two or three steps at most.
  let weeks = Math.max(1, Math.floor((nowMs - prevMs) / WEEK_MS));
  for (;;) {
    const candidate = addDaysLocal(local, 7 * weeks);
    if (candidate === null) return null;
    const iso = parseOsloDateTimeLocal(candidate);
    if (new Date(iso).getTime() > nowMs) return iso;
    weeks += 1;
  }
}

/** The `games` columns a weekly successor is built from. */
export type WeeklyRepeatSource = Pick<
  GamesRow,
  | 'id'
  | 'name'
  | 'course_id'
  | 'tee_box_id'
  | 'hcp_allowance_pct'
  | 'require_peer_approval'
  | 'score_visibility'
  | 'game_mode'
  | 'mode_config'
  | 'registration_mode'
  | 'registration_type'
  | 'let_friends_skip_gate'
  | 'entry_fee_kr'
  | 'payment_link'
  | 'prizes'
  | 'side_tournament_enabled'
  | 'side_ld_count'
  | 'side_ctp_count'
  | 'side_ld_holes'
  | 'side_ctp_holes'
  | 'side_disabled_categories'
  | 'start_type'
  | 'group_id'
  | 'tournament_id'
  | 'tournament_match_label'
  | 'hole_segment'
  | 'scheduled_tee_off_at'
> & {
  /** The organiser. A round without one is never repeated (no one to invite from). */
  created_by: string;
};

export type WeeklyRepeatPlayer = {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  tee_gender: GamePlayersInsert['tee_gender'];
  withdrawn_at: string | null;
};

/**
 * The name of the next round. A name the wizard made (`isAutoGameName`: the
 * course, or the course and a date) gets the new date in the same language;
 * the organiser's own name («Lørdagsrunden») is kept.
 */
function nextGameName(name: string, courseName: string | null, nextTeeOff: string): string {
  if (!isAutoGameName(name, courseName)) return name;
  const course = courseName?.trim() ?? '';
  const suffix = name.trim().slice(course.length + 1);
  const locale = suffix && !/^\d{1,2}\. /.test(suffix) ? 'en' : 'no';
  return (
    suggestGameName({
      courseName: course,
      scheduledTeeOffAt: formatOsloDateTimeLocal(nextTeeOff),
      locale,
    }) || name
  );
}

/**
 * The rows `spawnWeeklyRepeat` inserts for the next round: the game (the same
 * columns `createGameInternal` writes, plus `hole_segment` and the repeat
 * fields) and its roster.
 *
 * - `status: 'scheduled'`, everything a finish wrote is cleared.
 * - `mode_config` is copied as it is, with no new stamping: the series keeps
 *   the rules it was created under.
 * - The roster is the active players (withdrawn ones stay out, as in
 *   «Revansje?»), with their team, flight and tee category. Handicaps are
 *   frozen at start, as for every scheduled round. The organiser and guests
 *   are confirmed, everyone else is «Ikke bekreftet» (`acceptedAtForActor`).
 *   Wolf and Round Robin draw their rotation slots at start, so those are
 *   cleared (`NO_ROTATION_MODES`, shared with «Revansje?»).
 */
export function buildWeeklyRepeatInsert(
  source: WeeklyRepeatSource,
  players: WeeklyRepeatPlayer[],
  nextTeeOff: string,
  courseName: string | null,
  opts: { newGameId: string; guestIds: ReadonlySet<string>; nowIso: string },
): { game: GamesInsert & { id: string }; players: GamePlayersInsert[] } {
  const { newGameId, guestIds, nowIso } = opts;
  const clearSlots = NO_ROTATION_MODES.has(source.game_mode);

  const game = {
    id: newGameId,
    name: nextGameName(source.name, courseName, nextTeeOff),
    course_id: source.course_id,
    tee_box_id: source.tee_box_id,
    hcp_allowance_pct: source.hcp_allowance_pct,
    require_peer_approval: source.require_peer_approval,
    score_visibility: source.score_visibility,
    game_mode: source.game_mode,
    mode_config: source.mode_config,
    registration_mode: source.registration_mode,
    registration_type: source.registration_type,
    let_friends_skip_gate: source.let_friends_skip_gate,
    entry_fee_kr: source.entry_fee_kr,
    payment_link: source.payment_link,
    prizes: source.prizes,
    side_tournament_enabled: source.side_tournament_enabled,
    side_ld_count: source.side_ld_count,
    side_ctp_count: source.side_ctp_count,
    side_ld_holes: source.side_ld_holes,
    side_ctp_holes: source.side_ctp_holes,
    side_disabled_categories: source.side_disabled_categories,
    status: 'scheduled' as const,
    scheduled_tee_off_at: nextTeeOff,
    start_type: source.start_type,
    created_by: source.created_by,
    started_at: null,
    ended_at: null,
    finish_pipeline_at: null,
    round_report: null,
    group_id: source.group_id,
    tournament_id: source.tournament_id,
    tournament_match_label: source.tournament_match_label,
    hole_segment: source.hole_segment,
    repeat_weekly: true,
    repeated_from_game_id: source.id,
  };

  const roster = players
    .filter((p) => p.withdrawn_at === null)
    .map((p) => ({
      game_id: newGameId,
      user_id: p.user_id,
      team_number: clearSlots ? null : p.team_number,
      flight_number: clearSlots ? null : p.flight_number,
      tee_gender: p.tee_gender,
      course_handicap: null,
      accepted_at: guestIds.has(p.user_id)
        ? nowIso
        : acceptedAtForActor(source.created_by, p.user_id, nowIso),
    }));

  return { game, players: roster };
}

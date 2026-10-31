import 'server-only';
import { getServerClient } from '@/lib/supabase/server';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import {
  summariseRecentCourses,
  type RecentCourse,
  type RecentGameRow,
} from './recentCourseCards';

const GAME_COLUMNS = 'id, course_id, status, scheduled_tee_off_at, ended_at, source_game_id';

type PlayedRow = {
  game_id: string;
  withdrawn_at: string | null;
  games: Omit<RecentGameRow, 'withdrawn_at'>;
};

/**
 * «SIST BRUKT» on «Hvor og når?» (#2448): the courses of the games you played
 * or organised, one line per course (`summariseRecentCourses` owns which games
 * count). Read through your own client, so RLS decides what you get to see:
 * the games you are in once they are past draft, and the games you created.
 * `today` is the Oslo day the season is read from.
 *
 * Best-effort, like `getPickerOrderStats`: a failed read logs
 * `[recentCourses]` and gives no courses, so the step shows the search as for
 * a new user instead of taking the form down.
 */
export async function getRecentCourses(userId: string, today: string): Promise<RecentCourse[]> {
  try {
    const supabase = await getServerClient();
    const [played, organised] = await Promise.all([
      selectAllRows(
        (from, to) =>
          supabase
            .from('game_players')
            .select(`game_id, withdrawn_at, games!inner(${GAME_COLUMNS})`)
            .eq('user_id', userId)
            .order('game_id')
            .range(from, to)
            .returns<PlayedRow[]>(),
        'recentCourses played',
      ),
      selectAllRows(
        (from, to) =>
          supabase
            .from('games')
            .select(GAME_COLUMNS)
            .eq('created_by', userId)
            .order('id')
            .range(from, to)
            .returns<RecentGameRow[]>(),
        'recentCourses organised',
      ),
    ]);
    const rows: RecentGameRow[] = [
      ...played.map((p) => ({ ...p.games, withdrawn_at: p.withdrawn_at })),
      ...organised,
    ];
    return summariseRecentCourses(rows, today);
  } catch (error) {
    console.error('[recentCourses] lookup failed', error);
    return [];
  }
}

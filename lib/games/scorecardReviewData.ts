import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { COURSE_HOLES_SELECT } from '@/lib/supabase/queryFragments';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { modeCollapsesToTeamCard, type GameMode } from '@/lib/scoring/modes/types';
import {
  ownedScoresByPlayer,
  type FilledRosterRow,
  type FilledScoreRow,
} from './filledHoles';

/**
 * Course-hole row as the scorecard review table needs it. Mirrors the
 * `COURSE_HOLES_SELECT` fragment.
 */
export type ScorecardHole = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

/**
 * The ids the review cards must be fetched for: the card holders, plus their
 * whole team when the mode shares rows (#2213).
 *
 * In the team-collapsed modes (scramble family, alternate-shot matchplay,
 * patsome from hole 7) the captain owns the team's rows, so a teammate's card
 * lives on somebody else's `user_id`. Withdrawn members are included: a captain
 * who deleted their account mid-round still holds the holes entered before
 * that (#2067), and `reviewScoresByHolder` folds them in.
 *
 * Wider than any single card needs, like `scoreOwnerUserIds`: the id list is
 * the fetch, `reviewScoresByHolder` is the rule. Hole 18 answers «does this
 * mode ever collapse» (patsome's shared half runs 7-18). A holder without a
 * team gets only themselves. Deduplicated, holders first.
 */
export function reviewScoreUserIds(
  mode: GameMode,
  roster: readonly FilledRosterRow[],
  holderIds: readonly string[],
): string[] {
  const ids = new Set(holderIds);
  if (!modeCollapsesToTeamCard(mode, 18)) return [...ids];
  const teams = new Set(
    roster
      .filter((p) => ids.has(p.user_id) && p.team_number != null)
      .map((p) => p.team_number),
  );
  for (const p of roster) {
    if (p.team_number != null && teams.has(p.team_number)) ids.add(p.user_id);
  }
  return [...ids];
}

/**
 * Rows → card holder → hole → strokes, with the row OWNER's rows per hole
 * (#2213). No new rule: this asks `ownedScoresByPlayer` (#2017/#2067), the
 * same per-hole ownership the submit page reads since #1577, so the approver
 * sees the card exactly as the team kept it. Grouping on `user_id` instead
 * showed a teammate in the one-ball formats an empty card.
 *
 * `roster` is the whole game roster, withdrawn members included:
 * `teamScoreOwnerId` needs the whole team to skip them itself, and the fold
 * needs them to find a former owner's rows.
 *
 * `rows` are UNFILTERED on strokes, with `strokes` selected — unlike what the
 * `FilledScoreRow` doc asks for. That is safe here: `ownedScoresByPlayer`
 * only filters on owner, and nothing counts rows (the doc's warning is about
 * counting holes nobody played). A `strokes: null` row lands on the card as
 * `null`, i.e. an empty hole, exactly as before. The fold reads `strokes` when
 * the field is present (`FoldScoreRow`), so a former owner's entered row still
 * beats the owner's cleared one.
 *
 * Returns one card per distinct holder, empty when they own no rows.
 */
export function reviewScoresByHolder<
  T extends FilledScoreRow & { strokes: number | null },
>(opts: {
  rows: readonly T[];
  mode: GameMode;
  roster: readonly FilledRosterRow[];
  holderIds: readonly string[];
}): Map<string, Map<number, number | null>> {
  const owned = ownedScoresByPlayer({
    players: opts.roster,
    scores: opts.rows,
    mode: opts.mode,
  });
  const byHolder = new Map<string, Map<number, number | null>>();
  for (const holderId of new Set(opts.holderIds)) {
    const card = new Map<number, number | null>();
    for (const row of owned.get(holderId) ?? []) {
      card.set(row.hole_number, row.strokes);
    }
    byHolder.set(holderId, card);
  }
  return byHolder;
}

/**
 * Holes + one card per holder for reviewing submitted scorecards (#1586).
 * Shared by the creator approval list and the Sekretariatet submitted list.
 *
 * The cards follow the row-owner rule (#2213): the scores are fetched for
 * `reviewScoreUserIds` (holders plus their team in the modes that share rows)
 * and mapped with `reviewScoresByHolder`, so a teammate in scramble,
 * foursomes or patsome sees the team's card instead of an empty one.
 * `roster` is the whole game roster, withdrawn members included.
 *
 * `scoresClient` is separate from `holesClient` because the two surfaces
 * differ in authz: the Sekretariatet page reads scores with the admin's
 * session client (the `is_admin()` branch of the scores RLS), while the
 * creator page must use the service-role client — its viewer gate is
 * `requireAdminOrCreator` on the route, and the RLS client would silently
 * return nothing for other flights or hidden score visibility (#1542: the
 * gate at the call-site IS the enforcement).
 */
export async function fetchScorecardReviewData(
  holesClient: SupabaseClient<Database>,
  scoresClient: SupabaseClient<Database>,
  gameId: string,
  courseId: string | null,
  cards: {
    mode: GameMode;
    roster: readonly FilledRosterRow[];
    holderIds: readonly string[];
  },
): Promise<{
  holes: ScorecardHole[];
  scoresByHolder: Map<string, Map<number, number | null>>;
}> {
  const { mode, roster, holderIds } = cards;
  if (!courseId || holderIds.length === 0) {
    return { holes: [], scoresByHolder: new Map() };
  }
  const userIds = reviewScoreUserIds(mode, roster, holderIds);
  const [holesRes, scoresRes] = await Promise.all([
    holesClient
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<ScorecardHole[]>(),
    selectAllRowsResult(
      (from, to) =>
        scoresClient
          .from('scores')
          .select('user_id, hole_number, strokes')
          .eq('game_id', gameId)
          .in('user_id', userIds)
          .order('id')
          .range(from, to)
          .returns<{ user_id: string; hole_number: number; strokes: number | null }[]>(),
      'fetchScorecardReviewData scores',
    ),
  ]);
  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;
  const scoresByHolder = reviewScoresByHolder({
    rows: scoresRes.data ?? [],
    mode,
    roster,
    holderIds,
  });
  return { holes: holesRes.data ?? [], scoresByHolder };
}

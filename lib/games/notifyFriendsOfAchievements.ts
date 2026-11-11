import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { readFriendIds } from '@/lib/friends/getFriendIds';
import { notify } from '@/lib/notifications/notify';
import { readBragRound } from '@/lib/games/notifyAchievementUnlocks';
import { achievementRecipients, friendWorthyMoments } from '@/lib/games/friendAchievements';

type AdminClient = ReturnType<typeof getAdminClient>;

const LOG = '[notifyFriendsOfAchievements]';

/**
 * Best-effort (#2800): when a game is finished, tells the people around each
 * player who got a gross hole-in-one, albatross or eagle: the player's friends,
 * and in a league round every league player too, each person once and nobody
 * from the same game (`achievementRecipients`, the one home of that rule). A
 * league player's notice carries `league_id` and links the league; a friend
 * outside it links Venner. One `friend_achievement` notice per player per
 * recipient, with every moment of the round in it. Inbox and push only, no mail.
 *
 * Runs once per game, inside the finish pipeline's claim, right after the
 * player's own `notifyAchievementUnlocks` and on the same read
 * (`readBragRound`). It never throws: a failed read sends nothing, a failed
 * read of one player's friends costs only that player's notices, and one
 * failed `notify` never stops the others. Returns the number of `notify` calls
 * that did not throw.
 */
export async function notifyFriendsOfAchievements(gameId: string): Promise<number> {
  try {
    const round = await readBragRound(gameId, 'notifyFriendsOfAchievements');
    if (!round) return 0;

    const scorers = round.players
      .map((p) => ({ userId: p.userId, moments: friendWorthyMoments(p.holes, round.game.game_mode) }))
      .filter((p) => p.moments.length > 0);
    if (scorers.length === 0) return 0;

    const admin = getAdminClient();
    const [courseRes, usersRes, league] = await Promise.all([
      admin
        .from('courses')
        .select('name')
        .eq('id', round.game.course_id)
        .maybeSingle<{ name: string }>(),
      admin
        .from('users')
        .select('id, name')
        .in(
          'id',
          scorers.map((s) => s.userId),
        )
        .returns<{ id: string; name: string | null }[]>(),
      readLeague(admin, round.game.league_round_id),
    ]);
    // A missing name or course only costs the card a fallback (#583).
    if (courseRes.error) console.error(`${LOG} course fetch failed`, { gameId, error: courseRes.error });
    if (usersRes.error) console.error(`${LOG} names fetch failed`, { gameId, error: usersRes.error });
    const courseName = courseRes.data?.name?.trim() || null;
    const nameById = new Map((usersRes.data ?? []).map((u) => [u.id, u.name?.trim() || null]));

    const perScorer = await Promise.allSettled(
      scorers.map(async (scorer): Promise<number> => {
        const recipients = achievementRecipients({
          playerId: scorer.userId,
          leagueMemberIds: league?.memberIds ?? null,
          friendIds: await readFriendIds(scorer.userId),
          gamePlayerIds: round.rosterIds,
        });
        const base = {
          game_id: gameId,
          player_id: scorer.userId,
          player_name: nameById.get(scorer.userId) ?? null,
          course_name: courseName,
          moments: scorer.moments.map((m) => ({ kind: m.kind, hole_number: m.holeNumber })),
        };
        const sends = await Promise.allSettled(
          recipients.map(({ userId, inLeague }) =>
            notify({
              userId,
              kind: 'friend_achievement',
              payload: { ...base, league_id: inLeague && league ? league.leagueId : null },
            }),
          ),
        );
        let sent = 0;
        for (const r of sends) {
          if (r.status === 'fulfilled') sent += 1;
          else console.error(`${LOG} notify failed`, { gameId, playerId: scorer.userId, reason: r.reason });
        }
        return sent;
      }),
    );

    let sent = 0;
    for (const r of perScorer) {
      if (r.status === 'fulfilled') sent += r.value;
      else console.error(`${LOG} recipients failed`, { gameId, reason: r.reason });
    }
    return sent;
  } catch (err) {
    console.error(`${LOG} failed`, { gameId, err });
    return 0;
  }
}

/**
 * The league behind a league round and its players, or `null` when the game
 * is not a league round. Throws on a failed read: without the list nobody can
 * say who is in the league or which link each notice gets, so nothing is sent.
 */
async function readLeague(
  admin: AdminClient,
  leagueRoundId: string | null,
): Promise<{ leagueId: string; memberIds: string[] } | null> {
  if (!leagueRoundId) return null;
  const roundRes = await admin
    .from('league_rounds')
    .select('league_id')
    .eq('id', leagueRoundId)
    .single<{ league_id: string }>();
  if (roundRes.error) throw roundRes.error;
  const playersRes = await admin
    .from('league_players')
    .select('user_id')
    .eq('league_id', roundRes.data.league_id)
    .returns<{ user_id: string }[]>();
  if (playersRes.error) throw playersRes.error;
  return {
    leagueId: roundRes.data.league_id,
    memberIds: (playersRes.data ?? []).map((p) => p.user_id),
  };
}

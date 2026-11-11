import { underParMoment, type HoleScore } from '@/lib/stats/achievements';
import { modeCollapsesToTeamCard, type GameMode } from '@/lib/scoring/modes/types';

/**
 * The rules behind the `friend_achievement` notice (#2800). Pure and I/O-free
 * (Type A); the sender is `notifyFriendsOfAchievements`.
 */

export type FriendWorthyKind = 'hole_in_one' | 'albatross' | 'eagle';
export type FriendWorthyMoment = { kind: FriendWorthyKind; holeNumber: number };

/**
 * A player's gross hole-in-one, albatross and eagle holes in one round, sorted
 * by hole. Built on `underParMoment`, so a hole-in-one is never an eagle as
 * well, and a birdie is never told. A hole where the team plays one ball
 * (`modeCollapsesToTeamCard`: scramble, foursomes, patsome from hole 7) is
 * skipped: the row sits on the captain, but the stroke is the team's, and the
 * owner asked for the player's own ball only.
 */
export function friendWorthyMoments(holes: HoleScore[], mode: GameMode): FriendWorthyMoment[] {
  const moments: FriendWorthyMoment[] = [];
  for (const h of holes) {
    if (h.strokes == null || modeCollapsesToTeamCard(mode, h.holeNumber)) continue;
    const kind = underParMoment(h.strokes, h.par);
    if (kind === 'hole_in_one' || kind === 'albatross' || kind === 'eagle') {
      moments.push({ kind, holeNumber: h.holeNumber });
    }
  }
  return moments.sort((a, b) => a.holeNumber - b.holeNumber);
}

/**
 * Who is told (the owner's answer 11.11): the other players in the league
 * when the game is a league round (`leagueMemberIds` set), otherwise the
 * player's friends. Never the player, and never anyone on the game's roster:
 * they were there. The one home of this rule.
 */
export function achievementRecipients(input: {
  playerId: string;
  leagueMemberIds: readonly string[] | null;
  friendIds: readonly string[];
  gamePlayerIds: readonly string[];
}): string[] {
  const pool = input.leagueMemberIds ?? input.friendIds;
  const there = new Set([input.playerId, ...input.gamePlayerIds]);
  return [...new Set(pool)].filter((id) => !there.has(id));
}

import 'server-only';
import { readUnavailableFriendIds } from '@/lib/games/appTeamSignup';
import { visibleFriendHcp, type FriendStats } from '@/lib/friends/friendStats';
import { friendLinkPath } from '@/lib/friends/friendLinkPath';
import { getFriendHandicaps, getFriendStats } from '@/lib/friends/getFriendStats';
import { firstName } from '@/lib/firstName';
import { nameInitials } from '@/lib/names/initials';
import { playerNameWithNicknameAfter } from '@/lib/names/playerName';
import { getTeamFriendCandidates } from '@/lib/users/getTeamCandidates';
import { getPrivateUserFields } from '@/lib/users/privateUserFields';

/** One friend in the web's friend picker (#2840 del 5). No address leaves. */
export type TeamPickerFriend = {
  id: string;
  /** Name with the nickname after it, else the masked address (#2207). */
  label: string;
  /** «Kari» for the lineup under the disc. */
  shortName: string;
  initials: string;
  isGuest: boolean;
  /** `visibleFriendHcp`: only after a finished round together (#2267). */
  hcp: number | null;
  /** `null` when the numbers could not be read; the row then shows no line. */
  stats: FriendStats | null;
  /** In the round already (`readUnavailableFriendIds`): greyed, not pickable. */
  unavailable: boolean;
};

export type TeamFriendPickerData = {
  friends: TeamPickerFriend[];
  /** «/venner/legg-til/<kode>» for «Kopier lenken din»; null when unread. */
  friendLinkPath: string | null;
};

/**
 * What the web's team form and the team page's «Velg en venn» list (#2840
 * del 5): the captain's friends (`getTeamFriendCandidates`), which of them
 * are in the round already, the numbers under each name, and the captain's
 * own friend link for «Legg til venn».
 *
 * The taken friends are read loud, as in the app's route: a failed read throws
 * instead of a list that greys out nobody. The numbers and the link are best
 * effort, like the friends page. The server checks every pick again.
 */
export async function loadTeamFriendPicker(
  userId: string,
  gameId: string,
): Promise<TeamFriendPickerData> {
  const [candidates, unavailableIds, privateFields] = await Promise.all([
    getTeamFriendCandidates(userId),
    readUnavailableFriendIds(gameId, userId),
    getPrivateUserFields([userId]).catch((err) => {
      console.error('[teamFriendPicker] friend code failed', err);
      return null;
    }),
  ]);
  const ids = candidates.map((c) => c.id);
  const [stats, handicaps] = await Promise.all([
    getFriendStats(userId, ids).catch((err) => {
      console.error('[teamFriendPicker] stats failed', err);
      return null;
    }),
    getFriendHandicaps(ids).catch((err) => {
      console.error('[teamFriendPicker] handicaps failed', err);
      return new Map<string, number>();
    }),
  ]);

  const unavailable = new Set(unavailableIds);
  const friendCode = privateFields?.get(userId)?.friendCode ?? null;
  return {
    friends: candidates.map((c) => {
      const plain = c.name?.trim() || c.maskedEmail;
      const own = stats === null ? null : (stats.get(c.id) ?? NO_SHARED_ROUNDS);
      return {
        id: c.id,
        label: playerNameWithNicknameAfter(plain, c.nickname),
        shortName: firstName(c.name) ?? plain,
        initials: nameInitials(c.name?.trim() || null),
        isGuest: c.isGuest ?? false,
        hcp: visibleFriendHcp(handicaps.get(c.id) ?? null, own),
        stats: own,
        unavailable: unavailable.has(c.id),
      };
    }),
    friendLinkPath: friendCode ? friendLinkPath(friendCode) : null,
  };
}

const NO_SHARED_ROUNDS: FriendStats = { roundsTogether: 0, lastPlayedAt: null, lastGameName: null };

import 'server-only';
import { cache } from 'react';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getFriendPlayerOptions } from '@/lib/friends/getFriendPlayerOptions';
import { getClubMemberPlayerOptions } from '@/lib/clubs/getClubMemberPlayerOptions';
import { mergeCreateGameRoster } from '@/lib/games/createGameRoster';

/**
 * Everything `/opprett-spill` needs to know about who the organiser can play
 * with — one home, read by both Suspense boundaries on that page (#2018).
 *
 * The shortage banner used to count only `getNewGameFormData` (co-players),
 * while the wizard below merged in friends and club members. A user with
 * friends but no shared games was told «du har bare 1 registrert spiller»
 * above a picker listing them all. Both now read this list.
 *
 * Wrapped in React `cache`, keyed on the primitive `userId` string, so the
 * banner and the wizard share one set of round-trips per request (an object
 * argument would miss the cache every time). `getNewGameFormData(false)` keeps
 * the literal `false` for the same reason, and for #435: no co-player e-post
 * in a non-admin page payload.
 *
 * The friend and club lookups are best-effort and their fallbacks live HERE,
 * inside the cached function. A rejected promise would be cached too and throw
 * in both boundaries, taking down the banner and the whole wizard for one
 * optional lookup. `getNewGameFormData` still throws on a failed users query:
 * that is the page's error boundary, as before.
 */
export const getCreateGamePlayerRoster = cache(async (userId: string) => {
  const [{ courses, players: coPlayers, clubs }, friends, clubMembers] =
    await Promise.all([
      getNewGameFormData(false),
      // #464: friends are the picker source for kompis/cup. Fetched as full
      // PlayerOption rows because users-RLS hides friends you never played with.
      getFriendPlayerOptions(userId).catch(() => []),
      // #464: club members are the picker source for klubb intent, and must be
      // merged in or members who are not co-players vanish from the roster.
      getClubMemberPlayerOptions(userId).catch(() => ({
        memberIdsByClub: {},
        options: [],
      })),
    ]);

  return {
    courses,
    clubs,
    players: mergeCreateGameRoster({
      coPlayers,
      friends,
      clubMembers: clubMembers.options,
    }),
    friendPlayerIds: friends.map((f) => f.id),
    clubMemberIdsByClub: clubMembers.memberIdsByClub,
  };
});

import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getFriendData, type FriendUser } from '@/lib/friends/getFriendData';
import { sortByLastPlayed, type FriendStats } from '@/lib/friends/friendStats';
import { getFriendHandicaps, getFriendStats } from '@/lib/friends/getFriendStats';
import { displayNameForOthers } from '@/lib/users/displayName';
import {
  getPrivateUserFields,
  type PrivateUserFields,
} from '@/lib/users/privateUserFields';

// Vennesiden i appen (#2256): det samme webbens `/profile/venner` viser.
//
// **Hvorfor en rute.** Venner, forespørsler og forslag leses med admin-
// klienten (`getFriendData`), fordi `users` ikke er lesbar for andre
// (users-RLS-gapet), og venne-koden er privat (#2207). En telefon kan aldri
// holde den nøkkelen, så appen spør her.
//
// **Ingen e-postadresse til andre.** Personene har bare `id` og visningsnavnet
// fra `displayNameForOthers`: navn (med kallenavn), ellers den maskerte
// adressen (#2271). Venne-koden er kallerens egen, fra `getPrivateUserFields`.
//
// AUTH: `authenticatedUserId` — id-en fra det validerte tokenet, aldri fra
// query eller kropp.
//
// **Tallene i underlinjene** (designet, #2256): runder dere har spilt
// sammen, sist dere spilte og i hvilket spill (`lib/friends/friendStats.ts`),
// og handicapet til vennene. `stats: null` betyr at tallene ikke kunne leses;
// listene kommer likevel.
//
// WIRE (frosset — appen speiler den; feltene legges bare til):
//   GET 200 { friends: Friend[], incoming: Request[], outgoing: Request[],
//             suggestions: Person[], friendCode: string | null }
//       Person  = { id, name, stats: Stats | null }
//       Stats   = { roundsTogether, lastPlayedAt: string | null,
//                   lastGameName: string | null }
//       Friend  = Person & { hcp: number | null }   (sist spilt først, så navn)
//       Request = Person & { requestId }   (`id` er den andre personen)
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }

type Person = { id: string; name: string; stats: FriendStats | null };
type Friend = Person & { hcp: number | null };
type FriendRequest = Person & { requestId: string };

const NO_SHARED_ROUNDS: FriendStats = { roundsTogether: 0, lastPlayedAt: null, lastGameName: null };

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const [data, privateFields] = await Promise.all([
      getFriendData(userId),
      // A failed lookup hides the share link, as it does on the web page.
      getPrivateUserFields([userId]).catch(() => new Map<string, PrivateUserFields>()),
    ]);

    const friendIds = data.friends.map((u) => u.id);
    const everyone = [
      ...friendIds,
      ...data.incoming.map((r) => r.user.id),
      ...data.outgoing.map((r) => r.user.id),
      ...data.suggestions.map((u) => u.id),
    ];
    // Best-effort: without the numbers the lists still come, with `stats: null`.
    const [stats, handicaps] = await Promise.all([
      getFriendStats(userId, everyone).catch((err) => {
        console.error('[api/friends] stats failed', err);
        return null;
      }),
      getFriendHandicaps(friendIds).catch((err) => {
        console.error('[api/friends] handicaps failed', err);
        return new Map<string, number>();
      }),
    ]);

    const person = (user: FriendUser): Person => ({
      id: user.id,
      // #2207: someone without a name (unfinished profile) shows as the
      // masked address — same as the web page's `personName`.
      name: displayNameForOthers(user) ?? '',
      stats: stats === null ? null : (stats.get(user.id) ?? NO_SHARED_ROUNDS),
    });
    const toRequest = (row: { id: string; user: FriendUser }): FriendRequest => ({
      requestId: row.id,
      ...person(row.user),
    });
    const friends: Friend[] = data.friends.map((u) => ({
      ...person(u),
      hcp: handicaps.get(u.id) ?? null,
    }));

    return NextResponse.json({
      // Without the numbers everyone ties, and the list stays by name.
      friends: sortByLastPlayed(friends, (f) => f.stats?.lastPlayedAt ?? null),
      incoming: data.incoming.map(toRequest),
      outgoing: data.outgoing.map(toRequest),
      suggestions: data.suggestions.map(person),
      friendCode: privateFields.get(userId)?.friendCode ?? null,
    });
  } catch (err) {
    console.error('[api/friends] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

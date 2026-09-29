import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getFriendData, type FriendUser } from '@/lib/friends/getFriendData';
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
// WIRE (frosset — appen speiler den):
//   GET 200 { friends: Person[], incoming: Request[], outgoing: Request[],
//             suggestions: Person[], friendCode: string | null }
//       Person  = { id, name }
//       Request = { requestId, id, name }   (`id` er den andre personen)
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }

type Person = { id: string; name: string };
type FriendRequest = Person & { requestId: string };

function person(user: FriendUser): Person {
  // #2207: someone without a name (unfinished profile) shows as the masked
  // address — same as the web page's `personName`.
  return { id: user.id, name: displayNameForOthers(user) ?? '' };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const [data, privateFields] = await Promise.all([
      getFriendData(userId),
      // A failed lookup hides the share link, as it does on the web page.
      getPrivateUserFields([userId]).catch(() => new Map<string, PrivateUserFields>()),
    ]);

    const toRequest = (row: { id: string; user: FriendUser }): FriendRequest => ({
      requestId: row.id,
      ...person(row.user),
    });

    return NextResponse.json({
      friends: data.friends.map(person),
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

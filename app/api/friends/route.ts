import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getFriendsView } from '@/lib/friends/getFriendsView';

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
// listene kommer likevel. Sammenstillingen bor i `getFriendsView` (#2267), som
// webbens `/profile/venner` også bruker.
//
// WIRE (frosset — appen speiler den; feltene legges bare til):
//   GET 200 { friends: Friend[], incoming: Request[], outgoing: Request[],
//             suggestions: Person[], friendCode: string | null }
//       Person  = { id, name, initials, stats: Stats | null }
//                 (`initials` fra navnet uten kallenavn, #2267)
//       Stats   = { roundsTogether, lastPlayedAt: string | null,
//                   lastGameName: string | null }
//                 (ferdige spill der ingen av dere har trukket dere, #2267)
//       Friend  = Person & { hcp: number | null }   (sist spilt først, så navn;
//                 `hcp` er null uten minst én ferdig runde sammen, #2267)
//       Request = Person & { requestId }   (`id` er den andre personen)
//       suggestions: flest runder sammen først (#2267)
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    return NextResponse.json(await getFriendsView(userId));
  } catch (err) {
    console.error('[api/friends] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

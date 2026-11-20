import { after, type NextRequest } from 'next/server';
import { inviteByEmail } from '@/lib/friends/friendActionsCore';
import { friendActionRoute, textField } from '@/lib/friends/friendRoute';

// Kalt av appbygg fra før 0252, etter at «Legg til venn på e-post» svarte at
// adressen ikke var på Tørny. Det svaret finnes ikke lenger, og ruta gjør nå
// det samme som `by-email`, med invitasjonskodene de byggene kjenner. Nye bygg
// kaller bare `by-email`.
// Porten og wire-formen: `lib/friends/friendRoute.ts`. Kropp: { email }.
export async function POST(request: NextRequest) {
  return friendActionRoute(request, 'api/friends/invite', async (client, userId, body) =>
    (await inviteByEmail(client, userId, textField(body, 'email'), after)).status,
  );
}

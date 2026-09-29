import type { NextRequest } from 'next/server';
import { inviteByEmail } from '@/lib/friends/friendActionsCore';
import { friendActionRoute, textField } from '@/lib/friends/friendRoute';

// Inviter en adresse som ikke er på Tørny (#2256). Samme vern som webbens
// `sendFriendInvite`, fordi begge kaller kjernen: adressesjekkene, fullført
// profil, invitasjonskvoten og dedup mot kontoer og åpne invitasjoner.
// Porten og wire-formen: `lib/friends/friendRoute.ts`. Kropp: { email }.
export async function POST(request: NextRequest) {
  return friendActionRoute(request, 'api/friends/invite', async (client, userId, body) =>
    (await inviteByEmail(client, userId, textField(body, 'email'))).status,
  );
}

import type { NextRequest } from 'next/server';
import { addByEmail } from '@/lib/friends/friendActionsCore';
import { friendActionRoute, textField } from '@/lib/friends/friendRoute';

// Legg til venn på e-post (#2256). `not_found` betyr at adressen ikke er på
// Tørny, og appen tilbyr da invitasjon på samme adresse, som webben.
// Porten og wire-formen: `lib/friends/friendRoute.ts`. Kropp: { email }.
export async function POST(request: NextRequest) {
  return friendActionRoute(request, 'api/friends/by-email', (client, userId, body) =>
    addByEmail(client, userId, textField(body, 'email')),
  );
}

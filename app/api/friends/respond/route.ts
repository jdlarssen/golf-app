import type { NextRequest } from 'next/server';
import { respond } from '@/lib/friends/friendActionsCore';
import { friendActionRoute, textField } from '@/lib/friends/friendRoute';

// Godta eller avslå en innkommende forespørsel (#2256). Bare `accept: true`
// godtar; alt annet avslår, som webbens skjema der bare «1» godtar.
// Porten og wire-formen: `lib/friends/friendRoute.ts`. Kropp: { requestId, accept }.
export async function POST(request: NextRequest) {
  return friendActionRoute(request, 'api/friends/respond', (client, userId, body) =>
    respond(client, userId, textField(body, 'requestId'), body.accept === true),
  );
}

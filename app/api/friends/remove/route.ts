import type { NextRequest } from 'next/server';
import { remove } from '@/lib/friends/friendActionsCore';
import { friendActionRoute, textField } from '@/lib/friends/friendRoute';

// Fjern en venn eller trekk tilbake en forespørsel (#2256). Stille, uten varsel.
// Porten og wire-formen: `lib/friends/friendRoute.ts`. Kropp: { otherId }.
export async function POST(request: NextRequest) {
  return friendActionRoute(request, 'api/friends/remove', (client, _userId, body) =>
    remove(client, textField(body, 'otherId')),
  );
}

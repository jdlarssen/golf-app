import type { NextRequest } from 'next/server';
import { sendRequest } from '@/lib/friends/friendActionsCore';
import { friendActionRoute, textField } from '@/lib/friends/friendRoute';

// Venneforespørsel til en kjent bruker (#2256, appens «Legg til» under
// «Folk du har spilt med»). Porten og wire-formen: `lib/friends/friendRoute.ts`.
// Kropp: { addresseeId }.
export async function POST(request: NextRequest) {
  return friendActionRoute(request, 'api/friends/request', (client, userId, body) =>
    sendRequest(client, userId, textField(body, 'addresseeId')),
  );
}

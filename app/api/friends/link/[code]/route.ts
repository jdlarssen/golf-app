import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { connectByFriendCode } from '@/lib/friends/friendActionsCore';
import { friendActionRoute } from '@/lib/friends/friendRoute';
import { friendLinkView } from '@/lib/friends/friendLinkView';

// «Bli venn med …» i appen (#2627): QR-koden på bag-taggen og venne-lenka
// åpner appen, og skjermen spør her. Samme oppslag og samme kobling som
// nettsidens `/venner/legg-til/[code]` (#369), fra `friendLinkView` og
// `connectByFriendCode`.
//
// AUTH: `authenticatedUserId` (GET) og `friendActionRoute` (POST). Kalleren
// kommer KUN fra tokenet, og koden KUN fra stien. Svaret har eierens
// visningsnavn (maskert på serveren, #2271) og forholdet, aldri id eller
// adresse.
//
// WIRE (appen speiler den i `native/app/src/data/friends.ts`):
//   GET  200 { relation: 'self' | 'already_friends' | 'connectable', name: string }
//        401 { error: 'unauthorized' }   404 { error: 'not_found' }
//        500 { error: 'load_failed' }
//   POST 200 { status: FriendStatus }    (`accepted` når dere ble venner nå)
//        401 { error: 'unauthorized' }   500 { status: 'error' }

const LOG_PREFIX = 'api/friends/link/[code]';

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { code } = await ctx.params;
    const view = await friendLinkView(userId, code);
    if (!view) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ relation: view.relation, name: view.name });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] load failed`, err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  return friendActionRoute(request, LOG_PREFIX, async (client, userId) =>
    connectByFriendCode(client, userId, (await ctx.params).code),
  );
}

import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUser, callerScopedClient } from '@/lib/api/appAuth';
import { openInvitation } from '@/lib/auth/openInvitation';

// Invitasjonslenka i appen (#2748): mailen åpner appen, og skjermen spør her. Å
// åpne er å bekrefte, som i dag. Reglene bor i `afterLogin`, de samme stegene
// en innlogging kjører (`lib/auth/openInvitation.ts`).
//
// AUTH: `authenticatedUser`. Kalleren og adressen kommer KUN fra tokenet, og
// invitasjonen KUN fra stien. Kroppen leses ikke. En invitasjon til en annen adresse
// svarer `other_account`, uten å røpe runden. Kjernen får `callerScopedClient`, så
// konsumet av invitasjonen kjører som kalleren under RLS.
//
// WIRE (appen speiler den i `native/app/src/data/invitationLink.ts`):
//   POST 200 { status: 'in_game', gameId: string }
//        200 { status: 'started' | 'no_game' | 'other_account' }
//        401 { error: 'unauthorized' }   404 { error: 'not_found' }
//        500 { error: 'open_failed' }

// `afterLogin` kan gi flere rundturer per spill, som ruta etter innloggingen.
export const maxDuration = 30;

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const user = await authenticatedUser(request);
    if (!user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const client = callerScopedClient(request);
    if (!client) throw new Error('caller-scoped client unavailable');

    const { token } = await ctx.params;
    const result = await openInvitation(client, { token, userId: user.id, email: user.email });
    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/invitasjon/[token]] open failed', err);
    return NextResponse.json({ error: 'open_failed' }, { status: 500 });
  }
}

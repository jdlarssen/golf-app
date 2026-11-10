import { NextResponse, type NextRequest } from 'next/server';
import { paymentsGate, rosterBody } from './gate';

// «Hvem har betalt?» in the native app (#2749). Transport only: the list and
// its counts are `lib/games/payments.ts`, which the web's page reads too. The
// gate is `./gate.ts`.
//
// WIRE (frozen; the app mirrors it, `native/app/src/data/payments.ts`):
//   GET 200 { entryFeeKr: number, gameName: string, paidCount: number,
//             totalCount: number, remindable: number,
//             players: [{ userId, name: string | null, isGuest, withdrawn, paid }] }
//       401 { error: 'unauthorized' }  403 { error: 'forbidden' }
//       404 { error: 'not_found' }     409 { error: 'no_fee' }
//       500 { error: 'payments_failed' }
//
// The error bodies are fixed, opaque codes: `err.message` never leaves.

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gated = await paymentsGate(request, id);
    if (!gated.ok) return gated.response;
    return NextResponse.json(rosterBody(gated.roster));
  } catch (err) {
    console.error('[api/games/[id]/payments] read failed', err);
    return NextResponse.json({ error: 'payments_failed' }, { status: 500 });
  }
}

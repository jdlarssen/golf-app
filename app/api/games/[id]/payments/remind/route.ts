import { NextResponse, type NextRequest } from 'next/server';
import { remindUnpaidPlayers } from '@/lib/games/payments';
import { getAdminClient } from '@/lib/supabase/admin';
import { paymentsGate } from '../gate';

// «Purr de som mangler» from the native app (#2749). Transport only: the target
// rule and the sending are `remindUnpaidPlayers` in `lib/games/payments.ts`, the
// same core the web's button calls. The gate is `../gate.ts`.
//
// WIRE (frozen; the app mirrors it, `native/app/src/data/payments.ts`):
//   POST 200 { reminded: number }
//        401 { error: 'unauthorized' }  403 { error: 'forbidden' }
//        404 { error: 'not_found' }     409 { error: 'no_fee' }
//        500 { error: 'payments_failed' }
//
// `reminded` is the number of targets, not delivered mails: mail and push are
// best effort in the core, and one dead address must not become a 500.

// N mails and N pushes in one round trip, as in `../../remind/route.ts`.
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gated = await paymentsGate(request, id);
    if (!gated.ok) return gated.response;
    const { count } = await remindUnpaidPlayers(getAdminClient(), gated.gameId);
    return NextResponse.json({ reminded: count });
  } catch (err) {
    console.error('[api/games/[id]/payments/remind] remind failed', err);
    return NextResponse.json({ error: 'payments_failed' }, { status: 500 });
  }
}

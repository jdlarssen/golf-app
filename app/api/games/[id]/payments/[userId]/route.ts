import { NextResponse, type NextRequest } from 'next/server';
import { setPlayerPaid } from '@/lib/games/payments';
import { getAdminClient } from '@/lib/supabase/admin';
import { paymentsGate } from '../gate';

// Ticking a player as paid from the native app (#2749). Transport only: the
// write, the 0-row check, the audit row and the cache are `setPlayerPaid` in
// `lib/games/payments.ts`, which the web's server action calls too. The gate is
// `../gate.ts`; the player must have a row in this game.
//
// WIRE (frozen; the app mirrors it, `native/app/src/data/payments.ts`):
//   PUT { paid: boolean } → 200 { paid: boolean }
//       400 { error: 'bad_request' }   401 { error: 'unauthorized' }
//       403 { error: 'forbidden' }     404 { error: 'not_found' }
//       409 { error: 'no_fee' }        500 { error: 'payments_failed' }

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, userId: playerId } = await ctx.params;
    const gated = await paymentsGate(request, id);
    if (!gated.ok) return gated.response;

    const body = (await request.json().catch(() => null)) as { paid?: unknown } | null;
    if (typeof body?.paid !== 'boolean') {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    if (!gated.roster.players.some((p) => p.userId === playerId)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const admin = getAdminClient();
    const { data: actor } = await admin
      .from('users')
      .select('name')
      .eq('id', gated.userId)
      .maybeSingle<{ name: string | null }>();
    await setPlayerPaid(admin, {
      gameId: gated.gameId,
      userId: playerId,
      paid: body.paid,
      actor: { id: gated.userId, name: actor?.name?.trim() || 'Arrangør' },
    });
    return NextResponse.json({ paid: body.paid });
  } catch (err) {
    console.error('[api/games/[id]/payments/[userId]] write failed', err);
    return NextResponse.json({ error: 'payments_failed' }, { status: 500 });
  }
}

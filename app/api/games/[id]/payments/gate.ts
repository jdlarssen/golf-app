import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, gameOrganiserAccess } from '@/lib/api/appAuth';
import { paymentRoster, type PaymentRoster } from '@/lib/games/payments';
import { getAdminClient } from '@/lib/supabase/admin';

// #2749: the gate the three payment routes share (`route.ts`, `[userId]/route.ts`,
// `remind/route.ts`). One body, not three: a gap between them is exactly the
// failure that doesn't show, like the GET in `remind/route.ts` leaking another
// round's roster.
//
// AUTH: `lib/api/appAuth.ts`. The user comes ONLY from the Bearer token and the
// game ONLY from the path. The organiser is the club admin or the one who
// created the round (`gameOrganiserAccess`, the same two-way rule as
// `requireAdminOrCreator`, not the web's `requireAdmin`): in the app the
// organiser is the creator (owner's answer 2 on #2749). A simulator league
// flight has no organiser (#2688), so it is 403.
//
// After the gate the routes read and write with the admin client. The write
// guard in 0191 (e) refuses `paid_at` on the caller's own row for anyone but a
// club admin, and the design has the organiser ticking themselves. RLS and the
// guard stay as they are, the backstop for a direct PATCH (trap 3).

export type PaymentsGate =
  | { ok: true; gameId: string; userId: string; roster: PaymentRoster }
  | { ok: false; response: NextResponse };

const fail = (error: string, status: number): PaymentsGate => ({
  ok: false,
  response: NextResponse.json({ error }, { status }),
});

/** Who is calling, may they, and does the game take a fee at all? */
export async function paymentsGate(request: NextRequest, gameId: string): Promise<PaymentsGate> {
  const userId = await authenticatedUserId(request);
  if (!userId) return fail('unauthorized', 401);

  const access = await gameOrganiserAccess(userId, gameId);
  if (access === 'game_not_found') return fail('not_found', 404);
  if (access === 'not_organiser') return fail('forbidden', 403);

  const roster = await paymentRoster(getAdminClient(), gameId);
  if (!roster) return fail('not_found', 404);
  if (roster.entryFeeKr <= 0) return fail('no_fee', 409);
  return { ok: true, gameId, userId, roster };
}

/** The wire body for GET, and for the app to reload after a write. Frozen. */
export function rosterBody(roster: PaymentRoster) {
  return {
    entryFeeKr: roster.entryFeeKr,
    gameName: roster.gameName,
    paidCount: roster.paidCount,
    totalCount: roster.totalCount,
    remindable: roster.remindable,
    players: roster.players.map((p) => ({
      userId: p.userId,
      name: p.name,
      isGuest: p.isGuest,
      withdrawn: p.withdrawn,
      paid: p.paid,
    })),
  };
}

import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { joinFlightCore, type JoinFlightError } from '@/lib/games/joinFlight';
import { isUuid } from '@/lib/url/isUuid';

// A player picks or changes their own flight from the app (#2750).
//
// The route is transport in front of `lib/games/joinFlight.ts`. Who may move,
// which flights are on offer, the capacity check, the re-count after the write
// and the cache all live there and are NEVER mirrored here (AGENTS trap 4). The
// web's waiting room calls the same core through its server action.
//
// AUTH: `lib/api/appAuth.ts`, the shared access check for app→server routes.
// `Authorization: Bearer <access_token>` validated against GoTrue.
//
// **The gate is `authenticatedUserId` ALONE, and that is enough.** The action is
// by definition on the caller's own row: the user id comes only from the
// validated token, the game id only from the path, and the core filters every
// read and write on `(gameId, userId)`. The body carries one number and is
// parsed into that number, so a `userId` in it reaches nothing.
//
// This IS the authorization argument. There is no RLS behind the route: the core
// writes with service-role, because `guard_game_players_self_update` (0168)
// refuses a player writing `flight_number` on their own row. The guard is why
// the route exists, and it stays.
//
// WIRE (frozen, `native/app/src/data/joinFlight.ts` mirrors it; change both in
// the same PR):
//   POST { flightNumber: number }
//     200 { ok: true }
//     400 { error: 'bad_request' }    body is not JSON, or the number is not a positive integer
//     401 { error: 'unauthorized' }
//     403 { error: 'not_member' }     also for an unknown game, so the status does not tell which games exist
//     409 { error: 'game_not_scheduled' | 'flight_full' | 'flight_bound_to_team' | 'bad_flight' }
//     500 { error: 'flight_failed' }
//
// The status is the class, `error` the detail. `db_error` becomes
// `flight_failed`, the same code as an unexpected throw: both mean «this did not
// work, try again», and the app has nothing to choose between them on.

const LOG_PREFIX = 'api/games/[id]/flight';

/** The core's error codes as HTTP. Exhaustive: a new code fails tsc. */
const ERROR_STATUS: Record<JoinFlightError, number> = {
  not_member: 403,
  game_not_scheduled: 409,
  flight_full: 409,
  flight_bound_to_team: 409,
  bad_flight: 409,
  db_error: 500,
};

const ERROR_CODE: Record<JoinFlightError, string> = {
  not_member: 'not_member',
  game_not_scheduled: 'game_not_scheduled',
  flight_full: 'flight_full',
  flight_bound_to_team: 'flight_bound_to_team',
  bad_flight: 'bad_flight',
  db_error: 'flight_failed',
};

/** The flight number from the body, or `null` when the body does not hold one. */
async function readFlightNumber(request: NextRequest): Promise<number | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (body === null || typeof body !== 'object') return null;
  const { flightNumber } = body as { flightNumber?: unknown };
  return typeof flightNumber === 'number' && Number.isInteger(flightNumber) && flightNumber >= 1
    ? flightNumber
    : null;
}

/** Pick or change your own flight. */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: gameId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const flightNumber = await readFlightNumber(request);
    if (flightNumber === null) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    // A malformed id is an unknown game, not a Postgres 22P02 that reads as 500.
    if (!isUuid(gameId)) {
      return NextResponse.json({ error: ERROR_CODE.not_member }, { status: ERROR_STATUS.not_member });
    }

    const result = await joinFlightCore(gameId, userId, flightNumber);
    if (!result.ok) {
      return NextResponse.json(
        { error: ERROR_CODE[result.error] },
        { status: ERROR_STATUS[result.error] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] join threw`, err);
    return NextResponse.json({ error: 'flight_failed' }, { status: 500 });
  }
}

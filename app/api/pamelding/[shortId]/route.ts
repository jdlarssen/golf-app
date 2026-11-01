import { NextResponse, type NextRequest } from 'next/server';
import { getClientIp } from '@/lib/admin/rateLimit';
import { authenticatedUserId } from '@/lib/api/appAuth';
import {
  buildAppRoundInviteView,
  type AppRoundInviteAnswer,
} from '@/lib/games/appRoundInviteView';
import { getGameByShortId, type ShortIdGame } from '@/lib/games/getGameByShortId';
import { loadSignupFacts } from '@/lib/games/loadSignupFacts';
import {
  registerForOpenGameCore,
  requestApprovalCore,
  type ActionError,
} from '@/lib/games/selfRegistration';
import { signupOffer } from '@/lib/games/signupOffer';
import { getAdminClient } from '@/lib/supabase/admin';

// Påmeldingen i appen (#2748): den delte lenka åpner en skjerm som spør her.
// Samme regel og samme skriving som `/signup/[shortId]`, fra `signupOffer` og
// `selfRegistration`.
//
// AUTH: `authenticatedUserId`. Kalleren kommer KUN fra tokenet, og runden KUN fra
// stien. Kroppen gir bare `intent`, `src` og `message`, så en `user_id` eller
// `game_id` der gjør ingenting. Skrivingen går med service role bak kjernenes
// vakter. Svaret har antall påmeldte, aldri navn eller e-post.
//
// `use_web`: lag, valg av side, en ventende invitasjon på bare-inviterte og
// kapteinens lag. Appen sender deg til nettsiden, der skjemaene bor.
//
// WIRE (typene står i `lib/games/appRoundInviteView.ts`):
//   GET  200 AppRoundInviteView
//        401 { error: 'unauthorized' }   404 { error: 'game_not_found' }
//        500 { error: 'load_failed' }
//   POST { intent: 'join', src? } | { intent: 'request', message? }
//        200 { status: 'joined', gameId }   (også når du alt er på lista)
//        200 { status: 'requested' }        (også når forespørselen alt venter)
//        400 { error: 'bad_request' | 'message_too_long' }
//        401 { error: 'unauthorized' }      404 { error: 'game_not_found' }
//        409 { error: 'game_locked' | 'signup_closed' | 'game_full' | 'wrong_mode'
//                  | 'use_web' | 'profile_incomplete' }
//            `wrong_mode` også for en gammel forespørsel som ikke venter lenger:
//            den kan ikke sendes på nytt, og «sendt» ville vært usant.
//        429 { error: 'rate_limited' }      500 { error: 'db_error' }

type RouteContext = { params: Promise<{ shortId: string }> };

type PostBody =
  | { intent: 'join'; src: string | null }
  | { intent: 'request'; message: string | null };

const UNAUTHORIZED = { error: 'unauthorized' } as const;
const NOT_FOUND = { error: 'game_not_found' } as const;

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const { shortId } = await ctx.params;
    const game = await getGameByShortId(shortId);
    // #2445: a draft answers like a game that does not exist.
    if (!game || game.status === 'draft') return NextResponse.json(NOT_FOUND, { status: 404 });

    const viewer = await loadSignupFacts(game, userId);
    const { count, error } = await getAdminClient()
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', game.id)
      .is('withdrawn_at', null);
    if (error) throw error;

    return NextResponse.json(
      buildAppRoundInviteView(game, signupOffer({ game, ...viewer }), count ?? 0),
    );
  } catch (err) {
    console.error('[api/pamelding/[shortId]] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const body = await readBody(request);
    if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

    const { shortId } = await ctx.params;
    const game = await getGameByShortId(shortId);
    if (!game || game.status === 'draft') return NextResponse.json(NOT_FOUND, { status: 404 });

    // The same answer the screen was given, whichever button it had on it: the
    // cores only ever see a player the page would show a form.
    const viewer = await loadSignupFacts(game, userId);
    switch (signupOffer({ game, ...viewer })) {
      case 'in_game':
        return joined(game.id);
      case 'pending':
        return requested();
      case 'locked':
        return conflict('game_locked');
      case 'closed':
        return conflict('signup_closed');
      case 'web':
        return conflict('use_web');
      case 'join':
      case 'request':
        break;
    }

    const ip = await getClientIp();
    if (body.intent === 'join') {
      const result = await registerForOpenGameCore({ shortId, userId, ip, side: null, src: body.src });
      return result.ok ? joined(result.gameId) : await failure(result.error, game, userId);
    }
    const result = await requestApprovalCore({ shortId, userId, ip, message: body.message });
    return result.ok ? requested() : await failure(result.error, game, userId);
  } catch (err) {
    console.error('[api/pamelding/[shortId]] signup failed', err);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}

async function readBody(request: NextRequest): Promise<PostBody | null> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const { intent, src, message } = parsed as { intent?: unknown; src?: unknown; message?: unknown };
  if (intent === 'join') return { intent, src: typeof src === 'string' ? src : null };
  if (intent === 'request') return { intent, message: typeof message === 'string' ? message : null };
  return null;
}

function joined(gameId: string) {
  const answer: AppRoundInviteAnswer = { status: 'joined', gameId };
  return NextResponse.json(answer);
}

function requested() {
  const answer: AppRoundInviteAnswer = { status: 'requested' };
  return NextResponse.json(answer);
}

function conflict(error: string) {
  return NextResponse.json({ error }, { status: 409 });
}

async function failure(error: ActionError, game: ShortIdGame, userId: string) {
  switch (error) {
    // Two quick taps: the loser's row is the winner's, and the state is what
    // the player asked for.
    case 'already_registered':
      return joined(game.id);
    // The unique key answers for any old row, also one the organiser rejected.
    // Only a request still waiting is a «sent»; the organiser hears of no other.
    case 'already_requested': {
      const viewer = await loadSignupFacts(game, userId);
      const offer = signupOffer({ game, ...viewer });
      if (offer === 'pending') return requested();
      if (offer === 'in_game') return joined(game.id);
      return conflict('wrong_mode');
    }
    case 'message_too_long':
      return NextResponse.json({ error }, { status: 400 });
    case 'not_authed':
      return NextResponse.json(UNAUTHORIZED, { status: 401 });
    case 'game_not_found':
      return NextResponse.json(NOT_FOUND, { status: 404 });
    case 'game_locked':
    case 'signup_closed':
    case 'game_full':
    case 'wrong_mode':
    case 'profile_incomplete':
      return conflict(error);
    // The app never picks a side or fills a team: these need the website.
    case 'team_not_supported_yet':
    case 'bad_side':
    case 'side_full':
      return conflict('use_web');
    case 'rate_limited':
      return NextResponse.json({ error }, { status: 429 });
    case 'db_error':
      return NextResponse.json({ error }, { status: 500 });
  }
}

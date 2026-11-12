import { NextResponse, type NextRequest } from 'next/server';
import { getClientIp } from '@/lib/admin/rateLimit';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getCaptainDisplayName } from '@/app/[locale]/signup/[shortId]/team/captainLookup';
import {
  buildAppRoundInviteView,
  type AppRoundInviteAnswer,
  type AppTeamSignupAnswer,
} from '@/lib/games/appRoundInviteView';
import { loadAppTeamSignup } from '@/lib/games/appTeamSignup';
import { getGameByShortId, type ShortIdGame } from '@/lib/games/getGameByShortId';
import { loadSignupFacts } from '@/lib/games/loadSignupFacts';
import {
  registerForOpenGameCore,
  requestApprovalCore,
  withdrawRequestCore,
  type ActionError,
} from '@/lib/games/selfRegistration';
import { offerForView, signupOffer, signupView } from '@/lib/games/signupOffer';
import {
  acceptTeamInviteCore,
  declineTeamInviteCore,
  submitTeamRegistrationCore,
  type AcceptDeclineError,
  type TeamRegistrationError,
} from '@/lib/games/teamRegistrationCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Påmeldingen i appen (#2748): den delte lenka åpner en skjerm som spør her.
// Samme regel og samme skriving som `/signup/[shortId]`, fra `signupOffer` og
// `selfRegistration`.
//
// AUTH: `authenticatedUserId`. Kalleren kommer KUN fra tokenet, og runden KUN fra
// stien. Kroppen gir bare `intent`, `src`, `message` og lagets felt (`teamName`,
// `memberIds`, `requestId`), så en `user_id` eller
// `game_id` der gjør ingenting. Skrivingen går med service role bak kjernenes
// vakter. Svaret har antall påmeldte og aldri en e-post; navn bare på laget ditt
// (#2840), slik andre ser dem.
//
// `use_web`: lag, valg av side, en ventende invitasjon på bare-inviterte og
// kapteinens lag. Appen sender deg til nettsiden, der skjemaene bor. Det står
// for `join` og `request` og for gamle bygg: `offer` er fortsatt `web` på en
// lagrunde.
//
// Lag i appen (#2840): `teamSignup` sier hvilken lagskjerm et nytt bygg kan vise
// (`teamSignupFor`), og `team`, `accept_team` og `decline_team` går til de samme
// kjernene som nettets lagskjema og lagside (`teamRegistrationCore`). Kjernene er
// portene: de sjekker runden, at medspillerne er vennene dine, og at
// forespørselen er din. Lagsiden selv er `./lag`.
//
// Full runde (#2837): `offer` er `request`, og `seats` har tallene. En forespørsel
// som venter, kan trekkes (`intent: 'cancel'`) når `canCancelRequest` er sann,
// også etter at arrangøren har stengt påmeldingen.
//
// WIRE (typene står i `lib/games/appRoundInviteView.ts`):
//   GET  200 AppRoundInviteView
//        401 { error: 'unauthorized' }   404 { error: 'game_not_found' }
//        500 { error: 'load_failed' }
//   POST { intent: 'join', src? } | { intent: 'request', message? } | { intent: 'cancel' }
//        200 { status: 'joined', gameId }   (også når du alt er på lista)
//        200 { status: 'requested' }        (også når forespørselen alt venter)
//        200 { status: 'cancelled' }        (forespørselen er trukket)
//        400 { error: 'bad_request' | 'message_too_long' }
//        401 { error: 'unauthorized' }      404 { error: 'game_not_found' }
//        409 { error: 'game_locked' | 'signup_closed' | 'game_full' | 'wrong_mode'
//                  | 'use_web' | 'profile_incomplete' | 'not_pending' }
//            `wrong_mode` også for en gammel forespørsel som ikke venter lenger:
//            den kan ikke sendes på nytt, og «sendt» ville vært usant.
//            `not_pending`: ingen egen forespørsel venter (arrangøren rakk å
//            svare). Ingenting er skrevet; hent visningen på nytt.
//        429 { error: 'rate_limited' }      500 { error: 'db_error' }
//
//   POST { intent: 'team', teamName, memberIds: uuid[] }   (#2840)
//        200 AppTeamSignupAnswer `team_registered`: slotResults har navnene slik
//            andre ser dem (#2207), aldri en adresse. En venn som ikke kom med,
//            gir en ledig plass, ikke en feil.
//   POST { intent: 'accept_team' | 'decline_team', requestId: uuid }
//        200 { status: 'team_accepted' } | { status: 'team_declined' }
//   Feilene (kjernenes koder, uendret):
//        400 bad_request (kroppen) | team_name_invalid | slots_count_wrong
//            | duplicate_members | self_in_slots              — rett skjemaet
//        401 unauthorized                                     — not_authed
//        403 teammate_not_friend                              — en du ikke er venn med
//        404 game_not_found (runden) | not_found (forespørselen er ikke din / borte)
//        409 game_locked | signup_closed | game_full | already_registered
//            | wrong_type | wrong_mode | mode_does_not_support_teams
//            | profile_incomplete                             — runden eller du står i veien
//        429 rate_limited                                     500 db_error

type RouteContext = { params: Promise<{ shortId: string }> };

type PostBody =
  | { intent: 'join'; src: string | null }
  | { intent: 'request'; message: string | null }
  | { intent: 'cancel' }
  | { intent: 'team'; teamName: string; memberIds: string[] }
  | { intent: 'accept_team'; requestId: string }
  | { intent: 'decline_team'; requestId: string };

/**
 * A guard on the body, not the rule: the core checks the name against
 * `TEAM_NAME_MIN`/`TEAM_NAME_MAX` and the count against the team size. These
 * only keep a junk body from reaching it. Teams have at most four players.
 */
const TEAM_NAME_BODY_MAX = 200;
const MEMBER_IDS_BODY_MAX = 8;

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

    const view = signupView({ game, ...viewer });
    const team = await loadAppTeamSignup(game, userId, view);
    return NextResponse.json(
      buildAppRoundInviteView(game, offerForView(view, game), count ?? 0, viewer, team),
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
    // Withdrawing your own request has no offer to match: it stands also after
    // the signup closed (#2837). The core's filter is the gate.
    if (body.intent === 'cancel') return await cancel(shortId, userId);
    // #2840: the cores check that the request is the caller's own.
    if (body.intent === 'accept_team' || body.intent === 'decline_team') {
      return await answerTeamInvite(body.intent, shortId, body.requestId, userId);
    }

    const game = await getGameByShortId(shortId);
    if (!game || game.status === 'draft') return NextResponse.json(NOT_FOUND, { status: 404 });
    // #2840: not the offer's way. The core has every gate the team form has.
    if (body.intent === 'team') return await registerTeam(game, userId, body);

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
  const { intent, src, message, teamName, memberIds, requestId } = parsed as {
    intent?: unknown;
    src?: unknown;
    message?: unknown;
    teamName?: unknown;
    memberIds?: unknown;
    requestId?: unknown;
  };
  if (intent === 'join') return { intent, src: typeof src === 'string' ? src : null };
  if (intent === 'request') return { intent, message: typeof message === 'string' ? message : null };
  if (intent === 'cancel') return { intent };
  if (intent === 'team') {
    if (typeof teamName !== 'string' || teamName.length > TEAM_NAME_BODY_MAX) return null;
    if (!Array.isArray(memberIds) || memberIds.length > MEMBER_IDS_BODY_MAX) return null;
    if (!memberIds.every((id): id is string => typeof id === 'string' && isUuid(id))) return null;
    return { intent, teamName, memberIds };
  }
  if (intent === 'accept_team' || intent === 'decline_team') {
    if (typeof requestId !== 'string' || !isUuid(requestId)) return null;
    return { intent, requestId };
  }
  return null;
}

async function registerTeam(
  game: ShortIdGame,
  userId: string,
  body: { teamName: string; memberIds: string[] },
) {
  const result = await submitTeamRegistrationCore(
    userId,
    { shortId: game.short_id, teamName: body.teamName, memberIds: body.memberIds },
    { ip: await getClientIp() },
  );
  if (!result.ok) return teamFailure(result.error);

  // The names the team page shows (#2207); the app picked these friends itself,
  // so this only spares it a lookup. Best effort: a missing name is null.
  const names = await Promise.all(result.slotResults.map((r) => getCaptainDisplayName(r.userId)));
  const answer: AppTeamSignupAnswer = {
    status: 'team_registered',
    captainRequestId: result.captainRequestId,
    joinEffect: game.registration_mode === 'open' ? 'instant' : 'approval',
    slotResults: result.slotResults.map((r, i) =>
      r.ok
        ? { ok: true, userId: r.userId, name: names[i] }
        : { ok: false, userId: r.userId, name: names[i], reason: r.reason },
    ),
  };
  return NextResponse.json(answer);
}

async function answerTeamInvite(
  intent: 'accept_team' | 'decline_team',
  shortId: string,
  requestId: string,
  userId: string,
) {
  const core = intent === 'accept_team' ? acceptTeamInviteCore : declineTeamInviteCore;
  const result = await core(userId, { shortId, requestId });
  if (!result.ok) return teamFailure(result.error);
  const answer: AppTeamSignupAnswer = {
    status: intent === 'accept_team' ? 'team_accepted' : 'team_declined',
  };
  return NextResponse.json(answer);
}

/** #2840: the team cores' codes, unchanged, with the status the table above gives. */
function teamFailure(error: TeamRegistrationError | AcceptDeclineError) {
  switch (error) {
    case 'team_name_invalid':
    case 'slots_count_wrong':
    case 'duplicate_members':
    case 'self_in_slots':
      return NextResponse.json({ error }, { status: 400 });
    case 'not_authed':
      return NextResponse.json(UNAUTHORIZED, { status: 401 });
    case 'teammate_not_friend':
      return NextResponse.json({ error }, { status: 403 });
    case 'game_not_found':
      return NextResponse.json(NOT_FOUND, { status: 404 });
    case 'not_found':
      return NextResponse.json({ error }, { status: 404 });
    case 'game_locked':
    case 'signup_closed':
    case 'game_full':
    case 'already_registered':
    case 'wrong_type':
    case 'wrong_mode':
    case 'mode_does_not_support_teams':
    case 'profile_incomplete':
      return conflict(error);
    case 'rate_limited':
      return NextResponse.json({ error }, { status: 429 });
    case 'db_error':
      return NextResponse.json({ error }, { status: 500 });
  }
}

async function cancel(shortId: string, userId: string) {
  const result = await withdrawRequestCore({ shortId, userId });
  if (result.ok) {
    const answer: AppRoundInviteAnswer = { status: 'cancelled' };
    return NextResponse.json(answer);
  }
  switch (result.error) {
    case 'game_not_found':
      return NextResponse.json(NOT_FOUND, { status: 404 });
    case 'not_pending':
      return conflict('not_pending');
    case 'db_error':
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
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

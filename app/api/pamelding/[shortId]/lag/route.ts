import { after, NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import type { AppTeamPageAnswer, AppTeamPageResponse } from '@/lib/games/appRoundInviteView';
import { readUnavailableFriendIds } from '@/lib/games/appTeamSignup';
import {
  addTeamMemberCore,
  attachToCaptainTeamCore,
  loadTeamDashboard,
  onTeamPageVisit,
  removeTeamMemberCore,
  resendTeamInviteCore,
  transferCaptaincyCore,
  type AddTeamMemberError,
  type AttachTeamResult,
  type TransferCaptaincyResult,
} from '@/lib/games/teamDashboardCore';
import { isUuid } from '@/lib/url/isUuid';

// Lagsiden i appen (#2840): det `/signup/[shortId]/team` viser og gjør, fra de
// samme kjernene (`teamDashboardCore`). Kjernene er portene: bare lagets
// kaptein styrer laget, og en forespørsel eller invitasjon er bare din egen.
//
// AUTH: `authenticatedUserId`, som søsterruta. Kalleren kommer KUN fra tokenet
// og runden KUN fra stien; en `user_id` eller `userId` i kroppen gjør ingenting.
// `attach` trenger i tillegg kallerens egen klient (`callerScopedClient`), fordi
// `befriend_inviter` leser `auth.uid()`.
//
// WIRE (svartypen `AppTeamPageAnswer` står i `lib/games/appRoundInviteView.ts`):
//   GET  200 TeamDashboardView fra `loadTeamDashboard` uten `not_found`:
//            navn slik andre ser dem (#2207), aldri en adresse. Kapteinen får i
//            tillegg `unavailableFriendIds`, vennene som alt er i runden, så
//            «Velg en venn» kan gråe dem ut (som lagskjemaet). Etter svaret
//            bekreftes plassen og lagvarslene merkes lest (`onTeamPageVisit`),
//            som siden gjør.
//        401 { error: 'unauthorized' }   404 { error: 'game_not_found' } (også utkast)
//        500 { error: 'load_failed' }
//   POST { intent: 'remove' | 'resend' | 'transfer', requestId: uuid }
//        { intent: 'attach', invitationId: uuid }
//        { intent: 'add', friendId: uuid, replaceRequestId?: uuid }
//        200 { status: 'removed' | 'resent' | 'transferred' | 'attached' }
//            | { status: 'added', replaced? }
//   Feilene (kjernenes koder, uendret; samme tabell som søsterruta):
//        400 bad_request                 — kroppen
//        401 unauthorized                — ingen gyldig token, eller not_authed
//        403 teammate_not_friend         — `add` med en du ikke er venn med
//        404 not_found                   — ikke ditt lag, din forespørsel eller runden
//        409 game_locked | signup_closed | profile_incomplete | not_approved
//            | captain_is_guest | team_unknown | team_full | already_registered
//        500 db_error

type RouteContext = { params: Promise<{ shortId: string }> };

type PostBody =
  | { intent: 'remove' | 'resend' | 'transfer'; requestId: string }
  | { intent: 'attach'; invitationId: string }
  | { intent: 'add'; friendId: string; replaceRequestId: string | null };

type TeamPageError =
  | AddTeamMemberError
  | Extract<AttachTeamResult, { ok: false }>['error']
  | Extract<TransferCaptaincyResult, { ok: false }>['error'];

const UNAUTHORIZED = { error: 'unauthorized' } as const;

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const { shortId } = await ctx.params;
    const view = await loadTeamDashboard(shortId, userId);
    // #2445: a draft answers like a game that does not exist.
    if (view.kind === 'not_found') {
      return NextResponse.json({ error: 'game_not_found' }, { status: 404 });
    }

    // As the page does in its `after()`: confirm a seat the captain gave you
    // (#463), then mark the game's team varsler read (#2201, #2759).
    const gameId = view.game.id;
    const body: AppTeamPageResponse =
      view.kind === 'captain'
        ? { ...view, unavailableFriendIds: await readUnavailableFriendIds(gameId, userId) }
        : view;
    after(async () => {
      try {
        await onTeamPageVisit(gameId, userId);
      } catch (err) {
        console.error('[api/pamelding/[shortId]/lag] visit side effects failed', err);
      }
    });
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/pamelding/[shortId]/lag] load failed', err);
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
    switch (body.intent) {
      case 'remove': {
        const result = await removeTeamMemberCore(userId, { shortId, requestId: body.requestId });
        return result.ok ? answer({ status: 'removed' }) : failure(result.error);
      }
      case 'resend': {
        const result = await resendTeamInviteCore(userId, { shortId, requestId: body.requestId });
        return result.ok ? answer({ status: 'resent' }) : failure(result.error);
      }
      case 'transfer': {
        const result = await transferCaptaincyCore(userId, { shortId, requestId: body.requestId });
        return result.ok ? answer({ status: 'transferred' }) : failure(result.error);
      }
      case 'attach': {
        // Only null without the anon key: the token was validated above.
        const userClient = callerScopedClient(request);
        if (!userClient) return failure('db_error');
        const result = await attachToCaptainTeamCore(
          userId,
          { shortId, invitationId: body.invitationId },
          { userClient },
        );
        return result.ok ? answer({ status: 'attached' }) : failure(result.error);
      }
      case 'add': {
        const result = await addTeamMemberCore(userId, {
          shortId,
          friendId: body.friendId,
          replaceRequestId: body.replaceRequestId,
        });
        if (!result.ok) return failure(result.error);
        return answer(
          result.replaced === undefined
            ? { status: 'added' }
            : { status: 'added', replaced: result.replaced },
        );
      }
    }
  } catch (err) {
    console.error('[api/pamelding/[shortId]/lag] action failed', err);
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
  const { intent, requestId, invitationId, friendId, replaceRequestId } = parsed as Record<
    string,
    unknown
  >;
  const uuid = (v: unknown): v is string => typeof v === 'string' && isUuid(v);
  if (intent === 'remove' || intent === 'resend' || intent === 'transfer') {
    return uuid(requestId) ? { intent, requestId } : null;
  }
  if (intent === 'attach') {
    return uuid(invitationId) ? { intent, invitationId } : null;
  }
  if (intent === 'add') {
    if (!uuid(friendId)) return null;
    if (replaceRequestId == null) return { intent, friendId, replaceRequestId: null };
    return uuid(replaceRequestId) ? { intent, friendId, replaceRequestId } : null;
  }
  return null;
}

function answer(body: AppTeamPageAnswer) {
  return NextResponse.json(body);
}

/** The cores' codes, unchanged, with the status the table above gives. */
function failure(error: TeamPageError) {
  switch (error) {
    case 'not_authed':
      return NextResponse.json(UNAUTHORIZED, { status: 401 });
    case 'teammate_not_friend':
      return NextResponse.json({ error }, { status: 403 });
    case 'not_found':
      return NextResponse.json({ error }, { status: 404 });
    case 'game_locked':
    case 'signup_closed':
    case 'profile_incomplete':
    case 'not_approved':
    case 'captain_is_guest':
    case 'team_unknown':
    case 'team_full':
    case 'already_registered':
      return NextResponse.json({ error }, { status: 409 });
    case 'db_error':
      return NextResponse.json({ error }, { status: 500 });
  }
}

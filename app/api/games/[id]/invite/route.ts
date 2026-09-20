import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, gameOrganiserAccess } from '@/lib/api/appAuth';
import { consumeAdminInviteRateLimit, getClientIp } from '@/lib/admin/rateLimit';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  inviteEmailToGameCore,
  type InviteRefusal,
} from '@/lib/games/inviteToGame';

// Inviter en e-post inn i runden, fra native-appen (#1919). Kandidatlista i
// appen er medspiller-scopet, og når den var tom sto det «Nye folk inviterer du
// fra nettsiden» — en blindvei med en lenke ut av appen.
//
// Ruta er kun transport foran `lib/games/inviteToGame.ts`. Hvilken gren som
// gjelder (eksisterende bruker vs. ukjent adresse), venne-/klubb-scopingen,
// idempotensen, mail-rollbacken og cache-utløpingen bor der og speiles ALDRI
// her (AGENTS trap 4) — webbens spillerside kaller den samme kjernen gjennom
// sin server-action.
//
// AUTH: `lib/api/appAuth.ts`, den delte adgangssjekken for app→server-ruter.
// `Authorization: Bearer <access_token>` validert mot GoTrue; bruker-id-en
// kommer KUN fra tokenet og spill-id-en KUN fra stien. Kroppen bærer én verdi —
// adressen — og ingen identitet.
//
// ⚠️ **Kjernen får service-role-klienten her.** Da no-op-er 0115-triggeren
// (`auth.uid()` er NULL under service-role), og `isAdmin` + eligibility-sjekken
// inne i kjernen er den ENESTE håndhevelsen av venne-/klubb-scopingen på denne
// stien. Derfor leses `is_admin` for den EKTE kalleren under, aldri fra kroppen.
//
// **Rate-limit selv om webbens spill-invitasjon ikke har en.** Et HTTP-endepunkt
// er eksponert på en annen måte enn en server-action bak et skjema. Bøttene
// deles med admin-døra (`invite-admin:<id>` / `invite-ip:<ip>`), så en app som
// spammer ikke kan omgå taket ved å bytte flate.
//
// WIRE (frosset — appen speiler den):
//   POST { email: string }
//     200 { status: 'added' | 'sent' }
//     400 { error: 'invalid_email' | 'disposable_email' }
//     401 { error: 'unauthorized' }   403 { error: 'forbidden' }
//     404 { error: 'not_found' }
//     409 { error: 'game_locked' | 'game_full' | 'invite_not_allowed' }
//     429 { error: 'rate_limited' }   500 { error: 'invite_failed' }
//
// 400 og 409 bærer hver flere koder, så appen MÅ lese `error` fra kroppen her —
// i motsetning til purringen og selv-frafallet, der én status = én kode.
//
// `db_players` og `mail_failed` skjules begge som 500 `invite_failed`: raden er
// rullet tilbake i begge tilfeller, og arrangøren skal prøve igjen, ikke
// feilsøke. Feil-bodyene er faste, ugjennomsiktige koder — endepunktet er
// offentlig eksponert, så `err.message` (Postgres-detaljer, env-navn) skal
// aldri ut.
//
// `maxDuration = 60`: én Resend-mail kan trekke ut på treg SMTP, og en
// halv-utført invitasjon (rad uten mail) er nettopp det rollbacken i kjernen
// finnes for å unngå. Eneste segment-eksporten repoet bruker — `dynamic`/
// `revalidate`/`runtime` er inkompatible med `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/games/[id]/invite';

/** Kjernens avvisninger, oversatt til HTTP. Uttømmende — ny kode faller på tsc. */
const REFUSAL_STATUS: Record<InviteRefusal, number> = {
  invalid_email: 400,
  disposable_email: 400,
  not_found: 404,
  game_locked: 409,
  game_full: 409,
  invite_not_allowed: 409,
  db_players: 500,
  invite_failed: 500,
  mail_failed: 500,
};

/** Wire-koden per avvisning. De tre server-feilene kollapser til én. */
const REFUSAL_CODE: Record<InviteRefusal, string> = {
  invalid_email: 'invalid_email',
  disposable_email: 'disposable_email',
  not_found: 'not_found',
  game_locked: 'game_locked',
  game_full: 'game_full',
  invite_not_allowed: 'invite_not_allowed',
  db_players: 'invite_failed',
  invite_failed: 'invite_failed',
  mail_failed: 'invite_failed',
};

type RouteContext = { params: Promise<{ id: string }> };

type Gate =
  | { ok: true; gameId: string; userId: string }
  | { ok: false; response: NextResponse };

/** Hvem ringer, og er hen arrangør for akkurat denne runden? */
async function gate(request: NextRequest, ctx: RouteContext): Promise<Gate> {
  const { id: gameId } = await ctx.params;

  const userId = await authenticatedUserId(request);
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }

  const access = await gameOrganiserAccess(userId, gameId);
  if (access === 'game_not_found') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'not_found' }, { status: 404 }),
    };
  }
  if (access === 'not_organiser') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }

  return { ok: true, gameId, userId };
}

/**
 * Adressen fra kroppen, eller tom streng når kroppen ikke lar seg lese.
 *
 * En uleselig kropp er en KLIENT-feil: den faller gjennom som tom adresse, og
 * kjernen svarer `invalid_email` — samme svar som et tomt felt. Uten dette ville
 * `request.json()`-kastet blitt fanget av catch-en under og rapportert som 500,
 * altså «vi feilet» for noe kalleren sendte feil. Samme vakt som profil-ruta.
 */
async function readEmail(request: NextRequest): Promise<string> {
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== 'object') return '';
    const email = (parsed as { email?: unknown }).email;
    return typeof email === 'string' ? email : '';
  } catch {
    return '';
  }
}

/**
 * Rolle og visningsnavn for den EKTE kalleren.
 *
 * `gameOrganiserAccess` svarer bare «arrangør eller ikke» — en oppretter uten
 * admin-flagg og en klubb-admin får samme svar, og de to skal IKKE behandles
 * likt av kjernen: admin er unntatt disposable-guarden og venne-scopingen
 * (kurator-modellen, #422/#906). Webbens `loadRole` leser de samme to feltene
 * for sin ctx; her leses de med admin-klienten, fordi ruta ikke har en
 * RLS-klient. Mangler raden, er svaret det trygge: ikke admin, ikke noe navn.
 */
async function inviterProfile(
  userId: string,
): Promise<{ isAdmin: boolean; name: string | null }> {
  const { data } = await getAdminClient()
    .from('users')
    .select('is_admin, name')
    .eq('id', userId)
    .maybeSingle<{ is_admin: boolean | null; name: string | null }>();

  return { isAdmin: data?.is_admin === true, name: data?.name ?? null };
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const gated = await gate(request, ctx);
    if (!gated.ok) return gated.response;

    const rawEmail = await readEmail(request);

    const allowed = await consumeAdminInviteRateLimit({
      adminId: gated.userId,
      ip: await getClientIp(),
    });
    if (!allowed) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const profile = await inviterProfile(gated.userId);
    const result = await inviteEmailToGameCore({
      client: getAdminClient(),
      gameId: gated.gameId,
      inviterUserId: gated.userId,
      inviterName: profile.name,
      isAdmin: profile.isAdmin,
      rawEmail,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: REFUSAL_CODE[result.reason] },
        { status: REFUSAL_STATUS[result.reason] },
      );
    }

    return NextResponse.json({ status: result.kind });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] invite threw`, err);
    return NextResponse.json({ error: 'invite_failed' }, { status: 500 });
  }
}

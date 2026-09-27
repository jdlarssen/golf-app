import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, gameOrganiserAccess } from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  addExistingPlayerToGameCore,
  type AddExistingPlayerRefusal,
} from '@/lib/games/inviteToGame';

// «Legg til spiller» fra native-appen (#2215). Appen skrev raden selv under
// RLS, så spilleren fikk aldri `invite`-varselet, og webbens cache viste ikke
// den nye spilleren: hen fikk «fant ikke spillet» på nettsiden til cachen
// gikk ut.
//
// Ruta er kun transport foran `addExistingPlayerToGameCore`
// (`lib/games/inviteToGame.ts`). Status-låsen, venne-/klubb-porten,
// format-taket, idempotensen, varselet og cache-tømmingen bor der og speiles
// ALDRI her (AGENTS trap 4). Webbens «Inviter spillere» kaller den samme
// kjernen gjennom sin server-action.
//
// AUTH: `lib/api/appAuth.ts`, den delte adgangssjekken for app→server-ruter.
// `Authorization: Bearer <access_token>` validert mot GoTrue; kalleren kommer
// KUN fra tokenet, og spillet og spilleren som legges til KUN fra stien.
//
// ⚠️ **Kjernen får service-role-klienten her.** Da no-op-er 0115-triggeren
// (`auth.uid()` er NULL under service-role), og `isAdmin` + venne-porten inne i
// kjernen er den ENESTE håndhevelsen av scopingen på denne stien. Derfor leses
// `is_admin` for den EKTE kalleren under, aldri fra kroppen — samme linje som
// `invite`-ruta.
//
// WIRE (appen speiler den):
//   POST (ingen kropp)
//     200 { alreadyOnRoster: boolean }
//     401 { error: 'unauthorized' }   403 { error: 'forbidden' }
//     404 { error: 'not_found' }
//     409 { error: 'game_locked' | 'game_full' | 'invite_not_allowed' }
//     500 { error: 'add_failed' }
//
// 409 bærer flere koder, så appen leser `error` fra kroppen. 404 for et ukjent
// spill gjelder ALLE kallere, også en admin, så statusen ikke røper roller.
// Feil-bodyene er faste, ugjennomsiktige koder: endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.
//
// `maxDuration = 60`: varselet er en push-rundtur etter skrivingen. Eneste
// segment-eksporten repoet bruker — `dynamic`/`revalidate`/`runtime` er
// inkompatible med `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/games/[id]/players/[userId]';

/**
 * Kjernens avvisninger, oversatt til HTTP. Ett kart og ingen `default`: en ny
 * grunn i kjernen feller tsc her i stedet for å bli en stille 500.
 */
const REFUSAL: Record<AddExistingPlayerRefusal, { status: number; error: string }> = {
  not_found: { status: 404, error: 'not_found' },
  game_locked: { status: 409, error: 'game_locked' },
  game_full: { status: 409, error: 'game_full' },
  invite_not_allowed: { status: 409, error: 'invite_not_allowed' },
  db_players: { status: 500, error: 'add_failed' },
};

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/**
 * `is_admin` for den EKTE kalleren.
 *
 * `gameOrganiserAccess` svarer bare «arrangør eller ikke», og en oppretter og en
 * klubb-admin skal ikke behandles likt av kjernen: admin er unntatt
 * venne-porten (kurator-modellen, #906). Mangler raden, er svaret det trygge:
 * ikke admin.
 */
async function callerIsAdmin(userId: string): Promise<boolean> {
  const { data } = await getAdminClient()
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle<{ is_admin: boolean | null }>();
  return data?.is_admin === true;
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: gameId, userId: recipientUserId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const access = await gameOrganiserAccess(userId, gameId);
    if (access === 'game_not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (access === 'not_organiser') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const result = await addExistingPlayerToGameCore({
      client: getAdminClient(),
      gameId,
      inviterUserId: userId,
      isAdmin: await callerIsAdmin(userId),
      recipientUserId,
    });

    if (!result.ok) {
      const { status, error } = REFUSAL[result.reason];
      return NextResponse.json({ error }, { status });
    }

    return NextResponse.json({ alreadyOnRoster: result.alreadyOnRoster });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] add threw`, err);
    return NextResponse.json({ error: 'add_failed' }, { status: 500 });
  }
}

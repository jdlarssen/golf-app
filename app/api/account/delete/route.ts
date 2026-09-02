import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import {
  deleteOrAnonymizeUser,
  getDeleteBlockReason,
  type DeleteBlockReason,
} from '@/lib/users/deleteAccount';

// Konto-sletting for native-appen (#1876, App Store 5.1.1(v)).
//
// Webben sletter via server-action (`/profile/slett-konto`); appen kan ikke
// holde service-role og trenger derfor en server-vei. Denne ruta er kun en
// transport foran de EKSISTERENDE hjelperne i `lib/users/deleteAccount.ts` —
// blokk-regelen og slette-/anonymiser-regelen har ett hjem der, og speiles
// aldri her (AGENTS trap 4). Webbens flyt røres ikke.
//
// AUTH: `authenticatedUserId` i `lib/api/appAuth.ts` — den delte adgangssjekken
// for alle app→server-ruter (#1891). `Authorization: Bearer <access_token>`
// validert mot GoTrue; bruker-id-en kommer KUN derfra, aldri fra body eller
// query, så det finnes ingen vei til å slette en annens konto. Sjekken lå her
// først (#1876) og ble flyttet ut da purre-ruta trengte den samme.
//
// WIRE (frosset — appen speiler den):
//   GET  200 { blocked: 'admin_account' | 'active_engagements' | null }
//        401 { error: 'unauthorized' }   500 { error: 'status_failed' }
//   POST 200 { mode: 'hard' | 'anonymized' }
//        401 { error: 'unauthorized' }
//        403 { error: 'admin_account' | 'active_engagements' }
//        500 { error: 'delete_failed' }
//
// 403-koden er hjelperens egen `DeleteBlockReason`, ikke webbens copy-nøkkel
// (`active_games`). Regelen har ett navn; appen oversetter kode → tekst.
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.

// Sletting er flere rundturer (token-validering, blokk-sjekk, RPC + GoTrue) og
// er ikke idempotent på hard-stien — en timeout midtveis er dyrere enn den
// ekstra taket. Eneste segment-eksporten repoet bruker; `dynamic`/`revalidate`/
// `runtime` er inkompatible med `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/account/delete';

/** GET-svaret. Appen kartlegger koden til banner-copy, se `accountCopy`. */
type StatusBody = { blocked: DeleteBlockReason | null };

/** Blokk-status FØR bekreftelsesskjermen — appen viser banner i stedet for knapp. */
export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body: StatusBody = { blocked: await getDeleteBlockReason(userId) };
    return NextResponse.json(body);
  } catch (err) {
    console.error(`[${LOG_PREFIX}] status failed`, err);
    return NextResponse.json({ error: 'status_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Autoritativ re-sjekk: GET-en er bare pynt for skjermen, og noe kan ha
    // startet i mellomtiden.
    const blocked = await getDeleteBlockReason(userId);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 403 });
    }

    // Hjelperen kaster ikke på DB-feil — den svarer `{ ok: false }` etter å ha
    // logget. 500-en må derfor komme både herfra OG fra catch-en under (som
    // fanger `getAdminClient()`-kastet ved manglende service-nøkkel).
    const result = await deleteOrAnonymizeUser(userId, `[${LOG_PREFIX}]`);
    if (!result.ok) {
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }

    return NextResponse.json({ mode: result.mode });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] delete threw`, err);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
}

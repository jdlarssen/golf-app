import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getClientIp } from '@/lib/admin/rateLimit';
import { sendLoginCode } from '@/lib/auth/sendLoginCode';
import type { SendLoginCodeError } from '@/lib/auth/loginCodeErrors';

// «Send meg kode» for native-appen (#2216).
//
// Appen ber om innloggingskode her i stedet for rett mot Supabase, så den får
// nettsidens sperrer: fartsgrensen per e-post og per IP, bryteren for nye
// kontoer, sperren mot engangs-e-post og invitasjonen som åpner for ny konto.
// Alt det bor i `sendLoginCode`, som nettsidens skjema også kaller. Ruta leser
// kroppen, sender IP-en videre og oversetter svaret. Ingen regel bor her.
//
// AUTH: ingen. Kalleren har ingen sesjon ennå, det er hele poenget. Vernet mot
// direkte kall er fartsgrensene i kjernen, akkurat som for nettsidens skjema.
// Honningfella hører til nettsidens skjema (en felle for skjema-roboter) og
// finnes ikke her.
//
// WIRE (frosset — appen speiler den):
//   POST { email }
//     200 { ok: true }
//     400 { error: 'unknown' | 'user_not_found' | 'invite_expired' | 'disposable_email' }
//     429 { error: 'rate_limited' | 'rate_limited_minute' | 'rate_limited_quota' }
//     500 { error: 'unknown' }
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` skal aldri ut.

// Fartsgrensen, invitasjons-oppslaget og GoTrue er tre rundturer, og en
// utløpt invitasjon gir en fjerde. Eneste segment-eksporten repoet bruker;
// `dynamic`/`revalidate`/`runtime` er inkompatible med `cacheComponents`.
export const maxDuration = 30;

const LOG_PREFIX = 'api/auth/send-code';

/** De tre fartsgrense-kodene svarer 429; resten av avslagene 400. */
const RATE_LIMITED: ReadonlySet<SendLoginCodeError> = new Set([
  'rate_limited',
  'rate_limited_minute',
  'rate_limited_quota',
]);

type ErrorBody = { error: SendLoginCodeError };

/**
 * E-posten fra kroppen, eller `null` når den mangler, ikke er en streng, er tom
 * eller kroppen ikke lar seg lese. Alle fire er kallerens feil og gir 400.
 */
async function readEmail(request: NextRequest): Promise<string | null> {
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== 'object') return null;
    const email = (parsed as { email?: unknown }).email;
    if (typeof email !== 'string' || email.trim() === '') return null;
    return email;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const email = await readEmail(request);
    if (email === null) {
      const body: ErrorBody = { error: 'unknown' };
      return NextResponse.json(body, { status: 400 });
    }

    const result = await sendLoginCode({
      supabase: await getServerClient(),
      email,
      ip: await getClientIp(),
    });
    if (result.ok) return NextResponse.json({ ok: true });

    const body: ErrorBody = { error: result.code };
    return NextResponse.json(body, { status: RATE_LIMITED.has(result.code) ? 429 : 400 });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] failed`, err);
    const body: ErrorBody = { error: 'unknown' };
    return NextResponse.json(body, { status: 500 });
  }
}

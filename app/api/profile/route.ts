import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectOne } from '@/lib/supabase/affectedRows';
import { recomputeCourseHandicapForUser } from '@/lib/games/recomputeCourseHandicap';
import {
  parseProfileInput,
  type ProfileInputError,
  type RawProfileInput,
} from '@/lib/users/profileInput';

// Profil-lagring for native-appen (#1906).
//
// **Hvorfor appen ikke skriver rett mot `users`.** Å rette handicapet MENS en
// runde er i gang må også skrive om de FROSNE banehandicapene i de aktive
// spillene — jobben `recomputeCourseHandicapForUser` gjør, og den krever
// service-role. Uten den gjentas Ryder Cup 2026-feilen: en spiller rettet et
// glemt plusshandicap-fortegn, spillene beholdt den gamle CH-en, og han fikk
// fem slag for mye i tre aktive kamper. Appen kan aldri holde service-nøkkelen,
// så regelen blir liggende på serveren og appen spør — samme mønster som
// konto-sletting (#1876) og purring (#1889).
//
// **Ett regel-hjem (AGENTS trap 4).** Valideringen bor i
// `lib/users/profileInput.ts`. Webbens skjema-action og denne ruta kaller SAMME
// `parseProfileInput` og gjør ingenting selv utover å oversette feilkoden til
// sin egen kanal — `?error=` for skjemaet, JSON-kropp her. Ruta speiler ingen
// grense, ingen enum-liste og ingen rekkefølge på sjekkene.
//
// AUTH: `authenticatedUserId` i `lib/api/appAuth.ts` — den delte adgangssjekken
// for app→server-rutene (#1891). Bruker-id-en kommer KUN fra det validerte
// tokenet; en `userId` i kroppen ignoreres, så det finnes ingen vei til å
// skrive på en annens profil.
//
// WIRE (frosset — appen speiler den):
//   PUT  200 { ok: true }
//        400 { error: 'name_required' | 'hcp_invalid'
//                   | 'gender_required' | 'level_invalid' }
//        401 { error: 'unauthorized' }
//        500 { error: 'update_failed' }
//
// 400-kodene ER parserens egne `ProfileInputError`-verdier — de samme fire
// webbens feilbanner allerede kjenner. Regelen har ett navn; appen oversetter
// kode → tekst.
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.

// Lagringen er flere rundturer (token-validering, update, og en recompute som
// leser alle medlemskap og skriver ett banehandicap per aktivt spill). Eneste
// segment-eksporten repoet bruker; `dynamic`/`revalidate`/`runtime` er
// inkompatible med `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/profile';

type ErrorBody = { error: ProfileInputError | 'unauthorized' | 'update_failed' };

/**
 * Kroppen, eller tomme felter når den ikke lar seg lese.
 *
 * En uleselig kropp er en KLIENT-feil, ikke en server-feil: vi lar den falle
 * gjennom som tomt objekt, og parseren svarer 400 `name_required` — samme svar
 * appen får når feltene er tomme. Uten dette ville `request.json()`-kastet blitt
 * fanget av catch-en under og rapportert som 500 `update_failed`, altså «vi
 * feilet» for noe kalleren sendte feil.
 */
async function readBody(request: NextRequest): Promise<RawProfileInput> {
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== 'object') return {};
    return parsed as RawProfileInput;
  } catch {
    return {};
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) {
      const body: ErrorBody = { error: 'unauthorized' };
      return NextResponse.json(body, { status: 401 });
    }

    const parsed = parseProfileInput(await readBody(request));
    if (!parsed.ok) {
      const body: ErrorBody = { error: parsed.error };
      return NextResponse.json(body, { status: 400 });
    }
    const { name, nickname, hcpIndex, gender, level } = parsed.value;

    // Samme stempel-oppførsel som webbens `updateProfile`:
    // `profile_completed_at` settes på hver lagring (feltet betyr «har vært
    // gjennom skjemaet», ikke «når først»), og `handicap_updated_at` bumpes
    // selv om tallet står stille — spilleren har sett verdien og stått for den.
    // Det er dét den gamle-handicap-påminnelsen leser
    // (`lib/handicap/staleness.ts`).
    const now = new Date().toISOString();
    expectOne(
      await getAdminClient()
        .from('users')
        .update({
          name,
          nickname,
          hcp_index: hcpIndex,
          handicap_updated_at: now,
          profile_completed_at: now,
          // Utelates helt når parseren ikke ga kjønn (#1064) — ellers ville en
          // lagring uten feltet nulle ut en allerede satt verdi på raden.
          ...(gender !== undefined ? { gender } : {}),
          level,
        })
        // Id-en fra tokenet, aldri fra kroppen.
        .eq('id', userId)
        .select(),
      'api/profile PUT',
    );

    // Best-effort, nøyaktig som webben: raden ER skrevet, så en feilet recompute
    // skal aldri gjøre lagringen mislykket. Den logges og etterlater et par
    // aktive spill på gammel CH — synlig og rettbart — mens en 500 her ville
    // fått appen til å be spilleren lagre på nytt over en rad som alt er riktig.
    try {
      await recomputeCourseHandicapForUser(userId, hcpIndex);
    } catch (err) {
      console.error(`[${LOG_PREFIX}] course-handicap recompute threw`, err);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Fanger både DB-feil, den stille 0-rads-skrivingen fra `expectOne`
    // (AGENTS trap 2 — PostgREST svarer `error == null` for en update som traff
    // ingenting) og `getAdminClient()`-kastet ved manglende service-nøkkel.
    console.error(`[${LOG_PREFIX}] update failed`, err);
    const body: ErrorBody = { error: 'update_failed' };
    return NextResponse.json(body, { status: 500 });
  }
}

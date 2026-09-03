// lib/users/profileInput.ts
// Delt validering av de fem profil-feltene: navn, kallenavn, handicap, kjønn,
// spillerklasse.
//
// **Hvorfor regelen flyttet hjemmefra.** Native-appen (#1906) kan ikke skrive
// rett mot `users`: en handicap-retting MENS en runde er i gang må også skrive
// om de frosne banehandicapene, og den jobben er service-role. Så appen spør
// serveren, akkurat som ved konto-sletting (#1876) og purring (#1889) — og da
// får den samme regelen to inngangsdører: skjemaet i
// `app/[locale]/profile/actions.ts` og ruta appen kaller. AGENTS trap 4 sier at
// en regel har ETT hjem; dette er det hjemmet. Begge inngangene kaller
// {@link parseProfileInput} og gjør ingenting selv utover å oversette feilkoden
// til sin egen kanal (redirect med `?error=` for skjemaet, JSON-kropp for ruta).
//
// (`app/[locale]/complete-profile/actions.ts` har fortsatt sin egen kopi av
// reglene. Den ble bevisst stående utenfor denne slicen og har eget
// oppfølgingsissue — ikke legg til et tredje hjem i mellomtiden.)
//
// **Ren modul med vilje:** ingen Supabase, ingen `server-only`, ingen
// `FormData`. Kallerne gir et vanlig objekt, så regelen kan enhetstestes uten
// rigg — og lar seg kalle fra hvilken som helst transport senere.
//
// **Rekkefølgen på sjekkene er en del av kontrakten**, ikke en tilfeldighet:
// navn → handicap → kjønn → spillerklasse. Et skjema med flere feil skal gi
// samme FØRSTE feilmelding som før utflyttingen, ellers flytter feilbanneret
// seg for brukere som er vant til det. `profileInput.test.ts` låser den.
import { toSignedHcp } from '@/lib/handicap/sign';

/** Nedre grense for LAGRET (signert) hcp — plusshandicap er negativt. */
export const HCP_MIN = -10;
/** Øvre grense for hcp: WHS-taket. */
export const HCP_MAX = 54;
export const GENDERS = ['mens', 'ladies'] as const;
export const LEVELS = ['junior', 'normal', 'senior'] as const;
export type Gender = (typeof GENDERS)[number];
export type Level = (typeof LEVELS)[number];

/**
 * Typede feilkoder — ingen bruker-tekst i regelen. Kallerne oversetter:
 * skjemaet sender koden videre som `?error=<kode>` til det eksisterende
 * banneret, appen slår den opp i sin copy-modul.
 */
export type ProfileInputError =
  | 'name_required'
  | 'hcp_invalid'
  | 'gender_required'
  | 'level_invalid';

export interface ParsedProfile {
  name: string;
  nickname: string | null;
  /** SIGNERT: plusshandicap er negativt (se `lib/handicap/sign.ts`). */
  hcpIndex: number;
  /** Utelatt betyr «la raden beholde verdien sin» (#1064). */
  gender?: Gender;
  level: Level;
}

export type ParseProfileResult =
  | { ok: true; value: ParsedProfile }
  | { ok: false; error: ProfileInputError };

/**
 * Rå input fra en av inngangsdørene.
 *
 * `hcpIndex` tas som streng ELLER tall fordi skjemaet leverer strenger
 * (`FormData`) mens appen sender JSON. `hcpPlus` er et eget flagg fordi
 * UI-et jobber med positiv magnitude + plusshake — spilleren skal slippe å
 * taste fortegn på mobil.
 */
export interface RawProfileInput {
  name?: string | null;
  nickname?: string | null;
  hcpIndex?: string | number | null;
  hcpPlus?: boolean;
  gender?: string | null;
  level?: string | null;
}

export function parseProfileInput(raw: RawProfileInput): ParseProfileResult {
  const name = String(raw.name ?? '').trim();
  if (!name) return { ok: false, error: 'name_required' };

  const nicknameRaw = String(raw.nickname ?? '').trim();
  const nickname = nicknameRaw === '' ? null : nicknameRaw;

  // Komma → punktum: norske tastatur gir «12,4», `parseFloat` vil ha «12.4».
  const hcpRaw = String(raw.hcpIndex ?? '')
    .trim()
    .replace(',', '.');
  const hcpMagnitude = Number.parseFloat(hcpRaw);
  if (!Number.isFinite(hcpMagnitude) || hcpMagnitude < 0 || hcpMagnitude > HCP_MAX) {
    return { ok: false, error: 'hcp_invalid' };
  }
  // To sjekker, ikke én: magnituden må ligge i [0, 54], og den SIGNERTE
  // verdien må ligge i [−10, 54]. Et plusshandicap på 10,1 passerer den
  // første og skal stoppes av den andre.
  const hcpIndex = toSignedHcp(hcpMagnitude, raw.hcpPlus === true);
  if (hcpIndex < HCP_MIN || hcpIndex > HCP_MAX) {
    return { ok: false, error: 'hcp_invalid' };
  }

  // #1064: kjønn samles ikke lenger inn under onboarding, så en tom verdi
  // betyr «la stå» — feltet utelates fra resultatet, og kalleren utelater det
  // fra update-payloaden. Ellers ville en gammel cachet side nullet ut en
  // allerede satt verdi. En SATT, men ugyldig verdi er fortsatt en hard feil.
  const genderRaw = String(raw.gender ?? '').trim();
  let gender: Gender | undefined;
  if (genderRaw !== '') {
    if (!GENDERS.includes(genderRaw as Gender)) {
      return { ok: false, error: 'gender_required' };
    }
    gender = genderRaw as Gender;
  }

  // Utelatt spillerklasse er ikke en feil — «normal» er default. En tom
  // streng er derimot et felt som ble sendt tomt, og det er ugyldig (samme
  // oppførsel som skjemaet alltid har hatt).
  const levelRaw = raw.level == null ? 'normal' : String(raw.level).trim();
  if (!LEVELS.includes(levelRaw as Level)) {
    return { ok: false, error: 'level_invalid' };
  }
  const level = levelRaw as Level;

  return {
    ok: true,
    value: {
      name,
      nickname,
      hcpIndex,
      ...(gender !== undefined ? { gender } : {}),
      level,
    },
  };
}

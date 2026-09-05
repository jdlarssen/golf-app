// native/app/src/data/profile.ts
// Native #1906: spillerens egen profilrad til profil-rommet.
//
// **Anon-klienten leser den selv.** Egen rad er alltid lesbar gjennom
// RLS-policyen `users select own or shared games` (0092), så her trengs ingen
// serverrute og ingen service-role — samme vei `DeleteAccount.tsx` alt går for
// navnet sitt.
//
// **Skrivingen går derimot ALDRI rett på `users`.** Webbens `updateProfile`
// gjør to ting: oppdaterer raden OG kaller `recomputeCourseHandicapForUser`,
// som skriver om de FROSNE banehandicapene i spill som allerede er i gang. Den
// er service-role, og en telefon kan aldri holde den nøkkelen. Skrev appen
// raden selv, ville vi gjentatt Ryder Cup 2026-feilen: en spiller rettet et
// glemt plusshandicap-fortegn, spillene beholdt gammel CH, og han fikk fem slag
// for mye i tre aktive kamper. Regelen blir liggende på serveren og appen spør —
// `PUT /api/profile`, samme mønster som `/api/account/delete` (#1876) og
// `/api/games/[id]/remind` (#1889).
//
// **Mappingen snake_case → camelCase bor i dette laget**, som i resten av
// `src/data/`. Ingen skjerm ser en rå kolonne.
import { supabase } from '../supabase';
import { callWebRoute, type WebApiFailure } from './webApi';
import type { ProfileInputError } from '../../../../lib/users/profileInput';

/**
 * Feltene profil-rommet viser. Alle er nullbare her, også de kolonnene som er
 * NOT NULL i skjemaet i dag (`hcp_index`, `handicap_updated_at`): skjermen
 * tegner hvert felt med den samme «verdi eller ikke satt»-regelen, og da slipper
 * den å vite hvilke kolonner databasen tilfeldigvis har markert som påkrevd.
 *
 * `gender` og `level` ble lest allerede før noe viste dem: redigeringen fyller
 * skjemaet med verdiene som står, og et skjema som starter tomt ville sett ut
 * som «ikke satt» og fått spilleren til å velge på nytt.
 */
export interface OwnProfile {
  name: string | null;
  nickname: string | null;
  hcpIndex: number | null;
  handicapUpdatedAt: string | null;
  gender: string | null;
  level: string | null;
  /**
   * Om denne brukeren er admin (#1934).
   *
   * Rollen står i `users.is_admin`, og appen leser den i stedet for å gjette
   * den ut fra hva brukeren har gjort: regelen bor i basen, og en avledning
   * her ville vært en andre regel ved siden av den (AGENTS trap 4). Feltet er
   * IKKE nullbart som de andre — alt som ikke er `true` leses som «ikke
   * admin», så en manglende kolonne skjuler en admin-knapp i stedet for å
   * love en dør som er låst.
   */
  isAdmin: boolean;
}

interface ProfileRow {
  name: string | null;
  nickname: string | null;
  hcp_index: number | null;
  handicap_updated_at: string | null;
  gender: string | null;
  level: string | null;
  is_admin: boolean | null;
}

const PROFILE_SELECT =
  'name, nickname, hcp_index, handicap_updated_at, gender, level, is_admin';

/**
 * Hent egen profilrad.
 *
 * `single()`, ikke `maybeSingle()`: finnes ikke raden, er det ikke en tom
 * profil — det er noe galt (RLS, feil id, en halvferdig registrering), og
 * PostgREST svarer da med en feil vi kaster videre. Skjermen fanger kastet og
 * viser en feillinje. Et blankt profil-rom ville sett ut som en profil uten
 * innhold, og spilleren ville prøvd å fylle den ut.
 */
export async function fetchOwnProfile(userId: string): Promise<OwnProfile> {
  const { data, error } = await supabase
    .from('users')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .single<ProfileRow>();

  if (error) throw new Error(error.message);

  return {
    name: data.name,
    nickname: data.nickname,
    hcpIndex: data.hcp_index,
    handicapUpdatedAt: data.handicap_updated_at,
    gender: data.gender,
    level: data.level,
    // Fail-closed: bare `true` er admin. `null`, `undefined` og alt annet
    // betyr «ikke admin» — den ærlige teksten er en bedre feil enn en knapp
    // til en side som sender brukeren rett hjem igjen.
    isAdmin: data.is_admin === true,
  };
}

/** Ruta appen lagrer gjennom. Ett verb, ingen id i kroppen. */
const PROFILE_PATH = '/api/profile';

/**
 * Hvorfor lagringen ikke gikk gjennom.
 *
 * De fire første er appens egen tilstand ({@link WebApiFailure}); de fire
 * neste er valideringskodene ruta svarer 400 med, og beholder derfor
 * wire-stavemåten med understrek — de er `parseProfileInput`s egne, og webbens
 * `messages/no.json → profile.errors` har en setning for hver. `update_failed`
 * er catch-all for alt annet. Blandingen av bindestrek og understrek er den
 * samme som i `ReminderFailure` og med vilje: en kode som kom fra nettverket
 * skal se ut som det den kom som.
 *
 * Koden bor her og ikke i `lib/profileCopy.ts` (der `AccountDeleteFailure` bor):
 * her er den ene halvdelen av wire-kontrakten, og copy-modulen importerer den
 * som type. Ingen runtime-avhengighet går den veien.
 */
export type ProfileSaveFailure =
  | WebApiFailure
  // De fire valideringskodene ARVES fra parseren i stedet for å skrives av.
  // `parseProfileInput` er det ene regel-hjemmet (AGENTS trap 4), så den er
  // også stedet en femte kode ville kommet. Uten arven ville ruta svart 400 med
  // en kode appen ikke kjenner, `readValidationError` gitt `undefined`, og
  // spilleren fått «Noe gikk galt» i stedet for setningen som peker på feltet —
  // uten at noen test ble rød. `import type` slettes av Babel, så parseren
  // følger aldri med inn i bundelen.
  | ProfileInputError
  | 'update_failed';

/**
 * Feltene skjemaet sender.
 *
 * Alt er RÅ input, slik spilleren skrev det: serveren kjører
 * `parseProfileInput` og er den autoritative. Appen kan kjøre samme parser for
 * å vise en feil med én gang, men den avgjør ingenting selv (ett regel-hjem,
 * AGENTS trap 4).
 */
export interface ProfileInput {
  name: string;
  /** Tomt kallenavn er `null`, ikke en tom streng — kolonnen er nullbar. */
  nickname: string | null;
  /**
   * Magnitude (aldri negativ) — plusshandicap uttrykkes med {@link hcpPlus}.
   * Streng, ikke tall: feltet er et `decimal-pad`-felt, og «12,4» med norsk
   * komma skal nå parseren uendret. Tallkonverteringen er dens jobb.
   */
  hcpIndex: string;
  hcpPlus: boolean;
  /** `null` betyr «ikke valgt» og lar serveren beholde verdien som står. */
  gender: string | null;
  level: string;
}

export type ProfileSaveResult =
  | { ok: true }
  | { ok: false; reason: ProfileSaveFailure };

/**
 * Valideringskoden fra kroppen, eller `undefined` når den ikke er en vi kjenner.
 *
 * En ukjent kode slippes ALDRI videre: `describeProfileSaveFailure` har en
 * uttømmende switch uten `default`, så en streng utenfra ville gitt `undefined`
 * som setning på skjermen. Kalleren oversetter derfor `undefined` til sin egen
 * «dette gikk ikke»-kode. Samme vakt som `readBlockReason` i `account.ts`.
 */
const VALIDATION_ERRORS: Record<ProfileInputError, true> = {
  name_required: true,
  hcp_invalid: true,
  gender_required: true,
  level_invalid: true,
};

function readValidationError(value: unknown): ProfileInputError | undefined {
  // `Record<ProfileInputError, true>` er porten: får parseren en femte kode og
  // ingen legger den til her, faller `tsc` på den manglende nøkkelen i stedet
  // for at koden stille blir til «Noe gikk galt».
  return typeof value === 'string' && Object.hasOwn(VALIDATION_ERRORS, value)
    ? (value as ProfileInputError)
    : undefined;
}

/**
 * Lagre profilen. Ruta oppdaterer raden og regner om banehandicapene.
 *
 * Kroppen bærer bare feltverdier. **Ingen `userId`** — hvem som lagres er
 * tokenets sak, og ruta ignorerer en id i kroppen selv om noen skulle sende
 * en. Sender vi den aldri, finnes det ingen id å forveksle med en annens.
 *
 * Status → kode oversettes ÉN gang, her, slik at skjermen aldri leser et
 * statusnummer (samme arbeidsdeling som `account.ts` og `remind.ts`). 200 er
 * kvitteringen: recompute-en er best-effort på serversiden, så et 200-svar
 * betyr at RADEN er lagret — det er den lagringen spilleren trykket på.
 *
 * **Skrivingen legges aldri i sync-køen.** Den har ingen lokal-først-vei
 * (regelen kjøres på serveren), så uten nett stopper `callWebRoute` med
 * `offline`, og copyen sier at lagring krever tilkobling.
 */
export async function saveProfile(input: ProfileInput): Promise<ProfileSaveResult> {
  const call = await callWebRoute(PROFILE_PATH, 'PUT', {
    name: input.name,
    nickname: input.nickname,
    hcpIndex: input.hcpIndex,
    hcpPlus: input.hcpPlus,
    gender: input.gender,
    level: input.level,
  });
  if (!call.ok) return call;

  if (call.status === 200) return { ok: true };
  if (call.status === 400) {
    return { ok: false, reason: readValidationError(call.body.error) ?? 'update_failed' };
  }
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  return { ok: false, reason: 'update_failed' };
}

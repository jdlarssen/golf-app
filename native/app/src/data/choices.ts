// Native (#1832): wolf- og BBB-valgene — halve regnestykket for de to formatene.
//
// Slag alene sier ingenting her. Et wolf-hull står «pending» til wolfen har
// valgt partner/lone/blind, og BBB-poeng utledes ikke fra slag i det hele tatt.
// Begge bor i egne per-hull-tabeller, og denne fila er appens eneste vei inn og
// ut av dem.
//
// Fire valg bærer fila:
//
//  1. **Direkte RLS-skriv, ingen server action speilet.** Webbens actions er
//     tynne valideringsskall rundt nøyaktig samme upsert; porten ER Postgres:
//     `wolf_choices_insert/update` krever `wolf_user_id = auth.uid()` (eller
//     admin), og `bbb_holes_write` slipper enhver deltaker til. Appen legger de
//     samme reglene foran for UX-ens skyld — men gaten er RLS.
//  2. **Mappingen bor her.** Webbens `getWolfChoices`/`getBingoBangoBongoHoles`
//     åpner med `import 'server-only'` og kan ikke gjenbrukes; select-listene
//     deres er fasit for de to under, og de delte `build*Context`-hjelperne vil
//     ha camelCase.
//  3. **Fetch KASTER ved feil.** Skillet mellom «fikk ikke hentet valgene» og
//     «ingen har valgt ennå» er hele grunnen til at formatet var gatet: en tom
//     wolf-tabell som ser autoritativ ut viser alle hull som uavgjort. Tom liste
//     er et gyldig mellomresultat, en feilet henting er det ikke — og kalleren
//     må kunne se forskjell. Samme grep som `fetchGameBundle`.
//  4. **Trap 2 er ufravikelig.** PostgREST svarer `error == null` på en upsert
//     som traff 0 rader (#667/#704). Hver skriving kjeder `.select()` og går
//     gjennom `expectAffected`. Stille suksess finnes ikke her.
//
// Valgene holdes IKKE i SQLite og går IKKE i sync-køen: de gjøres stående på
// hullet, med nett. Oppdatering skjer ved refetch (skjerm-fokus, poll, og rett
// etter egen skriving) — valg-tabellene står ikke i `supabase_realtime`, så en
// `postgres_changes`-binding ville levert ingenting.
import {
  expectAffected,
  NoRowsAffectedError,
} from '../../../../lib/supabase/affectedRows';
import type {
  BingoBangoBongoHoleInput,
  WolfChoice,
  WolfHoleChoice,
} from '../../../../lib/scoring/modes/types';
import { currentDeviceUserId, supabase } from '../supabase';

// -----------------------------------------------------------------------------
// Henting
// -----------------------------------------------------------------------------

// Kolonnelistene er webbens, ord for ord (`lib/wolf/getWolfChoices.ts`,
// `lib/bbb/getBingoBangoBongoHoles.ts`). Får de to sidene samme kolonner, gir de
// delte context-byggerne samme tall.
const WOLF_SELECT = 'hole_number, wolf_user_id, choice, partner_user_id';
const BBB_SELECT = 'hole_number, bingo_user_id, bango_user_id, bongo_user_id';

/** Rå PostgREST-fasong. Ingen skjerm ser den — mappingen skjer under. */
interface WolfChoiceRow {
  hole_number: number;
  wolf_user_id: string;
  choice: string;
  partner_user_id: string | null;
}

interface BingoBangoBongoHoleRow {
  hole_number: number;
  bingo_user_id: string | null;
  bango_user_id: string | null;
  bongo_user_id: string | null;
}

/**
 * Alle wolf-valg i spillet, sortert på hull.
 *
 * Leses under vanlig RLS (`wolf_choices_read` slipper deltakere til) og mates
 * rett inn i `buildWolfContext`.
 *
 * @throws {Error} når spørringen feiler. Tom liste betyr «ingen har valgt
 *   ennå» og er et gyldig svar — et kast betyr «vi vet ikke», og kalleren MÅ
 *   si det i stedet for å tegne en tabell der hvert hull står uavgjort.
 */
export async function fetchWolfChoices(gameId: string): Promise<WolfHoleChoice[]> {
  const { data, error } = await supabase
    .from('wolf_hole_choices')
    .select(WOLF_SELECT)
    .eq('game_id', gameId)
    .order('hole_number', { ascending: true })
    .returns<WolfChoiceRow[]>();

  if (error) throw new Error(`fetchWolfChoices: ${error.message}`);

  return (data ?? []).map((row) => ({
    holeNumber: row.hole_number,
    wolfUserId: row.wolf_user_id,
    // CHECK-en på tabellen holder kolonnen innenfor unionen; samme cast som web.
    choice: row.choice as WolfChoice,
    partnerUserId: row.partner_user_id,
  }));
}

/**
 * Alle BBB-hullrader i spillet, sortert på hull.
 *
 * Samme kontrakt som `fetchWolfChoices`: tom liste er et svar, en feil er et
 * kast.
 *
 * @throws {Error} når spørringen feiler.
 */
export async function fetchBingoBangoBongoHoles(
  gameId: string,
): Promise<BingoBangoBongoHoleInput[]> {
  const { data, error } = await supabase
    .from('bingo_bango_bongo_holes')
    .select(BBB_SELECT)
    .eq('game_id', gameId)
    .order('hole_number', { ascending: true })
    .returns<BingoBangoBongoHoleRow[]>();

  if (error) throw new Error(`fetchBingoBangoBongoHoles: ${error.message}`);

  return (data ?? []).map((row) => ({
    holeNumber: row.hole_number,
    bingoUserId: row.bingo_user_id,
    bangoUserId: row.bango_user_id,
    bongoUserId: row.bongo_user_id,
  }));
}

// -----------------------------------------------------------------------------
// Validering — rene funksjoner, speiler webbens actions
// -----------------------------------------------------------------------------

/**
 * Hvorfor en skriving ikke gikk gjennom. Engelske identifikatorer, som webbens
 * actions — skjermene oversetter til norsk copy.
 *
 *  - `not_authenticated` — ingen sesjon på enheten.
 *  - `no_rows`           — upserten traff 0 rader (trap 2). Skrivingen SKJEDDE
 *                          ikke, uansett hva fraværet av `error` antyder.
 *  - `rls_denied`        — Postgres nektet (42501). Du har ikke lov til dette.
 *  - `db_error`          — alt annet: nettbrudd, constraint, serverfeil. Egen
 *                          kode fordi svaret er «prøv igjen», ikke «du har ikke
 *                          lov» (samme skille som #1445 ga BBB-actionen).
 */
export type ChoiceWriteFailure =
  | 'not_authenticated'
  | 'no_rows'
  | 'rls_denied'
  | 'db_error';

/** Valideringsfeil for et wolf-valg. Speiler `lib/wolf/setWolfChoice.ts:50-68`. */
export type WolfChoiceValidationError =
  | 'invalid_hole'
  | 'invalid_choice'
  | 'partner_required'
  | 'partner_must_be_null'
  | 'partner_cannot_be_wolf';

/** Valideringsfeil for en BBB-rad. Speiler `lib/bbb/setBingoBangoBongoHole.ts:53-89`. */
export type BingoBangoBongoValidationError = 'invalid_hole' | 'game_finished';

/**
 * Feil bare BBB-skrivingen kan gi, fordi bare den slår opp spillet på nytt før
 * upserten. Wolf har ingen tilsvarende — webben har bevisst ingen status-lås
 * der, og paritet er poenget.
 */
export type BingoBangoBongoWriteError = 'game_not_found';

export type ChoiceWriteResult<E> = { ok: true } | { ok: false; error: E };

export type SetWolfChoiceResult = ChoiceWriteResult<
  WolfChoiceValidationError | ChoiceWriteFailure
>;

export type SetBingoBangoBongoHoleResult = ChoiceWriteResult<
  BingoBangoBongoValidationError | BingoBangoBongoWriteError | ChoiceWriteFailure
>;

export interface WolfChoiceWrite {
  gameId: string;
  holeNumber: number;
  wolfUserId: string;
  choice: WolfChoice;
  partnerUserId: string | null;
}

export interface BingoBangoBongoHoleWrite {
  gameId: string;
  holeNumber: number;
  bingoUserId: string | null;
  bangoUserId: string | null;
  bongoUserId: string | null;
}

const VALID_CHOICES: readonly string[] = ['partner', 'lone', 'blind'];

/** Sant for et heltall i 1..18. Begge skrivingene gater på det, som webben. */
function isPlayableHole(holeNumber: number): boolean {
  return Number.isInteger(holeNumber) && holeNumber >= 1 && holeNumber <= 18;
}

/**
 * Forretningsreglene for et wolf-valg, i webbens rekkefølge:
 *
 *  - hull 1..18 (heltall)
 *  - choice ∈ {partner, lone, blind}
 *  - 'partner' krever en partner; 'lone'/'blind' krever at den er null
 *  - wolfen kan ikke velge seg selv
 *
 * Ingen finished-lås: webben har bevisst ingen på wolf-valg, og paritet er
 * poenget her — ikke ny policy.
 *
 * Ren funksjon med vilje: reglene er det som lett driver fra hverandre mellom
 * app og web, så de skal kunne låses i jest uten å mocke et eneste kall.
 *
 * @returns feilkoden, eller `null` når valget er gyldig.
 */
export function validateWolfChoice(
  input: WolfChoiceWrite,
): WolfChoiceValidationError | null {
  const { holeNumber, wolfUserId, choice, partnerUserId } = input;

  if (!isPlayableHole(holeNumber)) return 'invalid_hole';
  if (!VALID_CHOICES.includes(choice)) return 'invalid_choice';
  if (choice === 'partner' && !partnerUserId) return 'partner_required';
  if (choice !== 'partner' && partnerUserId !== null) return 'partner_must_be_null';
  if (partnerUserId && partnerUserId === wolfUserId) return 'partner_cannot_be_wolf';

  return null;
}

/**
 * Forretningsreglene for en BBB-rad: hull 1..18, og INGEN skriving i et ferdig
 * spill.
 *
 * Finished-låsen er den viktige raden. RLS håndhever den ikke — `bbb_holes_write`
 * spør bare om du er med i spillet — så uten sjekken her ville appen skrevet
 * prestasjoner inn i et avsluttet spill mens webben nektet det samme trykket.
 *
 * `gameStatus` er kallerens bundle-status, og den er et RASKT NEI, ikke fasiten:
 * bundelen kan være minutter gammel. Den autoritative sjekken er det ferske
 * oppslaget i `setBingoBangoBongoHole` — se der.
 *
 * @returns feilkoden, eller `null` når raden kan skrives.
 */
export function validateBingoBangoBongoHole(
  input: BingoBangoBongoHoleWrite,
  gameStatus: string,
): BingoBangoBongoValidationError | null {
  if (!isPlayableHole(input.holeNumber)) return 'invalid_hole';
  if (gameStatus === 'finished') return 'game_finished';

  return null;
}

// -----------------------------------------------------------------------------
// Skriving
// -----------------------------------------------------------------------------

/** PostgRESTs kode for «insufficient_privilege» — RLS avviste raden. */
const RLS_DENIED_CODE = '42501';

/**
 * Les svaret på en upsert og gi den ene sannheten tilbake: gikk raden inn?
 *
 * Tre utfall må skilles, og hvert av dem har sin egen norske copy i skjermene:
 * nektet (RLS), noe gikk galt (prøv igjen), og — den lumske — «ingen feil, men
 * heller ingen rad». `expectAffected` er husets vakt mot den siste.
 *
 * @returns feilkoden, eller `null` når minst én rad kom tilbake.
 */
function readUpsertResult(
  result: { data: unknown[] | null; error: { message: string; code?: string } | null },
  context: string,
): ChoiceWriteFailure | null {
  if (result.error) {
    return result.error.code === RLS_DENIED_CODE ? 'rls_denied' : 'db_error';
  }

  try {
    // Feilgrenen er alt tatt over, så bare 0-rads-kastet kan fyre her.
    expectAffected({ data: result.data, error: null }, context);
    return null;
  } catch (err: unknown) {
    if (err instanceof NoRowsAffectedError) return 'no_rows';
    return 'db_error';
  }
}

/**
 * Lagre wolfens valg for ett hull.
 *
 * Upsert på `(game_id, hole_number)` — tabellens primærnøkkel — så wolfen kan
 * ombestemme seg så lenge hullet står åpent. `entered_by` er den som taster
 * (audit-sporet); `wolf_user_id` er den valget gjelder, og RLS krever at de er
 * samme person med mindre du er admin.
 */
export async function setWolfChoice(
  input: WolfChoiceWrite,
): Promise<SetWolfChoiceResult> {
  const invalid = validateWolfChoice(input);
  if (invalid) return { ok: false, error: invalid };

  const userId = await currentDeviceUserId();
  if (!userId) return { ok: false, error: 'not_authenticated' };

  const failure = readUpsertResult(
    await supabase
      .from('wolf_hole_choices')
      .upsert(
        {
          game_id: input.gameId,
          hole_number: input.holeNumber,
          wolf_user_id: input.wolfUserId,
          choice: input.choice,
          partner_user_id: input.partnerUserId,
          entered_by: userId,
        },
        { onConflict: 'game_id,hole_number' },
      )
      // Uten `.select()` finnes det ikke noe radantall å sjekke (trap 2).
      .select('hole_number'),
    'setWolfChoice',
  );

  return failure ? { ok: false, error: failure } : { ok: true };
}

/**
 * Slå opp spillets status FERSKT, rett før skrivingen.
 *
 * Bundle-statusen kalleren sitter på kan være minutter gammel. Står spilleren
 * på hull-skjermen i det runden avsluttes, sier bundelen fortsatt «active», og
 * uten dette oppslaget ville tappet landet i databasen: `bbb_holes_write` spør
 * bare om du er med i spillet, ikke om spillet lever. Webben leser statusen på
 * nytt ved hvert skriv av nøyaktig samme grunn.
 *
 * Feil ≠ fravær (#1445): bare et ekte 0-rads-svar betyr at spillet er borte. En
 * spørring som falt på nettet får sin egen kode, så meldingen midt i runden
 * blir «prøv igjen» og ikke «spillet finnes ikke».
 *
 * @returns feilkoden, eller `null` når spillet finnes og fortsatt tar imot.
 */
async function refuseUnlessGameLives(
  gameId: string,
): Promise<'db_error' | 'game_not_found' | 'game_finished' | null> {
  const { data, error } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .maybeSingle<{ status: string }>();

  if (error) return 'db_error';
  if (!data) return 'game_not_found';
  if (data.status === 'finished') return 'game_finished';

  return null;
}

/**
 * Lagre bingo/bango/bongo for ett hull.
 *
 * Delt registrering: alle deltakere kan sette og endre raden, og alle tre
 * feltene er nullable — et hull der ingen nådde greena først har ingen bingo.
 * `null` settes eksplisitt, slik at en retting faktisk fjerner forrige mottaker
 * i stedet for å la den stå.
 *
 * To lag rundt finished-låsen: bundle-statusen svarer med én gang når kalleren
 * allerede vet at runden er over, og det ferske oppslaget fanger runden som ble
 * avsluttet mens spilleren sto på hullet.
 */
export async function setBingoBangoBongoHole(
  input: BingoBangoBongoHoleWrite,
  gameStatus: string,
): Promise<SetBingoBangoBongoHoleResult> {
  const invalid = validateBingoBangoBongoHole(input, gameStatus);
  if (invalid) return { ok: false, error: invalid };

  const userId = await currentDeviceUserId();
  if (!userId) return { ok: false, error: 'not_authenticated' };

  const stale = await refuseUnlessGameLives(input.gameId);
  if (stale) return { ok: false, error: stale };

  const failure = readUpsertResult(
    await supabase
      .from('bingo_bango_bongo_holes')
      .upsert(
        {
          game_id: input.gameId,
          hole_number: input.holeNumber,
          bingo_user_id: input.bingoUserId,
          bango_user_id: input.bangoUserId,
          bongo_user_id: input.bongoUserId,
          entered_by: userId,
        },
        { onConflict: 'game_id,hole_number' },
      )
      .select('hole_number'),
    'setBingoBangoBongoHole',
  );

  return failure ? { ok: false, error: failure } : { ok: true };
}

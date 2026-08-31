// native/app/src/data/createGame.ts
// Native N6a (#1854): lesningene veiviseren trenger, og selve publiseringen.
//
// Ingen server action speiles. På DB-nivå ER opprettelsen to inserts, og
// autorisasjonen ligger i Postgres: `games creator insert` krever
// `created_by = auth.uid()` (0071, omskrevet 0092), `game_players creator
// insert` slipper arrangøren til, og `guard_game_players_invite_eligibility`
// (0115) håndhever hvem som kan legges til. Appen har ingen service-role og
// skal ikke få en.
//
// Fire ting bærer fila:
//
//  1. **Reglene er delt kode.** `buildGameInsertPayload` bygger `mode_config`
//     og eier alle valideringskodene; `isTeeOffInPast`,
//     `parseSideTournamentFromFormData`, `parsePrizesFromFormData` og
//     `acceptedAtForActor` er de samme funksjonene webben kaller. Det eneste
//     som er speilet her er REKKEFØLGEN og kolonnesettet.
//  2. **Trap 2 er ufravikelig.** PostgREST svarer `error == null` på en INSERT
//     som traff 0 rader. Begge skrivingene kjeder `.select('id')` og går
//     gjennom `expectAffected`. Stille suksess finnes ikke her.
//  3. **Kompenserende sletting (#737).** Feiler spiller-inserten, slettes den
//     nyopprettede games-raden — ellers står det igjen en tom, ødelagt runde i
//     arrangørens lister. Feiler SLETTINGEN også, sies det høyt
//     (`orphan_game`), aldri stille.
//  4. **Feil ≠ fravær.** «Formatet finnes ikke» og «vi fikk ikke sjekket
//     formatet» får hver sin kode. Webbens `isValidActiveGameMode` slår dem
//     sammen til `false`; midt i en opprettelse er det forskjell på «velg noe
//     annet» og «prøv igjen».
//
// Skriving krever nett — opprettelsen går aldri i sync-køen (samme v1-valg som
// valg-skrivene i #1832). Skjermen gater på nett før den kaller hit.
import { acceptedAtForActor } from '../../../../lib/games/participantAcceptance';
import {
  isTeeOffInPast,
  parsePrizesFromFormData,
  type GameValidationErrorCode,
} from '../../../../lib/games/gamePayload';
import { parseSideTournamentFromFormData } from '../../../../lib/games/sideTournamentPayload';
import { isMatchplayFamily } from '../../../../lib/scoring/modes/types';
import {
  expectAffected,
  NoRowsAffectedError,
} from '../../../../lib/supabase/affectedRows';
import { isAppSupportedMode } from '../lib/appFormats';
import { asSharedFormData } from '../lib/wizardFormData';
import { buildDraftPayload, type GameDraft, type TeeGenderUi } from '../lib/wizardPayload';
import { currentDeviceUserId, supabase } from '../supabase';

// -----------------------------------------------------------------------------
// Lesninger — kandidater, baner og teer
// -----------------------------------------------------------------------------

/** En spiller arrangøren kan legge til i runden. */
export interface RosterCandidate {
  id: string;
  name: string;
  nickname: string | null;
  hcpIndex: number;
  /**
   * Rå `users.gender` — DB-enumen `'mens' | 'ladies'` (0036), eller null.
   *
   * ⚠️ IKKE veiviserens `'M' | 'D' | 'J'`-alfabet. Oversettelsen skjer i
   * `teeGenderFor` (`screens/CreateGame.tsx`), som sammenligner mot `'ladies'`.
   * Sammenlign aldri dette feltet mot `'D'` — det er alltid usant, og hver
   * kvinne ville stille fått herretee og dermed feil banehandicap.
   */
  gender: string | null;
  /** Profilen er ikke fullført. Blokkerer publisering (delt RPC-gate). */
  pending: boolean;
}

interface UserRow {
  id: string;
  name: string;
  nickname: string | null;
  hcp_index: number | string;
  gender: string | null;
  profile_completed_at: string | null;
  is_guest: boolean | null;
}

/**
 * Spillerne arrangøren kan velge blant.
 *
 * **Under RLS er dette medspillere, ikke venner.** `users`-SELECT-policyen
 * (0092:179-186) gir egen rad ∨ admin ∨ delt spill. Webbens kandidat-univers
 * (venner ∪ medspillere ∪ klubbmedlemmer, `lib/games/inviteEligibility.ts`) er
 * `server-only` + service-role og kan ikke gjenbrukes; en venn du aldri har
 * spilt med er rett og slett ikke navnlesbar herfra. Begrensningen er bokført
 * i kontrakten som en Could-oppfølger (egen SECURITY DEFINER-RPC).
 *
 * Håndhevelsen er uansett i DB: `guard_game_players_invite_eligibility` (0115)
 * speiler webbens union, og appens subsett er en delmengde av den — hvert valg
 * her lykkes.
 *
 * To filtre speiles fra webben:
 *  - `deleted_at IS NULL` (#1012) — anonymiserte kontoer er ikke valgbare.
 *  - gjester utelates. En gjesterad MÅ inn via service-role (0115-triggeren
 *    blokkerer en ikke-admin arrangørs klient-insert), så appen kan ikke lage
 *    dem. Å tilby en spiller hvis insert er dømt til å feile er uærlig — vi
 *    skjuler dem heller, og gjeste-flyten forblir web-eid.
 *
 * @throws {Error} når spørringen feiler. Tom liste er et gyldig svar (en ny
 *   bruker uten medspillere) og betyr «du kan opprette en runde med bare deg
 *   selv» — ikke det samme som en feilet henting.
 */
export async function fetchRosterCandidates(): Promise<RosterCandidate[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, nickname, hcp_index, gender, profile_completed_at, is_guest')
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .returns<UserRow[]>();

  if (error) throw new Error(`fetchRosterCandidates: ${error.message}`);

  return (data ?? [])
    // JS-filter og ikke `.eq('is_guest', false)`: et NULL ville falt ut av et
    // eq-filter, og en rad uten flagg er ikke en gjest.
    .filter((row) => row.is_guest !== true)
    .map((row) => ({
      id: row.id,
      name: row.name,
      nickname: row.nickname,
      hcpIndex: Number(row.hcp_index),
      gender: row.gender,
      pending: row.profile_completed_at === null,
    }));
}

/** En tee-boks med hvilke tee-kjønn den faktisk har rating for. */
export interface TeeOption {
  id: string;
  name: string;
  hasMens: boolean;
  hasLadies: boolean;
  hasJuniors: boolean;
}

export interface CourseOption {
  id: string;
  name: string;
  tees: TeeOption[];
}

interface TeeBoxRow {
  id: string;
  name: string;
  archived_at: string | null;
  slope_mens: number | null;
  course_rating_mens: number | null;
  par_total_mens: number | null;
  slope_ladies: number | null;
  course_rating_ladies: number | null;
  par_total_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | null;
  par_total_juniors: number | null;
}

interface CourseRow {
  id: string;
  name: string;
  tee_boxes: TeeBoxRow[] | null;
}

const COURSE_SELECT =
  'id, name, tee_boxes(id, name, archived_at, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)';

/**
 * Alle baner med teene sine, sortert på navn.
 *
 * `courses` og `tee_boxes` er åpne lesinger (`using (true)`, 0002:53-61).
 *
 * To ting speiles fra webbens `getNewGameFormData`:
 *  - **arkiv-filteret gjøres i JS.** `courses` har ingen arkiv-kolonne; kun
 *    `tee_boxes.archived_at` finnes, og webben filtrerer den etter hentingen
 *    (`newGameFormData.ts:104`) fordi filteret må gjelde den nøstede raden,
 *    ikke banen.
 *  - **tee-kjønn utledes.** En kategori er tilgjengelig først når slope,
 *    course rating OG par alle er satt — mangler ett av dem, kan ikke
 *    banehandicapet regnes ut for den spilleren.
 *
 * @throws {Error} når spørringen feiler.
 */
export async function fetchCourses(): Promise<CourseOption[]> {
  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_SELECT)
    .order('name', { ascending: true })
    .returns<CourseRow[]>();

  if (error) throw new Error(`fetchCourses: ${error.message}`);

  return (data ?? []).map((course) => ({
    id: course.id,
    name: course.name,
    tees: (course.tee_boxes ?? [])
      .filter((tee) => tee.archived_at === null)
      .map((tee) => ({
        id: tee.id,
        name: tee.name,
        hasMens:
          tee.slope_mens !== null &&
          tee.course_rating_mens !== null &&
          tee.par_total_mens !== null,
        hasLadies:
          tee.slope_ladies !== null &&
          tee.course_rating_ladies !== null &&
          tee.par_total_ladies !== null,
        hasJuniors:
          tee.slope_juniors !== null &&
          tee.course_rating_juniors !== null &&
          tee.par_total_juniors !== null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'no')),
  }));
}

// -----------------------------------------------------------------------------
// Publisering
// -----------------------------------------------------------------------------

/**
 * Hvorfor en opprettelse ikke gikk gjennom.
 *
 * Halve unionen er webbens egne valideringskoder fra den delte byggeren — de
 * kommer gratis og skal ikke speiles. Resten er kodene selve skrivingen kan gi.
 *
 * Skillet som betyr noe på parkeringsplassen: `rls_denied` og
 * `unsupported_mode` er ENDELIGE («det får du ikke lov til / velg noe annet»),
 * mens `db_game`, `db_players` og `db_format` er «prøv igjen når nettet er
 * tilbake». `orphan_game` er sin egen kategori — spillet KAN finnes i DB.
 */
export type CreateGameFailure =
  | GameValidationErrorCode
  | 'not_authenticated'
  /** Formatet finnes, men appen har ingen skjermer for det. */
  | 'unsupported_mode'
  /** Formatet finnes ikke i `formats`, eller er slått av av admin. */
  | 'invalid_game_mode'
  /** Vi fikk ikke SJEKKET formatet. Ikke det samme som at det er ugyldig. */
  | 'db_format'
  | 'tee_off_required'
  | 'tee_off_in_past'
  | 'bad_side_ld_count'
  | 'bad_side_ctp_count'
  | 'db_roster'
  | 'pending_players'
  | 'rls_denied'
  | 'no_rows'
  | 'db_game'
  | 'db_players'
  /** Spiller-inserten feilet OG kompensasjonen feilet. Raden kan stå igjen. */
  | 'orphan_game';

export type CreateGameResult =
  | { ok: true; gameId: string }
  | { ok: false; error: CreateGameFailure };

const failed = (error: CreateGameFailure): CreateGameResult => ({
  ok: false,
  error,
});

/** PostgRESTs kode for «insufficient_privilege» — RLS avviste raden. */
const RLS_DENIED_CODE = '42501';

/** Webbens `uiGenderToDb` (actions.ts:26): UI-bokstav → DB-enum. */
function teeGenderToDb(ui: TeeGenderUi | string): 'mens' | 'ladies' | 'juniors' {
  return ui === 'D' ? 'ladies' : ui === 'J' ? 'juniors' : 'mens';
}

/**
 * Les svaret på en skriving og gi den ene sannheten tilbake: traff den rader?
 *
 * Tre utfall må skilles, og hvert av dem har sin egen norske setning:
 * nektet (RLS), noe gikk galt (prøv igjen), og — den lumske — «ingen feil, men
 * heller ingen rad». `expectAffected` er husets vakt mot den siste.
 */
function readWriteResult<T>(
  result: { data: T[] | null; error: { message: string; code?: string } | null },
  context: string,
): { ok: true; rows: T[] } | { ok: false; error: 'rls_denied' | 'no_rows' | 'db_error' } {
  if (result.error) {
    return {
      ok: false,
      error: result.error.code === RLS_DENIED_CODE ? 'rls_denied' : 'db_error',
    };
  }
  try {
    // Feilgrenen er alt tatt over, så bare 0-rads-kastet kan fyre her.
    return { ok: true, rows: expectAffected({ data: result.data, error: null }, context) };
  } catch (err: unknown) {
    if (err instanceof NoRowsAffectedError) return { ok: false, error: 'no_rows' };
    return { ok: false, error: 'db_error' };
  }
}

/**
 * Slå opp at formatet finnes og er aktivt, rett før skrivingen.
 *
 * Webbens `isValidActiveGameMode` erstatter den droppede
 * `games_mode_check`-CHECK-en fra 0047. Den leser med service-role; appen leser
 * samme tabell under RLS (SELECT-policyen slipper innloggede til) og deler
 * feilgrenen fra fraværs-grenen — se `db_format`.
 *
 * @returns feilkoden, eller `null` når formatet er gyldig.
 */
async function refuseUnlessModeIsActive(
  slug: string,
): Promise<'invalid_game_mode' | 'db_format' | null> {
  const { data, error } = await supabase
    .from('formats')
    .select('slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle<{ slug: string }>();

  if (error) return 'db_format';
  return data ? null : 'invalid_game_mode';
}

/**
 * Opprett og publiser runden.
 *
 * Rekkefølgen er webbens `createGameInternal`, steg for steg:
 *
 *  1. innlogget?
 *  2. delt payload-bygging (`buildGameInsertPayload` med `'publish'`)
 *  3. formatet er støttet i appen, og aktivt i DB
 *  4. tee-off finnes, er lesbar og ikke i fortiden
 *  5. sideturneringens tellere er 0–2
 *  6. ingen på lista mangler profil (`incomplete_profiles_for_ids`)
 *  7. INSERT `games` (status `'scheduled'`, `created_by` = deg)
 *  8. INSERT `game_players`
 *  9. feiler 8 → slett games-raden igjen
 *
 * Knappen låses av skjermen mens dette står på; funksjonen er ikke idempotent
 * og et dobbelttrykk ville laget to runder.
 */
export async function publishGame(draft: GameDraft): Promise<CreateGameResult> {
  const userId = await currentDeviceUserId();
  if (!userId) return failed('not_authenticated');

  // Appens egen gate står FØRST, foran den delte byggeren. Et format appen ikke
  // har skjermer for, skal svare «dette opprettes på nettsiden ennå» — ikke
  // `bad_team` fordi validatoren for et format vi uansett ikke kan spille,
  // savnet en lagtildeling veiviseren aldri viste.
  if (!isAppSupportedMode(draft.gameMode)) return failed('unsupported_mode');

  const { form, payload } = buildDraftPayload(draft);
  if (payload.errorCode) return failed(payload.errorCode);

  const modeProblem = await refuseUnlessModeIsActive(payload.game_mode);
  if (modeProblem) return failed(modeProblem);

  // Tee-off er alt et absolutt tidspunkt (`teeOffInstant` på pickerens Date).
  // Appen kaller MED VILJE ikke webbens `parseOsloDateTimeLocal`: den avgjør
  // sommer-/vintertid ved å streng-sammenligne `Intl`-utdata mot `'GMT+2'`, og
  // den sammenligningen holder ikke under Hermes. Resultatet var en tee-off
  // lagret én time feil — se `teeOffInstant` for hele historien.
  const rawTeeOff = (form.get('scheduled_tee_off_at') ?? '').trim();
  if (!rawTeeOff) return failed('tee_off_required');
  const scheduledTeeOffAt = rawTeeOff;
  if (Number.isNaN(new Date(scheduledTeeOffAt).getTime())) {
    // Appen bygger strengen selv, så en ulesbar verdi er en programfeil hos
    // oss — den skal likevel ende i en melding og ikke i en krasj.
    return failed('tee_off_required');
  }
  // #902: en tee-off i fortiden får E1-auto-starten til å fyre med én gang og
  // nedtellingen til å gå negativ. 5 minutters slingringsmonn ligger i den
  // delte helperen, så «opprett runden idet den starter» går fint.
  if (isTeeOffInPast(scheduledTeeOffAt)) return failed('tee_off_in_past');

  const sideResult = parseSideTournamentFromFormData(asSharedFormData(form));
  if (!sideResult.ok) return failed(sideResult.errorCode);
  const side = sideResult.payload;

  // Premiebordet er utenfor v1 (kontingent er Won't). Den delte parseren kalles
  // likevel: uten premie-felter gir den `[]`, og skulle veiviseren en dag få
  // dem, persisteres de riktig uten at denne fila må røres.
  const prizes = parsePrizesFromFormData(asSharedFormData(form), {
    hasPodium: !isMatchplayFamily(payload.game_mode),
    ldCount: side.ldCount,
    ctpCount: side.ctpCount,
  });

  // Uferdige profiler blokkerer publisering. Et direkte SELECT ville stille
  // returnert ingenting for en ikke-admin arrangør (#366 pending-read-fella);
  // SECURITY DEFINER-RPC-en (0071) svarer for de eksakte id-ene vi sender.
  // Personvern (#435): vi leser bare ANTALLET, aldri e-postene den returnerer.
  const { data: incomplete, error: rosterError } = await supabase.rpc(
    'incomplete_profiles_for_ids',
    { p_user_ids: payload.players.map((p) => p.user_id) },
  );
  if (rosterError) return failed('db_roster');
  if ((incomplete ?? []).length > 0) return failed('pending_players');

  const insertedGame = readWriteResult<{ id: string }>(
    await supabase
      .from('games')
      .insert({
        name: payload.name,
        course_id: payload.course_id,
        tee_box_id: payload.tee_box_id,
        hcp_allowance_pct: payload.hcp_allowance_pct,
        require_peer_approval: payload.require_peer_approval,
        score_visibility: payload.score_visibility,
        game_mode: payload.game_mode,
        mode_config: payload.mode_config,
        registration_mode: payload.registration_mode,
        registration_type: payload.registration_type,
        let_friends_skip_gate: payload.let_friends_skip_gate,
        entry_fee_kr: payload.entry_fee_kr,
        payment_link: payload.payment_link,
        prizes,
        side_tournament_enabled: side.enabled,
        side_ld_count: side.ldCount,
        side_ctp_count: side.ctpCount,
        side_disabled_categories: side.disabledCategories,
        // Publisering setter 'scheduled', ikke 'active'. Runden startes for seg
        // («Start runden nå»), og banehandicapene fryses først da — derfor
        // `course_handicap: null` på spiller-radene under.
        status: 'scheduled',
        scheduled_tee_off_at: scheduledTeeOffAt,
        created_by: userId,
        started_at: null,
        // Klubb- og cup-kobling er web-eid (Should i MoSCoW-porten). Satt
        // eksplisitt så kolonnesettet er identisk med webbens insert.
        group_id: null,
        tournament_id: null,
        tournament_match_label: null,
      })
      // Uten `.select()` finnes det ikke noe radantall å sjekke (trap 2).
      .select('id'),
    'publishGame(games)',
  );
  if (!insertedGame.ok) {
    return failed(
      insertedGame.error === 'db_error' ? 'db_game' : insertedGame.error,
    );
  }
  const gameId = insertedGame.rows[0]!.id;

  const rowAcceptedAt = new Date().toISOString();
  const playerRows = payload.players.map((p) => ({
    game_id: gameId,
    user_id: p.user_id,
    team_number: p.team_number,
    flight_number: p.flight_number,
    tee_gender: teeGenderToDb(form.get(`player_${p.user_id}_gender`) ?? 'M'),
    // Fryses ved start, ikke ved opprettelse.
    course_handicap: null,
    // #463: din egen rad er bekreftet med én gang; de andre står «Ikke
    // bekreftet» til de selv sier ja. Regelen bor i delt kode.
    accepted_at: acceptedAtForActor(userId, p.user_id, rowAcceptedAt),
  }));

  const insertedPlayers = readWriteResult(
    await supabase.from('game_players').insert(playerRows).select('user_id'),
    'publishGame(game_players)',
  );
  if (!insertedPlayers.ok) {
    // #737: rull tilbake games-raden. Uten dette står det igjen en runde uten
    // spillere som ingen kan rydde. Arrangøren har DELETE-RLS på egne spill
    // (0071), og `game_players` cascade-ryddes av FK-en (0001).
    const compensated = readWriteResult(
      await supabase.from('games').delete().eq('id', gameId).select('id'),
      'publishGame(compensate)',
    );
    // Feiler kompensasjonen, MÅ det sies. En stille «noe gikk galt» ville
    // etterlatt arrangøren med en tom runde hen ikke vet finnes.
    if (!compensated.ok) return failed('orphan_game');
    return failed(
      insertedPlayers.error === 'db_error' ? 'db_players' : insertedPlayers.error,
    );
  }

  return { ok: true, gameId };
}

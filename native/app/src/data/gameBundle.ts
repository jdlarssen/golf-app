// Native N3 (#1825): all metadata en spillerskjerm trenger om ETT spill, hentet
// i én bølge og lagret som JSON i `cache_entries`.
//
// Mønsteret er stale-while-revalidate: skjermene tegner cachen med én gang og
// ber om en refetch i bakgrunnen. Det er derfor hull-føring virker i flymodus
// midt i runden — bundelen ligger alt på enheten, og resten av føringen går mot
// den lokale basen uansett.
//
// Hvorfor JSON og ikke normaliserte tabeller: skjermene trenger hele bundelen
// samlet, og normalisering er støy helt til noe faktisk spør om delene hver for
// seg. Ingen scores her — de eier `scores`-tabellen og LWW-regelen.
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import { supabase } from '../supabase';
import { getCacheEntry, getDb, putCacheEntry } from './db';

/**
 * Nyttelast-versjonen som ligger lagret sammen med bundelen.
 *
 * Hver gang `BundleGame`/`BundlePlayer`/`BundleHole` får et NYTT felt som
 * koden narrower på, bumpes dette tallet. En cache-oppføring fra før bumpen
 * leses som «ingen cache» (se `loadGameBundle`) og hentes på nytt — i stedet
 * for å levere `undefined` inn i en `revealState(...)` eller en gate som tror
 * feltet alltid finnes. Alternativet, å lese gammel payload og fylle inn
 * defaults, er verre: da ville et manglende `score_visibility` stille blitt
 * til «live» og kunne lekket netto i et reveal-spill.
 *
 * v2 (N4, #1828): la til `scoreVisibility`, `tournamentId` og de to
 * foursomes-tee-starter-feltene.
 * v3 (#1850): la til `sideTournamentEnabled`, de to slot-tellerne og
 * `sideDisabledCategories`. En v2-oppføring mangler dem, og et `undefined`
 * inn i sideturnerings-gaten ville skrudd seksjonen av på et spill som
 * faktisk har LD/CTP — den leses derfor som «ingen cache».
 * v4 (N6b, #1855): la til `acceptedAt` på spiller-radene. En v3-oppføring
 * mangler feltet, og `undefined` er falsy — hele rosteret ville stått som
 * «Ikke bekreftet» i arrangør-visningen, også spillere som har sagt ja.
 * v5 (#2200): la til `isGuest` og `submittedByUserId` på spiller-radene. En
 * v4-oppføring mangler dem: en gjest ville stått som vanlig spiller, og
 * scorekortet ville ikke tilbudt å levere kortet hens.
 * v6 (#2262): la til `approvedByUserId` på spiller-radene, og tar med
 * `withdrawnByUserId` (#2358), som kom uten egen versjon. En v5-oppføring
 * mangler begge: stempelet på scorekortet ville sagt «Godkjent» i stedet for
 * «Markør: Anders har godkjent», og trukket-banneret ville ikke visst hvem som
 * trakk spilleren.
 * v7 (#2255): la til `teeRatings`, `hcpAllowancePct` og `resultSummary` for
 * startbilletten. En v6-oppføring mangler dem: billetten ville stått uten
 * faktalinje, uten «85 % handicap» og uten plassen i en avsluttet runde.
 * v8 (#2255, design): la til `spectateToken`. En v7-oppføring mangler det, og
 * Del-knappen på billetten ville stått skjult selv om arrangøren har slått på
 * live-følging.
 */
export const BUNDLE_PAYLOAD_VERSION = 8;

/** Spillet selv. Feltene er nøyaktig de skjermene gater og viser på. */
export interface BundleGame {
  id: string;
  name: string;
  status: string;
  gameMode: string;
  modeConfig: unknown;
  courseId: string | null;
  teeBoxId: string | null;
  requirePeerApproval: boolean;
  scheduledTeeOffAt: string | null;
  holeSegment: string;
  sourceGameId: string | null;
  createdBy: string | null;
  /**
   * `'live'` eller `'reveal'`. Kolonnen er NOT NULL med default `'live'`, så
   * den er alltid satt — men typen holdes bred (`string`) her og smalnes ved
   * bruk, som `status` og `gameMode`.
   */
  scoreVisibility: string;
  /** Satt når spillet hører til en cup/turnering. N5 eier etikettene. */
  tournamentId: string | null;
  /**
   * Hvem som slår ut på odde hull for hver side i foursomes. Valget gjøres på
   * nettsiden; appen viser det bare.
   */
  foursomesSide1TeeStarterUserId: string | null;
  foursomesSide2TeeStarterUserId: string | null;
  /** Slår sideturneringen av eller på for hele spillet. */
  sideTournamentEnabled: boolean;
  /**
   * Hvor mange LD-/CTP-hull runden har, 0–2 hver.
   *
   * Dette er SLOTS — hull sideturneringen spilles på — ikke medaljeplasser.
   * `sideLdCount: 2` betyr to ULIKE hull med lengste drive, hvert med sin egen
   * vinner, ikke en første- og andreplass på samme hull. Leses den som
   * plassering, blir poengtabellen feil: hver slot gir 2p til én spiller.
   */
  sideLdCount: number;
  sideCtpCount: number;
  /**
   * Kategorier som er slått AV. Legacy: kategori-valget ble fjernet i #1139, og
   * nye spill får alltid tom liste = alle kategorier aktive. Kolonnen leses
   * fortsatt fordi gamle spill kan ha verdier her.
   */
  sideDisabledCategories: string[];
  /**
   * `games.hcp_allowance_pct` (#2255): «85 % handicap» i billetthodet og
   * andelen DINE SLAG regnes med før start. Bare formatene i
   * `usesGameHcpAllowance` bruker den. Valgfri, som `approvedByUserId`: kode
   * som bygger et spill uten den (testene), står som før.
   */
  hcpAllowancePct?: number;
  /**
   * `games.spectate_token` (#2255): satt når arrangøren har slått på
   * live-følging, og da deler Del-knappen på billetten lenka
   * `/spectate/<token>`. Spillere har lesetilgang til kolonnen. `null` = av.
   */
  spectateToken?: string | null;
}

/**
 * Én spiller i rosteret. `courseHandicap` er den FROSNE kolonnen fra
 * `game_players` — den regnes aldri om her.
 */
export interface BundlePlayer {
  userId: string;
  name: string | null;
  nickname: string | null;
  teamNumber: number | null;
  flightNumber: number | null;
  courseHandicap: number | null;
  teeGender: string;
  /**
   * Når spilleren bekreftet at hen blir med (#463), eller null.
   *
   * Arrangør-flatene gater bekreftet/ubekreftet på den, og
   * `confirmParticipation` (`rosterActions.ts`) er det som setter den.
   */
  acceptedAt: string | null;
  submittedAt: string | null;
  /**
   * Hvem som leverte kortet (#2200, 0191), eller null. En trigger fyller den;
   * er det en annen enn spilleren selv, står det «Levert av …» i rosteret, og
   * den som leverte kan ikke også godkjenne kortet.
   */
  submittedByUserId: string | null;
  approvedAt: string | null;
  /**
   * Hvem som godkjente kortet, eller null. Stempelet på scorekortet (#2262)
   * sier «Markør: Anders har godkjent» når det er en flightkamerat, og
   * «Godkjent av arrangøren» ellers. Valgfri, så kode som bygger en spiller
   * uten den (Hjem, testene), står som før.
   */
  approvedByUserId?: string | null;
  rejectionReason: string | null;
  withdrawnAt: string | null;
  /**
   * Hvem som trakk spilleren (#2358), eller null. Bare den som trakk seg selv
   * kan angre; et trekk arrangøren satte, er arrangørens å angre. Serveren
   * nekter uansett (`withdrawn_by_other`), så trukket-banneret skjuler knappen
   * i stedet for å tilby et trykk som alltid feiler.
   */
  withdrawnByUserId: string | null;
  /**
   * `users.is_guest` (#1009). En gjest kan ikke logge inn og levere selv, så
   * kortet hens kan leveres av hvem som helst i flighten når det er fullt.
   */
  isGuest: boolean;
  /**
   * `game_players.result_summary` (#2255, kolonnen fra 0096): plassen som
   * settes når runden avsluttes. Stubben på billetten viser den. `null` før
   * runden er avsluttet, og når utfallet ikke gir mening (en uavgjort duell).
   */
  resultSummary?: ResultSummary | null;
}

/**
 * Teens rating og lengde (#2255), til DINE SLAG før start. Lengden brukes
 * ikke lenger (faktalinja er borte fra billetten), men står i bundelen.
 * Én trio (slope, CR, par) per kjønn; `getRatingForGender` velger. Alt kan
 * mangle på en bane som er lagt inn uten rating.
 */
export interface BundleTeeRatings {
  lengthMeters: number | null;
  slopeMens: number | null;
  courseRatingMens: number | null;
  parTotalMens: number | null;
  slopeLadies: number | null;
  courseRatingLadies: number | null;
  parTotalLadies: number | null;
  slopeJuniors: number | null;
  courseRatingJuniors: number | null;
  parTotalJuniors: number | null;
}

export interface BundleHole {
  holeNumber: number;
  parMens: number;
  parLadies: number;
  parJuniors: number;
  strokeIndex: number;
}

export interface GameBundle {
  game: BundleGame;
  players: BundlePlayer[];
  courseName: string | null;
  teeBoxName: string | null;
  /** `null` når spillet ikke har tee. Valgfri av samme grunn som over. */
  teeRatings?: BundleTeeRatings | null;
  holes: BundleHole[];
  /** Når bundelen sist ble hentet fra serveren (ISO). */
  fetchedAt: string;
}

export function gameBundleCacheKey(gameId: string): string {
  return `game:${gameId}`;
}

// Rå PostgREST-fasonger. Som i `db.ts` bor snake_case → camelCase-mappingen kun
// i denne fila; ingen skjerm ser en rå rad.
interface GameRow {
  id: string;
  name: string;
  status: string;
  game_mode: string;
  mode_config: unknown;
  course_id: string | null;
  tee_box_id: string | null;
  require_peer_approval: boolean;
  scheduled_tee_off_at: string | null;
  hole_segment: string;
  source_game_id: string | null;
  created_by: string | null;
  score_visibility: string;
  tournament_id: string | null;
  foursomes_side1_tee_starter_user_id: string | null;
  foursomes_side2_tee_starter_user_id: string | null;
  side_tournament_enabled: boolean;
  side_ld_count: number;
  side_ctp_count: number;
  side_disabled_categories: string[];
  hcp_allowance_pct: number;
  spectate_token?: string | null;
  courses: { name: string; course_holes: CourseHoleRow[] } | null;
  tee_boxes: TeeBoxRow | null;
}

// `course_rating_*` er `numeric` i basen, og PostgREST kan levere den som tekst.
interface TeeBoxRow {
  name: string;
  length_meters: number | null;
  slope_mens: number | null;
  course_rating_mens: number | string | null;
  par_total_mens: number | null;
  slope_ladies: number | null;
  course_rating_ladies: number | string | null;
  par_total_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | string | null;
  par_total_juniors: number | null;
}

interface CourseHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

interface PlayerRow {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  course_handicap: number | null;
  tee_gender: string;
  accepted_at: string | null;
  submitted_at: string | null;
  submitted_by_user_id: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  rejection_reason: string | null;
  withdrawn_at: string | null;
  withdrawn_by_user_id?: string | null;
  result_summary?: ResultSummary | null;
  users: { name: string | null; nickname: string | null; is_guest: boolean | null } | null;
}

// `users!game_players_user_id_fkey`: game_players har TRE fremmednøkler mot
// users (user_id, approved_by_user_id, withdrawn_by_user_id, og fra 0191
// submitted_by_user_id), så et bart `users(...)` er tvetydig og feiler. Samme
// hint som webben bruker.
const PLAYER_SELECT =
  'user_id, team_number, flight_number, course_handicap, tee_gender, accepted_at, submitted_at, submitted_by_user_id, approved_at, approved_by_user_id, rejection_reason, withdrawn_at, withdrawn_by_user_id, result_summary, users!game_players_user_id_fkey(name, nickname, is_guest)';

// Bane, tee og hullene rir med på games-raden som embeds. Det gjør hele
// metadata-hentingen til to spørringer i én Promise.all i stedet for en kjede
// der hullene må vente på at course_id kommer tilbake.
const GAME_SELECT =
  'id, name, status, game_mode, mode_config, course_id, tee_box_id, require_peer_approval, scheduled_tee_off_at, hole_segment, source_game_id, created_by, score_visibility, tournament_id, foursomes_side1_tee_starter_user_id, foursomes_side2_tee_starter_user_id, side_tournament_enabled, side_ld_count, side_ctp_count, side_disabled_categories, hcp_allowance_pct, spectate_token, courses(name, course_holes(hole_number, par_mens, par_ladies, par_juniors, stroke_index)), tee_boxes(name, length_meters, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)';

function toNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTeeRatings(tee: TeeBoxRow | null): BundleTeeRatings | null {
  if (!tee) return null;
  return {
    lengthMeters: tee.length_meters,
    slopeMens: tee.slope_mens,
    courseRatingMens: toNumber(tee.course_rating_mens),
    parTotalMens: tee.par_total_mens,
    slopeLadies: tee.slope_ladies,
    courseRatingLadies: toNumber(tee.course_rating_ladies),
    parTotalLadies: tee.par_total_ladies,
    slopeJuniors: tee.slope_juniors,
    courseRatingJuniors: toNumber(tee.course_rating_juniors),
    parTotalJuniors: tee.par_total_juniors,
  };
}

function toBundle(game: GameRow, players: PlayerRow[]): GameBundle {
  return {
    game: {
      id: game.id,
      name: game.name,
      status: game.status,
      gameMode: game.game_mode,
      modeConfig: game.mode_config,
      courseId: game.course_id,
      teeBoxId: game.tee_box_id,
      requirePeerApproval: game.require_peer_approval,
      scheduledTeeOffAt: game.scheduled_tee_off_at,
      holeSegment: game.hole_segment,
      sourceGameId: game.source_game_id,
      createdBy: game.created_by,
      scoreVisibility: game.score_visibility,
      tournamentId: game.tournament_id,
      foursomesSide1TeeStarterUserId: game.foursomes_side1_tee_starter_user_id,
      foursomesSide2TeeStarterUserId: game.foursomes_side2_tee_starter_user_id,
      sideTournamentEnabled: game.side_tournament_enabled,
      sideLdCount: game.side_ld_count,
      sideCtpCount: game.side_ctp_count,
      // NOT NULL i skjemaet, men en eldre cache-rad eller en select som mister
      // kolonnen skal gi tom liste — ikke `undefined` inn i kategori-filteret.
      sideDisabledCategories: game.side_disabled_categories ?? [],
      hcpAllowancePct: game.hcp_allowance_pct,
      spectateToken: game.spectate_token ?? null,
    },
    players: players.map((row) => ({
      userId: row.user_id,
      name: row.users?.name ?? null,
      nickname: row.users?.nickname ?? null,
      teamNumber: row.team_number,
      flightNumber: row.flight_number,
      courseHandicap: row.course_handicap,
      teeGender: row.tee_gender,
      acceptedAt: row.accepted_at,
      submittedAt: row.submitted_at,
      submittedByUserId: row.submitted_by_user_id ?? null,
      approvedAt: row.approved_at,
      approvedByUserId: row.approved_by_user_id ?? null,
      rejectionReason: row.rejection_reason,
      withdrawnAt: row.withdrawn_at,
      withdrawnByUserId: row.withdrawn_by_user_id ?? null,
      isGuest: row.users?.is_guest === true,
      resultSummary: row.result_summary ?? null,
    })),
    courseName: game.courses?.name ?? null,
    teeBoxName: game.tee_boxes?.name ?? null,
    teeRatings: toTeeRatings(game.tee_boxes),
    holes: (game.courses?.course_holes ?? [])
      .map((hole) => ({
        holeNumber: hole.hole_number,
        parMens: hole.par_mens,
        parLadies: hole.par_ladies,
        parJuniors: hole.par_juniors,
        strokeIndex: hole.stroke_index,
      }))
      .sort((a, b) => a.holeNumber - b.holeNumber),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Hent bundelen fra serveren. Alt går under vanlig RLS — appen har ingen
 * service-role. Kaster ved feil, slik at kalleren kan velge: vise cachen videre
 * eller si fra.
 */
export async function fetchGameBundle(gameId: string): Promise<GameBundle> {
  const [gameRes, playersRes] = await Promise.all([
    supabase
      .from('games')
      .select(GAME_SELECT)
      .eq('id', gameId)
      .maybeSingle<GameRow>(),
    supabase
      .from('game_players')
      .select(PLAYER_SELECT)
      .eq('game_id', gameId)
      .returns<PlayerRow[]>(),
  ]);

  if (gameRes.error) throw new Error(gameRes.error.message);
  if (playersRes.error) throw new Error(playersRes.error.message);
  if (!gameRes.data) throw new Error(`Fant ikke spillet ${gameId}`);

  return toBundle(gameRes.data, playersRes.data ?? []);
}

/**
 * Slik bundelen ligger i `cache_entries`: versjonen utenpå, bundelen inni.
 * Versjonen står i selve nyttelasten (ikke i nøkkelen) slik at en ny versjon
 * overskriver den gamle oppføringen i stedet for å legge seg ved siden av den.
 */
interface CachedBundlePayload {
  v: number;
  bundle: GameBundle;
}

/** Sant kun for en nyttelast skrevet av NÅVÆRENDE versjon av denne fila. */
function isCurrentPayload(parsed: unknown): parsed is CachedBundlePayload {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { v?: unknown }).v === BUNDLE_PAYLOAD_VERSION &&
    typeof (parsed as { bundle?: unknown }).bundle === 'object' &&
    (parsed as { bundle?: unknown }).bundle !== null
  );
}

/**
 * Bundelen som ligger på enheten, eller `undefined` om den aldri er hentet —
 * eller ble skrevet av en eldre versjon av appen.
 *
 * Versjons-sjekken er den viktige raden: en v1-oppføring har hverken
 * `scoreVisibility` eller foursomes-feltene, og ville levert `undefined` rett
 * inn i reveal-narrowingen på leaderboardet. Den leses derfor som «ingen
 * cache», og `refreshGameBundle` skriver den om ved første nettkontakt.
 */
export async function loadGameBundle(
  gameId: string,
): Promise<GameBundle | undefined> {
  const db = await getDb();
  const entry = await getCacheEntry(db, gameBundleCacheKey(gameId));
  if (!entry) return undefined;
  try {
    const parsed: unknown = JSON.parse(entry.payload);
    return isCurrentPayload(parsed) ? parsed.bundle : undefined;
  } catch {
    // En ødelagt nyttelast (avbrutt skriving, eldre format) skal ikke krasje en
    // skjerm — den leses som «ingen cache», og neste refetch skriver den om.
    return undefined;
  }
}

/**
 * Hent på nytt og legg i cachen.
 *
 * Rekkefølgen er poenget: kastet fra `fetchGameBundle` slipper ut FØR vi rører
 * `cache_entries`. En feilet refetch (offline, RLS, serverfeil) lar dermed den
 * forrige bundelen stå urørt — spilleren mister ikke banen sin fordi nettet falt.
 */
export async function refreshGameBundle(gameId: string): Promise<GameBundle> {
  const bundle = await fetchGameBundle(gameId);
  const db = await getDb();
  const payload: CachedBundlePayload = { v: BUNDLE_PAYLOAD_VERSION, bundle };
  await putCacheEntry(db, {
    key: gameBundleCacheKey(gameId),
    payload: JSON.stringify(payload),
    fetchedAt: bundle.fetchedAt,
  });
  return bundle;
}

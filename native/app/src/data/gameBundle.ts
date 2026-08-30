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
import { supabase } from '../supabase';
import { getCacheEntry, getDb, putCacheEntry } from './db';

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
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  withdrawnAt: string | null;
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
  courses: { name: string; course_holes: CourseHoleRow[] } | null;
  tee_boxes: { name: string } | null;
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
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
}

// `users!game_players_user_id_fkey`: game_players har TRE fremmednøkler mot
// users (user_id, approved_by_user_id, withdrawn_by_user_id), så et bart
// `users(...)` er tvetydig og feiler. Samme hint som webben bruker.
const PLAYER_SELECT =
  'user_id, team_number, flight_number, course_handicap, tee_gender, submitted_at, approved_at, rejection_reason, withdrawn_at, users!game_players_user_id_fkey(name, nickname)';

// Bane, tee og hullene rir med på games-raden som embeds. Det gjør hele
// metadata-hentingen til to spørringer i én Promise.all i stedet for en kjede
// der hullene må vente på at course_id kommer tilbake.
const GAME_SELECT =
  'id, name, status, game_mode, mode_config, course_id, tee_box_id, require_peer_approval, scheduled_tee_off_at, hole_segment, source_game_id, created_by, courses(name, course_holes(hole_number, par_mens, par_ladies, par_juniors, stroke_index)), tee_boxes(name)';

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
    },
    players: players.map((row) => ({
      userId: row.user_id,
      name: row.users?.name ?? null,
      nickname: row.users?.nickname ?? null,
      teamNumber: row.team_number,
      flightNumber: row.flight_number,
      courseHandicap: row.course_handicap,
      teeGender: row.tee_gender,
      submittedAt: row.submitted_at,
      approvedAt: row.approved_at,
      rejectionReason: row.rejection_reason,
      withdrawnAt: row.withdrawn_at,
    })),
    courseName: game.courses?.name ?? null,
    teeBoxName: game.tee_boxes?.name ?? null,
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

/** Bundelen som ligger på enheten, eller `undefined` om den aldri er hentet. */
export async function loadGameBundle(
  gameId: string,
): Promise<GameBundle | undefined> {
  const db = await getDb();
  const entry = await getCacheEntry(db, gameBundleCacheKey(gameId));
  if (!entry) return undefined;
  try {
    return JSON.parse(entry.payload) as GameBundle;
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
  await putCacheEntry(db, {
    key: gameBundleCacheKey(gameId),
    payload: JSON.stringify(bundle),
    fetchedAt: bundle.fetchedAt,
  });
  return bundle;
}

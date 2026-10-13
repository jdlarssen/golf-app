import type { CourseHoleRow, ScoreRow } from '@/lib/supabase/queryFragments';
import { computeLeaderboard, holesForSegment, type HoleSegment } from '@/lib/scoring';
import type {
  ModeResult,
  ScoringContext,
  GameMode,
  GameModeConfig,
  ScoringGender,
  WolfHoleChoice,
  BingoBangoBongoHoleInput,
} from '@/lib/scoring/modes/types';
import { buildStablefordContext } from '@/lib/scoring/context/buildStablefordContext';
import { buildSoloStrokeplayContext } from '@/lib/scoring/context/buildSoloStrokeplayContext';
import { buildWolfContext } from '@/lib/scoring/context/buildWolfContext';
import { buildNassauContext } from '@/lib/scoring/context/buildNassauContext';
import { buildSkinsContext } from '@/lib/scoring/context/buildSkinsContext';
import { buildNinesContext } from '@/lib/scoring/context/buildNinesContext';
import { buildRoundRobinContext } from '@/lib/scoring/context/buildRoundRobinContext';
import { buildAceyDeuceyContext } from '@/lib/scoring/context/buildAceyDeuceyContext';
import { buildBingoBangoBongoContext } from '@/lib/scoring/context/buildBingoBangoBongoContext';
import { buildUniformContext } from '@/lib/scoring/context/buildUniformContext';

// Import-ren med vilje (ingen `server-only`, #2228): native-appen kaller
// `buildContextForMode` direkte, slik at format-switchen har ett hjem i stedet
// for en kopi i appen. Hentingen bor i `buildModeResultForGame.ts`.

/**
 * Game-feltene scoring trenger. Matcher `endGame`-contextet + backfill-spørringen.
 */
export interface GameForScoring {
  id: string;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  course_id: string;
  /**
   * #1441 (splittet cup-dag): the game's own hole scope. Optional — omitting
   * it defaults to 'full' (every hole 1-18), byte-identical to pre-#1441
   * callers. A front9/back9 HOST game (not just a derived one) needs this
   * too: without it, its result summary would compute over all 18 holes
   * even though its players only ever wrote scores for their 9.
   */
  hole_segment?: HoleSegment;
  /**
   * #1441: non-null when this game is DERIVED from another game (no own
   * scores — every score read redirects to the host). Optional — omitting
   * it defaults to null (no redirect), byte-identical to pre-#1441 callers.
   */
  source_game_id?: string | null;
}

export interface GamePlayerRow {
  user_id: string;
  // Nullable in database.types.ts + live prod (#844). Defused at the single
  // normalization boundary in `buildModeResultFromData` (`team_number ?? 0`);
  // typed honestly here so future drift surfaces instead of being papered over.
  team_number: number | null;
  flight_number: number | null;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
}

/**
 * Spiller-raden `buildContextForMode` leser: feltene de delte
 * `build*Context`-hjelperne krever, samlet. `team_number` er alt kollapset til
 * et tall (webbens `?? 0` i `buildModeResultFromData`, appens `toPlayerRows`),
 * og `users` er nullbar fordi PostgREST-joinen kan gi null for en slettet
 * bruker. Webbens normaliserte rad og appens rad passer begge uten cast.
 */
export interface ModeContextPlayerRow {
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
}

export interface ModeResultExtras {
  wolfChoices?: WolfHoleChoice[];
  bingoBangoBongoHoles?: BingoBangoBongoHoleInput[];
}

/**
 * Ren (synkron) `ModeResult`-bygging fra allerede-hentede rader — fetch-fri delen
 * av `buildModeResultForGame`. Lar konsumenter som allerede har dataene (f.eks.
 * backfill fra en data-dump) regne uten en live Supabase-klient.
 */
export function buildModeResultFromData(
  game: GameForScoring,
  rawPlayers: GamePlayerRow[],
  holesRows: CourseHoleRow[],
  scoresRows: ScoreRow[],
  extras: ModeResultExtras = {},
): ModeResult | null {
  const players = rawPlayers.map((p) => ({
    ...p,
    team_number: p.team_number ?? 0,
  }));

  // #1441: scope course_holes down to the game's hole_segment before it
  // reaches any per-mode context builder. 'full' (the default for callers
  // that don't pass hole_segment) is a no-op — every hole 1-18, wrapped/
  // unwrapped through holesForSegment to reuse its canonical 1-9/10-18
  // boundary rather than duplicating it here.
  const scopedHolesRows = holesForSegment(
    holesRows.map((row) => ({ row, number: row.hole_number })),
    game.hole_segment ?? 'full',
  ).map((wrapped) => wrapped.row);
  const scopedHoleNumbers = new Set(scopedHolesRows.map((h) => h.hole_number));
  const scopedScoresRows = scoresRows.filter((s) =>
    scopedHoleNumbers.has(s.hole_number),
  );

  // Ingen hull eller spillere → ikke noe meningsfullt resultat å lagre.
  if (scopedHolesRows.length === 0 || players.length === 0) return null;

  const ctx = buildContextForMode({
    gameId: game.id,
    gameMode: game.game_mode,
    modeConfig: game.mode_config,
    players,
    holesRows: scopedHolesRows,
    scoresRows: scopedScoresRows,
    extras,
  });

  return computeLeaderboard(ctx);
}

/**
 * Format-switchen: ruter hvert `game_mode` til sin `build*Context`-hjelper.
 * Webbens resultat-bygger og native-appens tavle kaller begge denne.
 *
 * Wolf og BBB bygger med `extras.* ?? []`. Appen skiller «ikke hentet» fra
 * «ingen valg» og svarer `missing-choices` FØR den kaller hit
 * (`native/app/src/lib/scoringContext.ts`).
 */
export function buildContextForMode(args: {
  gameId: string;
  gameMode: GameMode;
  modeConfig: GameModeConfig;
  players: ModeContextPlayerRow[];
  holesRows: CourseHoleRow[];
  scoresRows: ScoreRow[];
  extras: ModeResultExtras;
}): ScoringContext {
  const { gameId, gameMode: mode, modeConfig, players, holesRows, scoresRows, extras } =
    args;

  switch (mode) {
    case 'stableford':
    case 'modified_stableford':
      return buildStablefordContext({
        gameId,
        gameMode: mode,
        modeConfig,
        players,
        holesRows,
        scoresRows,
      });
    case 'solo_strokeplay':
      return buildSoloStrokeplayContext({ gameId, modeConfig, players, holesRows, scoresRows });
    case 'nassau':
      return buildNassauContext({ gameId, modeConfig, players, holesRows, scoresRows });
    case 'skins':
      return buildSkinsContext({ gameId, modeConfig, players, holesRows, scoresRows });
    case 'nines':
      return buildNinesContext({ gameId, modeConfig, players, holesRows, scoresRows });
    case 'round_robin':
      return buildRoundRobinContext({ gameId, modeConfig, players, holesRows, scoresRows });
    case 'acey_deucey':
      return buildAceyDeuceyContext({ gameId, modeConfig, players, holesRows, scoresRows });
    case 'wolf':
      return buildWolfContext({
        gameId,
        modeConfig,
        players,
        holesRows,
        scoresRows,
        wolfChoices: extras.wolfChoices ?? [],
      });
    case 'bingo_bango_bongo':
      return buildBingoBangoBongoContext({
        gameId,
        modeConfig,
        players,
        holesRows,
        scoresRows,
        bingoBangoBongoHoles: extras.bingoBangoBongoHoles ?? [],
      });
    // Lag-/side-format uten dedikert builder — uniform context, team_number er
    // alltid satt på disse, så WD-filtrering + felt-map er nok.
    case 'best_ball':
    case 'singles_matchplay':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
    case 'shamble':
    case 'patsome':
      return buildUniformContext({
        gameId,
        gameMode: mode,
        modeConfig,
        players,
        holesRows,
        scoresRows,
      });
    default:
      return assertNever(mode);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled game_mode in buildModeResultForGame: ${String(x)}`);
}

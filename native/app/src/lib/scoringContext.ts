// Native N4 (#1828): broen fra appens data til den DELTE scoring-motoren.
//
// Appen regner ingenting selv. Den bygger `ScoringContext` — bundelen fra
// `cache_entries` for spillere/hull, den lokale SQLite-basen for slag — og
// sender den inn i `computeLeaderboard`, nøyaktig samme funksjon webbens
// leaderboard kaller. Får de to samme input, gir de samme tall.
//
// Tre valg bærer fila:
//
//  1. **Kartleggingen bor i de delte `build*Context`-hjelperne.** Nassau vil ha
//     `teamNumber: null`, round robin vil ha slot-nummeret, stableford vil ha
//     laget kun i par-varianten. De reglene har ETT hjem (`lib/scoring/context/`),
//     og appen oversetter derfor camelCase → rå rad og lar hjelperen svare — samme
//     grep som `roster.ts` bruker mot flight-reglene. Switchen under speiler
//     `buildModeResultForGame.buildContext`; selve fila kan ikke importeres fordi
//     den åpner med `import 'server-only'`.
//  2. **Trukne spillere filtreres HER, for alle modi.** Halvparten av de delte
//     hjelperne filtrerer selv, halvparten tar rader som allerede er rene. Å
//     gjøre det én gang i forkant er den eneste varianten som gir samme felt
//     uansett format.
//  3. **Ingen kast.** Et spill uten bane, uten spillere eller med en `mode_config`
//     appen ikke kjenner igjen gir et typet «nei» tilbake, ikke et unntak. En
//     leaderboard-skjerm som krasjer midt i runden er verre enn en som sier at
//     tabellen kommer på nettsiden.
import { computeLeaderboard } from '../../../../lib/scoring';
import { buildAceyDeuceyContext } from '../../../../lib/scoring/context/buildAceyDeuceyContext';
import { buildBingoBangoBongoContext } from '../../../../lib/scoring/context/buildBingoBangoBongoContext';
import { buildNassauContext } from '../../../../lib/scoring/context/buildNassauContext';
import { buildNinesContext } from '../../../../lib/scoring/context/buildNinesContext';
import { buildRoundRobinContext } from '../../../../lib/scoring/context/buildRoundRobinContext';
import { buildSkinsContext } from '../../../../lib/scoring/context/buildSkinsContext';
import { buildSoloStrokeplayContext } from '../../../../lib/scoring/context/buildSoloStrokeplayContext';
import { buildStablefordContext } from '../../../../lib/scoring/context/buildStablefordContext';
import { buildWolfContext } from '../../../../lib/scoring/context/buildWolfContext';
import type {
  BingoBangoBongoHoleInput,
  GameMode,
  GameModeConfig,
  ModeResult,
  ScoringContext,
  ScoringGender,
  WolfHoleChoice,
} from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';

/**
 * Hvorfor appen ikke kan regne ut et resultat.
 *
 *  - `unknown-mode`   — `games.game_mode` er en verdi denne app-versjonen ikke
 *                       kjenner. Skjer hvis serveren får et nytt format før
 *                       appen er oppdatert.
 *  - `missing-config` — `mode_config` mangler eller peker på et annet format
 *                       enn `game_mode`. Motoren narrower på den, så en gjetning
 *                       her ville gitt tall som ser riktige ut.
 *  - `missing-choices`— wolf/BBB: halve regnestykket bor i per-hull-tabeller,
 *                       og kalleren har ikke tredd dem inn. Se `ScoringExtras`
 *                       for hvorfor svaret er «nei» og ikke en tom liste.
 *  - `no-course`      — bundelen har ingen hull (banen er ikke satt ennå).
 *  - `no-players`     — ingen aktive spillere igjen etter WD-filtreringen.
 */
export type ScoringContextProblem =
  | 'unknown-mode'
  | 'missing-config'
  | 'missing-choices'
  | 'no-course'
  | 'no-players';

export type ScoringContextOutcome =
  | { ok: true; ctx: ScoringContext }
  | { ok: false; problem: ScoringContextProblem };

export type LeaderboardOutcome =
  | { ok: true; result: ModeResult }
  | { ok: false; problem: ScoringContextProblem };

/**
 * Input som IKKE ligger i bundelen eller i den lokale slag-basen: wolf- og
 * BBB-valgene fra sine egne per-hull-tabeller (`data/choices.ts`).
 *
 * **`undefined` og `[]` betyr to helt ulike ting, og det er hele poenget.**
 * `[]` = hentet, ingen har valgt ennå — et gyldig mellomresultat, samme som på
 * web før første valg. `undefined` = ikke hentet (kaldstart offline, nettfeil).
 * De to må ikke kollapse: bygger vi en wolf-kontekst med tom liste fordi
 * hentingen feilet, får spilleren en tabell der hvert hull står uavgjort — som
 * ser autoritativ ut og er ren fiksjon. Det var grunnen til at formatet var
 * gatet i det hele tatt.
 *
 * Derfor svarer adapteren `missing-choices` i stedet for å gjette. Selve
 * TEKSTEN spilleren får eies av skjermen (`PROBLEM_MESSAGES`), på linje med
 * `no-course` og `no-players` — dette laget sier bare hvilket input som mangler.
 */
export interface ScoringExtras {
  /** Alle wolf-valg i spillet. `undefined` = ikke hentet, ikke «ingen valg». */
  wolfChoices?: WolfHoleChoice[];
  /** Alle BBB-hullrader i spillet. Samme `undefined`-semantikk som over. */
  bingoBangoBongoHoles?: BingoBangoBongoHoleInput[];
}

/**
 * Rå `game_players`-rad slik de delte hjelperne leser den. Alle feltene de
 * enkelte hjelperne krever ligger her samlet; strukturell typing gjør at hver
 * hjelper plukker sine egne.
 */
interface ContextPlayerRow {
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  withdrawn_at: string | null;
  /**
   * Alltid satt. Hjelperne filtrerer på `users != null` fordi PostgREST-joinen
   * deres kan gi null for en slettet bruker — bundelen har alt kollapset det
   * til `name: null`, så et null her ville kastet ut navnløse spillere som
   * faktisk er med i runden.
   */
  users: { name: string | null; nickname: string | null };
}

interface ContextHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

interface ContextScoreRow {
  user_id: string;
  hole_number: number;
  strokes: number | null;
}

const KNOWN_MODES: readonly GameMode[] = [
  'best_ball',
  'stableford',
  'modified_stableford',
  'singles_matchplay',
  'solo_strokeplay',
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
  'wolf',
  'nassau',
  'skins',
  'bingo_bango_bongo',
  'nines',
  'round_robin',
  'acey_deucey',
  'shamble',
  'patsome',
];

const GENDERS: readonly ScoringGender[] = ['mens', 'ladies', 'juniors'];

function asGameMode(raw: string): GameMode | null {
  return KNOWN_MODES.includes(raw as GameMode) ? (raw as GameMode) : null;
}

/**
 * `tee_gender` er en DB-enum, men bundelen bærer den som `string`.
 * `'mens'` er samme fallback som scoring-lagets egen `parFor`.
 */
function asGender(raw: string): ScoringGender {
  return GENDERS.includes(raw as ScoringGender) ? (raw as ScoringGender) : 'mens';
}

/**
 * `mode_config` kommer inn som `unknown` (kolonnen er `jsonb`). Kravet er det
 * motoren faktisk stiller: et objekt hvis `kind` er samme format som
 * `game_mode`. Hver eneste variant i `GameModeConfig` har den likheten — den er
 * dermed en ekte sjekk, ikke en formalitet, og fanger en rad der de to har
 * kommet i utakt.
 */
function asModeConfig(mode: GameMode, raw: unknown): GameModeConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const kind = (raw as { kind?: unknown }).kind;
  return kind === mode ? (raw as GameModeConfig) : null;
}

function toPlayerRows(bundle: GameBundle): ContextPlayerRow[] {
  return bundle.players
    .filter((player) => player.withdrawnAt == null)
    .map((player) => ({
      user_id: player.userId,
      // Kolonnen er nullable i prod (#844). `?? 0` er samme kollaps som
      // webbens `buildModeResultFromData` gjør på grensen.
      team_number: player.teamNumber ?? 0,
      course_handicap: player.courseHandicap,
      tee_gender: asGender(player.teeGender),
      withdrawn_at: null,
      users: { name: player.name, nickname: player.nickname },
    }));
}

function toHoleRows(bundle: GameBundle): ContextHoleRow[] {
  return bundle.holes.map((hole) => ({
    hole_number: hole.holeNumber,
    par_mens: hole.parMens,
    par_ladies: hole.parLadies,
    par_juniors: hole.parJuniors,
    stroke_index: hole.strokeIndex,
  }));
}

/**
 * ALLE spillets rader fra den lokale basen, ikke bare mine.
 * `strokes` → `gross`: motoren har ikke noe puttbegrep.
 */
function toScoreRows(
  scores: readonly LocalScore[],
  activeUserIds: ReadonlySet<string>,
): ContextScoreRow[] {
  return scores
    .filter((score) => activeUserIds.has(score.userId))
    .map((score) => ({
      user_id: score.userId,
      hole_number: score.holeNumber,
      strokes: score.strokes,
    }));
}

/**
 * Uniform kontekst for lag-/side-formatene uten egen delt hjelper (best ball,
 * matchplay-familien, scramble-familien, shamble, patsome).
 *
 * Speiler `buildUniformContext` i `lib/scoring/buildModeResultForGame.ts`.
 * Kopien finnes fordi den fila åpner med `import 'server-only'` og
 * web-fredningen forbyr å flytte hjelperen ut av den i denne etappen —
 * bokført som restanse, ikke som et nytt hjem for en regel.
 */
function buildUniformContext(opts: {
  gameId: string;
  gameMode: GameMode;
  modeConfig: GameModeConfig;
  players: ContextPlayerRow[];
  holesRows: ContextHoleRow[];
  scoresRows: ContextScoreRow[];
}): ScoringContext {
  return {
    game: {
      id: opts.gameId,
      game_mode: opts.gameMode,
      mode_config: opts.modeConfig,
    },
    players: opts.players.map((player) => ({
      userId: player.user_id,
      teamNumber: player.team_number,
      flightNumber: null,
      courseHandicap: player.course_handicap ?? 0,
      teeGender: player.tee_gender,
    })),
    holes: opts.holesRows.map((hole) => ({
      number: hole.hole_number,
      par: hole.par_mens,
      parByGender: {
        mens: hole.par_mens,
        ladies: hole.par_ladies,
        juniors: hole.par_juniors,
      },
      strokeIndex: hole.stroke_index,
    })),
    scores: opts.scoresRows.map((score) => ({
      userId: score.user_id,
      holeNumber: score.hole_number,
      gross: score.strokes,
    })),
  };
}

/**
 * Bygg `ScoringContext` for ett spill fra bundelen og de lokale slagene.
 *
 * Ren funksjon: ingen nett, ingen SQLite, ingen React. Kalleren har allerede
 * lest begge kildene.
 */
export function buildScoringContext(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  extras: ScoringExtras = {},
): ScoringContextOutcome {
  const mode = asGameMode(bundle.game.gameMode);
  if (mode === null) return { ok: false, problem: 'unknown-mode' };

  const modeConfig = asModeConfig(mode, bundle.game.modeConfig);
  if (modeConfig === null) return { ok: false, problem: 'missing-config' };

  const holesRows = toHoleRows(bundle);
  if (holesRows.length === 0) return { ok: false, problem: 'no-course' };

  const players = toPlayerRows(bundle);
  if (players.length === 0) return { ok: false, problem: 'no-players' };

  const activeUserIds = new Set(players.map((player) => player.user_id));
  const scoresRows = toScoreRows(scores, activeUserIds);
  const gameId = bundle.game.id;

  switch (mode) {
    case 'stableford':
    case 'modified_stableford':
      return {
        ok: true,
        ctx: buildStablefordContext({
          gameId,
          gameMode: mode,
          modeConfig,
          players,
          holesRows,
          scoresRows,
        }),
      };
    case 'solo_strokeplay':
      return {
        ok: true,
        ctx: buildSoloStrokeplayContext({ gameId, modeConfig, players, holesRows, scoresRows }),
      };
    case 'nassau':
      return {
        ok: true,
        ctx: buildNassauContext({ gameId, modeConfig, players, holesRows, scoresRows }),
      };
    case 'skins':
      return {
        ok: true,
        ctx: buildSkinsContext({ gameId, modeConfig, players, holesRows, scoresRows }),
      };
    case 'nines':
      return {
        ok: true,
        ctx: buildNinesContext({ gameId, modeConfig, players, holesRows, scoresRows }),
      };
    case 'round_robin':
      return {
        ok: true,
        ctx: buildRoundRobinContext({ gameId, modeConfig, players, holesRows, scoresRows }),
      };
    case 'acey_deucey':
      return {
        ok: true,
        ctx: buildAceyDeuceyContext({ gameId, modeConfig, players, holesRows, scoresRows }),
      };
    // Halve regnestykket ligger i `wolf_hole_choices` /
    // `bingo_bango_bongo_holes`. Har kalleren dem, bygger vi; har den dem
    // ikke, sier vi fra — aldri en kontekst med tom liste (se `ScoringExtras`).
    // Rotasjons-sloten wolf leser er `team_number`, som radene alt bærer.
    case 'wolf':
      if (extras.wolfChoices === undefined) {
        return { ok: false, problem: 'missing-choices' };
      }
      return {
        ok: true,
        ctx: buildWolfContext({
          gameId,
          modeConfig,
          players,
          holesRows,
          scoresRows,
          wolfChoices: extras.wolfChoices,
        }),
      };
    case 'bingo_bango_bongo':
      if (extras.bingoBangoBongoHoles === undefined) {
        return { ok: false, problem: 'missing-choices' };
      }
      return {
        ok: true,
        ctx: buildBingoBangoBongoContext({
          gameId,
          modeConfig,
          players,
          holesRows,
          scoresRows,
          bingoBangoBongoHoles: extras.bingoBangoBongoHoles,
        }),
      };
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
      return {
        ok: true,
        ctx: buildUniformContext({
          gameId,
          gameMode: mode,
          modeConfig,
          players,
          holesRows,
          scoresRows,
        }),
      };
    default: {
      // Et nytt format i den delte unionen skal gi KOMPILEFEIL her, ikke en
      // stille tom tabell på telefonen.
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

/**
 * Bundelen + de lokale slagene → ferdig `ModeResult` fra den delte motoren.
 * Skjermen kaller denne; adapteren over er skilt ut så mappingen kan testes
 * uten å gå gjennom 22 mode-moduler.
 */
export function computeGameLeaderboard(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  extras: ScoringExtras = {},
): LeaderboardOutcome {
  const outcome = buildScoringContext(bundle, scores, extras);
  if (!outcome.ok) return outcome;
  return { ok: true, result: computeLeaderboard(outcome.ctx) };
}

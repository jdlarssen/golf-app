import { compute as computeSinglesMatchplay } from '@/lib/scoring/modes/singlesMatchplay';
import { compute as computeFourballMatchplay } from '@/lib/scoring/modes/fourballMatchplay';
import { compute as computeFoursomesMatchplay } from '@/lib/scoring/modes/foursomesMatchplay';
import { compute as computeGreensomeMatchplay } from '@/lib/scoring/modes/greensomeMatchplay';
import { compute as computeChapmanMatchplay } from '@/lib/scoring/modes/chapmanMatchplay';
import { compute as computeGruesomeMatchplay } from '@/lib/scoring/modes/gruesomeMatchplay';
import type { GameMode, GameModeConfig, ScoringContext } from '@/lib/scoring/modes/types';
import type { CupMatchInput } from './computeCupLeaderboard';

/**
 * Tabell-drevet scoring-dispatch for én cup-match. Erstatter fem nær-identiske
 * inline-grener i `getCupSnapshot` (singles/fourball/foursomes/chapman/gruesome)
 * og lukker greensome-gapet (#331): greensome ble lagt til i match-mode-unionen
 * men aldri gitt en compute-gren, så greensome-matcher scoret 0–0 uansett vinner.
 *
 * Ren funksjon (plain input → result), ingen Supabase — derfor Type-A-testbar,
 * i motsetning til `getCupSnapshot` som krever admin-client-mocks. Ny matchplay-
 * modus legges til ved én rad i `MATCHPLAY_CONFIG` (ikke en ny copy-paste-gren).
 */

type CupMatchplayMode =
  | 'singles_matchplay'
  | 'fourball_matchplay'
  | 'foursomes_matchplay'
  | 'greensome_matchplay'
  | 'chapman_matchplay'
  | 'gruesome_matchplay';

type MatchplayResult = { result: { winner: 'side1' | 'side2' | 'tied'; formatted: string } | null };

type MatchplayConfig = {
  compute: (ctx: ScoringContext) => MatchplayResult;
  /** Spillere per side: singles = 1, alle lag-format = 2. */
  sideSize: 1 | 2;
  /**
   * WHS-allowance-default når `mode_config.allowance_pct` mangler. `null` for
   * singles (ingen allowance i mode_config). Bevart eksakt fra de tidligere
   * inline-grenene: fourball 100, foursomes 50, greensome 100, chapman 100,
   * gruesome 50.
   */
  defaultAllowance: number | null;
};

const MATCHPLAY_CONFIG: Record<CupMatchplayMode, MatchplayConfig> = {
  singles_matchplay: { compute: computeSinglesMatchplay, sideSize: 1, defaultAllowance: null },
  fourball_matchplay: { compute: computeFourballMatchplay, sideSize: 2, defaultAllowance: 100 },
  foursomes_matchplay: { compute: computeFoursomesMatchplay, sideSize: 2, defaultAllowance: 50 },
  greensome_matchplay: { compute: computeGreensomeMatchplay, sideSize: 2, defaultAllowance: 100 },
  chapman_matchplay: { compute: computeChapmanMatchplay, sideSize: 2, defaultAllowance: 100 },
  gruesome_matchplay: { compute: computeGruesomeMatchplay, sideSize: 2, defaultAllowance: 50 },
};

/**
 * Runtime-oppslaget går via `Map`, ikke rått objekt-oppslag: `input.gameMode`
 * er fri tekst (`games.game_mode`), og `MATCHPLAY_CONFIG['toString']` ville
 * truffet `Object.prototype` og gitt en *funksjon* — truthy nok til å passere
 * `if (!cfg)`-guarden, for så å krasje på `cfg.sideSize` lenger nede (#1777).
 * `Object.entries` gir kun egne nøkler, og avledningen skjer ÉN gang ved
 * modulens rot. Deklarasjonen over blir bevisst stående som
 * `Record<CupMatchplayMode, …>` så en ny matchplay-modus fortsatt gir
 * kompileringsfeil her i stedet for en stille null-retur.
 * Presedens: `cupMatchGameMode.ts` (#1522).
 */
const MATCHPLAY_CONFIG_BY_MODE: ReadonlyMap<string, MatchplayConfig> = new Map(
  Object.entries(MATCHPLAY_CONFIG),
);

export type CupMatchSidePlayer = { userId: string; courseHandicap: number };

export type CupMatchScoringInput = {
  gameId?: string;
  gameMode: string;
  /**
   * `games.mode_config` — `allowance_pct` leses for alle lag-format.
   * `team_strokes_override` (#1441, D10 — splittet cup-dagens manuelle
   * greensome-lag-slag) leses KUN videre når `gameMode ===
   * 'greensome_matchplay'`; feltet ignoreres for øvrige moduser (samme
   * bevisste smalhet som `allowance_pct` alt hadde).
   */
  modeConfig: {
    allowance_pct?: number;
    team_strokes_override?: { team1: number; team2: number };
  } | null;
  side1: CupMatchSidePlayer[];
  side2: CupMatchSidePlayer[];
  holes: Array<{ number: number; par: number; strokeIndex: number }>;
  scores: Array<{ userId: string; holeNumber: number; gross: number | null }>;
};

/**
 * Scorer én cup-match. Returnerer `null` (ingen poeng tildeles) når:
 * game_mode ikke er en kjent matchplay-modus, side-størrelsen ikke matcher
 * modusen, eller matchen ikke har et avgjort resultat ennå (ingen hull spilt).
 */
export function computeCupMatchResult(input: CupMatchScoringInput): CupMatchInput['result'] {
  const cfg = MATCHPLAY_CONFIG_BY_MODE.get(input.gameMode);
  if (!cfg) return null;
  if (input.side1.length !== cfg.sideSize || input.side2.length !== cfg.sideSize) return null;

  const allowancePct =
    cfg.defaultAllowance === null
      ? null
      : typeof input.modeConfig?.allowance_pct === 'number'
        ? input.modeConfig.allowance_pct
        : cfg.defaultAllowance;

  // #1441 (D10): greensome's manuelle lag-slag-overstyring følger med til
  // `compute()` — `greensomeMatchplay.ts` leser `team_strokes_override` selv
  // fra `ctx.game.mode_config`. Andre moduser får aldri feltet forwardet
  // (`team_strokes_override` betyr ingenting for dem).
  const teamStrokesOverride =
    input.gameMode === 'greensome_matchplay' ? input.modeConfig?.team_strokes_override : undefined;

  const modeConfig: GameModeConfig = (
    cfg.sideSize === 1
      ? { kind: input.gameMode, team_size: 1, teams_count: 2 }
      : {
          kind: input.gameMode,
          team_size: 2,
          teams_count: 2,
          allowance_pct: allowancePct,
          ...(teamStrokesOverride ? { team_strokes_override: teamStrokesOverride } : {}),
        }
  ) as GameModeConfig;

  const ctx: ScoringContext = {
    game: {
      id: input.gameId ?? '',
      game_mode: input.gameMode as GameMode,
      mode_config: modeConfig,
    },
    players: [
      ...input.side1.map((p) => ({
        userId: p.userId,
        teamNumber: 1,
        flightNumber: null,
        courseHandicap: p.courseHandicap,
      })),
      ...input.side2.map((p) => ({
        userId: p.userId,
        teamNumber: 2,
        flightNumber: null,
        courseHandicap: p.courseHandicap,
      })),
    ],
    holes: input.holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex })),
    scores: input.scores.map((s) => ({
      userId: s.userId,
      holeNumber: s.holeNumber,
      gross: s.gross,
    })),
  };

  const r = cfg.compute(ctx);
  if (!r.result) return null;
  const winnerSide: 1 | 2 | 'tied' =
    r.result.winner === 'side1' ? 1 : r.result.winner === 'side2' ? 2 : 'tied';
  return { winnerSide, formatted: r.result.formatted };
}

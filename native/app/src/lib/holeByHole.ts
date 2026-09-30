// #2255: «Hull for hull» i appen — hvilke runder har den, og hva viser den.
//
// Gaten er webbens `hasHoleByHoleView`, gitt den RÅ `mode_config` slik
// webbens side gjør (en stableford-rad med tom config har ingen «Hull for
// hull» der heller). Oppå den står appens egen liste over formatene skjermen
// er bygget for. Den vokser format for format (PR 3a: solo stableford,
// modifisert stableford og solo slagspill; PR 3b: Wolf; PR 3c: Nines, Round
// Robin, Acey Deucey og Bingo Bango Bongo; PR 3d: best ball). For resten står
// flisa på spillets side som «Tavla», som for formatene webben sender til tavla.
// Skins og Nassau bygges etter sine egne tegninger (#2317, #2327), ikke her.
//
// Regnestykket er delt med webben: motoren (`computeGameLeaderboard`, samme
// som tavla) og radene (`lib/leaderboard/soloScorecard.ts`,
// `lib/leaderboard/wolfHoles.ts`, `lib/leaderboard/ninesHoles.ts`,
// `lib/leaderboard/roundRobinHoles.ts`, `lib/leaderboard/aceyDeuceyHoles.ts`,
// `lib/leaderboard/bingoBangoBongoHoles.ts`). Best ball regnes som webbens
// drilldown gjør det, ikke med motoren: `bestBallBoardInput` og
// `lib/leaderboard.ts` sin `computeLeaderboard`, og laget tegnes fra
// `lib/leaderboard/bestBallHoles.ts`. Skjermen tegner bare det som kommer
// herfra.
import { hasHoleByHoleView } from '../../../../lib/leaderboard/holeByHoleView';
import {
  soloStablefordScorecard,
  soloStrokeplayScorecard,
  type SoloScorecard,
} from '../../../../lib/leaderboard/soloScorecard';
import { wolfHoleCards, type WolfHoleCards } from '../../../../lib/leaderboard/wolfHoles';
import { ninesHoleCards, type NinesHoleCards } from '../../../../lib/leaderboard/ninesHoles';
import {
  roundRobinHoleCards,
  type RoundRobinHoleCards,
} from '../../../../lib/leaderboard/roundRobinHoles';
import {
  aceyDeuceyHoleCards,
  type AceyDeuceyHoleCards,
} from '../../../../lib/leaderboard/aceyDeuceyHoles';
import {
  bingoBangoBongoHoleCards,
  type BingoBangoBongoHoleCards,
} from '../../../../lib/leaderboard/bingoBangoBongoHoles';
import { computeLeaderboard as computeTeamLines, type TeamLine } from '../../../../lib/leaderboard';
import { bestBallBoardInput } from '../../../../lib/leaderboard/bestBallInput';
import { isHoleInSegment } from '../../../../lib/games/holeScope';
import type { HoleSegment } from '../../../../lib/scoring';
import {
  MODE_LABELS,
  type GameMode,
  type GameModeConfig,
} from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { BundleGame, GameBundle } from '../data/gameBundle';
import {
  BINGO_BANGO_BONGO_HOLES_TEXT,
  HOLES_TEXT,
  ROUND_ROBIN_HOLES_TEXT,
  aceyDeuceySubtitle,
  ninesSubtitle,
  wolfSubtitle,
} from './holesCopy';
import {
  asModeConfig,
  computeGameLeaderboard,
  toHoleRows,
  toPlayerRows,
  toScoreRows,
  type ScoringExtras,
} from './scoringContext';
import { choicesNotYetHere } from './choiceSource';

export type HoleByHoleKind =
  | 'solo-stableford'
  | 'solo-strokeplay'
  | 'wolf'
  | 'nines'
  | 'round-robin'
  | 'acey-deucey'
  | 'bingo-bango-bongo'
  | 'best-ball';

/**
 * Linja under overskriften er formatet («Stableford», «Wolf · Netto», «Nines ·
 * Netto», «Round Robin», «Acey Deucey · Netto», «Bingo Bango Bongo»).
 */
export type HoleByHoleModel =
  | { kind: 'solo-stableford' | 'solo-strokeplay'; subtitle: string; card: SoloScorecard }
  | { kind: 'wolf'; subtitle: string; wolf: WolfHoleCards }
  | { kind: 'nines'; subtitle: string; nines: NinesHoleCards }
  | { kind: 'round-robin'; subtitle: string; roundRobin: RoundRobinHoleCards }
  | { kind: 'acey-deucey'; subtitle: string; aceyDeucey: AceyDeuceyHoleCards }
  | { kind: 'bingo-bango-bongo'; subtitle: string; bingoBangoBongo: BingoBangoBongoHoleCards }
  /**
   * Alle lagene og tavlas par over hullene: skjermen velger laget (lederen
   * først, så «forrige» og «neste») med `bestBallDrilldown`.
   */
  | { kind: 'best-ball'; lines: TeamLine[]; coursePar: number };

function isKnownMode(mode: string): mode is GameMode {
  return Object.hasOwn(MODE_LABELS, mode);
}

/**
 * Hvilken «Hull for hull»-visning runden har i appen, eller `null` når flisa
 * skal stå som «Tavla».
 */
export function holeByHoleKind(
  game: Pick<BundleGame, 'gameMode' | 'modeConfig'>,
): HoleByHoleKind | null {
  const mode = game.gameMode;
  if (!isKnownMode(mode)) return null;
  const raw = typeof game.modeConfig === 'object' && game.modeConfig !== null ? game.modeConfig : {};
  if (!hasHoleByHoleView(mode, raw as GameModeConfig)) return null;
  if (mode === 'stableford' || mode === 'modified_stableford') return 'solo-stableford';
  if (mode === 'solo_strokeplay') return 'solo-strokeplay';
  if (mode === 'wolf') return 'wolf';
  if (mode === 'nines') return 'nines';
  if (mode === 'round_robin') return 'round-robin';
  if (mode === 'acey_deucey') return 'acey-deucey';
  if (mode === 'bingo_bango_bongo') return 'bingo-bango-bongo';
  if (mode === 'best_ball') return 'best-ball';
  return null;
}

/**
 * Lagene slik webbens drilldown regner dem (`holes/formats/drilldown.tsx`):
 * spillets segment, trukne spillere og slagene deres utenfor
 * (`bestBallBoardInput`), og netto. Skjermen viser bare avsluttede runder,
 * så webbens klipp til første halvdel i en aktiv runde gjelder ikke her.
 * `null` uten gyldig config eller bane.
 */
function bestBallLines(
  bundle: GameBundle,
  scores: readonly LocalScore[],
): { lines: TeamLine[]; coursePar: number } | null {
  const modeConfig = asModeConfig('best_ball', bundle.game.modeConfig);
  if (modeConfig === null) return null;
  const segment = bundle.game.holeSegment as HoleSegment;
  const roster = toPlayerRows(bundle);
  const holeRows = toHoleRows(bundle).filter((h) => isHoleInSegment(h.hole_number, segment));
  if (holeRows.length === 0) return null;
  const scoreRows = toScoreRows(scores, new Set(roster.map((p) => p.user_id))).filter((s) =>
    isHoleInSegment(s.hole_number, segment),
  );
  const input = bestBallBoardInput({
    gameMode: 'best_ball',
    modeConfig,
    roster,
    holeRows,
    scoreRows,
    unknownPlayer: HOLES_TEXT.unknownPlayer,
  });
  const lines = computeTeamLines({ mode: 'netto', players: input.players, holes: input.holes, scores: input.scores });
  // Tavlas par (#2217): `par_mens` over nøyaktig hullene som ble regnet.
  const coursePar = input.holes.reduce((sum, h) => sum + h.par, 0);
  return { lines, coursePar };
}

/**
 * Trenger formatet valg fra serveren før det kan regnes (Wolf: hvem valgte
 * hva; Bingo Bango Bongo: hvem tok hvilken prestasjon), og er de ikke hentet
 * ennå? Uten dem kan motoren ikke regne formatet (`missing-choices`), og
 * skjermen ville sagt at runden ikke har «Hull for hull». Da venter skjermen,
 * og sier fra hvis hentingen feiler. Om valgene er kommet, avgjør
 * `choicesNotYetHere` (samme regel som tavla); her står bare hvilken
 * `game_mode` visningen hører til.
 */
export function waitsForChoices(
  game: Pick<BundleGame, 'gameMode' | 'modeConfig'>,
  extras: ScoringExtras,
): boolean {
  // Hvilke formater som trenger valg, vet bare `choiceSource.ts`.
  return holeByHoleKind(game) !== null && choicesNotYetHere(game.gameMode, extras);
}

/**
 * Modellen skjermen tegner, eller `null` når runden ikke har appens «Hull for
 * hull», eller motoren ikke kan regne (ingen bane, ingen spillere).
 */
export function buildHoleByHole(
  bundle: GameBundle,
  scores: readonly LocalScore[],
  extras: ScoringExtras = {},
): HoleByHoleModel | null {
  const kind = holeByHoleKind(bundle.game);
  if (kind === null) return null;
  if (kind === 'best-ball') {
    const bestBall = bestBallLines(bundle, scores);
    return bestBall && bestBall.lines.length > 0 ? { kind, ...bestBall } : null;
  }
  const outcome = computeGameLeaderboard(bundle, scores, extras);
  if (!outcome.ok) return null;
  const { result } = outcome;
  const teeGenderOf = (userId: string) =>
    bundle.players.find((p) => p.userId === userId)?.teeGender;

  if (kind === 'solo-stableford' && result.kind === 'stableford' && result.variant === 'solo') {
    return {
      kind,
      subtitle: MODE_LABELS[bundle.game.gameMode as GameMode],
      card: soloStablefordScorecard(result, teeGenderOf),
    };
  }
  if (kind === 'solo-strokeplay' && result.kind === 'solo_strokeplay') {
    return {
      kind,
      subtitle: HOLES_TEXT.strokeplaySubtitle,
      card: soloStrokeplayScorecard(result, teeGenderOf),
    };
  }
  if (kind === 'wolf' && result.kind === 'wolf') {
    return { kind, subtitle: wolfSubtitle(result.scoring), wolf: wolfHoleCards(result) };
  }
  if (kind === 'nines' && result.kind === 'nines') {
    const nines = ninesHoleCards(result);
    return { kind, subtitle: ninesSubtitle(nines.variantKey, nines.scoringKey), nines };
  }
  if (kind === 'round-robin' && result.kind === 'round_robin') {
    return { kind, subtitle: ROUND_ROBIN_HOLES_TEXT.subtitle, roundRobin: roundRobinHoleCards(result) };
  }
  if (kind === 'acey-deucey' && result.kind === 'acey_deucey') {
    const aceyDeucey = aceyDeuceyHoleCards(result);
    return { kind, subtitle: aceyDeuceySubtitle(aceyDeucey.scoringKey), aceyDeucey };
  }
  if (kind === 'bingo-bango-bongo' && result.kind === 'bingo_bango_bongo') {
    return {
      kind,
      subtitle: BINGO_BANGO_BONGO_HOLES_TEXT.subtitle,
      bingoBangoBongo: bingoBangoBongoHoleCards(result),
    };
  }
  return null;
}

// #2255: «Hull for hull» i appen — hvilke runder har den, og hva viser den.
//
// Gaten er webbens `hasHoleByHoleView`, gitt den RÅ `mode_config` slik
// webbens side gjør (en stableford-rad med tom config har ingen «Hull for
// hull» der heller). Oppå den står appens egen liste over formatene skjermen
// er bygget for. Den vokser format for format (PR 3a: solo stableford,
// modifisert stableford og solo slagspill). For resten står flisa på spillets
// side som «Tavla», som for formatene webben sender til tavla.
//
// Regnestykket er delt med webben: motoren (`computeGameLeaderboard`, samme
// som tavla) og radene (`lib/leaderboard/soloScorecard.ts`). Skjermen tegner
// bare det som kommer herfra.
import { hasHoleByHoleView } from '../../../../lib/leaderboard/holeByHoleView';
import {
  soloStablefordScorecard,
  soloStrokeplayScorecard,
  type SoloScorecard,
} from '../../../../lib/leaderboard/soloScorecard';
import {
  MODE_LABELS,
  type GameMode,
  type GameModeConfig,
} from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { BundleGame, GameBundle } from '../data/gameBundle';
import { HOLES_TEXT } from './holesCopy';
import { computeGameLeaderboard } from './scoringContext';

export type HoleByHoleKind = 'solo-stableford' | 'solo-strokeplay';

export interface HoleByHoleModel {
  kind: HoleByHoleKind;
  /** Linja under overskriften: formatet («Stableford», «Slagspill · Netto»). */
  subtitle: string;
  card: SoloScorecard;
}

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
  return null;
}

/**
 * Modellen skjermen tegner, eller `null` når runden ikke har appens «Hull for
 * hull», eller motoren ikke kan regne (ingen bane, ingen spillere).
 */
export function buildHoleByHole(
  bundle: GameBundle,
  scores: readonly LocalScore[],
): HoleByHoleModel | null {
  const kind = holeByHoleKind(bundle.game);
  if (kind === null) return null;
  const outcome = computeGameLeaderboard(bundle, scores);
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
  return null;
}

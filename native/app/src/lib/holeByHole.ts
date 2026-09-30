// #2255: «Hull for hull» i appen — hvilke runder har den, og hva viser den.
//
// Gaten er webbens `hasHoleByHoleView`, gitt den RÅ `mode_config` slik
// webbens side gjør (en stableford-rad med tom config har ingen «Hull for
// hull» der heller). Oppå den står appens egen liste over formatene skjermen
// er bygget for. Den vokser format for format (PR 3a: solo stableford,
// modifisert stableford og solo slagspill; PR 3b: Wolf). For resten står flisa
// på spillets side som «Tavla», som for formatene webben sender til tavla.
// Skins og Nassau bygges etter sine egne tegninger (#2317, #2327), ikke her.
//
// Regnestykket er delt med webben: motoren (`computeGameLeaderboard`, samme
// som tavla) og radene (`lib/leaderboard/soloScorecard.ts`,
// `lib/leaderboard/wolfHoles.ts`). Skjermen tegner bare det som kommer herfra.
import { hasHoleByHoleView } from '../../../../lib/leaderboard/holeByHoleView';
import {
  soloStablefordScorecard,
  soloStrokeplayScorecard,
  type SoloScorecard,
} from '../../../../lib/leaderboard/soloScorecard';
import { wolfHoleCards, type WolfHoleCards } from '../../../../lib/leaderboard/wolfHoles';
import {
  MODE_LABELS,
  type GameMode,
  type GameModeConfig,
} from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { BundleGame, GameBundle } from '../data/gameBundle';
import { HOLES_TEXT, wolfSubtitle } from './holesCopy';
import { computeGameLeaderboard, type ScoringExtras } from './scoringContext';
import { choicesNotYetHere } from './choiceSource';

export type HoleByHoleKind = 'solo-stableford' | 'solo-strokeplay' | 'wolf';

/** Linja under overskriften er formatet («Stableford», «Wolf · Netto»). */
export type HoleByHoleModel =
  | { kind: 'solo-stableford' | 'solo-strokeplay'; subtitle: string; card: SoloScorecard }
  | { kind: 'wolf'; subtitle: string; wolf: WolfHoleCards };

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
  return null;
}

/**
 * Trenger formatet valg fra serveren før det kan regnes (Wolf: hvem valgte
 * hva), og er de ikke hentet ennå? Uten dem kan motoren ikke regne Wolf
 * (`missing-choices`), og skjermen ville sagt at runden ikke har «Hull for
 * hull». Da venter skjermen, og sier fra hvis hentingen feiler.
 */
export function waitsForChoices(kind: HoleByHoleKind | null, extras: ScoringExtras): boolean {
  return kind === 'wolf' && choicesNotYetHere('wolf', extras);
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
  return null;
}

// #2752: den delte cup-dagen i appen.
//
// En delt cup-dag er to spill for én flight: greensome på hull 1–9 og best ball
// på hull 10–18 (`lib/cup/cupTemplates.ts`), med avledede singler som leser
// slagene fra best ball-spillet. For spilleren er det én runde på 18 hull.
//
// Her står det appen må spørre om for å holde det sammen: hvilke hull spillet
// eier, hvilket spill et hull hører til, og hvor slagene ligger. Selve reglene
// er nettets: hullene fra `holeScope.ts`, broen fra `segmentSiblingRules.ts`.
// Søskenet ligger i bundelen (`gameBundle.ts`), så alt her virker uten nett.
import {
  firstHoleForSegment,
  holeNumbersForSegment,
  lastHoleForSegment,
} from '../../../../lib/games/holeScope';
import { isBroModus } from '../../../../lib/games/segmentSiblingRules';
import type { HoleSegment } from '../../../../lib/scoring/holeSegment';
import type { BundleGame, BundleHole, GameBundle } from '../data/gameBundle';

/** Et hull i runden: nummeret, og spillet det føres i. */
export interface RoundHole {
  gameId: string;
  holeNumber: number;
}

/** `games.hole_segment`. Kolonnen er NOT NULL, med default `'full'`. */
export function gameSegment(game: Pick<BundleGame, 'holeSegment'>): HoleSegment {
  return game.holeSegment as HoleSegment;
}

/** Hullene spillet selv eier: [1..18], [1..9] eller [10..18]. */
export function gameHoleNumbers(game: Pick<BundleGame, 'holeSegment'>): number[] {
  return holeNumbersForSegment(gameSegment(game));
}

/** Siste hull spillet selv eier. */
export function gameLastHole(game: Pick<BundleGame, 'holeSegment'>): number {
  return lastHoleForSegment(gameSegment(game));
}

/** Banens hull, klippet til spillet. Hele banen for et vanlig spill. */
export function gameHoles(bundle: Pick<GameBundle, 'game' | 'holes'>): BundleHole[] {
  const own = new Set(gameHoleNumbers(bundle.game));
  return bundle.holes.filter((hole) => own.has(hole.holeNumber));
}

/** En avledet kamp har ingen slag selv, og føres aldri (#1441). */
export function isDerivedGame(game: Pick<BundleGame, 'sourceGameId'>): boolean {
  return game.sourceGameId != null;
}

/** Spillet slagene ligger i, samme regel som `buildModeResultForGame`. */
export function scoresGameId(game: Pick<BundleGame, 'id' | 'sourceGameId'>): string {
  return game.sourceGameId ?? game.id;
}

/** Alle hullene spilleren kan bla mellom: spillets egne, pluss søskenets. */
export function roundHoleNumbers(bundle: Pick<GameBundle, 'game' | 'segmentSibling'>): number[] {
  const own = gameHoleNumbers(bundle.game);
  const sibling = bundle.segmentSibling;
  if (!sibling) return own;
  return [...own, ...holeNumbersForSegment(sibling.holeSegment)].sort((a, b) => a - b);
}

/** Hvilket spill hullet føres i, eller `null` når hullet ikke er i runden. */
export function roundHole(
  bundle: Pick<GameBundle, 'game' | 'segmentSibling'>,
  holeNumber: number,
): RoundHole | null {
  if (gameHoleNumbers(bundle.game).includes(holeNumber)) {
    return { gameId: bundle.game.id, holeNumber };
  }
  const sibling = bundle.segmentSibling;
  return sibling && holeNumbersForSegment(sibling.holeSegment).includes(holeNumber)
    ? { gameId: sibling.gameId, holeNumber }
    : null;
}

/**
 * Broen: hull 10 i best ball-spillet, når første halvdel ikke skal leveres selv.
 * `null` ellers, og da står «Lever» som før. Regelen er nettets (`isBroModus`).
 */
export function bridgeHole(bundle: Pick<GameBundle, 'game' | 'segmentSibling'>): RoundHole | null {
  const sibling = bundle.segmentSibling ?? null;
  if (!sibling || !isBroModus(gameSegment(bundle.game), sibling)) return null;
  return { gameId: sibling.gameId, holeNumber: firstHoleForSegment('back9') };
}

/**
 * Lenka over til den andre halvdelen på hullene som grenser mot den: hull 10 fra
 * hull 9, og hull 9 fra hull 10. Samme regel som nettets `segmentSibling`-lenke
 * (`holeSegmentBridges.ts`). På hull 9 er den overflødig mens broen er
 * hovedknappen, og da svarer den `null`.
 */
export function boundaryLink(
  bundle: Pick<GameBundle, 'game' | 'segmentSibling'>,
  holeNumber: number,
): RoundHole | null {
  const sibling = bundle.segmentSibling;
  if (!sibling) return null;
  const segment = gameSegment(bundle.game);
  if (segment === 'front9' && holeNumber === lastHoleForSegment('front9') && !bridgeHole(bundle)) {
    return { gameId: sibling.gameId, holeNumber: firstHoleForSegment('back9') };
  }
  if (segment === 'back9' && holeNumber === firstHoleForSegment('back9')) {
    return { gameId: sibling.gameId, holeNumber: lastHoleForSegment('front9') };
  }
  return null;
}

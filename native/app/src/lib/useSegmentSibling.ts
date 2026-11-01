// #2752: den andre halvdelen av en delt cup-dag ligger klar på telefonen.
//
// Hentes bundelen for hull 9, hentes også bundelen og slagene for hull 10. Da
// virker broen uten nett, som resten av føringen. Hentingen er best-effort
// (`refreshCardBundle` kaster aldri): uten nett står det som alt ligger der.
//
// Egen fil, av samme grunn som `useScoreCatchUp`: `useGameData.ts` skal ikke dra
// inn `data/realtime` og `data/seedScores`.
import { useEffect, useState } from 'react';
import { loadCardBundle, refreshCardBundle } from '../data/homeHero';
import type { GameBundle } from '../data/gameBundle';
import { toRoster } from './roster';
import type { CardBundle } from '../data/homeHero';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { filledHolesForOwner, foldLocalScores, myTeamCaptainId } from './teamPlay';

/** Hullene med slag på kortet mitt i spillet, lest på samme måte som hullsiden. */
function myFilledHoles(card: CardBundle, userId: string): number[] {
  const roster = toRoster(card.bundle.players);
  const mode = card.bundle.game.gameMode as GameMode;
  const scores = foldLocalScores(card.scores, roster, mode);
  return filledHolesForOwner(scores, mode, userId, myTeamCaptainId(roster, userId));
}

/**
 * Henter den andre halvdelen til telefonen, én gang per skjerm.
 *
 * @returns hullene jeg har ført der, til hullstripa. Tom uten søsken.
 */
export function useSegmentSibling(bundle: GameBundle | null, userId: string): readonly number[] {
  const siblingId = bundle?.segmentSibling?.gameId ?? null;
  const [shown, setShown] = useState<{ id: string; filled: number[] } | null>(null);

  useEffect(() => {
    if (!siblingId) return;
    let cancelled = false;
    const read = async () => {
      const card = await loadCardBundle(siblingId);
      if (!cancelled && card) setShown({ id: siblingId, filled: myFilledHoles(card, userId) });
    };
    void read().then(() => refreshCardBundle(siblingId, { withScores: true })).then(read);
    return () => {
      cancelled = true;
    };
  }, [siblingId, userId]);

  return shown?.id === siblingId && shown ? shown.filled : [];
}

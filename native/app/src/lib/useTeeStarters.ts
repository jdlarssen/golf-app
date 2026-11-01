// #2751: utslagsvalgene fra den lokale basen, med den ene regelen for hvilket
// valg som gjelder. Samme mønster som `useTeamTeeShots`, uten realtime: tabellen
// står ikke i publikasjonen, så en makkers valg kommer med bundelen, som hentes
// på nytt ved hvert hullbytte.
//
// Feiler lesingen, står velgeren eller hintet som om telefonen ikke har noe. Et
// hint er ikke verdt en feilside.
import { useCallback, useEffect, useState } from 'react';
import { getDb, listTeeStartersForGame, type LocalTeeStarter } from '../data/db';
import type { BundleGame } from '../data/gameBundle';

/** Valget laget har på serveren, slik bundelen sist kjente det. */
export function bundleTeeStarterFor(
  game: Pick<
    BundleGame,
    'gameMode' | 'foursomesSide1TeeStarterUserId' | 'foursomesSide2TeeStarterUserId' | 'patsomeTeeStarters'
  >,
  teamNumber: number,
): string | null {
  if (game.gameMode === 'patsome') {
    return game.patsomeTeeStarters?.find((row) => row.teamNumber === teamNumber)?.teeStarterUserId ?? null;
  }
  // Kun foursomes har kolonnene. Greensome, chapman og gruesome deler
  // resultatform med den, men ikke utslagsrotasjonen, som på nettet.
  if (game.gameMode !== 'foursomes_matchplay') return null;
  if (teamNumber === 1) return game.foursomesSide1TeeStarterUserId;
  if (teamNumber === 2) return game.foursomesSide2TeeStarterUserId;
  return null;
}

/**
 * Bundelens valg først, så det lokale. Serverens valg vinner alltid når
 * telefonen kjenner det.
 */
export function effectiveTeeStarter(
  game: Parameters<typeof bundleTeeStarterFor>[0],
  local: readonly Pick<LocalTeeStarter, 'teamNumber' | 'teeStarterId'>[],
  teamNumber: number,
): string | null {
  return (
    bundleTeeStarterFor(game, teamNumber) ??
    local.find((row) => row.teamNumber === teamNumber)?.teeStarterId ??
    null
  );
}

export function useTeeStarters(
  gameId: string,
  opts: { enabled: boolean; pollMs?: number },
): { rows: LocalTeeStarter[]; reload: () => Promise<void> } {
  const { enabled, pollMs } = opts;
  const [rows, setRows] = useState<LocalTeeStarter[]>([]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setRows(await listTeeStartersForGame(await getDb(), gameId));
    } catch (err: unknown) {
      console.error('[useTeeStarters] lesing feilet', err);
    }
  }, [enabled, gameId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await listTeeStartersForGame(await getDb(), gameId);
        if (!cancelled) setRows(next);
      } catch (err: unknown) {
        if (!cancelled) console.error('[useTeeStarters] første lesing feilet', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, gameId]);

  useEffect(() => {
    if (!enabled || !pollMs) return;
    const interval = setInterval(() => {
      void reload();
    }, pollMs);
    return () => clearInterval(interval);
  }, [enabled, pollMs, reload]);

  return { rows, reload };
}

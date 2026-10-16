// #2580: lagenes utslag i ett spill, fra den lokale basen. Speil av
// `useLocalScores`: seeden, realtime og drainen skriver i SQLite fra utsiden av
// React (gjennom `useScoreCatchUp` med `reloadTeeShots`), og hooken leser basen
// på nytt når de er ferdige, ved `reload` og med en valgfri poll.
//
// Feil (#2228): feiler FØRSTE lesing, kastes feilen under render, så skjermens
// feilgrense viser «Prøv igjen». En tom liste ville sett ut som om ingen hadde
// valgt noe, og leveringen ville vist feil. En senere feil lar de siste radene
// stå og logges; `reload()` avviser aldri.
import { useCallback, useEffect, useState } from 'react';
import { getDb, listTeeShotsForGame, type LocalTeeShot } from '../data/db';

export function useTeamTeeShots(
  gameId: string,
  opts: {
    /** Bare spill med «Hvem sitt utslag» leser noe. */
    enabled: boolean;
    pollMs?: number;
  },
): { rows: LocalTeeShot[]; reload: () => Promise<void>; loaded: boolean } {
  const { enabled, pollMs } = opts;
  const [rows, setRows] = useState<LocalTeeShot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [firstReadFailure, setFirstReadFailure] = useState<{ error: unknown } | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setRows(await listTeeShotsForGame(await getDb(), gameId));
      setLoaded(true);
    } catch (err: unknown) {
      console.error('[useTeamTeeShots] lesing feilet', err);
    }
  }, [enabled, gameId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await listTeeShotsForGame(await getDb(), gameId);
        if (!cancelled) {
          setRows(next);
          setLoaded(true);
        }
      } catch (err: unknown) {
        if (!cancelled) setFirstReadFailure({ error: err });
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

  if (firstReadFailure) throw firstReadFailure.error;

  return { rows, reload, loaded };
}

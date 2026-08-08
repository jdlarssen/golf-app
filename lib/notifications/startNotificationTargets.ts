import type { HoleSegment } from '@/lib/scoring';

/**
 * Ett startet spill med troppen sin, slik varsel-fasen i cron-sweepen
 * (`/api/cron/start-scheduled-games`) ser det (#1450).
 */
export type StartedGameForNotify = {
  id: string;
  name: string;
  /** `null` for frittstående spill — de dedupes aldri mot noe. */
  tournamentId: string | null;
  holeSegment: HoleSegment;
  /** Satt for avledede cup-matcher (#1441 D3) — de varsler aldri selv. */
  sourceGameId: string | null;
  /** Aktive spillere (trukkede allerede filtrert bort av kalleren). */
  playerIds: string[];
};

/** Spillet ett sett spillere skal varsles om. */
export type StartNotificationTarget = {
  game: { id: string; name: string };
  playerIds: string[];
};

/**
 * front9 spilles før back9; `full` ligger imellom fordi et helrunde-spill
 * verken er «først» eller «sist» i en splittet dag.
 */
const SEGMENT_ORDER: Record<HoleSegment, number> = {
  front9: 0,
  full: 1,
  back9: 2,
};

/**
 * Velger hvilket spill hver spiller skal få `game_started` for, når flere
 * spill flippet til aktiv i SAMME cron-sweep (#1450).
 *
 * Bakgrunn: splittet cup-dag (#1441) gir fire spill per flight — greensome
 * (front9, host), best ball (back9, host) og to avledede singles (back9) —
 * alle med identisk `scheduled_tee_off_at` (`resolveScheduledTeeOffAt`). Hver
 * spiller står i tre av dem. Sweepen varslet per spill den vant flippen på, så
 * antall varsler per spiller (2–3) avhang av rekkefølgen `due`-spørringen
 * tilfeldigvis returnerte radene i — den har ingen `ORDER BY`. Dette er den
 * rene logikken som gjør resultatet rekkefølge-uavhengig.
 *
 * To regler:
 *
 *  1. **Avledede spill droppes.** Et spill med `sourceGameId` satt varsler
 *     aldri — verten eier varselet, og en avledet singles har alltid et
 *     delsett av vertens tropp. (Regelen håndheves også i
 *     `notifyPlayersGameStarted`, som er dens ene hjem; her sparer vi i
 *     tillegg de unødvendige tropp-oppslagene.)
 *  2. **Maks ett varsel per (spiller, cup).** Spill i samme `tournamentId`
 *     konkurrerer om spilleren; det først sorterte vinner. Spill UTEN
 *     `tournamentId` dedupes aldri mot noe — to urelaterte spill som
 *     tilfeldigvis starter samme minutt skal fortsatt gi hvert sitt varsel.
 *
 * Sorteringen er (segment-rang, `id` stigende): greensome (front9) vinner over
 * best ball (back9), og `id` er en deterministisk tie-break slik at to spill
 * med samme segment aldri lar spørrings-rekkefølgen avgjøre.
 *
 * `games` muteres ikke. Spill som ender uten spillere utelates helt.
 */
export function pickStartNotificationTargets(
  games: StartedGameForNotify[],
): StartNotificationTarget[] {
  const ordered = games
    .filter((g) => g.sourceGameId == null)
    .slice()
    .sort((a, b) => {
      const bySegment = SEGMENT_ORDER[a.holeSegment] - SEGMENT_ORDER[b.holeSegment];
      if (bySegment !== 0) return bySegment;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const claimed = new Set<string>();
  const targets: StartNotificationTarget[] = [];

  for (const game of ordered) {
    const playerIds: string[] = [];
    for (const playerId of game.playerIds) {
      if (game.tournamentId == null) {
        playerIds.push(playerId);
        continue;
      }
      const key = `${game.tournamentId}:${playerId}`;
      if (claimed.has(key)) continue;
      claimed.add(key);
      playerIds.push(playerId);
    }
    if (playerIds.length > 0) {
      targets.push({ game: { id: game.id, name: game.name }, playerIds });
    }
  }

  return targets;
}

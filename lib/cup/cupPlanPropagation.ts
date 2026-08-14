/**
 * Ren planlegger for #1523: hvilke allerede genererte cup-matcher som skal
 * arve Oppsett-rommets bane/tee/starttid når planen lagres på nytt, og hvilken
 * starttid hver av dem skal ha.
 *
 * Bakgrunn: `tournament_plans` ble kopiert ned på `games`-radene i ETT øyeblikk
 * — ved generering (`createCupMatchesFromPlan`). Endret arrangøren starttiden
 * etterpå, ble matchene stående med sin gamle (ofte NULL) tee-off, og
 * auto-start-maskineriet hadde ingenting å fyre på. Denne modulen gjenskaper
 * genereringens egen utregning fra de LAGREDE radene, slik at en propagert
 * match ender med nøyaktig de feltene en nygenerert match med samme plan ville
 * fått.
 *
 * Ingen I/O — kalleren (`saveCupPlan`) leser radene og skriver oppdateringene.
 */

import type { GameStatus } from '@/lib/games/status';
import { resolveScheduledTeeOffAt } from './splitDayLineup';

/** Én lagret cup-match, slik `saveCupPlan` leser den fra `games`. */
export type StoredCupMatch = {
  id: string;
  status: GameStatus;
  /** `games.source_game_id` — satt kun på splittet-cup-dagens avledede singles. */
  sourceGameId: string | null;
  /** `games.tournament_match_label`, f.eks. «Greensome 2». */
  matchLabel: string | null;
  /** `games.hole_segment` — 'full' | 'front9' | 'back9'. */
  holeSegment: string;
};

/** Feltene Oppsett-rommet nettopp lagret i `tournament_plans`. */
export type CupPlanValues = {
  courseId: string;
  teeBoxId: string;
  /** Cup-start (flight 1) som ISO, eller `null` når feltet står tomt. */
  scheduledTeeOffAt: string | null;
};

/** Én match som skal oppdateres, med de ferdig utregnede verdiene. */
export type CupMatchPlanUpdate = {
  gameId: string;
  courseId: string;
  teeBoxId: string;
  scheduledTeeOffAt: string | null;
};

/**
 * Speiler `isBundleMatch` i genereringen (generer/actions.ts), men mot lagrede
 * kolonner: en bunt-match har enten et delt-segment (`front9`/`back9`) eller en
 * kilde-match. Trygt som skille fordi `hole_segment` KUN skrives av
 * cup-genereringen — alt annet arver DB-defaulten `'full'`.
 */
function isBundleRow(match: StoredCupMatch): boolean {
  return match.holeSegment !== 'full' || match.sourceGameId !== null;
}

/**
 * Flight-nummeret fra en bunt-HOSTS label. Genereringen navngir hostene med en
 * per-format-teller som går én per flight (`Greensome 1`, `Best ball 1`,
 * `Greensome 2`, …), så tallet PÅ EN HOST er flight-nummeret.
 *
 * Gjelder bevisst ikke avledede singles: deres teller går to per flight
 * («Singel 3»/«Singel 4» ligger i flight 2), derfor arver de hostens tall i
 * stedet — se `buildFlightIndex`.
 *
 * `undefined` når labelen ikke ender på et tall (manipulert eller manuelt satt
 * rad): da brukes ren base-tid. Vi gjetter aldri en forskyvning.
 */
function flightIndexFromLabel(label: string | null): number | undefined {
  const m = /\s(\d+)$/.exec((label ?? '').trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/**
 * Gjenskaper `flightIndex` per lagret rad — argumentet genereringen ga
 * `resolveScheduledTeeOffAt`.
 *
 * Tre klasser, som i genereringen:
 *  - ikke-bunt (de tre eldre presetene) → `undefined`: de har ikke noe
 *    flight-konsept, og genereringen ga alle radene ren base-tid.
 *  - bunt-host → tallet i labelen.
 *  - avledet → hostens flight. Aldri sin egen label (feil teller), og
 *    `undefined` hvis hosten mangler i settet (kan ikke skje — FK-en krever
 *    den — men vi gjetter ikke).
 */
function buildFlightIndex(
  matches: StoredCupMatch[],
): Map<string, number | undefined> {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const flightIndexById = new Map<string, number | undefined>();

  for (const match of matches) {
    if (!isBundleRow(match)) {
      flightIndexById.set(match.id, undefined);
      continue;
    }
    if (match.sourceGameId === null) {
      flightIndexById.set(match.id, flightIndexFromLabel(match.matchLabel));
      continue;
    }
    // Avledet: hosten er alltid en host (ingenting peker på en avledet rad),
    // så ett oppslag holder — ingen kjede å følge.
    const host = byId.get(match.sourceGameId);
    flightIndexById.set(
      match.id,
      host ? flightIndexFromLabel(host.matchLabel) : undefined,
    );
  }

  return flightIndexById;
}

/**
 * Oppdateringene `saveCupPlan` skal skrive: én per match som ennå ikke er
 * startet. Rekkefølgen følger inputen (deterministisk, og dermed idempotent —
 * to like lagringer gir identisk sett).
 *
 * Matcher med status `active` eller `finished` er ALDRI med: planen er ikke
 * levende sannhet for en runde som er i gang eller ferdig. `draft` holdes også
 * utenfor (cup-generering lager kun `scheduled`-rader — en draft-rad her er
 * ikke vår).
 *
 * Tom liste ut betyr «ingenting å propagere» og er en ærlig no-op — det er
 * KALLEREN som avgjør at 0 oppdaterte rader på et ikke-tomt sett er en feil.
 */
export function planCupPlanPropagation(
  matches: StoredCupMatch[],
  plan: CupPlanValues,
): CupMatchPlanUpdate[] {
  const flightIndexById = buildFlightIndex(matches);

  return matches
    .filter((m) => m.status === 'scheduled')
    .map((m) => ({
      gameId: m.id,
      courseId: plan.courseId,
      teeBoxId: plan.teeBoxId,
      scheduledTeeOffAt: resolveScheduledTeeOffAt(
        plan.scheduledTeeOffAt ?? undefined,
        flightIndexById.get(m.id),
      ),
    }));
}

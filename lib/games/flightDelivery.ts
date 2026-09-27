import { modeCollapsesToTeamCard, type GameMode } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring/holeSegment';
import { canApproveScorecardFor, type FlightPlayer } from './flightScope';
import { ownedScoresByPlayer } from './filledHoles';
import { holeCountForSegment } from './holeScope';

// Levering for flighten (#2200): den som fører slagene, kan levere kortene til
// makkerne sammen med sitt eget. Målt i prod 2026-09-25: 60 % av slagene
// tastes av en medspiller, og 16 av 18 som aldri leverte, hadde ikke tastet
// ett slag selv. Leveringen var per spiller, føringen var per flight.
//
// Dette er det ENE hjemmet for «hvem kan jeg levere for» (AGENTS trap 4).
// Server-kjernen (`submitScorecardCore`), lever-siden, spillsiden og appen
// kaller alle denne funksjonen. Ingen `server-only`, så appen importerer den
// som resten av de delte reglene.
//
// Regelen tilbyr noe, den er ingen sikkerhetsgrense. I basen er det fortsatt
// `can_score_for` (0106-policyen) som bestemmer hvem som kan sette
// `submitted_at` på en makkers rad, og arrangøren kan gjenåpne et kort.

/** Rosterraden regelen leser. Kallstedet mapper ned fra sin egen form. */
export type DeliveryPlayer = FlightPlayer & {
  team_number: number | null;
  submitted_at: string | null;
  /** `users.is_guest` (#1009): en gjest kan ikke logge inn og levere selv. */
  is_guest: boolean;
};

/** En `scores`-rad, snake_case som PostgREST gir den. */
export type DeliveryScore = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
  entered_by: string | null;
};

export type DeliveryGame = {
  game_mode: GameMode;
  hole_segment: HoleSegment;
  source_game_id: string | null;
};

/**
 * Bruker-id-ene til kortene `actorId` kan levere i tillegg til sitt eget, i
 * roster-rekkefølge. Tom liste når det ikke er noen.
 *
 * 1. **Formatet.** Ingen i format der laget fører én ball (scramble-familien,
 *    alternate-shot og patsome): lagkaskaden (#1453) leverer dem allerede. Heller
 *    ingen i en halv split-cup-runde eller et avledet spill (#1441, #1466).
 * 2. **Flighten.** Kandidaten er aktiv, ikke levert, og aktøren kan føre for
 *    hen (`canApproveScorecardFor`, TS-tvillingen til `can_score_for`).
 *    Aktøren må selv være aktiv. Eget kort kan være levert allerede.
 * 3. **Fullt kort.** Hvert hull har slag, talt som `filledHolesByPlayer`.
 * 4. **Den som fører.** For en vanlig spiller må aktøren ha tastet hvert hull.
 *    En gjest kan aldri levere selv, og to kan ha delt kortet, så der holder
 *    det at kortet er fullt.
 */
export function flightDeliveryCandidates(
  actorId: string,
  input: {
    players: readonly DeliveryPlayer[];
    scores: readonly DeliveryScore[];
    game: DeliveryGame;
  },
): string[] {
  const { players, game } = input;
  const mode = game.game_mode;

  if (modeCollapsesToTeamCard(mode, 18)) return [];
  if (game.hole_segment !== 'full') return [];
  if (game.source_game_id != null) return [];

  const actor = players.find((p) => p.user_id === actorId);
  if (!actor || actor.withdrawn_at != null) return [];

  const holeCount = holeCountForSegment(game.hole_segment);
  const owned = ownedScoresByPlayer({
    players,
    scores: input.scores.filter((s) => s.strokes != null),
    mode,
  });
  const flight = [...players];

  return players
    .filter((p) => {
      if (p.user_id === actorId) return false;
      if (p.withdrawn_at != null || p.submitted_at != null) return false;
      if (!canApproveScorecardFor(flight, mode, actorId, p.user_id)) return false;

      const rows = owned.get(p.user_id) ?? [];
      if (rows.length < holeCount) return false;
      if (p.is_guest) return true;
      return rows.every((row) => row.entered_by === actorId);
    })
    .map((p) => p.user_id);
}

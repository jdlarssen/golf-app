import 'server-only';
import type { InitialValues } from '@/app/[locale]/admin/games/new/GameForm';
import {
  buildEditInitialValues,
  type EditGameRow,
  type EditGamePlayerRow,
} from '@/lib/games/editGameInitialValues';

/**
 * #1007 — «Revansje»-knappen. Bygger prefill-`InitialValues` for opprett-
 * veiviseren fra et AVSLUTTET, frittstående spill (ikke cup/liga — den
 * gaten håndheves av kalleren, `/opprett-spill/page.tsx`, siden den krever
 * `tournament_id`/`league_round_id` som ikke er del av denne radens shape).
 *
 * Gjenbruker `buildEditInitialValues`-maskineriet (samme mode_config-uttrekk,
 * samme kategori-narrowing) i stedet for å duplisere den logikken — minst
 * test-churn ved fremtidige mode_config-endringer, siden begge flytene da
 * forblir i synk automatisk. Avvikene fra en vanlig edit-prefill (per
 * kontrakt #1007):
 *
 *  - `name` utelates — et prefilt navn setter `nameTouched` i wizarden og
 *    dreper auto-navngivingen fra bane + dato (GameWizard.tsx:193–196).
 *  - `scheduled_tee_off_at` utelates — datoen er brukerens valg; #902-guarden
 *    mot fortid gjelder uansett når de setter en ny dato.
 *  - `lock_game_mode` tvinges til `false` — buildEditInitialValues setter
 *    `true` for alt som ikke er draft (kilden er alltid 'finished' her), men
 *    revansje er et FORSLAG, ikke en lås.
 *  - Withdrawn spillere (`withdrawn_at != null`) filtreres bort før mapping.
 *  - Wolf/Round Robin (#969: rotasjons-slots trekkes ved spillstart) nuller
 *    team/flight for alle spillere — re-trekkes ved neste publish.
 */

export type RevansjeGameRow = EditGameRow;

export type RevansjePlayerRow = EditGamePlayerRow & {
  /** WD/«trekk spiller» (#386). Non-null rader filtreres bort før mapping. */
  withdrawn_at: string | null;
};

const NO_ROTATION_MODES = new Set(['wolf', 'round_robin']);

export function buildRevansjeInitialValues(
  game: RevansjeGameRow,
  playerRows: RevansjePlayerRow[],
): InitialValues {
  const activePlayers = playerRows.filter((p) => p.withdrawn_at === null);

  const base = buildEditInitialValues(game, activePlayers);

  const { name: _name, scheduled_tee_off_at: _teeOff, ...withoutNameAndTeeOff } =
    base;

  const nullRotationSlots = NO_ROTATION_MODES.has(game.game_mode);

  return {
    ...withoutNameAndTeeOff,
    lock_game_mode: false,
    players: withoutNameAndTeeOff.players?.map((p) =>
      nullRotationSlots
        ? { ...p, team_number: null, flight_number: null }
        : p,
    ),
  };
}

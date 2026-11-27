import 'server-only';
import type { InitialValues } from '@/app/[locale]/admin/games/new/GameForm';
import {
  buildEditInitialValues,
  type EditGameRow,
  type EditGamePlayerRow,
} from '@/lib/games/editGameInitialValues';
import { NO_ROTATION_MODES } from '@/lib/games/assignRotationSlots';
import { defaultTeamHandicapPct, type FormatTeamSize } from '@/lib/games/formatSetupDefaults';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

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
 *  - `repeat_weekly` utelates (#2460): en revansje er en enkeltrunde, og
 *    arrangøren slår på gjentakelsen selv på «Klar?».
 *  - `lock_game_mode` tvinges til `false` — buildEditInitialValues setter
 *    `true` for alt som ikke er draft (kilden er alltid 'finished' her), men
 *    revansje er et FORSLAG, ikke en lås.
 *  - Withdrawn spillere (`withdrawn_at != null`) filtreres bort før mapping.
 *  - Wolf/Round Robin (#969: rotasjons-slots trekkes ved spillstart) nuller
 *    team/flight for alle spillere — re-trekkes ved neste publish.
 *  - #3002: revansjen er et NYTT spill, så den starter på de nye reglene. Et
 *    kildespill fra før #3002 har ingen regel og ingen patsome-andel (edit-
 *    prefillen leser det som `null`, «behold den gamle regelen»), og det skal
 *    ikke følge med: se `newGameHandicapChoices`.
 */

export type RevansjeGameRow = EditGameRow;

export type RevansjePlayerRow = EditGamePlayerRow & {
  /** WD/«trekk spiller» (#386). Non-null rader filtreres bort før mapping. */
  withdrawn_at: string | null;
};

/**
 * #3002: the handicap choices a rematch starts on. A source game with a rule
 * or a patsome share passes it on. One from before #3002 (`null`) does not:
 * - scramble on the format's old start share → no rule, so the wizard starts
 *   on the format's rule (`defaultTeamHandicapRule`: NGF's weighting for Texas
 *   and Florida, the Ambrose formula for Ambrose);
 * - scramble on gross (0) or the organiser's own share → `'pct'`, so the
 *   rematch keeps that choice as «Egen prosent»;
 * - patsome → no share, so it starts on 85.
 */
function newGameHandicapChoices(
  config: GameModeConfig,
  values: InitialValues,
): InitialValues {
  const next: InitialValues = { ...values };
  if (next.team_handicap_rule === null) {
    delete next.team_handicap_rule;
    if (
      config.kind === 'texas_scramble' ||
      config.kind === 'ambrose' ||
      config.kind === 'florida_scramble'
    ) {
      // A row without a share (old data, #2566) also starts on the new rule.
      const pct: unknown = config.team_handicap_pct;
      const start = defaultTeamHandicapPct(config.kind, config.team_size as FormatTeamSize);
      const onOldStart =
        typeof pct !== 'number' || (start !== null && Math.abs(pct - start) < 0.01);
      if (!onOldStart) next.team_handicap_rule = 'pct';
    }
  }
  if (next.patsome_fourball_allowance_pct === null) delete next.patsome_fourball_allowance_pct;
  return next;
}

export function buildRevansjeInitialValues(
  game: RevansjeGameRow,
  playerRows: RevansjePlayerRow[],
): InitialValues {
  const activePlayers = playerRows.filter((p) => p.withdrawn_at === null);

  const base = buildEditInitialValues(game, activePlayers);

  const {
    name: _name,
    scheduled_tee_off_at: _teeOff,
    repeat_weekly: _repeat,
    repeat_weekly_linked: _repeatLinked,
    ...withoutNameAndTeeOff
  } = base;

  const nullRotationSlots = NO_ROTATION_MODES.has(game.game_mode);

  return {
    ...newGameHandicapChoices(game.mode_config, withoutNameAndTeeOff),
    lock_game_mode: false,
    players: withoutNameAndTeeOff.players?.map((p) =>
      nullRotationSlots
        ? { ...p, team_number: null, flight_number: null }
        : p,
    ),
  };
}

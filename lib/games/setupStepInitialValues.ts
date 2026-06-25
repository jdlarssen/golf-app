/**
 * Pure mapping helper for the setup-step formats (Wolf, Nassau, Skins,
 * Nines, Shamble). Takes a GameModeConfig from the DB and returns the
 * subset of GameForm InitialValues fields that correspond to that config.
 *
 * Returns `{}` for any config kind that does not have a setup-step section
 * (best_ball, stableford, texas_scramble, matchplay variants, etc.).
 *
 * Used by the edit page (`app/admin/games/[id]/edit/page.tsx`) to
 * pre-populate `initialValues` so that `useGameFormState` can read the
 * stored config and render the correct state in `GameForm`.
 *
 * Intentionally server-safe (no 'use client' imports). Return type is
 * structural — does not import `InitialValues` from the 'use client'
 * GameForm module.
 */
import type { GameModeConfig } from '@/lib/scoring/modes/types';

export type SetupStepInitialValues = {
  wolf_scoring?: 'gross' | 'net';
  nassau_scoring?: 'gross' | 'net';
  skins_scoring?: 'gross' | 'net';
  nines_variant?: 'nines' | 'split_sixes';
  nines_scoring?: 'gross' | 'net';
  shamble_variant?: 'shamble' | 'champagne';
  shamble_count?: 1 | 2 | 3;
  shamble_scoring?: 'gross' | 'net';
  /** Shamble team_size — 3 or 4 players per team. */
  team_size?: 3 | 4;
  /** #937: kr per enhet for veddemålsformatene — må restaureres ved edit. */
  kr_per_unit?: number;
};

/**
 * Maps a `GameModeConfig` to the setup-step `InitialValues` fields needed
 * by `useGameFormState` / `GameForm`.
 *
 * For the five setup-step formats (wolf/nassau/skins/nines/shamble):
 *   - Returns all persisted config fields so `useGameFormState` can restore
 *     the admin's previous choices instead of falling back to defaults.
 *
 * For all other formats: returns `{}` (no-op spread).
 */
export function buildSetupStepInitialValues(
  modeConfig: GameModeConfig,
): SetupStepInitialValues {
  switch (modeConfig.kind) {
    case 'wolf':
      return {
        wolf_scoring: modeConfig.wolf_scoring,
        kr_per_unit: modeConfig.kr_per_unit,
      };

    case 'nassau':
      return {
        nassau_scoring: modeConfig.nassau_scoring,
        kr_per_unit: modeConfig.kr_per_unit,
      };

    case 'skins':
      return {
        skins_scoring: modeConfig.skins_scoring,
        kr_per_unit: modeConfig.kr_per_unit,
      };

    // #937: BBB har ingen scoring-toggle, men nå et kr-felt som må restaureres.
    case 'bingo_bango_bongo':
      return { kr_per_unit: modeConfig.kr_per_unit };

    // #937: Acey-Deucey kr-felt må restaureres. (acey_deucey_scoring restaureres
    // bevisst IKKE — #322-avgjørelse, egen test låser {} uten kr.)
    case 'acey_deucey':
      return { kr_per_unit: modeConfig.kr_per_unit };

    case 'nines':
      return {
        nines_variant: modeConfig.nines_variant,
        nines_scoring: modeConfig.nines_scoring,
        kr_per_unit: modeConfig.kr_per_unit,
      };

    case 'shamble':
      return {
        team_size: modeConfig.team_size,
        shamble_variant: modeConfig.shamble_variant,
        shamble_count: modeConfig.shamble_count,
        shamble_scoring: modeConfig.shamble_scoring,
      };

    default:
      return {};
  }
}

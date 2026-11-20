// Why the database refused a wolf choice, as a code the screens have copy for.
//
// One home, read by the web's `setWolfChoice` action and the app's
// `data/choices.ts`. The guard on `wolf_hole_choices` (migration 0249) refuses
// with Postgres code 42501 and a stable message; anything else (no network, a
// timeout, a server error) is not a refusal, and the answer to it is «prøv
// igjen», not «du har ikke lov».
//
// Import-free, so Metro can bundle it. `wolfChoiceRefusal.test.ts` holds the
// messages below to the ones the migration raises.

/** PostgreSQL «insufficient_privilege»: the guard or the policy said no. */
const REFUSED_CODE = '42501';

export type WolfChoiceRefusal =
  /** The caller is not the wolf on this hole (or not in the game at all). */
  | 'not_wolf_on_hole'
  /** The round is not in progress: not started yet, or finished. */
  | 'game_not_active'
  /** The partner does not play in this game. */
  | 'partner_not_in_game'
  /** Another player's choice is already saved on this hole. */
  | 'hole_taken'
  /** Refused, with a reason no screen can cause. */
  | 'rls_denied'
  /** Not a refusal: the write never got an answer, or the server failed. */
  | 'save_failed';

/** The guard's message → the code the screens translate. */
export const WOLF_CHOICE_DB_REFUSALS: Readonly<Record<string, WolfChoiceRefusal>> = {
  wolf_choice_not_your_hole: 'not_wolf_on_hole',
  wolf_choice_not_in_game: 'not_wolf_on_hole',
  wolf_choice_game_not_active: 'game_not_active',
  wolf_choice_partner_not_in_game: 'partner_not_in_game',
  wolf_choice_hole_taken: 'hole_taken',
};

export function wolfChoiceRefusal(error: {
  code?: string | null;
  message?: string | null;
}): WolfChoiceRefusal {
  if (error.code !== REFUSED_CODE) return 'save_failed';
  return WOLF_CHOICE_DB_REFUSALS[error.message ?? ''] ?? 'rls_denied';
}

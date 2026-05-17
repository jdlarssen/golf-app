/**
 * Shared error-message maps for admin/games pages.
 *
 * ## Two maps, not one
 *
 * There is an intentional copy difference between the "new game" flow and the
 * "game detail" flow for the `pending_players` error:
 *
 *   - `ERROR_MESSAGES_NEW_GAME` (used by `app/admin/games/new/page.tsx` and
 *     `app/admin/games/[id]/edit/page.tsx`): says **«kan publiseres»** because
 *     the action in both these pages leads to a publish/schedule transition.
 *
 *   - `ERROR_MESSAGES_EXISTING_GAME` (used by `app/admin/games/[id]/page.tsx`):
 *     says **«kan startes»** because the action there leads to actually starting
 *     an already-scheduled game, not publishing it for the first time.
 *
 * Do NOT unify these two maps — the wording difference is load-bearing UX copy.
 *
 * ## Two `db_players`-family keys
 *
 * `db_roster` and `db_players` describe different failure modes:
 *
 *   - `db_roster` — the server failed while **reading** the player/roster list
 *     from the database (e.g. the guard query that checks for pending profiles
 *     before a publish/start operation). No data was written.
 *
 *   - `db_players` — the server failed while **writing** game_players rows
 *     (INSERT on creation, DELETE+INSERT on edit, UPDATE on approval/reopen).
 *     The game row itself may already exist.
 *
 * Always emit `?error=db_roster` from server actions that fail on a read query,
 * and `?error=db_players` from actions that fail on a write query.
 */

/** Error messages for the "create new game" page and the "edit game" page. */
export const ERROR_MESSAGES_NEW_GAME: Record<string, string> = {
  name_required: 'Spillet må ha et navn.',
  course_required: 'Velg en bane.',
  tee_required: 'Velg en tee-boks.',
  bad_allowance: 'HCP-allowance må være et helt tall mellom 0 og 100.',
  players_required: 'Du må velge nøyaktig 8 spillere.',
  duplicate_player: 'Samme spiller kan ikke velges flere ganger.',
  bad_team: 'Hver spiller må tilhøre et lag (1–4).',
  bad_flight: 'Hver spiller må tilhøre en flight (1–4).',
  team_balance: 'Hvert lag må ha nøyaktig 2 spillere.',
  bad_side_ld_count: 'Antall longest-drive-vinnere må være 0, 1 eller 2.',
  bad_side_ctp_count: 'Antall closest-to-pin-vinnere må være 0, 1 eller 2.',
  bad_ladies_tee:
    'Dame-tee må tilhøre samme bane og være merket som dame-tee.',
  /**
   * The new-game page originally said «ved publisering» while the edit page
   * said just «er påkrevd». The shared copy uses the broader form so it reads
   * correctly for both the publish-from-new and the update-scheduled paths.
   */
  tee_off_required: 'Tee-off-tidspunkt er påkrevd.',
  db_game:
    'Klarte ikke å lagre spillet. Prøv igjen, eller sjekk Supabase-loggene.',
  db_users: 'Klarte ikke å lese spillere fra databasen. Prøv igjen.',
  db_tee: 'Klarte ikke å lese tee-boksen fra databasen. Prøv igjen.',
  db_roster: 'Klarte ikke å lese spillerlisten fra databasen.',
  db_players:
    'Klarte ikke å lagre spillerne på spillet. Prøv igjen, eller sjekk Supabase-loggene.',
  not_editable:
    'Spillet kan ikke redigeres lenger — det er allerede startet eller avsluttet.',
  /**
   * NOTE: «kan publiseres» — used on both new-game and edit-game flows because
   * both lead to a publish/schedule transition. Compare `ERROR_MESSAGES_EXISTING_GAME`
   * which uses «kan startes» for the already-scheduled-game start transition.
   */
  pending_players:
    'Disse spillerne har ikke fullført registreringen ennå{LIST}. De må logge inn og fylle inn navn + HCP før spillet kan publiseres.',
};

/**
 * Error messages for the "game detail" page (`app/admin/games/[id]/page.tsx`).
 * This page handles actions on already-existing games (start, end, approve,
 * reopen) — hence the slightly different wording for some keys.
 */
export const ERROR_MESSAGES_EXISTING_GAME: Record<string, string> = {
  not_found: 'Spillet ble ikke funnet.',
  not_draft: 'Bare utkast kan startes.',
  not_scheduled: 'Spillet kan ikke startes (det er ikke planlagt).',
  not_active: 'Spillet er ikke aktivt — kan ikke avsluttes.',
  not_editable:
    'Spillet kan ikke redigeres lenger — det er allerede startet eller avsluttet.',
  no_players: 'Ingen spillere på dette spillet.',
  not_all_submitted:
    'Alle spillere må ha levert scorekort før spillet kan avsluttes.',
  not_all_approved:
    'Alle scorekort må være godkjent før spillet kan avsluttes.',
  db_finish: 'Klarte ikke å avslutte spillet. Prøv igjen.',
  db_tee: 'Klarte ikke å lese tee-boksen fra databasen. Prøv igjen.',
  tee_missing: 'Tee-box mangler — kan ikke beregne handicap.',
  db_roster: 'Klarte ikke å lese spillerlisten fra databasen.',
  db_players: 'Klarte ikke å oppdatere spillerne. Prøv igjen.',
  db_game: 'Klarte ikke å oppdatere spillet. Prøv igjen.',
  not_finished: 'Spillet er ikke avsluttet — kan ikke gjenåpnes.',
  /**
   * NOTE: «kan startes» — used on the game detail page where the admin starts
   * an already-scheduled game. Compare `ERROR_MESSAGES_NEW_GAME` which uses
   * «kan publiseres» for the new-game / edit-game publish transition.
   */
  pending_players:
    'Disse spillerne har ikke fullført registreringen ennå{LIST}. De må logge inn og fylle inn navn + HCP før spillet kan startes.',
};

/**
 * Resolves an error code (from a `?error=` search param) to a human-readable
 * Norwegian message. Returns `undefined` if the code is absent or unknown.
 *
 * The `{LIST}` placeholder in `pending_players` is replaced with a
 * colon-prefixed comma-separated email list when `emails` is provided.
 */
export function buildErrorMessage(
  messages: Record<string, string>,
  errorCode: string | undefined,
  emails: string | undefined,
): string | undefined {
  if (!errorCode) return undefined;
  const base = messages[errorCode];
  if (!base) return undefined;
  if (errorCode === 'pending_players') {
    return base.replace('{LIST}', emails ? `: ${emails}` : '');
  }
  return base;
}

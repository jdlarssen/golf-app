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
  tee_missing_rating:
    'Den valgte teen mangler rating for en spillers kjønn (M/D/J). Sjekk bane-administrasjon eller endre spillerens tee-kjønn.',
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
    'Spillet kan ikke redigeres lenger fordi det allerede er startet eller avsluttet.',
  // Epic #41 — mode-spesifikke feilkoder. Uten disse rendres en tom Banner
  // når admin trigger en av error-kodene fra payload-validatoren eller
  // edit-action-mode-lock-guarden.
  mode_required:
    'Du må velge en spillmodus før du kan publisere spillet.',
  unsupported_mode_size_combo:
    'Den valgte lagstørrelsen er ikke støttet for denne spillmodusen ennå.',
  min_players_for_mode:
    'Du må velge minst én spiller for å publisere spillet.',
  // Epic #45 — matchplay krever EKSAKT 2 spillere. Egen kode (ikke gjenbruk
  // av `team_balance`) for å gi en tydeligere norsk feilmelding når admin
  // har valgt for mange spillere i singles matchplay-flyten.
  too_many_players_for_mode:
    'Singles matchplay krever nøyaktig 2 spillere. Fjern de overflødige før du publiserer.',
  mode_locked_after_publish:
    'Spillmodus kan ikke endres etter at spillet er publisert. Slett spillet og opprett et nytt hvis du vil bytte modus.',
  // F2 (#272): server-action-validering mot formats-tabellen. Trigges hvis
  // game_mode-slugen i form-en ikke finnes eller er deaktivert. Erstatter
  // den droppede games_mode_check-DB-constraint.
  invalid_game_mode:
    'Den valgte spillmodusen er ikke tilgjengelig. Velg en annen modus og prøv igjen.',
  // F2 (#272): Cup-creation-form (CupSetup i wizard step 2) bouncer
  // validerings-feil tilbake til wizarden. Cup-prefiksede koder unngår
  // kollisjon med game-spesifikke koder.
  cup_name: 'Cup-navnet må være mellom 1 og 80 tegn.',
  cup_team_1: 'Navn på lag 1 må være mellom 1 og 40 tegn.',
  cup_team_2: 'Navn på lag 2 må være mellom 1 og 40 tegn.',
  cup_team_dup: 'Lagene må ha forskjellige navn.',
  cup_points: 'Point-målet må være et positivt tall (typisk 4,5 for 8 matches).',
  cup_allowance: 'Allowance må være mellom 0 og 100.',
  cup_insert_failed:
    'Klarte ikke å opprette cupen. Prøv igjen, eller sjekk Vercel-loggene.',
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
  not_active: 'Spillet er ikke aktivt og kan ikke avsluttes.',
  not_editable:
    'Spillet kan ikke redigeres lenger fordi det allerede er startet eller avsluttet.',
  no_players: 'Ingen spillere på dette spillet.',
  not_all_submitted:
    'Alle spillere må ha levert scorekort før spillet kan avsluttes.',
  not_all_approved:
    'Alle scorekort må være godkjent før spillet kan avsluttes.',
  db_finish: 'Klarte ikke å avslutte spillet. Prøv igjen.',
  db_tee: 'Klarte ikke å lese tee-boksen fra databasen. Prøv igjen.',
  tee_missing: 'Tee-box mangler. Kan ikke beregne handicap.',
  tee_missing_rating:
    'Den valgte teen mangler rating for en spillers kjønn (M/D/J). Sjekk bane-administrasjon eller endre spillerens tee-kjønn.',
  db_roster: 'Klarte ikke å lese spillerlisten fra databasen.',
  db_players: 'Klarte ikke å oppdatere spillerne. Prøv igjen.',
  db_game: 'Klarte ikke å oppdatere spillet. Prøv igjen.',
  not_finished: 'Spillet er ikke avsluttet og kan ikke gjenåpnes.',
  /**
   * NOTE: «kan startes» — used on the game detail page where the admin starts
   * an already-scheduled game. Compare `ERROR_MESSAGES_NEW_GAME` which uses
   * «kan publiseres» for the new-game / edit-game publish transition.
   */
  pending_players:
    'Disse spillerne har ikke fullført registreringen ennå{LIST}. De må logge inn og fylle inn navn + HCP før spillet kan startes.',
  // #544: matchplay åpen påmelding — ufullstendige sider ved tee-tid.
  incomplete_sides:
    'En eller begge sider mangler spillere. Alle spillere må ha en side og begge sider må være fulltallige før spillet kan startes.',
  // #543: store solo-spill (>4 aktive) krever flight-inndeling før start.
  unassigned_flights:
    'Spillerne er ikke fordelt i flighter ennå. Del inn flightene før spillet kan startes.',
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

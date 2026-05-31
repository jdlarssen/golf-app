/**
 * Canonical label for the single «create game» entry point, used across every
 * surface that opens the intent-first wizard (home empty-state + non-empty,
 * the game-list action, and the trusted-creator variant). One door, one label
 * — see #346 and the «én vei til rom»-umbrella #344. Keeping it in one place
 * stops the three historical variants («Opprett en turnering» / «+ Nytt» /
 * «Sett opp ny runde») from creeping back in.
 *
 * The wizard creates Kompis/Klubb/Cup/Solo — «spill» is the umbrella word
 * (a cup is picked inside the wizard's intent step), and it matches the admin
 * surface's dominant vocabulary («Spill»-lista, status per spill).
 */
export const CREATE_GAME_LABEL = 'Opprett spill';

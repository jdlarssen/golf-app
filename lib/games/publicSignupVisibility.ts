import type { ShortIdGame } from './getGameByShortId';

/**
 * Én regel, ett hjem (#1022): avgjør om et spill får en offentlig
 * påmeldings-flate (landingsside, OG-bilde, plakat) for uinnloggede.
 *
 * Offentlig = publisert og faktisk åpent for påmelding:
 *   - status 'scheduled' (draft er upublisert; active/finished er i gang/ferdig)
 *   - registration_mode 'open' eller 'manual_approval' (invite_only er privat
 *     og skal aldri eksponere spilldata uten innlogging)
 *   - signups_closed_at ikke satt (#543 — arrangøren har ikke stengt manuelt)
 *
 * Alt annet beholder dagens oppførsel for uinnloggede: redirect til /login
 * med next-param (#559 — aldri 404 på en lenke som kan være gyldig etter
 * innlogging).
 */
export type PublicSignupVisibilityInput = Pick<
  ShortIdGame,
  'status' | 'registration_mode' | 'signups_closed_at'
>;

/**
 * The signup window (#2276): published and not closed by the organiser. The
 * rule both discovery lists read — logged out (`getPublicDiscoverableGames`)
 * and logged in (`getDiscoverableGames`). Club games use this alone, since
 * membership stands in for the invitation on `invite_only`; every other list
 * goes through `isPubliclyViewable`, which adds the registration mode.
 */
export function isSignupWindowOpen(
  game: Pick<PublicSignupVisibilityInput, 'status' | 'signups_closed_at'>,
): boolean {
  return game.status === 'scheduled' && game.signups_closed_at == null;
}

export function isPubliclyViewable(game: PublicSignupVisibilityInput): boolean {
  return (
    isSignupWindowOpen(game) &&
    (game.registration_mode === 'open' || game.registration_mode === 'manual_approval')
  );
}

/**
 * Mapper `?src=`-query-parameteren til `game_players.signup_source`-verdien.
 * Allowlist-basert: ukjente verdier (og gjentatte params, som Next leverer
 * som array) droppes stille til null — attribusjon er best-effort og skal
 * aldri blokkere en påmelding.
 */
export function signupSourceFromParam(
  src: string | string[] | undefined,
): 'public_page' | 'poster' | null {
  if (src === 'public') return 'public_page';
  if (src === 'plakat') return 'poster';
  return null;
}

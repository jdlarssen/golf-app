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

export function isPubliclyViewable(game: PublicSignupVisibilityInput): boolean {
  return (
    game.status === 'scheduled' &&
    (game.registration_mode === 'open' || game.registration_mode === 'manual_approval') &&
    game.signups_closed_at == null
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

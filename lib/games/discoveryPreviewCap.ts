/**
 * Totaltak for Hjems funn-forhåndsvisning (#1798, kontrakt #1069 K7 —
 * eier-godkjent reversering av #879/PR #901 sitt 3-per-liste-tak).
 *
 * Ett samlet tak på tvers av de passive listene, grådig fylt i kuratert
 * rekkefølge klubb > venner > åpne (IKKE nærmeste tee-off). Egne ventende
 * forespørsler er spillerens egen handling og kappes aldri — de holdes
 * utenfor denne funksjonen.
 */

export const DISCOVERY_PREVIEW_TOTAL_CAP = 3;

export function capDiscoveryPreview<
  Club,
  Friend,
  Open,
>(data: {
  clubGames: Club[];
  friendGames: Friend[];
  openGames: Open[];
}): { clubGames: Club[]; friendGames: Friend[]; openGames: Open[] } {
  const clubGames = data.clubGames.slice(0, DISCOVERY_PREVIEW_TOTAL_CAP);
  const friendGames = data.friendGames.slice(
    0,
    DISCOVERY_PREVIEW_TOTAL_CAP - clubGames.length,
  );
  const openGames = data.openGames.slice(
    0,
    DISCOVERY_PREVIEW_TOTAL_CAP - clubGames.length - friendGames.length,
  );
  return { clubGames, friendGames, openGames };
}

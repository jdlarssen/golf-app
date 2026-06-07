/**
 * #463 — «Ikke bekreftet»: bestemmer `accepted_at` for en ny
 * `game_players`- eller `league_players`-rad ut fra HVEM som lager raden.
 *
 * Kjerneprinsipp: `accepted_at = now()` når raden lages av/for brukeren selv
 * gjennom deres egen handling (selv-påmelding, OTP-aksept, oppretters egen
 * rad); `accepted_at = null` (pending) når en arrangør lager den for noen
 * andre. En `null` gir kun en «Ikke bekreftet»-badge + et dytt-varsel —
 * spilleren er fullt med, scorene teller.
 *
 * Single source of truth for alle innsettings-stedene, så regelen ikke
 * driver fra hverandre per call-site.
 */
export function acceptedAtForActor(
  actingUserId: string,
  rowUserId: string,
  nowIso: string = new Date().toISOString(),
): string | null {
  return actingUserId === rowUserId ? nowIso : null;
}

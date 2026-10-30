/**
 * #2688: the name of a league flight game, «Vinterliga 2026-2027 – Runde 1».
 * The round label is what tells two flights apart, so a long league name gives
 * way to it: the league name is cut with an ellipsis and the label always
 * stays. Pure; imports nothing.
 */
export function leagueFlightName(leagueName: string, roundLabel: string, max: number): string {
  const label = roundLabel.trim();
  const league = leagueName.trim();
  if (label === '') return league.slice(0, max);
  const suffix = ` – ${label}`;
  if (league.length + suffix.length <= max) return `${league}${suffix}`;
  const room = max - suffix.length;
  // No room for even a short league name: keep the end of the label's name out
  // of the cut, and let the label itself be cut as the last resort.
  if (room < 2) return `${league}${suffix}`.slice(0, max);
  return `${league.slice(0, room - 1).trimEnd()}…${suffix}`;
}

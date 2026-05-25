/**
 * Velger lag-kaptein deterministisk: lexicographically minste userId.
 *
 * Stabil på tvers av sessions: gitt samme medlems-set returnerer alltid
 * samme kaptein, uavhengig av rekkefølge i input-arrayen.
 *
 * Brukt av:
 *  - Texas scramble-scoring: kapteinens userId eier scores-radene i DB.
 *  - Scorekort-flaten: non-captain-medlemmer må slå opp captain-userId
 *    for å hente lagets delte score.
 */
export function pickTeamCaptain(userIds: readonly string[]): string {
  if (userIds.length === 0) {
    throw new Error('pickTeamCaptain: empty team');
  }
  let captain = userIds[0];
  for (let i = 1; i < userIds.length; i++) {
    if (userIds[i] < captain) {
      captain = userIds[i];
    }
  }
  return captain;
}

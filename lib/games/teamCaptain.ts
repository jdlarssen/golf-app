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

/** Minste form et lag-medlem må ha for at vi kan peke ut rad-eieren. */
export type TeamMemberRow = {
  user_id: string;
  withdrawn_at: string | null;
};

/**
 * Hvem eier lagets delte scores-rader — kalt med rå `game_players`-rader
 * (#1538). Samme lex-min-regel som `pickTeamCaptain`, men tilpasset kallere
 * som holder hele rader og ikke kan garantere at lista er ikke-tom:
 *
 *  - withdrawn medlemmer filtreres bort (de fører ikke laget videre),
 *  - tomt/helt withdrawn lag gir `null` i stedet for å kaste, slik at flater
 *    som Hjem-kortet kan degradere til «egne rader» framfor å velte siden.
 *
 * Delegerer selve sammenligningen til `pickTeamCaptain` — regelen har ett
 * hjem, denne funksjonen er kun adapteren rundt den.
 *
 * NB: frafall tilbys ikke i de kollapsede modusene (`supportsWithdrawal`),
 * men kontosletting midt i runden trekker spilleren likevel (0174). Trekkes
 * kapteinen, peker lex-min på et NYTT medlem, mens hullene som alt er ført,
 * ligger igjen på det gamle. Skrivingen går hit (den trukne raden kan ikke
 * skrives til), og lesingen folder de gamle radene inn med `foldTeamRows`
 * (`lib/scoring/context/foldTeamRows.ts`, #2067).
 */
export function teamScoreOwnerId(
  teamMembers: readonly TeamMemberRow[],
): string | null {
  const active = teamMembers
    .filter((m) => m.withdrawn_at == null)
    .map((m) => m.user_id);
  return active.length > 0 ? pickTeamCaptain(active) : null;
}

/**
 * Lagmedlemmer som kan ha eid lagets rader før: de trukne (#2067). En
 * leseflate henter radene deres i tillegg til eierens, og `foldTeamRows`
 * legger dem på eieren.
 *
 * Sortert lex-SYNKENDE, siste eier først. Eierskapet går alltid til det
 * lex-minste aktive medlemmet, så når en eier trekkes, er neste eier
 * lex-større. Har to trukne ført samme hull, er det den lex-største som
 * førte sist, og verdien dens vinner.
 */
export function formerTeamRowOwnerIds(
  teamMembers: readonly TeamMemberRow[],
): string[] {
  return teamMembers
    .filter((m) => m.withdrawn_at != null)
    .map((m) => m.user_id)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

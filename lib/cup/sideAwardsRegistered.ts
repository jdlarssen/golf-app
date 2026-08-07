/**
 * Sidepoeng-registrerings-gate (#1501). Ren klassifisering av om et
 * konfigurert sidepoeng har fått sin registrering etter runden:
 *
 *  - ctp/ld: én vinner er tastet (`winnerUserId` satt). Hver vinner-plass
 *    (slot-rad) må ha en vinner — «alle konfigurerte sidepoeng».
 *  - gir: BEGGE lag-tellerne er satt (`team1Count`/`team2Count` != null). 0 er
 *    en gyldig registrering («registrert null GIR»), ikke «uregistrert» —
 *    derfor `!= null`, ikke truthiness.
 *
 * Ett hjem for regelen: brukes både av `finishTournament` (avvis avslutning med
 * `?error=side_awards_missing`) og av `CupManagement` (disabler «Avslutt
 * cupen»-knappen + navngir hva som mangler i hintet). UI kan aldri «love» noe
 * serveren avviser (bug-prevention trap #4).
 */

export type SideAwardRegistrationState =
  | { kind: 'ctp' | 'ld'; winnerUserId: string | null }
  | { kind: 'gir'; team1Count: number | null; team2Count: number | null };

export function isSideAwardRegistered(award: SideAwardRegistrationState): boolean {
  if (award.kind === 'gir') {
    return award.team1Count != null && award.team2Count != null;
  }
  return award.winnerUserId != null;
}

export function allSideAwardsRegistered(
  awards: readonly SideAwardRegistrationState[],
): boolean {
  // En cup uten sidepoeng er trivielt grønn.
  return awards.every(isSideAwardRegistered);
}

/**
 * Delmengden som ennå ikke er registrert — driver hint-linja i CupManagement
 * (navngir hvilke sidepoeng arrangøren mangler). Generisk så kallere kan sende
 * inn sine egne rader (med hull/type) og få de samme objektene tilbake.
 */
export function unregisteredSideAwards<T extends SideAwardRegistrationState>(
  awards: readonly T[],
): T[] {
  return awards.filter((a) => !isSideAwardRegistered(a));
}

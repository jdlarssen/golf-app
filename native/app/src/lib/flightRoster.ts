// #2255: hvem du spiller med — regelen avatarraden på Hjem (#2254) og
// startbilletten på spillets side deler.
//
// Den bodde inne i `FlightAvatars.tsx`. Billetten trenger det samme utvalget
// til navnelista under skivene, og to kopier av «hvem er i flighten din» ville
// kunnet vise to ulike lag med folk (AGENTS felle 4). Nå har regelen ett hjem.

/** Maks antall skiver; resten blir «+N til». */
export const MAX_AVATARS = 4;

/**
 * Billetten (#2255, design): deg først og så inntil tre andre, fire skiver i
 * alt. Navnelista ved siden av nevner de samme tre og resten som et tall.
 */
export const MAX_TICKET_COMPANIONS = 3;

/** Det utvalget trenger å vite om en spiller. */
export interface FlightMember {
  userId: string;
  flightNumber: number | null;
  withdrawnAt: string | null;
}

/**
 * De andre du spiller med, i rosterens rekkefølge. Med flight satt er det de
 * andre i flighten din; uten flight de andre i spillet. Trukne spillere står
 * ikke på banen og tas ikke med.
 */
export function companionsOf<P extends FlightMember>(
  players: readonly P[],
  userId: string,
  flightNumber: number | null,
): P[] {
  return players.filter(
    (p) =>
      p.userId !== userId &&
      p.withdrawnAt == null &&
      (flightNumber == null || p.flightNumber === flightNumber),
  );
}

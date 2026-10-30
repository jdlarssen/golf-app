// #2688: hvem som er arrangør av et spill i appen. `created_by` er arrangøren,
// unntatt i en ligaflight (`leagueRoundId` satt): der er den som startet
// flighten bare `created_by`, og ligaen styrer runden. Ett hjem for regelen, så
// spillets side, hullsiden og scorekortet ikke er uenige om hvem som kan åpne
// et levert kort.
export function isGameOrganiser(
  game: { createdBy: string | null; leagueRoundId: string | null },
  userId: string,
): boolean {
  return game.createdBy === userId && game.leagueRoundId === null;
}

// #2688: hvem som er arrangør av et spill i appen. `created_by` er arrangøren,
// unntatt i en simulatorligaflight (eierens valg 30.10): der er den som startet
// flighten bare `created_by`, og markøren og ligaen styrer runden. En vanlig
// ligaflight beholder oppretteren som arrangør, for ingen annen avslutter den.
//
// Appen leser ikke ligaen, men start-kjernen setter `require_peer_approval` til
// `markerRequired(is_simulator)` (`startLeagueRoundFlightCore`): en ligaflight
// med godkjenning på er en simulatorligaflight. Serveren (`gameOrganiserAccess`)
// spør ligaen selv, så skjermen og porten svarer det samme. Ett hjem for
// regelen i appen, så spillets side, hullsiden og scorekortet er enige.
export function isGameOrganiser(
  game: { createdBy: string | null; leagueRoundId: string | null; requirePeerApproval: boolean },
  userId: string,
): boolean {
  const simulatorFlight = game.leagueRoundId !== null && game.requirePeerApproval;
  return game.createdBy === userId && !simulatorFlight;
}

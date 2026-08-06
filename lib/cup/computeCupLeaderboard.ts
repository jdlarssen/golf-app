// Aggregator for Ryder Cup-stil multi-match-turnering (#47, fase 1).
//
// Tar tournament-raden + en liste av match-summary-er (allerede med pre-
// beregnet matchplay-result) og produserer master-leaderboard-en: team 1-
// point, team 2-point, vinner-deklarering, og bevart match-rekkefølge.
//
// Renheten her er bevisst: zero IO, zero scoring-pipeline-kobling. Caller-
// stien gjør game-fetch + per-match singlesMatchplay.compute(), og passerer
// inn en oppsummert match-rad. Det gir oss enkel unit-test-dekning (alle
// kombinasjoner: vunnet, halvert, in-progress, blanding, vinner-deklarert)
// uten å mocke games/game_players/scores.
//
// Point-tildelings-regel (matcher PGA/European Tour-ryder-cup-tradisjon):
//   - winnerSide === 1 → 1 point til team 1
//   - winnerSide === 2 → 1 point til team 2
//   - winnerSide === 'tied' (AS) → 0,5 til hvert lag
//   - result === null (matchen ikke ferdig) → 0 til begge

export type CupMatchInput = {
  gameId: string;
  matchLabel: string | null;
  team1PlayerName: string;
  team2PlayerName: string;
  /**
   * Game-mode for matchen. Brukes av cup-UI for å velge mellom spiller-fokusert
   * («3&2 til Per») og lag-fokusert («3&2 til Lag Skog») result-tekst. Singles
   * bruker spiller-navn; fourball (#217) og foursomes (#218) bruker lag-navn.
   * Optional for backward-compat med pre-#217-call-sites; UI defaulter til
   * singles-stil rendering når feltet er undefined.
   */
  gameMode?:
    | 'singles_matchplay'
    | 'fourball_matchplay'
    | 'foursomes_matchplay'
    | 'greensome_matchplay'
    | 'chapman_matchplay'
    | 'gruesome_matchplay';
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  result: { winnerSide: 1 | 2 | 'tied'; formatted: string } | null;
};

export type TournamentInput = {
  team_1_name: string;
  team_2_name: string;
  // NULL fram til cupen starter — målet utledes av match-antallet (#1142).
  points_to_win: number | null;
  status: 'draft' | 'active' | 'finished';
  winner_team: 1 | 2 | null;
  /**
   * Vektbare cup-poeng (#1441, D8 — `tournaments.win_points`/`tie_points`,
   * migrasjon 0153). Optional med default 1/0,5 (dagens hardkodede oppførsel)
   * når feltet mangler — eksisterende callers (getCupSnapshot.ts) og tester
   * som ikke sender disse feltene forblir uendret.
   */
  win_points?: number;
  tie_points?: number;
};

/**
 * Manuelt sidepoeng-innslag (#1441, D9 — `tournament_side_awards`, migrasjon
 * 0154): closest-to-pin eller longest-drive på et gitt hull. `winnerTeam` er
 * `null` inntil arrangøren taster vinneren etter runden — inntil da bidrar
 * innslaget med 0 poeng til begge lag. Mapping fra `winner_user_id` til
 * hvilket LAG spilleren tilhører (via roster) skjer i F3b (getCupSnapshot) —
 * denne rene laget tar `winnerTeam` direkte som input.
 */
export type CupSideAwardInput = {
  kind: 'ctp' | 'ld';
  holeNumber: number;
  points: number;
  winnerTeam: 1 | 2 | null;
};

export type CupMatchSummary = CupMatchInput & {
  pointsTeam1: number;
  pointsTeam2: number;
};

export type CupLeaderboardResult = {
  team1Name: string;
  team2Name: string;
  team1Points: number;
  team2Points: number;
  pointsToWin: number | null;
  winner: 1 | 2 | null;
  matches: CupMatchSummary[];
  finishedMatches: number;
  remainingMatches: number;
  /**
   * Sidepoeng-bidraget som ligger inne i `team1Points`/`team2Points` over
   * (#1441, D9) — brutt ut separat slik at UI kan vise «+7 sidepoeng» uten å
   * regne det ut selv fra rå `sideAwards`-input på nytt.
   */
  sideAwardPoints: { team1: number; team2: number };
};

// Dagens 1/½-default (#1441, D8) — speiler DEFAULT_WIN_POINTS/DEFAULT_TIE_POINTS
// i pointsToWin.ts (egen konstant her: computeCupLeaderboard og
// derivePointsToWinWeighted er bevisst uavhengige rene moduler, ingen av dem
// importerer fra hverandre).
const DEFAULT_WIN_POINTS = 1;
const DEFAULT_TIE_POINTS = 0.5;

function pointsForMatch(
  input: CupMatchInput,
  winPoints: number,
  tiePoints: number,
): { team1: number; team2: number } {
  if (input.status !== 'finished' || input.result === null) {
    return { team1: 0, team2: 0 };
  }
  if (input.result.winnerSide === 1) return { team1: winPoints, team2: 0 };
  if (input.result.winnerSide === 2) return { team1: 0, team2: winPoints };
  return { team1: tiePoints, team2: tiePoints };
}

export function computeCupLeaderboard(
  tournament: TournamentInput,
  matches: CupMatchInput[],
  sideAwards: CupSideAwardInput[] = [],
): CupLeaderboardResult {
  const winPoints = tournament.win_points ?? DEFAULT_WIN_POINTS;
  const tiePoints = tournament.tie_points ?? DEFAULT_TIE_POINTS;

  let team1Points = 0;
  let team2Points = 0;
  let finished = 0;

  const summarized: CupMatchSummary[] = matches.map((m) => {
    const pts = pointsForMatch(m, winPoints, tiePoints);
    team1Points += pts.team1;
    team2Points += pts.team2;
    if (m.status === 'finished') finished += 1;
    return { ...m, pointsTeam1: pts.team1, pointsTeam2: pts.team2 };
  });

  // Sidepoeng (#1441, D9): legges OVENPÅ match-poengene i totalen. Et innslag
  // uten registrert vinner (winnerTeam null) bidrar med 0 til begge lag.
  let sideAwardTeam1 = 0;
  let sideAwardTeam2 = 0;
  for (const award of sideAwards) {
    if (award.winnerTeam === 1) sideAwardTeam1 += award.points;
    else if (award.winnerTeam === 2) sideAwardTeam2 += award.points;
  }
  team1Points += sideAwardTeam1;
  team2Points += sideAwardTeam2;

  // Avrunde til nærmeste 0,1 for å unngå flyt-presisjons-rusk (0,5 + 0,5
  // kan teoretisk gi 0,9999...). Halv-poenger er den minste granulariteten
  // i cup-formatet.
  team1Points = Math.round(team1Points * 10) / 10;
  team2Points = Math.round(team2Points * 10) / 10;

  // Et poengmål på null betyr «ikke bestemt ennå» (cupen har ikke startet), og
  // kan aldri kåre en vinner — uansett stilling (#1142).
  let winner: 1 | 2 | null = null;
  if (tournament.status === 'finished') {
    winner = tournament.winner_team;
  } else if (tournament.points_to_win === null) {
    winner = null;
  } else if (team1Points >= tournament.points_to_win) {
    winner = 1;
  } else if (team2Points >= tournament.points_to_win) {
    winner = 2;
  }

  return {
    team1Name: tournament.team_1_name,
    team2Name: tournament.team_2_name,
    team1Points,
    team2Points,
    pointsToWin: tournament.points_to_win,
    winner,
    matches: summarized,
    finishedMatches: finished,
    remainingMatches: matches.length - finished,
    sideAwardPoints: { team1: sideAwardTeam1, team2: sideAwardTeam2 },
  };
}

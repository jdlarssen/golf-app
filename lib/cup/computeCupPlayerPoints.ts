// Per-spiller-poengregnskap for en cup (#1497). Ren funksjon over ÉN
// snapshot — zero IO, ingen datoer — som svarer «hvilke poeng bidro jeg til?»
// og «hvor mange samlet den enkelte inn?».
//
// To bevisste avgjørelser fra issuet/kontrakten:
//   - Ryder Cup-full-kreditt: BEGGE spillerne på en side får HELE sidens
//     kamppoeng (hele tie_points ved delt kamp), ikke en 0,5/0,5-deling.
//     Spillertotalene summerer derfor IKKE til lagtotalen — det er by design
//     og skal ikke «avstemmes».
//   - Poengregelen har ett hjem: vi GJENBRUKER pointsTeam1/pointsTeam2 fra
//     CupMatchSummary (beregnet i computeCupLeaderboard), og regner aldri
//     kamppoeng på nytt her. gir bidrar aldri til spillerregnskapet (#1489 —
//     lag-attribuert, ingen spiller-kobling).

import type { CupMatchSummary } from './computeCupLeaderboard';
import type { CupRoster, CupRosterPlayer, CupSideAwardSnapshot } from './getCupSnapshot';

export type CupPlayerContribution =
  | {
      type: 'match';
      gameId: string;
      matchLabel: string | null;
      opponentLabel: string;
      outcome: 'won' | 'tied';
      points: number;
    }
  | { type: 'ctp' | 'ld'; holeNumber: number; points: number };

export type CupPlayerPointsRow = {
  userId: string;
  displayName: string;
  team: 1 | 2;
  /** Avrundet til nærmeste 0,1, samme granularitet som lagtotalen. */
  points: number;
  /** Kun poenggivende hendelser — en kvittering for innsamlede poeng. */
  contributions: CupPlayerContribution[];
};

export type CupPlayerPointsResult = {
  team1: CupPlayerPointsRow[];
  team2: CupPlayerPointsRow[];
};

export type CupPlayerPointsInput = {
  matches: CupMatchSummary[];
  roster: CupRoster;
  sideAwards: CupSideAwardSnapshot[];
};

// Samme fallback-regel som getCupSnapshot.preferredName: nickname foran navn,
// begge trimmet, «Ukjent spiller» når begge mangler.
function preferredName(p: CupRosterPlayer): string {
  return p.nickname?.trim() || p.name?.trim() || 'Ukjent spiller';
}

export function computeCupPlayerPoints(input: CupPlayerPointsInput): CupPlayerPointsResult {
  const { matches, roster, sideAwards } = input;

  // Én rad per roster-spiller. Kartene peker på de SAMME rad-objektene som
  // ligger i team-arrayene, så krediteringen muterer raden direkte.
  const team1ByUser = new Map<string, CupPlayerPointsRow>();
  const team2ByUser = new Map<string, CupPlayerPointsRow>();

  for (const p of roster.team1) {
    if (team1ByUser.has(p.userId)) continue;
    team1ByUser.set(p.userId, {
      userId: p.userId,
      displayName: preferredName(p),
      team: 1,
      points: 0,
      contributions: [],
    });
  }
  for (const p of roster.team2) {
    if (team2ByUser.has(p.userId)) continue;
    team2ByUser.set(p.userId, {
      userId: p.userId,
      displayName: preferredName(p),
      team: 2,
      points: 0,
      contributions: [],
    });
  }

  // Kamp-kreditering: full kreditt til hver spiller på en side når sidens
  // poeng er > 0 (uferdig/tapt side har allerede 0 fra computeCupLeaderboard —
  // ingen egen gating trengs). Manglende teamNUserIds (gammel input-form) →
  // ingen kreditt, aggregatoren krasjer aldri.
  for (const m of matches) {
    creditSide({
      byUser: team1ByUser,
      userIds: m.team1UserIds,
      points: m.pointsTeam1,
      opponentLabel: m.team2PlayerName,
      match: m,
    });
    creditSide({
      byUser: team2ByUser,
      userIds: m.team2UserIds,
      points: m.pointsTeam2,
      opponentLabel: m.team1PlayerName,
      match: m,
    });
  }

  // Sidepoeng: ctp/ld krediteres den enkelte vinneren via winnerUserId. gir har
  // ingen spiller-attribusjon (#1489) og hoppes over. En vinner utenfor
  // rosteret (eller null) gir ingen kreditt.
  for (const award of sideAwards) {
    if (award.kind === 'gir') continue;
    if (!award.winnerUserId) continue;
    const row = team1ByUser.get(award.winnerUserId) ?? team2ByUser.get(award.winnerUserId);
    if (!row) continue;
    row.points += award.points;
    row.contributions.push({ type: award.kind, holeNumber: award.holeNumber, points: award.points });
  }

  return {
    team1: finalize(team1ByUser),
    team2: finalize(team2ByUser),
  };
}

function creditSide(args: {
  byUser: Map<string, CupPlayerPointsRow>;
  userIds: string[] | undefined;
  points: number;
  opponentLabel: string;
  match: CupMatchSummary;
}): void {
  const { byUser, userIds, points, opponentLabel, match: m } = args;
  if (points <= 0 || !userIds) return;
  const outcome: 'won' | 'tied' = m.result?.winnerSide === 'tied' ? 'tied' : 'won';
  for (const userId of userIds) {
    const row = byUser.get(userId);
    if (!row) continue;
    row.points += points;
    row.contributions.push({
      type: 'match',
      gameId: m.gameId,
      matchLabel: m.matchLabel,
      opponentLabel,
      outcome,
      points,
    });
  }
}

function finalize(byUser: Map<string, CupPlayerPointsRow>): CupPlayerPointsRow[] {
  const rows = Array.from(byUser.values());
  for (const row of rows) {
    // Avrund til nærmeste 0,1 — samme mønster som lagtotalen i
    // computeCupLeaderboard (0,5 + 0,5 kan teoretisk gi 0,9999…).
    row.points = Math.round(row.points * 10) / 10;
  }
  // Deterministisk: poeng synkende, deretter navn stigende (norsk collator).
  rows.sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName, 'nb'));
  return rows;
}

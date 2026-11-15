/**
 * What the cup's matches reported for the side awards, as the organiser reads
 * it before registering winners and GIR counts (#2283, drawings V3 in the app
 * and V4 on the web): «Meldt inn fra kampene» under each closest-to-pin and
 * longest-drive award, and one box under both GIR counters. The web's
 * `SideAwardsPanel` and the app's `GET /api/cup/[id]/manage` both get their
 * data from `buildCupSideReports`, so the order, the names and the matches
 * that have not reported cannot differ between them.
 *
 * The matches report; the organiser still registers (`registerSideAwardWinner`,
 * `registerGirCounts`). Nothing here fills a choice or a counter in.
 *
 * The rules are not copied from anywhere: the lines are `reportsForSlot`
 * (the finish page's rule, with the match as the sender: a cup match is one
 * claim flight), the sums are `sumGirClaimsByTeam`, and «does this match
 * report on the hole» is `cupMatchReportsHole`. This file only joins them to
 * the cup's matches.
 *
 * Pure. The read is `loadCupSideReports`. Relative imports only: the app
 * imports the types from `native/app/src/`.
 */

import { buildCupRoster, type CupRosterPlayer } from './cupRoster';
import {
  categoryForCupKind,
  cupMatchReportsHole,
  sumGirClaimsByTeam,
  type GirClaimInput,
  type GirSumGame,
  type SideContestCategory,
} from '../games/sideContest';
import { reportsForSlot, toSideClaimReports, type SideClaimReportRow } from '../games/sideClaimReports';
import { playerShortName } from '../names/playerName';

/** One of the cup's games, as `getCupSnapshot` reads them, with the label a report is sent under. */
export type CupReportGame = GirSumGame & {
  /** `games.tournament_match_label`, «Four-ball 1». Null = unnamed: each surface says «Match». */
  matchLabel: string | null;
};

/** The awards a report is read for: what the cup set up. Counters and winners are not needed. */
export type CupReportAward =
  | { kind: 'ctp' | 'ld'; holeNumber: number }
  | { kind: 'gir'; holeNumber: number; maxPerTeam: number };

/** A `game_side_claims` row. */
export type CupSideClaimRow = SideClaimReportRow & { game_id: string };

/** A `game_gir_claims` row. */
export type CupGirClaimRow = { game_id: string; hole_number: number; user_id: string; hit: boolean };

/** A match, as the lines name it. */
export type CupReportMatch = { gameId: string; matchLabel: string | null };

/** One match's answer on a closest-to-pin or longest-drive hole. */
export type CupSlotReportLine = CupReportMatch & {
  /** The winner's first name (the full name when another in the cup shares it). Null = «Ingen på green/fairway». */
  name: string | null;
  distanceM: number | null;
};

/** What the matches reported for one closest-to-pin or longest-drive hole. */
export type CupSlotReports = {
  kind: 'ctp' | 'ld';
  holeNumber: number;
  /** The shortest distance first, answers without one last (`sortClaimsForHole`), then by match. */
  lines: CupSlotReportLine[];
  /** The matches that play the hole and have not reported on it. */
  missing: CupReportMatch[];
};

/** One team's GIR on a hole. */
export type CupGirTeamReport = {
  /** Balls on the green in regulation across every match; a shared foursomes ball counts once. */
  count: number;
  /** One entry per ball that counted: the first names on it, «Ole/Kari» for a shared ball. */
  names: string[];
  /**
   * More than «maks per lag» was reported. The one home of that rule: the web panel
   * and the app box both read this flag and show « · maks N GIR» in warning colour.
   */
  overMax: boolean;
};

/** What the matches reported for one GIR hole. */
export type CupGirReport = {
  holeNumber: number;
  /** «Maks per lag» from the award. The count can still be higher: the matches report what they saw. */
  maxPerTeam: number;
  team1: CupGirTeamReport;
  team2: CupGirTeamReport;
  /** How many matches have reported on the hole. 0 = «Ingen kamper har meldt inn ennå.» */
  reportedMatches: number;
  /** The matches that play the hole and have not reported on it. */
  missing: CupReportMatch[];
};

export type CupSideReports = {
  slots: CupSlotReports[];
  gir: CupGirReport[];
};

/**
 * What the loader gives a surface: the reports, `'failed'` when the read did
 * not work (the surface says so and the organiser registers as before), or
 * `null` when the cup has nothing to report on (no awards, or not started).
 */
export type CupSideReportsResult = CupSideReports | 'failed' | null;

export type BuildCupSideReportsInput = {
  awards: readonly CupReportAward[];
  /** All the cup's games in match order, derived singles included: the roster is built from every game. */
  games: readonly CupReportGame[];
  sideClaims: readonly CupSideClaimRow[];
  girClaims: readonly CupGirClaimRow[];
};

export function buildCupSideReports(input: BuildCupSideReportsInput): CupSideReports {
  const { games } = input;
  const roster = buildCupRoster(games);
  const everyone = [...roster.team1, ...roster.team2];
  const playerById = new Map(everyone.map((p) => [p.userId, p]));
  const shortName = (p: CupRosterPlayer): string =>
    playerShortName(
      p,
      everyone.filter((other) => other.userId !== p.userId).map((other) => other.name),
    ) ?? '';

  // A derived game keeps no strokes and reports nothing. Each match that does
  // gets a key; `reportsForSlot` reads it as the flight the claim came from.
  const reporting = games.filter((game) => game.sourceGameId == null);
  const keyOfGame = new Map(reporting.map((game, index) => [game.id, index + 1]));
  const matchOfKey = new Map(
    reporting.map((game, index): [number, CupReportMatch] => [index + 1, { gameId: game.id, matchLabel: game.matchLabel }]),
  );
  const matchOf = (gameId: string): CupReportMatch => {
    const game = games.find((candidate) => candidate.id === gameId);
    return { gameId, matchLabel: game?.matchLabel ?? null };
  };

  const claims = toSideClaimReports(
    input.sideClaims.flatMap((row) => {
      const key = keyOfGame.get(row.game_id);
      return key === undefined ? [] : [{ ...row, flight_number: key }];
    }),
    (winnerUserId) => playerById.get(winnerUserId) ?? { name: null, nickname: null },
  );
  const rosterNames = everyone.map((p) => ({ userId: p.userId, name: p.name }));

  const slots: CupSlotReports[] = [];
  const seenSlots = new Set<string>();
  const gir: CupGirReport[] = [];
  const seenGirHoles = new Set<number>();
  const girClaims: GirClaimInput[] = input.girClaims.map((row) => ({
    gameId: row.game_id,
    holeNumber: row.hole_number,
    userId: row.user_id,
    hit: row.hit,
  }));

  for (const award of input.awards) {
    if (award.kind === 'gir') {
      if (seenGirHoles.has(award.holeNumber)) continue;
      seenGirHoles.add(award.holeNumber);
      const sum = sumGirClaimsByTeam(award.holeNumber, girClaims, games);
      const team = (side: typeof sum.team1): CupGirTeamReport => ({
        count: side.count,
        names: side.balls.map((ball) => ball.map(shortName).filter((name) => name !== '').join('/')),
        overMax: side.count > award.maxPerTeam,
      });
      gir.push({
        holeNumber: award.holeNumber,
        maxPerTeam: award.maxPerTeam,
        team1: team(sum.team1),
        team2: team(sum.team2),
        reportedMatches: sum.reportedGameIds.length,
        missing: sum.missingGameIds.map(matchOf),
      });
      continue;
    }

    const slotKey = `${award.kind}:${award.holeNumber}`;
    if (seenSlots.has(slotKey)) continue;
    seenSlots.add(slotKey);
    // ctp/ld only: the GIR branch above has already continued.
    const category = categoryForCupKind(award.kind) as SideContestCategory;
    const playing = reporting.filter((game) => cupMatchReportsHole(game, award.holeNumber));
    const reports = reportsForSlot(
      { category, hole: award.holeNumber },
      claims,
      playing.map((game) => keyOfGame.get(game.id)!),
      rosterNames,
    );
    slots.push({
      kind: award.kind,
      holeNumber: award.holeNumber,
      lines:
        reports?.lines.map((line) => ({
          ...matchOfKey.get(line.flightNumber)!,
          name: line.name,
          distanceM: line.distanceM,
        })) ?? [],
      missing: reports?.missingFlights.map((key) => matchOfKey.get(key)!) ?? [],
    });
  }

  return { slots, gir };
}

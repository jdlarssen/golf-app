// Hvem vises som kort på hull-siden, og med hvilke prikker (#1716 — ren
// flytting ut av `page.tsx`): først hvilken gruppe spillere som er synlig,
// deretter kortene selv (ett per spiller, eller ett per lag i de
// lag-kollapsede modusene).

import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { modeCollapsesToTeamCard } from '@/lib/scoring/modes/types';
import { readTeamStrokesOverride } from '@/lib/scoring/modes/greensomeMatchplay';
import { nameInitials } from '@/lib/names/initials';
import { isSingleFlightGame } from '@/lib/games/flightScope';
import { teamScoreOwnerId } from '@/lib/games/teamCaptain';
import type { RoundRobinConstellationPlayer } from '@/lib/scoring/modes/roundRobin';
import type { GameForHole, PlayerForHole } from '@/lib/games/getGameWithPlayers';
import type { ClientPlayer } from './holeClientProps';
import type { ScoreRow } from './holePageData';

/**
 * #543: én-flight-regelen — alle aktive spillere er i samme gruppe når
 * spillet har ≤4 aktive spillere ELLER formatet er wolf.
 *
 * Når singleFlight er true vises ALLE aktive spillere uavhengig av
 * flight_number. Dette fikser bl.a. matchplay-motstanderens scorer
 * (side 1 vs side 2) og foursomes/texas (lag 1 vs lag 2) for 4-spiller-spill.
 *
 * Når singleFlight er false brukes eksisterende logikk:
 *   • flight_number == null → alle spillere (legacy ≤4 flightless)
 *   • flight_number != null → kun samme flight
 *
 * Trukkede spillere filtreres ut av roster slik at de ikke vises som
 * aktive kort på hull-siden (#386/#387-presedensen).
 */
export function resolveFlight(args: {
  game: GameForHole;
  allPlayers: PlayerForHole[];
  me: PlayerForHole;
}): PlayerForHole[] {
  const { game, allPlayers, me } = args;
  const singleFlight = isSingleFlightGame(game.game_mode, allPlayers);
  if (singleFlight || me.flight_number == null) {
    return allPlayers.filter((p) => p.withdrawn_at == null);
  }
  return allPlayers.filter(
    (p) => p.flight_number === me.flight_number && p.withdrawn_at == null,
  );
}

/**
 * Round Robin: bygg spillerliste med teamNumber + visningsnavn for badge.
 * Speiler wolfPlayersForClient-mønstret — samme datakilde (allPlayers),
 * ingen ekstra fetch nødvendig.
 */
export function buildRoundRobinPlayers(args: {
  isRoundRobin: boolean;
  allPlayers: PlayerForHole[];
  unknownPlayer: string;
}): RoundRobinConstellationPlayer[] | undefined {
  const { isRoundRobin, allPlayers, unknownPlayer } = args;
  if (!isRoundRobin) return undefined;
  return allPlayers
    .filter((p) => p.team_number != null)
    .map((p) => ({
      userId: p.user_id,
      teamNumber: p.team_number as number,
      name: p.users?.nickname?.trim() || p.users?.name || unknownPlayer,
    }));
}

/**
 * For Texas scramble collapses vi lag-medlemmer til ett kort per lag.
 * Lag-kapteinen (lex-min userId) eier scores-radene; alle medlemmer kan
 * taste, alle tap skriver til kapteinens userId. Kortets `name` viser
 * «Lag N · Navn1, Navn2» og `initial`-avataren viser lag-nummeret slik at
 * det visuelt skiller seg fra per-spiller-kort i andre moduser.
 *
 * #543: når singleFlight er true og rosteret spenner over flere lag (f.eks.
 * foursomes med 4 spillere totalt), bygger vi ETT kort PER LAG slik at alle
 * kan taste på begge kortene. Handicap-formlene er identiske med eksisterende
 * logikk: begge lags tall produserer det den andre siden ser i dag.
 *
 * Lag-handicap beregnes etter NGF-konvensjon:
 *   teamHCP = round(combinedCourseHandicap × team_handicap_pct / 100)
 * og fordeles per hull via vanlig SI-allokering (strokesForHole).
 */
export function buildPlayersForClient(args: {
  game: GameForHole;
  holeNumber: number;
  flight: PlayerForHole[];
  allPlayers: PlayerForHole[];
  strokeIndex: number;
  scoresByUser: Record<string, ScoreRow>;
  unknownPlayer: string;
}): ClientPlayer[] {
  const {
    game,
    holeNumber,
    flight,
    allPlayers,
    strokeIndex,
    scoresByUser,
    unknownPlayer,
  } = args;
  const isFoursomes = game.game_mode === 'foursomes_matchplay';
  const isGreensome = game.game_mode === 'greensome_matchplay';
  const isChapman = game.game_mode === 'chapman_matchplay';
  const isGruesome = game.game_mode === 'gruesome_matchplay';
  const isPatsome = game.game_mode === 'patsome';

  if (!modeCollapsesToTeamCard(game.game_mode, holeNumber)) {
    // Patsome hull 1–6: 4BBB — begge taster sin egen ball.
    // I brutto-modus har ingen spillere ekstra slag.
    const patsomeScoringForPerPlayer =
      isPatsome && game.mode_config.kind === 'patsome'
        ? game.mode_config.patsome_scoring
        : 'net';
    return flight.map((p) => {
      const name = p.users?.name ?? unknownPlayer;
      const rawNickname = p.users?.nickname ?? null;
      const nickname =
        rawNickname && rawNickname.trim().length > 0 ? rawNickname : null;
      const ch =
        isPatsome && patsomeScoringForPerPlayer === 'gross'
          ? 0
          : (p.course_handicap ?? 0);
      const scoreRow = scoresByUser[p.user_id];
      return {
        userId: p.user_id,
        name,
        nickname,
        initial: nameInitials(name),
        extraStrokes: strokesForHole(ch, strokeIndex),
        initialStrokes: scoreRow?.strokes ?? null,
        initialPutts: scoreRow?.putts ?? null,
        initialClientUpdatedAt: scoreRow?.client_updated_at ?? null,
        initialServerUpdatedAt: scoreRow?.updated_at ?? null,
        submitted: p.submitted_at != null,
      };
    });
  }

  // Grupper roster på team_number. Vanligvis ett lag (når flight-filteret kun
  // returnerer mitt lag), men ved singleFlight får vi alle lag.
  const teamNumbers = [
    ...new Set(
      flight.map((p) => p.team_number).filter((t): t is number => t != null),
    ),
  ].sort((a, b) => a - b);

  // WHS-diff-formel (foursomes/greensome/chapman/gruesome) beregnes globalt
  // mot motstander-sidens combined CH. Vi trenger alle aktive lag-spillere
  // for begge sider — bruk allPlayers (ikke flight) for å få motstander-tallene.
  const isSixtyForty = isGreensome || isChapman;
  const isDiffFormat = isFoursomes || isGreensome || isChapman || isGruesome;

  // #1447: manuelt tastede lag-slag (D10) må styre prikkene her identisk med
  // motoren — override erstatter formel-CH per side FØR diff × allowance.
  // Kun greensome_matchplay har feltet; undefined = formelen under.
  const teamStrokesOverride = readTeamStrokesOverride(game.mode_config);

  function sideHandicap(players: PlayerForHole[]): number {
    if (isSixtyForty) {
      const chs = players.map((p) => p.course_handicap ?? 0);
      if (chs.length === 0) return 0;
      return Math.round(0.6 * Math.min(...chs) + 0.4 * Math.max(...chs));
    }
    return players.reduce((sum, p) => sum + (p.course_handicap ?? 0), 0);
  }

  function teamHandicapFor(teamNum: number): number {
    const teamPlayers = flight.filter((p) => p.team_number === teamNum);
    const combinedCH = teamPlayers.reduce(
      (sum, p) => sum + (p.course_handicap ?? 0),
      0,
    );
    if (isDiffFormat) {
      // Alle aktive lag-spillere — bruk allPlayers for diff-beregning.
      const oppPlayers = allPlayers.filter(
        (p) =>
          p.team_number !== teamNum &&
          p.team_number !== null &&
          p.withdrawn_at == null,
      );
      const thisSideCH = teamStrokesOverride
        ? teamNum === 1
          ? teamStrokesOverride.side1
          : teamStrokesOverride.side2
        : isSixtyForty
          ? sideHandicap(teamPlayers)
          : combinedCH;
      const oppCH = teamStrokesOverride
        ? teamNum === 1
          ? teamStrokesOverride.side2
          : teamStrokesOverride.side1
        : sideHandicap(oppPlayers);
      const allowancePct =
        game.mode_config.kind === 'foursomes_matchplay'
          ? game.mode_config.allowance_pct
          : game.mode_config.kind === 'greensome_matchplay'
            ? game.mode_config.allowance_pct
            : game.mode_config.kind === 'chapman_matchplay'
              ? game.mode_config.allowance_pct
              : game.mode_config.kind === 'gruesome_matchplay'
                ? game.mode_config.allowance_pct
                : 50;
      const diff = Math.abs(thisSideCH - oppCH);
      const highSideExtra = Math.round((diff * allowancePct) / 100);
      return thisSideCH > oppCH ? highSideExtra : 0;
    } else if (isPatsome) {
      const patsomeScoring =
        game.mode_config.kind === 'patsome'
          ? game.mode_config.patsome_scoring
          : 'net';
      if (patsomeScoring === 'gross') return 0;
      if (holeNumber <= 12) {
        const chs = teamPlayers.map((p) => p.course_handicap ?? 0);
        if (chs.length === 0) return 0;
        return Math.round(0.6 * Math.min(...chs) + 0.4 * Math.max(...chs));
      }
      return Math.round(0.5 * combinedCH);
    } else {
      // Texas/ambrose/florida
      const handicapPct =
        game.mode_config.kind === 'texas_scramble' ||
        game.mode_config.kind === 'ambrose' ||
        game.mode_config.kind === 'florida_scramble'
          ? game.mode_config.team_handicap_pct
          : 0;
      return Math.round((combinedCH * handicapPct) / 100);
    }
  }

  return teamNumbers.map((teamNum) => {
    const teamPlayers = flight.filter((p) => p.team_number === teamNum);
    // `flight` is already withdrawal-free, so this is the same lex-min
    // captain as before — now read from the one home the Home card shares.
    const captainId = teamScoreOwnerId(teamPlayers) ?? teamPlayers[0].user_id;
    const teamHCP = teamHandicapFor(teamNum);
    const captainScoreRow = scoresByUser[captainId];
    const memberNames = teamPlayers
      .map((p) => p.users?.name ?? '')
      .map((n) => n.split(/\s+/)[0])
      .filter((n) => n.length > 0)
      .join(', ');
    const anyTeamMemberSubmitted = teamPlayers.some(
      (p) => p.submitted_at != null,
    );
    return {
      userId: captainId,
      name: `Lag ${teamNum} · ${memberNames}`,
      nickname: null,
      initial: String(teamNum),
      extraStrokes: strokesForHole(teamHCP, strokeIndex),
      initialStrokes: captainScoreRow?.strokes ?? null,
      initialPutts: captainScoreRow?.putts ?? null,
      initialClientUpdatedAt: captainScoreRow?.client_updated_at ?? null,
      initialServerUpdatedAt: captainScoreRow?.updated_at ?? null,
      submitted: anyTeamMemberSubmitted,
      // #1058: lar HoleClient finne "mitt kort" via me.team_number når jeg
      // ikke er lag-kapteinen (userId over er captain.user_id, ikke meg).
      teamNumber: teamNum,
    };
  });
}

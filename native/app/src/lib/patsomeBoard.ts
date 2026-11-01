// #2751: Patsome-tavla i appen, etter tegningen «Patsome-tavla», variant A: alle
// lagene side om side, live og ferdig.
//
// Ren funksjon, ingen React, som `teamBoard.ts`. Svaret er `null` nøyaktig når
// Resultater-skjermen ikke tegner tavla, med de samme portene i samme rekkefølge
// som `LeaderboardBody`: gaten, reveal, ingen slag, motoren.
//
// Ingen regning og ingen sortering her. Poengene, delsummene, plassene og
// rekkefølgen er motorens (`lib/scoring/modes/patsome.ts`). Det eneste som er
// satt sammen her, er avstanden i stripa, som er tegnet som forskjellen i poeng
// også når lagene har spilt ulikt mange hull: under runden er det den tegningen
// viser («Delt 3. plass · 6 poeng bak Lag 3» etter 9 mot 11 hull), og kortene
// sier hvor langt hvert lag er kommet. Aldri «mot par» (#2738).
import { parForPlayer } from '../../../../lib/games/parDisplay';
import { STATUS_LABELS } from '../../../../lib/games/status';
import { boardRowSrParts, boardShowsRank, isBoardLeader, sentenceName, totalLabel } from '../../../../lib/leaderboard/boardRules';
import { showHolesColumn } from '../../../../lib/leaderboard/holesColumn';
import type { PatsomeHoleRow, PatsomeTeamLine, ScoringGender } from '../../../../lib/scoring/modes/types';
import { rankTeams } from '../../../../lib/scoring/tiebreaker';
import type { LocalScore } from '../data/db';
import type { BundleGame, GameBundle } from '../data/gameBundle';
import { BOARD_APP_TEXT, BOARD_COMMON_TEXT, BOARD_PATSOME_TEXT, BOARD_TEAM_TEXT, BOARD_TEXT } from './boardCopy';
import { gateReason } from './formatGate';
import { heroAction } from './homeHero';
import { formatMessage } from './kavalkadeCopy';
import { hasAnyStroke, leaderboardVisibility } from './leaderboardModel';
import { computeGameLeaderboard } from './scoringContext';
import { DECIDED_TEXT, placeText, srPartText, stripAction, stripPlace } from './soloBoard';
import { teamMembers, type TeamBoardStrip } from './teamBoard';

export function hasPatsomeBoard(game: Pick<BundleGame, 'gameMode'>): boolean {
  return game.gameMode === 'patsome';
}

export type PatsomeBoardRow = {
  teamNumber: number;
  /** «Lag 3». */
  name: string;
  /** «–» før noen har spilt, «T2» ved delt plass, ellers plassen. */
  place: string;
  /** Lederen live, vinneren ferdig: gullskive og gullring. */
  leader: boolean;
  you: boolean;
  /** «Deg, Jonas». */
  members: string;
  /** «37», eller «—» før laget har spilt. */
  total: string;
  /** «poeng», live «poeng · hull 11». */
  under: string;
  /** Lagets poeng per del: «16», eller «—» på en del uten spilte hull. */
  segments: { label: string; value: string }[];
  /** Ferdig: «Likt med Lag 4 · avgjort på siste ni». */
  note: string | null;
  /** Hele kortet som én linje for skjermleseren. */
  a11y: string;
};

export type PatsomeBoardColumn = {
  teamNumber: number;
  label: string;
  you: boolean;
};

export type PatsomeBoardHole = {
  holeNumber: number;
  par: number;
  /** Poengene i kolonnenes rekkefølge: «2», eller «—» på et uspilt hull. */
  cells: string[];
  a11y: string;
};

export type PatsomeBoardGroup = {
  /** «Greensome · hull 7–12». */
  label: string;
  holes: PatsomeBoardHole[];
};

export type PatsomeBoardModel = {
  variant: 'live' | 'finished';
  pill: { text: string; live: boolean };
  rows: PatsomeBoardRow[];
  viewerTeam: number | null;
  /** Lagene i tavlas rekkefølge. */
  columns: PatsomeBoardColumn[];
  groups: PatsomeBoardGroup[];
  /** «Laget ditt», eller `null` når seeren ikke er med på et lag. */
  strip: TeamBoardStrip | null;
};

const teamName = (teamNumber: number) => formatMessage(BOARD_COMMON_TEXT.teamLabel, { number: teamNumber });

const SEGMENT_LABEL = {
  fourball: BOARD_PATSOME_TEXT.fourball,
  greensome: BOARD_PATSOME_TEXT.greensome,
  foursomes: BOARD_PATSOME_TEXT.foursomes,
} as const;

const GROUPS = [
  { segment: 'fourball', label: BOARD_PATSOME_TEXT.groupFourball },
  { segment: 'greensome', label: BOARD_PATSOME_TEXT.groupGreensome },
  { segment: 'foursomes', label: BOARD_PATSOME_TEXT.groupFoursomes },
] as const;

function teamHolesPlayed(team: PatsomeTeamLine): number {
  const { fourball, greensome, foursomes } = team.segments;
  return fourball.holesPlayed + greensome.holesPlayed + foursomes.holesPlayed;
}

/** Samme regel som motorens `holesPlayed`: minst én ball i 4BBB, lagballen ellers. */
function holePlayed(hole: PatsomeHoleRow): boolean {
  return hole.segment === 'fourball' ? hole.players.some((player) => player.gross !== null) : hole.teamGross !== null;
}

/**
 * Trinnet som skilte radene fra hverandre. Motorens lag-linje har ikke feltet,
 * så samme `rankTeams` spørres med de samme poengene, i motorens rekkefølge.
 */
function decidedByTeam(teams: readonly PatsomeTeamLine[]): Map<number, ReturnType<typeof rankTeams>[number]['decidedBy']> {
  const ranked = rankTeams(
    teams.map((team) => ({
      id: team.teamNumber,
      holes: Array.from({ length: 18 }, (_, index) => -(team.holes[index]?.teamPoints ?? 0)),
    })),
  );
  return new Map(ranked.map((team) => [team.id, team.decidedBy]));
}

/** «4 poeng bak Lag 3», eller `null` når laget leder eller er likt med lederen. */
function behindText(
  rows: readonly { teamNumber: number; name: string; rank: number; total: number | null }[],
  mine: { rank: number; total: number | null },
): string | null {
  const leaders = rows.filter((row) => row.rank === 1);
  const leader = leaders[0];
  if (mine.rank === 1 || mine.total === null || !leader || leader.total === null) return null;
  const gap = leader.total - mine.total;
  if (gap <= 0) return null;
  if (leaders.length > 1) return formatMessage(BOARD_TEXT.behindPointsLead, { gap });
  return formatMessage(BOARD_TEXT.behindPoints, {
    gap,
    name: sentenceName(leader, rows, (row) => row.name, (row) => row.teamNumber),
  });
}

/**
 * Patsome-tavla for skjermen, eller `null` når Resultater-skjermen viser noe
 * annet (et annet format, et stengt spill, en blind runde, ingen slag, eller når
 * motoren ikke kan svare).
 */
export function patsomeBoardFor(opts: {
  bundle: GameBundle;
  /** Foldet (`useTeamScores`), som tavla og Hjem-kortet får dem. */
  scores: readonly LocalScore[];
  userId: string | null;
}): PatsomeBoardModel | null {
  const { bundle, scores, userId } = opts;
  const { game } = bundle;
  if (!hasPatsomeBoard(game) || gateReason(game) !== null) return null;
  if (leaderboardVisibility(game.scoreVisibility, game.status, 'patsome') !== 'full') return null;
  if (!hasAnyStroke(scores)) return null;
  const outcome = computeGameLeaderboard(bundle, scores);
  if (!outcome.ok || outcome.result.kind !== 'patsome') return null;
  const { teams } = outcome.result;
  if (teams.length === 0) return null;

  const finished = game.status === 'finished';
  const rankCounts = new Map<number, number>();
  for (const team of teams) rankCounts.set(team.rank, (rankCounts.get(team.rank) ?? 0) + 1);
  const lines = teams.map((team) => {
    const holesPlayed = teamHolesPlayed(team);
    return {
      team,
      teamNumber: team.teamNumber,
      name: teamName(team.teamNumber),
      rank: team.rank,
      tied: (rankCounts.get(team.rank) ?? 0) > 1,
      holesPlayed,
      total: holesPlayed > 0 ? team.totalPoints : null,
    };
  });

  const roundHoles = Math.max(0, ...lines.map((line) => line.holesPlayed));
  const showRank = boardShowsRank(roundHoles);
  const viewerTeam = userId ? (lines.find((line) => line.team.playerIds.includes(userId))?.teamNumber ?? null) : null;
  const decidedBy = finished ? decidedByTeam(teams) : null;
  const finishedShowsHoles = finished && showHolesColumn('finished', lines.map((line) => line.holesPlayed));

  const rows = lines.map((line, index): PatsomeBoardRow => {
    const you = line.teamNumber === viewerTeam;
    const leader = showRank && isBoardLeader(line);
    const members = teamMembers(bundle, line.team.playerIds, userId).names.join(', ');
    const decided = decidedBy?.get(line.teamNumber) ?? null;
    const above = lines[index - 1];
    const note =
      decided !== null && decided !== 'total' && above
        ? formatMessage(DECIDED_TEXT[decided], {
            name: sentenceName(above, lines, (row) => row.name, (row) => row.teamNumber),
          })
        : null;
    const { fourball, greensome, foursomes } = line.team.segments;
    const segments = [fourball, greensome, foursomes].map((segment) => ({
      label: SEGMENT_LABEL[segment.segment],
      value: segment.holesPlayed > 0 ? String(segment.points) : '—',
    }));
    const holesText = formatMessage(BOARD_TEAM_TEXT.holes, { holes: line.holesPlayed });
    const parts = boardRowSrParts({
      row: { ...line, movement: null, recent: [] },
      unit: 'points',
      showRank,
      isYou: you,
      winner: finished && leader,
      hasNote: note !== null,
    });
    return {
      teamNumber: line.teamNumber,
      name: line.name,
      place: placeText(line, showRank),
      leader,
      you,
      members,
      total: totalLabel('points', line.total),
      under: finished && !finishedShowsHoles ? BOARD_COMMON_TEXT.poengLabel : `${BOARD_COMMON_TEXT.poengLabel} · ${holesText}`,
      segments,
      note,
      a11y: [
        line.name,
        members,
        ...parts.map((part) => (part.key === 'you' ? BOARD_TEAM_TEXT.srYourTeam : srPartText(part, note))),
        segments.map((segment) => `${segment.label} ${segment.value}`).join(', '),
      ]
        .filter(Boolean)
        .join('. '),
    };
  });

  const viewer = bundle.players.find((player) => player.userId === userId);
  const teeGender = (viewer?.teeGender ?? 'mens') as ScoringGender;
  const groups = GROUPS.map(({ segment, label }): PatsomeBoardGroup => ({
    label,
    holes: bundle.holes
      .filter((hole) => teams[0]?.holes.find((row) => row.holeNumber === hole.holeNumber)?.segment === segment)
      .map((hole) => {
        const par = parForPlayer({ mens: hole.parMens, ladies: hole.parLadies, juniors: hole.parJuniors }, teeGender);
        const cells = lines.map((line) => {
          const row = line.team.holes.find((candidate) => candidate.holeNumber === hole.holeNumber);
          return row && holePlayed(row) ? row.teamPoints : null;
        });
        return {
          holeNumber: hole.holeNumber,
          par,
          cells: cells.map((points) => (points === null ? '—' : String(points))),
          a11y: [
            formatMessage(BOARD_PATSOME_TEXT.srHole, { hole: hole.holeNumber, par }),
            ...cells.map((points, index) =>
              points === null
                ? formatMessage(BOARD_PATSOME_TEXT.srCellUnplayed, { name: lines[index]!.name })
                : formatMessage(BOARD_PATSOME_TEXT.srCell, { name: lines[index]!.name, points }),
            ),
          ].join('. '),
        };
      }),
  })).filter((group) => group.holes.length > 0);

  const mine = lines.find((line) => line.teamNumber === viewerTeam);
  const strip: TeamBoardStrip | null =
    mine && userId
      ? {
          kicker: BOARD_TEAM_TEXT.stripKicker,
          place: stripPlace({ rank: mine.rank, tied: mine.tied }),
          detail: behindText(lines, mine),
          action: finished
            ? { kind: 'scorecard', label: BOARD_APP_TEXT.scorecard }
            : stripAction(heroAction({ bundle, scores, userId })),
        }
      : null;

  return {
    variant: finished ? 'finished' : 'live',
    pill: finished
      ? { text: formatMessage(BOARD_APP_TEXT.pillFinished, { holes: roundHoles }), live: false }
      : {
          text:
            game.status === 'scheduled'
              ? STATUS_LABELS.scheduled
              : formatMessage(BOARD_TEXT.pillLiveAfter, { holes: roundHoles }),
          live: game.status === 'active',
        },
    rows,
    viewerTeam,
    columns: lines.map((line) => ({
      teamNumber: line.teamNumber,
      label: line.name,
      you: line.teamNumber === viewerTeam,
    })),
    groups,
    strip,
  };
}

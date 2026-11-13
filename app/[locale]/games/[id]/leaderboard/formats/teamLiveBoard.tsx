import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LeaderboardShell } from '../LeaderboardChrome';
import { LiveBoard } from '../LiveBoard';
import type { TeamBoardRowData, TeamBoardData, TeamStripData } from '../TeamBoardRows';
import type { TeamHoleCardData } from '../TeamHoleCard';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeGender } from '@/lib/games/teeRating';
import {
  firstHalfHoleNumbersForSegment,
  hiddenHoleNumbersForSegment,
  lastHoleForSegment,
} from '@/lib/games/holeScope';
import { parseStartType } from '@/lib/games/startType';
import { scoredHoleNumbers } from '@/lib/games/scoreOwner';
import { formerTeamRowOwnerIds, teamScoreOwnerId } from '@/lib/games/teamCaptain';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { firstName, sharesFirstName } from '@/lib/firstName';
import { formatListLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { liveBoardStripAction } from '@/lib/leaderboard/liveBoard';
import { asTeamBoardResult, resultStanding, type TeamBoardResult } from '@/lib/leaderboard/resultBoard';
import {
  bestBallHoleCard,
  scrambleHoleCard,
  teamDisplayUnit,
  teamLiveBoard,
  withoutLatestHolePerTeam,
  type TeamLiveRow,
} from '@/lib/leaderboard/teamLiveBoard';
import { formatRevealName } from '@/lib/names/formatRevealName';
import { nameInitials } from '@/lib/names/initials';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildStablefordContext } from '@/lib/scoring/context/buildStablefordContext';
import { buildUniformContext } from '@/lib/scoring/context/buildUniformContext';

type PlayerRow = {
  user_id: string;
  team_number: number | null;
  users: { name: string | null; nickname: string | null } | null;
  course_handicap: number | null;
  tee_gender: TeeGender;
  withdrawn_at: string | null;
  flight_number?: number | null;
  submitted_at?: string | null;
  approved_at?: string | null;
};
type HoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};
type ScoreRow = { user_id: string; hole_number: number; strokes: number | null };

/**
 * Lagtavla (#2316): the live board for scramble (texas, ambrose, florida), team
 * stableford, shamble and best ball, in the server half of `LiveBoard kind="team"`.
 * Sibling of `renderLiveBoard` (solo, #2253).
 *
 * It calls the engine twice, now and over the rows without each team's latest
 * hole (`withoutLatestHolePerTeam`, in the flight's own order for a shotgun
 * start), and `teamLiveBoard` reads the movement off the two. Rank, total, N
 * and the gap are the engine's through `teamLiveBoard`/`resultStanding`, the
 * same pure layer the app reads; nothing is ranked here.
 *
 * `scope: 'first-half'` is best ball while the round is on (#1978): the board
 * is computed over the open half's holes and strokes only, so nothing from the
 * back nine is read into it, and it has no movement. The viewer's strip still
 * reads the whole card (`scoresRows`).
 *
 * The caller owns the reveal and finished branches. The strip, «Ditt lag» and
 * the hole card are left out on the public views (`publicView`: spectate, embed).
 */
export async function renderTeamLiveBoard(opts: {
  gameId: string;
  game: GameForHole;
  players: PlayerRow[];
  /** The game's holes and strokes, already filtered to its hole segment. */
  holesRows: HoleRow[];
  scoresRows: ScoreRow[];
  backHref: string;
  footerSlot?: ReactNode;
  viewerUserId?: string;
  publicView?: boolean;
  scope?: 'live' | 'first-half';
}) {
  const { gameId, game, players, backHref, footerSlot, scope = 'live' } = opts;
  const [tc, tModes, tStatus, tt, locale] = await Promise.all([
    getTranslations('leaderboard.common'),
    getTranslations('modes'),
    getTranslations('gameStatus'),
    getTranslations('leaderboard.teamBoard'),
    getLocale() as Promise<AppLocale>,
  ]);
  const startType = parseStartType(game.start_type);
  const firstHalf = scope === 'first-half';
  const openHoles = new Set(firstHalfHoleNumbersForSegment(game.hole_segment));
  const holesRows = firstHalf ? opts.holesRows.filter((h) => openHoles.has(h.hole_number)) : opts.holesRows;
  const boardScores = firstHalf ? opts.scoresRows.filter((s) => openHoles.has(s.hole_number)) : opts.scoresRows;

  const normalized = players.map((p) => ({ ...p, team_number: p.team_number ?? 0 }));
  const resultFor = (scores: ScoreRow[]): TeamBoardResult | null => {
    const ctx =
      game.game_mode === 'stableford' || game.game_mode === 'modified_stableford'
        ? buildStablefordContext({
            gameId,
            gameMode: game.game_mode,
            modeConfig: game.mode_config,
            players: normalized,
            holesRows,
            scoresRows: scores,
          })
        : buildUniformContext({
            gameId,
            gameMode: game.game_mode,
            modeConfig: game.mode_config,
            players: normalized,
            holesRows,
            scoresRows: scores,
          });
    return asTeamBoardResult(computeModeResult(ctx));
  };

  const result = resultFor(boardScores);
  if (!result) notFound();
  const teamOf = new Map(normalized.map((p) => [p.user_id, p.team_number > 0 ? p.team_number : null]));
  const previous = firstHalf
    ? null
    : resultFor(
        withoutLatestHolePerTeam(boardScores, (userId) => teamOf.get(userId) ?? null, game.hole_segment, startType),
      );
  const teamName = (teamNumber: number) => tc('teamLabel', { number: teamNumber });
  const board = teamLiveBoard(result, previous, teamName, {
    stablefordTable: game.game_mode === 'modified_stableford' ? 'modified' : 'standard',
  });

  const viewerUserId = opts.publicView ? '' : (opts.viewerUserId ?? '');
  const viewerRow = board.rows.find((r) => viewerUserId !== '' && r.memberIds.includes(viewerUserId));
  const viewerTeam = viewerRow?.teamNumber ?? null;

  // The members in the name line's order: the viewer first («Deg»), then by
  // name. A first name that two on the team share is written in full.
  const playerById = new Map(players.map((p) => [p.user_id, p]));
  const unit = teamDisplayUnit(result);
  const teamMembers = (memberIds: readonly string[], you: string) => {
    const nameOf = (id: string) => formatRevealName(playerById.get(id)?.users?.name ?? '', playerById.get(id)?.users?.nickname ?? null);
    const others = memberIds.filter((id) => id !== viewerUserId).sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale));
    const ids = [...memberIds.filter((id) => id === viewerUserId), ...others];
    const names = ids.map((id) => {
      if (id === viewerUserId) return you;
      const full = playerById.get(id)?.users?.name ?? null;
      const rest = memberIds.filter((m) => m !== id).map((m) => playerById.get(m)?.users?.name ?? null);
      return (sharesFirstName(full, rest) ? nameOf(id) : (firstName(full) ?? nameOf(id))) || tc('unknownPlayerFull');
    });
    return { ids, names, initials: ids.map((id) => nameInitials(playerById.get(id)?.users?.name)) };
  };

  const rowData = (row: TeamLiveRow): TeamBoardRowData => {
    const team = teamMembers(row.memberIds, tt('you'));
    return {
      teamNumber: row.teamNumber,
      name: row.name,
      rank: row.rank,
      tied: row.tied,
      total: row.total,
      holesPlayed: row.holesPlayed,
      movement: row.movement,
      recent: row.recent,
      tones: row.tones.map((h) => h.tone),
      initials: team.initials,
      members: formatListLocale(team.names, locale),
      you: row.teamNumber === viewerTeam,
    };
  };

  const hidden = hiddenHoleNumbersForSegment(game.hole_segment);
  const open = firstHalfHoleNumbersForSegment(game.hole_segment);
  const boardData: TeamBoardData = {
    unit: board.unit,
    displayUnit: unit,
    holesPlayed: board.holesPlayed,
    rows: board.rows.map(rowData),
    firstHalf: firstHalf
      ? {
          holes: open.length,
          shown: { from: open[0], to: open[open.length - 1] },
          hidden: { from: hidden[0], to: hidden[hidden.length - 1] },
          last: lastHoleForSegment(game.hole_segment),
        }
      : null,
  };

  // The strip: the place, the gap («1 slag bak Lag 3», only when both have
  // played the same number of holes) and the button, which follows the card the
  // viewer's team has filled (the captain owns a scramble team's rows).
  let strip: TeamStripData | null = null;
  if (viewerUserId !== '' && viewerRow) {
    const standing = resultStanding(board, (r) => r.teamNumber, viewerRow.teamNumber);
    const me = players.find((p) => p.user_id === viewerUserId);
    const roster = players.filter((p) => p.team_number === me?.team_number);
    const action = liveBoardStripAction({
      gameId,
      status: game.status,
      holeSegment: game.hole_segment,
      startType,
      requirePeerApproval: game.require_peer_approval,
      viewer: me && {
        submitted_at: me.submitted_at ?? null,
        approved_at: me.approved_at ?? null,
        withdrawn_at: me.withdrawn_at,
      },
      viewerScores: [],
      filledHoles: scoredHoleNumbers(
        opts.scoresRows.map((s) => ({ holeNumber: s.hole_number, userId: s.user_id, strokes: s.strokes })),
        game.game_mode,
        viewerUserId,
        teamScoreOwnerId(roster),
        formerTeamRowOwnerIds(roster),
      ),
    });
    if (standing && action) {
      const leader = standing.leaders.length === 1 ? board.rows.find((r) => r.teamNumber === standing.leaders[0]) : null;
      strip = {
        rank: standing.rank,
        tied: standing.tied,
        gap: standing.gap,
        leaderName: leader?.name ?? null,
        inPoints: board.unit === 'points',
        ofHoles: firstHalf ? { played: viewerRow.holesPlayed, total: open.length } : null,
        action,
      };
    }
  }

  // «Ditt lag på hull N»: the scramble family live, best ball in its first half.
  let holeCard: TeamHoleCardData | null = null;
  if (viewerRow) {
    if (result.kind === 'texas_scramble' && !firstHalf) {
      const card = scrambleHoleCard(result, viewerRow.teamNumber);
      if (card) holeCard = { kind: 'scramble', ...card };
    } else if (result.kind === 'best_ball' && firstHalf) {
      const card = bestBallHoleCard(result, viewerRow.teamNumber);
      if (card) {
        const names = teamMembers(card.contributorIds, tt('youInSentence')).names;
        holeCard = {
          kind: 'bestBall',
          holeNumber: card.holeNumber,
          net: card.net,
          term: card.term,
          overPar: card.overPar,
          names: formatListLocale(names, locale),
        };
      }
    }
  }

  // «Texas scramble · 4 lag à 4 · netto»: «à N» only when the teams are as big as each other.
  const sizes = new Set(board.rows.map((r) => r.memberIds.length));
  const teamsText =
    sizes.size === 1
      ? tt('teamsOfSize', { count: board.rows.length, size: [...sizes][0] })
      : tt('teams', { count: board.rows.length });
  const unitText =
    unit === 'points' ? tc('poengLabel') : unit === 'toPar' ? tc('vsParLabel') : unit === 'gross' ? tt('unitGross') : tt('unitNet');
  const formatLine = [
    tModes(formatDisplayLabelKey(game.game_mode, game.mode_config) as Parameters<typeof tModes>[0]),
    teamsText,
    unitText,
  ].join(' · ');

  return (
    <LeaderboardShell footerSlot={footerSlot}>
      <LiveBoard
        kind="team"
        gameName={game.name}
        status={game.status === 'scheduled' ? 'scheduled' : 'active'}
        statusLabel={tStatus('scheduled')}
        formatLine={formatLine}
        board={boardData}
        strip={strip}
        holeCard={holeCard}
        backHref={backHref}
        testId="team-leaderboard"
      />
    </LeaderboardShell>
  );
}

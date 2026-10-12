import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { FollowView } from '../FollowView';
import { LeaderboardShell } from '../LeaderboardChrome';
import { LiveBoard } from '../LiveBoard';
import { FollowMemory } from '../../../../spectate/[token]/FollowMemory';
import { buildFollowView, followSubtitle } from '@/lib/leaderboard/followPlayer';
import {
  liveBoardStripAction,
  type LiveBoard as LiveBoardData,
} from '@/lib/leaderboard/liveBoard';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { ScoringGender } from '@/lib/scoring/modes/types';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';

/**
 * Heiagjengen (#2286): what the live link sends down. Only spectate sets it;
 * the signed-in board and the embed are unchanged without it.
 */
export type LiveBoardFollowOpts = {
  token: string;
  /** The `?folg=` id (`resolveFollowUserId`), not yet checked against the board. */
  userId: string | null;
  /** The address had a `?folg=` at all — an id that cannot be followed is forgotten. */
  hadFolg: boolean;
  /** The follow page's «Lag din egen turnering på et par minutter →». */
  cta: ReactNode;
};

/**
 * The live branch shared by solo stableford and solo strokeplay (#2253): wraps
 * `LiveBoard` in `LeaderboardShell` (realtime refresh and the floating CTAs come
 * with it) and resolves on the server what the client component cannot:
 * the translated format and status names (`modes`/`gameStatus` are not sent to
 * the browser), the number of flights and the strip's button.
 *
 * The strip is left out on the public views (spectate, embed), for a viewer
 * without a player row (an organizer who does not play) and for a withdrawn
 * player — `liveBoardStripAction` owns that rule.
 *
 * On the live link (`follow`, #2286) a followable `?folg=` gives the follow
 * page in a flush `AppShell` instead, and the board's name plates link to it.
 * `FollowMemory` is mounted on both, and only here: where there is no board
 * (team stableford, hidden net, a finished game, other formats) nothing is
 * followed or remembered.
 */
export async function renderLiveBoard(opts: {
  gameId: string;
  game: GameForHole;
  players: ReadonlyArray<{
    user_id: string;
    flight_number?: number | null;
    submitted_at?: string | null;
    approved_at?: string | null;
    withdrawn_at: string | null;
    tee_gender: ScoringGender;
    users: { name: string | null; nickname: string | null } | null;
  }>;
  board: LiveBoardData;
  /** The game's holes, already filtered to its hole segment. */
  holesRows: ReadonlyArray<CourseHoleRow>;
  /** The game's scores, already filtered to its hole segment. */
  scoresRows: ReadonlyArray<{ user_id: string; hole_number: number; strokes: number | null }>;
  backHref: string;
  footerSlot: ReactNode;
  viewerUserId?: string;
  publicView?: boolean;
  testId: 'stableford-leaderboard' | 'strokeplay-leaderboard';
  /** The course's name, for the follow page's «{spillnavn} · {bane}». */
  courseName?: string | null;
  follow?: LiveBoardFollowOpts;
}) {
  const { gameId, game, players, board, holesRows, scoresRows, backHref, footerSlot, testId, follow } = opts;

  const followView =
    follow?.userId
      ? buildFollowView({
          board,
          userId: follow.userId,
          players,
          holesRows,
          scoresRows,
          segment: game.hole_segment,
        })
      : null;
  if (follow && followView) {
    return (
      <AppShell flush>
        <FollowView
          token={follow.token}
          board={board}
          view={followView}
          subtitle={followSubtitle(game.name, opts.courseName ?? null)}
          cta={follow.cta}
          footerSlot={footerSlot}
        />
        <FollowMemory token={follow.token} userId={followView.row.userId} hadFolg />
      </AppShell>
    );
  }

  const [tModes, tStatus] = await Promise.all([
    getTranslations('modes'),
    getTranslations('gameStatus'),
  ]);

  const onBoard = new Set(board.rows.map((r) => r.userId));
  const flights = new Set(
    players
      .filter((p) => onBoard.has(p.user_id) && p.flight_number != null)
      .map((p) => p.flight_number),
  ).size;

  const viewerUserId = opts.publicView ? '' : (opts.viewerUserId ?? '');
  const viewer = viewerUserId ? players.find((p) => p.user_id === viewerUserId) : undefined;
  const strip = viewerUserId
    ? liveBoardStripAction({
        gameId,
        status: game.status,
        holeSegment: game.hole_segment,
        requirePeerApproval: game.require_peer_approval,
        viewer: viewer && {
          submitted_at: viewer.submitted_at ?? null,
          approved_at: viewer.approved_at ?? null,
          withdrawn_at: viewer.withdrawn_at,
        },
        viewerScores: scoresRows.filter((s) => s.user_id === viewerUserId),
      })
    : null;

  return (
    <LeaderboardShell footerSlot={footerSlot}>
      <LiveBoard
        gameName={game.name}
        status={game.status === 'scheduled' ? 'scheduled' : 'active'}
        statusLabel={tStatus('scheduled')}
        formatLabel={tModes(
          formatDisplayLabelKey(game.game_mode, game.mode_config) as Parameters<typeof tModes>[0],
        )}
        flights={flights}
        board={board}
        viewerUserId={viewerUserId}
        strip={strip}
        backHref={backHref}
        testId={testId}
        followPath={follow ? `/spectate/${follow.token}` : undefined}
      />
      {follow && <FollowMemory token={follow.token} userId={null} hadFolg={follow.hadFolg} />}
    </LeaderboardShell>
  );
}

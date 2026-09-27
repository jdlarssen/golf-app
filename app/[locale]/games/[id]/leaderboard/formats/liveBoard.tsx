import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { LeaderboardShell } from '../LeaderboardChrome';
import { LiveBoard } from '../LiveBoard';
import {
  liveBoardStripAction,
  type LiveBoard as LiveBoardData,
} from '@/lib/leaderboard/liveBoard';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';

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
  }>;
  board: LiveBoardData;
  /** The game's scores, already filtered to its hole segment. */
  scoresRows: ReadonlyArray<{ user_id: string; hole_number: number; strokes: number | null }>;
  backHref: string;
  footerSlot: ReactNode;
  viewerUserId?: string;
  publicView?: boolean;
  testId: 'stableford-leaderboard' | 'strokeplay-leaderboard';
}) {
  const { gameId, game, players, board, scoresRows, backHref, footerSlot, testId } = opts;
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
      />
    </LeaderboardShell>
  );
}

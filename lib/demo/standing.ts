// Stripa i prøvespill-demoen (#2281): din plass, avstanden til lederen og pila
// siden forrige hull. Ren modul, ingen React. Alt regnes av tavlas egne
// funksjoner (`computeLiveBoard` + `viewerStanding`), så demoen og den ekte
// tavla har én regel for plass, delt plass, gap og pil (AGENTS.md felle 4).

import { computeLiveBoard, viewerStanding } from '@/lib/leaderboard/liveBoard';
import {
  DEMO_GAME_ID,
  DEMO_MODE_CONFIG,
  DEMO_PLAYERS,
  DEMO_YOU_ID,
  demoRows,
  type DemoYouScores,
} from './seed';

export type DemoStanding = {
  rank: number;
  /** Another player shares your rank. */
  tied: boolean;
  /** The leader who is not you (on a shared lead: the other one); `null` when you lead alone. */
  leaderName: string | null;
  /** Points behind the lead; `null` when you lead. */
  gap: number | null;
  /** Places moved since your previous hole (positive = up); `null` when not known. */
  movement: number | null;
};

/** Your standing on the demo board, or `null` before your first score. */
export function demoStanding(youScores: DemoYouScores): DemoStanding | null {
  const board = computeLiveBoard({
    gameId: DEMO_GAME_ID,
    game: {
      game_mode: 'stableford',
      mode_config: DEMO_MODE_CONFIG,
      status: 'active',
      score_visibility: 'live',
    },
    // The demo shows the arrow from the first hole: everyone starts level, so
    // hole 1 already moves you (#2281, the owner's answer E3).
    minHolesForMovement: 1,
    ...demoRows(youScores),
  });
  if (!board) return null;

  const standing = viewerStanding(board, DEMO_YOU_ID);
  if (!standing || standing.holesPlayed === 0) return null;

  const leaderId = standing.leaderUserIds.find((id) => id !== DEMO_YOU_ID) ?? null;
  const leaderName = DEMO_PLAYERS.find((p) => p.userId === leaderId)?.name ?? null;
  const you = board.rows.find((r) => r.userId === DEMO_YOU_ID);

  return {
    rank: standing.rank,
    tied: standing.tied,
    leaderName,
    gap: standing.gap,
    movement: you?.movement ?? null,
  };
}

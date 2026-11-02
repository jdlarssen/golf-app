import { formatDisplayLabel } from '@/lib/games/formatLabel';
import type { SignupOffer } from '@/lib/games/signupOffer';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * The wire types of `/api/pamelding/[shortId]` (#2748). Sums and details the
 * invitation card shows a signed-in player on the website; numbers, never a
 * name or an address.
 */

export type AppRoundInviteView = {
  offer: SignupOffer;
  /** Only at `in_game`: the app opens the round. */
  gameId?: string;
  round: {
    name: string;
    modeLabel: string;
    courseName: string | null;
    teeName: string | null;
    teeOffAt: string | null;
    entryFeeKr: number;
  };
  playerCount: number;
  /** The website's form, for `web`. */
  signupPath: string;
};

export type AppRoundInviteAnswer =
  | { status: 'joined'; gameId: string }
  | { status: 'requested' };

/** What the view reads of a game. Spelled out: the app reads this file's types. */
export type AppRoundInviteViewGame = {
  id: string;
  name: string;
  short_id: string;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  courses: { name: string } | null;
  tee_box: { name: string } | null;
  scheduled_tee_off_at: string | null;
  entry_fee_kr: number;
};

export function buildAppRoundInviteView(
  game: AppRoundInviteViewGame,
  offer: SignupOffer,
  playerCount: number,
): AppRoundInviteView {
  return {
    offer,
    ...(offer === 'in_game' ? { gameId: game.id } : {}),
    round: {
      name: game.name,
      modeLabel: formatDisplayLabel(game.game_mode, game.mode_config),
      courseName: game.courses?.name ?? null,
      teeName: game.tee_box?.name ?? null,
      teeOffAt: game.scheduled_tee_off_at,
      entryFeeKr: game.entry_fee_kr,
    },
    playerCount,
    signupPath: `/signup/${game.short_id}`,
  };
}

import { formatDisplayLabel } from '@/lib/games/formatLabel';
import type { SignupOffer } from '@/lib/games/signupOffer';
import type { GameSeats } from '@/lib/games/seatCapacity';
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
  /**
   * #2837: the seats on a format with a player cap, for «12 av 12 plasser».
   * Null without a cap, or when the count failed.
   */
  seats: GameSeats | null;
  /** #2837: at `pending`, «Trekk forespørselen» goes through. */
  canCancelRequest: boolean;
  /** The website's form, for `web`. */
  signupPath: string;
  /**
   * #2840: the app's own team screens. Null when neither applies; `offer`
   * stays `web` on a team round, so an old build (which ignores this) shows
   * the website's button as before. Optional: an older server sends none.
   */
  teamSignup?: AppTeamSignup | null;
  /** #2840: you are captain or teammate on a team in this round («Se laget»). */
  hasTeamPage?: boolean;
};

/**
 * #2840: the team form. `unavailableFriendIds` are your friends who are on the
 * list already or have a request of any status (a declined one still holds the
 * row), so the picker can grey them out; never anyone else's id, never an
 * address. The friends themselves come from `GET /api/friends`.
 */
export type AppTeamSignupForm = {
  kind: 'form';
  /** Players per team, the captain included: pick `teamSize - 1` friends. */
  teamSize: number;
  nameMin: number;
  nameMax: number;
  /** «Martins lag», from your first name (`suggestTeamName`). */
  suggestedName: string;
  unavailableFriendIds: string[];
};

/** One person on the team you were put on. Names as the team page shows them. */
export type AppTeamSignupMember = {
  /** The name, or the masked address (#2207); null when the user row is gone. */
  name: string | null;
  isCaptain: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
};

/** #2840: a captain put you on their team; yes is `accept_team`, no is `decline_team`. */
export type AppTeamSignupInvited = {
  kind: 'invited';
  /** Your own request row, for the answer. */
  requestId: string;
  captainName: string | null;
  teamName: string | null;
  /** `instant`: yes puts you on the list. `approval`: the organiser decides. */
  joinEffect: 'instant' | 'approval';
  /** The captain first, then the teammates, you among them. */
  members: AppTeamSignupMember[];
};

export type AppTeamSignup = AppTeamSignupForm | AppTeamSignupInvited;

export type AppRoundInviteAnswer =
  | { status: 'joined'; gameId: string }
  | { status: 'requested' }
  | { status: 'cancelled' };

/** #2840: one picked friend after the team submit, keyed on the id the app sent. */
export type AppTeamSlotResult =
  | { ok: true; userId: string; name: string | null }
  | {
      ok: false;
      userId: string;
      name: string | null;
      reason: 'alreadyRegistered' | 'dbError' | 'unexpected';
    };

/**
 * #2840: the answers to `team`, `accept_team` and `decline_team`. Apart from
 * `AppRoundInviteAnswer`, so the screens already shipped read exactly the
 * answers their intents can get.
 */
export type AppTeamSignupAnswer =
  | {
      status: 'team_registered';
      captainRequestId: string;
      joinEffect: 'instant' | 'approval';
      /** A friend who could not be added leaves an open seat, filled from the team page. */
      slotResults: AppTeamSlotResult[];
    }
  | { status: 'team_accepted' }
  | { status: 'team_declined' };

/** #2840: the answers of `POST /api/pamelding/[shortId]/lag`. */
export type AppTeamPageAnswer =
  | { status: 'removed' }
  | { status: 'resent' }
  | { status: 'transferred' }
  | { status: 'attached' }
  /** `replaced` only with `replaceRequestId`: whether the old row is gone. */
  | { status: 'added'; replaced?: boolean };

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
  { seats, ownRequestCancellable }: { seats: GameSeats | null; ownRequestCancellable: boolean },
  team: { teamSignup: AppTeamSignup | null; hasTeamPage: boolean } = {
    teamSignup: null,
    hasTeamPage: false,
  },
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
    seats,
    canCancelRequest: offer === 'pending' && ownRequestCancellable,
    signupPath: `/signup/${game.short_id}`,
    teamSignup: team.teamSignup,
    hasTeamPage: team.hasTeamPage,
  };
}

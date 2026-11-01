import type { PendingRequestView } from '@/app/[locale]/signup/[shortId]/pendingRequestView';
import { resolveRegistrationTypeView } from '@/app/[locale]/signup/[shortId]/registrationTypeView';
import { isMatchplayMode } from '@/lib/games/matchplaySides';
import {
  gameModeSupportsTeams,
  type RegistrationMode,
  type RegistrationType,
} from '@/lib/games/registration';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * What a signed-in player gets on a round's signup link (#2748), the rule's one
 * home: `renderBody` on `/signup/[shortId]`, the app's route
 * `/api/pamelding/[shortId]` and the writes in `selfRegistration.ts` all read
 * it, so the page and the write can never disagree (AGENTS.md trap 4). Pure, the
 * facts come from the caller.
 */

export type SignupFacts = {
  game: {
    status: 'draft' | 'scheduled' | 'active' | 'finished';
    registration_mode: RegistrationMode;
    registration_type: RegistrationType;
    game_mode: GameMode;
    signups_closed_at: string | null;
    let_friends_skip_gate: boolean;
  };
  /** A withdrawn player's row counts: the page sends them to the game. */
  isAlreadyRegistered: boolean;
  requestView: PendingRequestView;
  hasPendingInvitation: boolean;
  isClubMember: boolean;
  viewerIsFriend: boolean;
};

/** The page's branches, in the page's order. */
export type SignupView =
  | 'already_registered'
  | 'captain_invited'
  | 'self_request'
  | 'team_awaiting_approval'
  | 'locked'
  | 'closed'
  | 'club_member_form'
  | 'friend_form'
  | 'invite_has_invitation'
  | 'invite_team_only'
  | 'invite_request_form'
  | 'team_unsupported_mode'
  | 'team_form'
  | 'solo_open_form'
  | 'solo_manual_form';

/**
 * What the app can do about it. `join` and `request` happen in the app; `web`
 * is everything that needs the website: a team, picking a side, a pending
 * invitation on an invite-only round (the inbox is #2759) and a captain's team.
 */
export type SignupOffer = 'in_game' | 'pending' | 'locked' | 'closed' | 'join' | 'request' | 'web';

export function signupView(facts: SignupFacts): SignupView {
  const { game, isAlreadyRegistered, requestView, hasPendingInvitation, isClubMember, viewerIsFriend } =
    facts;
  if (isAlreadyRegistered) return 'already_registered';

  // #1422, #2061: the answer to a captain lies on the team page; a request and
  // a yes to a team waiting for the organiser read the same to the player.
  if (requestView !== 'none') return requestView;

  if (game.status === 'active' || game.status === 'finished') return 'locked';
  // #543: closed by hand comes after locked, so a started round never says «closed».
  if (game.signups_closed_at != null) return 'closed';

  // #442: club membership IS the invitation, whatever the mode. Solo only; a
  // club round with teams falls through to the team logic below.
  if (isClubMember && game.registration_type === 'solo') return 'club_member_form';

  // #369: «Slipp venner direkte inn».
  if (
    viewerIsFriend &&
    game.registration_mode === 'manual_approval' &&
    game.let_friends_skip_gate === true &&
    game.registration_type === 'solo'
  ) {
    return 'friend_form';
  }

  if (game.registration_mode === 'invite_only') {
    if (hasPendingInvitation) return 'invite_has_invitation';
    if (game.registration_type === 'team') return 'invite_team_only';
    return 'invite_request_form';
  }

  // #466: which form depends on registration_type and whether the format has teams.
  const typeView = resolveRegistrationTypeView(
    game.registration_type,
    gameModeSupportsTeams(game.game_mode),
  );
  if (typeView.kind === 'team_unsupported_mode') return 'team_unsupported_mode';
  if (typeView.kind === 'team_form') return 'team_form';
  return game.registration_mode === 'open' ? 'solo_open_form' : 'solo_manual_form';
}

/** The forms that sign you up directly. On matchplay they also ask for a side. */
export function isDirectJoinView(view: SignupView): boolean {
  return view === 'club_member_form' || view === 'friend_form' || view === 'solo_open_form';
}

export function offerForView(
  view: SignupView,
  game: Pick<SignupFacts['game'], 'game_mode' | 'registration_type'>,
): SignupOffer {
  switch (view) {
    case 'already_registered':
      return 'in_game';
    case 'self_request':
    case 'team_awaiting_approval':
      return 'pending';
    case 'locked':
    case 'closed':
      return view;
    case 'club_member_form':
    case 'friend_form':
    case 'solo_open_form':
      return isMatchplayMode(game.game_mode) ? 'web' : 'join';
    case 'solo_manual_form':
      return 'request';
    // The page's invite-only branch knows 'team' only, so 'both' on a team format
    // lands here too, on a form the solo gate refuses (#1792). The app never
    // offers what cannot go through.
    case 'invite_request_form':
      return resolveRegistrationTypeView(
        game.registration_type,
        gameModeSupportsTeams(game.game_mode),
      ).kind === 'solo_form'
        ? 'request'
        : 'web';
    case 'captain_invited':
    case 'invite_has_invitation':
    case 'invite_team_only':
    case 'team_unsupported_mode':
    case 'team_form':
      return 'web';
  }
}

export function signupOffer(facts: SignupFacts): SignupOffer {
  return offerForView(signupView(facts), facts.game);
}

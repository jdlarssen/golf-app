import { describe, expect, it } from 'vitest';
import { resolveRegistrationTypeView } from '@/app/[locale]/signup/[shortId]/registrationTypeView';
import { isMatchplayMode } from '@/lib/games/matchplaySides';
import { gameModeSupportsTeams } from '@/lib/games/registration';
import { SIGNUP_FACTS_MATRIX_ROWS, signupFactsMatrix } from '@/lib/games/testing/signupFactsMatrix';
import {
  isDirectJoinView,
  offerForView,
  signupOffer,
  signupView,
  type SignupFacts,
  type SignupOffer,
  type SignupView,
} from './signupOffer';

/**
 * Type A (#2748): what the signup page shows and what the app is offered have
 * one home. `legacyRenderBody` below is the branch order `renderBody` had in
 * `app/[locale]/signup/[shortId]/page.tsx` before the rule moved, typed out
 * from that file: the moved rule has to land on the same branch for every row.
 * #2837 adds one branch on top: a form that signs you up directly turns into
 * the request on a full round, unless a side is picked there (matchplay).
 */

function legacyRenderBody(f: SignupFacts): SignupView {
  const { game } = f;
  const gameLocked = game.status === 'active' || game.status === 'finished';
  const signupsClosed = !gameLocked && game.signups_closed_at != null;
  if (f.isAlreadyRegistered) return 'already_registered';
  if (f.requestView === 'captain_invited') return 'captain_invited';
  if (f.requestView === 'self_request') return 'self_request';
  if (f.requestView === 'team_awaiting_approval') return 'team_awaiting_approval';
  if (gameLocked) return 'locked';
  if (signupsClosed) return 'closed';
  if (f.isClubMember && game.registration_type === 'solo') return 'club_member_form';
  if (
    f.viewerIsFriend &&
    game.registration_mode === 'manual_approval' &&
    game.let_friends_skip_gate === true &&
    game.registration_type === 'solo'
  ) {
    return 'friend_form';
  }
  if (game.registration_mode === 'invite_only') {
    if (f.hasPendingInvitation) return 'invite_has_invitation';
    if (game.registration_type === 'team') return 'invite_team_only';
    return 'invite_request_form';
  }
  const typeView = resolveRegistrationTypeView(
    game.registration_type,
    gameModeSupportsTeams(game.game_mode),
  );
  if (typeView.kind === 'team_unsupported_mode') return 'team_unsupported_mode';
  if (typeView.kind === 'team_form') return 'team_form';
  return game.registration_mode === 'open' ? 'solo_open_form' : 'solo_manual_form';
}

type RowOverrides = Partial<Omit<SignupFacts, 'game'>> & { game?: Partial<SignupFacts['game']> };

function row(over: RowOverrides = {}): SignupFacts {
  return {
    isAlreadyRegistered: false,
    requestView: 'none',
    hasPendingInvitation: false,
    isClubMember: false,
    viewerIsFriend: false,
    isFull: false,
    ...over,
    game: {
      status: 'scheduled',
      registration_mode: 'open',
      registration_type: 'solo',
      game_mode: 'stableford',
      signups_closed_at: null,
      let_friends_skip_gate: false,
      ...over.game,
    },
  };
}

describe('signupView', () => {
  it('lands on the branch renderBody had, for every row of the matrix', () => {
    let rows = 0;
    for (const facts of signupFactsMatrix()) {
      rows += 1;
      const actual = signupView(facts);
      const legacy = legacyRenderBody(facts);
      const expected =
        facts.isFull && isDirectJoinView(legacy) && !isMatchplayMode(facts.game.game_mode)
          ? 'solo_open_full'
          : legacy;
      if (actual !== expected) {
        expect.fail(`${JSON.stringify(facts)}: ${actual}, expected ${expected}`);
      }
    }
    expect(rows).toBe(SIGNUP_FACTS_MATRIX_ROWS);
    expect(rows).toBe(55_296);
  });
});

describe('signupOffer', () => {
  it.each<[string, RowOverrides, SignupOffer]>([
    ['on the list', { isAlreadyRegistered: true }, 'in_game'],
    ['on the list in a finished round', { isAlreadyRegistered: true, game: { status: 'finished' } }, 'in_game'],
    ['asked already', { requestView: 'self_request' }, 'pending'],
    ['said yes, the team waits', { requestView: 'team_awaiting_approval' }, 'pending'],
    ['a captain put you on a team', { requestView: 'captain_invited' }, 'web'],
    ['started', { game: { status: 'active' } }, 'locked'],
    ['finished', { game: { status: 'finished' } }, 'locked'],
    ['closed by the organiser', { game: { signups_closed_at: '2026-11-01T10:00:00Z' } }, 'closed'],
    ['started and closed', { game: { status: 'active', signups_closed_at: '2026-11-01T10:00:00Z' } }, 'locked'],
    ['open solo', {}, 'join'],
    ['open, both on a solo format', { game: { registration_type: 'both' } }, 'join'],
    ['open, capped format', { game: { game_mode: 'wolf' } }, 'join'],
    ['open team', { game: { registration_type: 'team', game_mode: 'best_ball' } }, 'web'],
    ['open, both on a team format', { game: { registration_type: 'both', game_mode: 'best_ball' } }, 'web'],
    ['team on a format without teams', { game: { registration_type: 'team' } }, 'web'],
    ['open matchplay picks a side', { game: { game_mode: 'singles_matchplay' } }, 'web'],
    ['manual approval', { game: { registration_mode: 'manual_approval' } }, 'request'],
    ['manual approval on matchplay has no side', { game: { registration_mode: 'manual_approval', game_mode: 'singles_matchplay' } }, 'request'],
    ['manual approval, friend, gate open', { viewerIsFriend: true, game: { registration_mode: 'manual_approval', let_friends_skip_gate: true } }, 'join'],
    ['manual approval, friend, gate shut', { viewerIsFriend: true, game: { registration_mode: 'manual_approval' } }, 'request'],
    ['manual approval, friend, matchplay', { viewerIsFriend: true, game: { registration_mode: 'manual_approval', let_friends_skip_gate: true, game_mode: 'singles_matchplay' } }, 'web'],
    ['invite only, uninvited', { game: { registration_mode: 'invite_only' } }, 'request'],
    ['invite only, invited: the inbox', { hasPendingInvitation: true, game: { registration_mode: 'invite_only' } }, 'web'],
    ['invite only team', { game: { registration_mode: 'invite_only', registration_type: 'team', game_mode: 'best_ball' } }, 'web'],
    ['invite only, both on a team format: the form the solo gate refuses', { game: { registration_mode: 'invite_only', registration_type: 'both', game_mode: 'best_ball' } }, 'web'],
    ['invite only, both on a solo format', { game: { registration_mode: 'invite_only', registration_type: 'both' } }, 'request'],
    ['invite only, club member', { isClubMember: true, game: { registration_mode: 'invite_only' } }, 'join'],
    ['invite only, club member with an invitation', { isClubMember: true, hasPendingInvitation: true, game: { registration_mode: 'invite_only' } }, 'join'],
    ['invite only, club member on matchplay', { isClubMember: true, game: { registration_mode: 'invite_only', game_mode: 'singles_matchplay' } }, 'web'],
    ['invite only, club member, both on a solo format', { isClubMember: true, game: { registration_mode: 'invite_only', registration_type: 'both' } }, 'request'],
    // #2837: a full round asks instead of signing up.
    ['open solo, full', { isFull: true, game: { game_mode: 'wolf' } }, 'request'],
    ['open solo, seats left', { isFull: false, game: { game_mode: 'wolf' } }, 'join'],
    ['full and closed', { isFull: true, game: { game_mode: 'wolf', signups_closed_at: '2026-11-01T10:00:00Z' } }, 'closed'],
    ['full and started', { isFull: true, game: { game_mode: 'wolf', status: 'active' } }, 'locked'],
    ['full matchplay picks a side', { isFull: true, game: { game_mode: 'singles_matchplay' } }, 'web'],
    ['full, club member', { isFull: true, isClubMember: true, game: { game_mode: 'wolf', registration_mode: 'invite_only' } }, 'request'],
    ['full, friend through the gate', { isFull: true, viewerIsFriend: true, game: { game_mode: 'wolf', registration_mode: 'manual_approval', let_friends_skip_gate: true } }, 'request'],
    ['full team round', { isFull: true, game: { registration_type: 'team', game_mode: 'best_ball' } }, 'web'],
    ['full, asked already', { isFull: true, requestView: 'self_request', game: { game_mode: 'wolf' } }, 'pending'],
    ['full, asked already, then closed', { isFull: true, requestView: 'self_request', game: { game_mode: 'wolf', signups_closed_at: '2026-11-01T10:00:00Z' } }, 'pending'],
    ['full manual approval', { isFull: true, game: { game_mode: 'wolf', registration_mode: 'manual_approval' } }, 'request'],
  ])('%s', (_name, over, expected) => {
    expect(signupOffer(row(over))).toBe(expected);
  });

  it('join is the plain solo form only, and every view has one offer', () => {
    for (const facts of signupFactsMatrix()) {
      const offer = signupOffer(facts);
      expect(offer).toBe(offerForView(signupView(facts), facts.game));
      if (offer === 'join') {
        expect(isMatchplayMode(facts.game.game_mode)).toBe(false);
        expect(['club_member_form', 'friend_form', 'solo_open_form']).toContain(signupView(facts));
        expect(facts.isFull).toBe(false);
      }
    }
  });
});

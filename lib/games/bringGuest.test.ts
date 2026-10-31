import { describe, it, expect } from 'vitest';
import { bringGuestBlock, type BringGuestGame, type BringGuestPlayer } from './bringGuest';

/**
 * Type A (#2607, fase 2): who gets «Ta med en gjest» — the row on the game
 * page, the page and the action share this one gate.
 */

const PLAYER = 'player';
const game = (over: Partial<BringGuestGame> = {}): BringGuestGame => ({
  status: 'scheduled',
  created_by: 'organiser',
  game_mode: 'stableford',
  registration_mode: 'open',
  registration_type: 'solo',
  signups_closed_at: null,
  tournament_id: null,
  league_round_id: null,
  ...over,
});
const player = (over: Partial<BringGuestPlayer> = {}): BringGuestPlayer => ({
  userId: PLAYER,
  seat: { withdrawn_at: null },
  isGuest: false,
  ...over,
});

describe('bringGuestBlock', () => {
  it.each([
    ['open sign-up', game()],
    ['manual approval', game({ registration_mode: 'manual_approval' })],
    ['«both» on a solo format', game({ registration_type: 'both' })],
  ])('a signed-up player in a scheduled round with %s may bring a guest', (_label, g) => {
    expect(bringGuestBlock(g, player())).toBeNull();
  });

  it.each([
    ['not on the roster', game(), player({ seat: null }), 'not_on_roster'],
    ['withdrawn', game(), player({ seat: { withdrawn_at: '2026-10-30T10:00:00Z' } }), 'withdrawn'],
    ['a guest', game(), player({ isGuest: true }), 'is_guest'],
    ['the organiser', game({ created_by: PLAYER }), player(), 'is_organiser'],
    ['a draft', game({ status: 'draft' }), player(), 'game_locked'],
    ['a started round', game({ status: 'active' }), player(), 'game_locked'],
    ['invite only', game({ registration_mode: 'invite_only' }), player(), 'wrong_mode'],
    ['sign-up closed', game({ signups_closed_at: '2026-10-30T10:00:00Z' }), player(), 'signup_closed'],
    ['a cup match', game({ tournament_id: 'cup' }), player(), 'cup'],
    ['a league round', game({ league_round_id: 'round' }), player(), 'league'],
    ['matchplay', game({ game_mode: 'fourball_matchplay' }), player(), 'matchplay'],
    ['a team sign-up', game({ game_mode: 'texas_scramble', registration_type: 'team' }), player(), 'team_format'],
    ['«both» on a team format', game({ game_mode: 'best_ball', registration_type: 'both' }), player(), 'team_format'],
  ] as const)('%s → %s', (_label, g, p, code) => {
    expect(bringGuestBlock(g, p)).toBe(code);
  });
});

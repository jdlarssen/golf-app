import { describe, expect, it } from 'vitest';
import {
  buildAppRoundInviteView,
  type AppRoundInviteViewGame,
  type AppTeamSignupForm,
} from './appRoundInviteView';

/** Type A (#2748): what the app gets about a round before you are on it. */

const GAME: AppRoundInviteViewGame = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Sommercup 2026',
  short_id: 'abc12345',
  game_mode: 'stableford',
  mode_config: { kind: 'stableford', team_size: 1 } as AppRoundInviteViewGame['mode_config'],
  courses: { name: 'Larvik GK' },
  tee_box: { name: 'Gul' },
  scheduled_tee_off_at: '2026-11-20T09:00:00Z',
  entry_fee_kr: 200,
};

const NO_EXTRAS = { seats: null, ownRequestCancellable: false };

describe('buildAppRoundInviteView', () => {
  it('has the card details, the count and the web path', () => {
    expect(buildAppRoundInviteView(GAME, 'join', 7, NO_EXTRAS)).toEqual({
      offer: 'join',
      round: {
        name: 'Sommercup 2026',
        modeLabel: 'Stableford',
        courseName: 'Larvik GK',
        teeName: 'Gul',
        teeOffAt: '2026-11-20T09:00:00Z',
        entryFeeKr: 200,
      },
      playerCount: 7,
      seats: null,
      canCancelRequest: false,
      signupPath: '/signup/abc12345',
      teamSignup: null,
      hasTeamPage: false,
    });
  });

  // #2840
  it('carries the team screen and the team page beside the offer, which stays web', () => {
    const teamSignup: AppTeamSignupForm = {
      kind: 'form',
      teamSize: 2,
      nameMin: 3,
      nameMax: 40,
      suggestedName: 'Martins lag',
      unavailableFriendIds: [],
    };
    const view = buildAppRoundInviteView(GAME, 'web', 3, NO_EXTRAS, { teamSignup, hasTeamPage: true });
    expect(view).toMatchObject({ offer: 'web', teamSignup, hasTeamPage: true });
  });

  it('carries the seats as numbers (#2837)', () => {
    const seats = { kind: 'capped', cap: 12, held: 12 } as const;
    expect(buildAppRoundInviteView(GAME, 'request', 12, { ...NO_EXTRAS, seats }).seats).toEqual(seats);
  });

  it('offers to withdraw only a waiting request that can be withdrawn (#2837)', () => {
    const can = { ...NO_EXTRAS, ownRequestCancellable: true };
    expect(buildAppRoundInviteView(GAME, 'pending', 7, can).canCancelRequest).toBe(true);
    expect(buildAppRoundInviteView(GAME, 'pending', 7, NO_EXTRAS).canCancelRequest).toBe(false);
    for (const offer of ['in_game', 'locked', 'closed', 'join', 'request', 'web'] as const) {
      expect(buildAppRoundInviteView(GAME, offer, 7, can).canCancelRequest).toBe(false);
    }
  });

  it('gives the game id only to a player on the list', () => {
    expect(buildAppRoundInviteView(GAME, 'in_game', 7, NO_EXTRAS).gameId).toBe(GAME.id);
    for (const offer of ['pending', 'locked', 'closed', 'join', 'request', 'web'] as const) {
      expect(buildAppRoundInviteView(GAME, offer, 7, NO_EXTRAS)).not.toHaveProperty('gameId');
    }
  });

  it('names the variant the card names', () => {
    const game = {
      ...GAME,
      mode_config: { kind: 'stableford', team_size: 2 } as AppRoundInviteViewGame['mode_config'],
    };
    expect(buildAppRoundInviteView(game, 'web', 0, NO_EXTRAS).round.modeLabel).toBe('4BBB Stableford');
  });

  it('has no course, tee or tee-off when the round has none', () => {
    const game = { ...GAME, courses: null, tee_box: null, scheduled_tee_off_at: null };
    expect(buildAppRoundInviteView(game, 'join', 0, NO_EXTRAS).round).toMatchObject({
      courseName: null,
      teeName: null,
      teeOffAt: null,
    });
  });
});

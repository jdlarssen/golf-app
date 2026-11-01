import { describe, expect, it } from 'vitest';
import { buildAppRoundInviteView, type AppRoundInviteViewGame } from './appRoundInviteView';

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

describe('buildAppRoundInviteView', () => {
  it('has the card details, the count and the web path', () => {
    expect(buildAppRoundInviteView(GAME, 'join', 7)).toEqual({
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
      signupPath: '/signup/abc12345',
    });
  });

  it('gives the game id only to a player on the list', () => {
    expect(buildAppRoundInviteView(GAME, 'in_game', 7).gameId).toBe(GAME.id);
    for (const offer of ['pending', 'locked', 'closed', 'join', 'request', 'web'] as const) {
      expect(buildAppRoundInviteView(GAME, offer, 7)).not.toHaveProperty('gameId');
    }
  });

  it('names the variant the card names', () => {
    const game = {
      ...GAME,
      mode_config: { kind: 'stableford', team_size: 2 } as AppRoundInviteViewGame['mode_config'],
    };
    expect(buildAppRoundInviteView(game, 'web', 0).round.modeLabel).toBe('4BBB Stableford');
  });

  it('has no course, tee or tee-off when the round has none', () => {
    const game = { ...GAME, courses: null, tee_box: null, scheduled_tee_off_at: null };
    expect(buildAppRoundInviteView(game, 'join', 0).round).toMatchObject({
      courseName: null,
      teeName: null,
      teeOffAt: null,
    });
  });
});

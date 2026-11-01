import { describe, it, expect } from 'vitest';
import { softWithdrawOpen } from './softWithdrawRule';

/** Type A (#2752): when a withdrawal can be undone. The server and both buttons read this. */
describe('softWithdrawOpen', () => {
  it.each(['best_ball', 'stableford', 'modified_stableford', 'solo_strokeplay'])(
    'et aktivt spill i %s: ja',
    (gameMode) => {
      expect(softWithdrawOpen({ status: 'active', gameMode })).toBe(true);
    },
  );

  it.each(['singles_matchplay', 'fourball_matchplay', 'foursomes_matchplay', 'wolf'])(
    'et aktivt spill i %s, som ikke kjenner frafall: nei',
    (gameMode) => {
      expect(softWithdrawOpen({ status: 'active', gameMode })).toBe(false);
    },
  );

  it.each(['draft', 'scheduled', 'finished'])('et spill som er %s: nei', (status) => {
    expect(softWithdrawOpen({ status, gameMode: 'best_ball' })).toBe(false);
  });
});

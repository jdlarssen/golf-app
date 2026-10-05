import { describe, expect, it } from 'vitest';
import { isNewPlayer } from './isNewPlayer';

// Type A: when the Klubbhus room shows the new player's version (#2494). Only
// when all three reads worked and found nothing: no standalone round you made,
// no club, no cup. A failed read is never «new»: the room from #2493 shows its
// error box instead.
const none = {
  rounds: { ok: true as const, games: [] },
  clubs: { ok: true as const, clubs: [] },
  cups: { ok: true as const, ids: [] },
};
const failed = { ok: false as const };

describe('isNewPlayer', () => {
  it('no round, no club, no cup → new', () => {
    expect(isNewPlayer(none)).toBe(true);
  });

  it.each([
    ['one round', { ...none, rounds: { ok: true as const, games: [{ id: 'g' }] } }],
    ['one club', { ...none, clubs: { ok: true as const, clubs: [{ id: 'c' }] } }],
    ['one cup', { ...none, cups: { ok: true as const, ids: ['cup'] } }],
    ['the rounds read failed', { ...none, rounds: failed }],
    ['the clubs read failed', { ...none, clubs: failed }],
    ['the cups read failed', { ...none, cups: failed }],
  ])('%s → not new', (_label, reads) => {
    expect(isNewPlayer(reads)).toBe(false);
  });
});

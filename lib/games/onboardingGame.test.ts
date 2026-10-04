import { describe, it, expect } from 'vitest';
import { gameIdFromNext, isOnboardingGameOpen } from './onboardingGame';

/**
 * #2350: «Fullfør profilen» shows the round you came from (`next=/games/<id>`).
 * Which `next` names a game, and which game is still worth a card. The app
 * (#2216) uses the same open-rule for its own pick.
 */

const ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('gameIdFromNext', () => {
  it.each<[string, string | null]>([
    [`/games/${ID}`, ID],
    [`/games/${ID}/holes/3`, ID],
    [`/games/${ID}/scorecard`, ID],
    [`/games/${ID}/submit`, ID],
    [`/games/${ID.toUpperCase()}`, ID.toUpperCase()],
    [`/games/${ID}?tab=leaderboard`, ID],
    ['/games/not-a-uuid', null],
    ['/games/', null],
    ['/games', null],
    [`/signup/${ID}`, null],
    [`/cup/${ID}`, null],
    [`/admin/games/${ID}`, null],
    ['/', null],
    ['', null],
  ])('%s → %s', (next, expected) => {
    expect(gameIdFromNext(next)).toBe(expected);
  });
});

describe('isOnboardingGameOpen', () => {
  const open = { withdrawn_at: null, status: 'scheduled', source_game_id: null };

  it.each(['scheduled', 'active'])('a %s game gets a card', (status) => {
    expect(isOnboardingGameOpen({ ...open, status })).toBe(true);
  });

  it.each(['finished', 'draft'])('a %s game gets no card', (status) => {
    expect(isOnboardingGameOpen({ ...open, status })).toBe(false);
  });

  it('a withdrawn player gets no card', () => {
    expect(isOnboardingGameOpen({ ...open, withdrawn_at: '2026-10-01T10:00:00Z' })).toBe(false);
  });

  it('a segment game (source_game_id set) gets no card', () => {
    expect(isOnboardingGameOpen({ ...open, source_game_id: ID })).toBe(false);
  });
});

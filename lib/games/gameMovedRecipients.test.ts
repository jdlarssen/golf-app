import { describe, it, expect } from 'vitest';
import { gameMovedRecipients, type GameMovedRosterRow } from './gameMovedRecipients';

// #2480: who hears that a round has moved. Type A: the rule alone, no
// Supabase. The page's name line and the send use the same function.

const ORGANISER = 'organiser';
const ADMIN = 'admin';

const row = (user_id: string, withdrawn_at: string | null = null): GameMovedRosterRow => ({
  user_id,
  withdrawn_at,
});

const none = new Set<string>();

describe('gameMovedRecipients', () => {
  it('an empty roster moved by the organiser tells nobody', () => {
    expect(
      gameMovedRecipients({ roster: [], guestIds: none, actorUserId: ORGANISER, createdBy: ORGANISER }),
    ).toEqual([]);
  });

  it('a roster of only the one who moves it tells nobody', () => {
    expect(
      gameMovedRecipients({
        roster: [row(ORGANISER)],
        guestIds: none,
        actorUserId: ORGANISER,
        createdBy: ORGANISER,
      }),
    ).toEqual([]);
  });

  it('tells every other active player, in roster order', () => {
    expect(
      gameMovedRecipients({
        roster: [row(ORGANISER), row('marte'), row('jonas'), row('anders')],
        guestIds: none,
        actorUserId: ORGANISER,
        createdBy: ORGANISER,
      }),
    ).toEqual(['marte', 'jonas', 'anders']);
  });

  it('leaves out a player who has withdrawn and a guest', () => {
    expect(
      gameMovedRecipients({
        roster: [row(ORGANISER), row('marte'), row('trakk-seg', '2026-10-01T10:00:00.000Z'), row('gjest')],
        guestIds: new Set(['gjest']),
        actorUserId: ORGANISER,
        createdBy: ORGANISER,
      }),
    ).toEqual(['marte']);
  });

  it('an admin who moves it tells the organiser, also when the organiser does not play', () => {
    expect(
      gameMovedRecipients({
        roster: [row('marte'), row('jonas')],
        guestIds: none,
        actorUserId: ADMIN,
        createdBy: ORGANISER,
      }),
    ).toEqual(['marte', 'jonas', ORGANISER]);
  });

  it('the organiser who plays is told once when an admin moves it, and the admin never', () => {
    expect(
      gameMovedRecipients({
        roster: [row(ORGANISER), row(ADMIN), row('marte'), row('marte')],
        guestIds: none,
        actorUserId: ADMIN,
        createdBy: ORGANISER,
      }),
    ).toEqual([ORGANISER, 'marte']);
  });

  it('a game without an organiser adds nobody, and a guest organiser is not told', () => {
    expect(
      gameMovedRecipients({ roster: [row('marte')], guestIds: none, actorUserId: ADMIN, createdBy: null }),
    ).toEqual(['marte']);
    expect(
      gameMovedRecipients({
        roster: [row('marte')],
        guestIds: new Set([ORGANISER]),
        actorUserId: ADMIN,
        createdBy: ORGANISER,
      }),
    ).toEqual(['marte']);
  });

  it('leaves out the players added in the same save, who get their invite instead', () => {
    expect(
      gameMovedRecipients({
        roster: [row(ORGANISER), row('marte'), row('ny')],
        guestIds: none,
        actorUserId: ORGANISER,
        createdBy: ORGANISER,
        excludeIds: new Set(['ny']),
      }),
    ).toEqual(['marte']);
  });
});

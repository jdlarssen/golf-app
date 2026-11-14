import { describe, it, expect } from 'vitest';
import { NOTIFICATION_KINDS } from './types';
import { pushGroupForKind } from './pushGroups';
import { isQuietHour, shouldPush, type PushPreferences } from './pushPreferences';

/**
 * Type A (#2315): the rule notify() asks before it pushes. Quiet hours are
 * 22:00–07:00 Norwegian time, so the instants below are written in UTC and
 * cover both winter time (UTC+1) and summer time (UTC+2).
 */

// January: Oslo is UTC+1. July: Oslo is UTC+2.
const WINTER = {
  '21:59': '2026-01-15T20:59:00Z',
  '22:00': '2026-01-15T21:00:00Z',
  '06:59': '2026-01-16T05:59:00Z',
  '07:00': '2026-01-16T06:00:00Z',
};
const SUMMER = {
  '21:59': '2026-07-15T19:59:00Z',
  '22:00': '2026-07-15T20:00:00Z',
  '06:59': '2026-07-16T04:59:00Z',
  '07:00': '2026-07-16T05:00:00Z',
};

const NIGHT = new Date('2026-01-15T23:30:00Z'); // 00:30 in Oslo
const DAY = new Date('2026-01-15T11:00:00Z'); // 12:00 in Oslo

const prefs = (over: Partial<PushPreferences> = {}): PushPreferences => ({
  mutedGroups: [],
  quietHours: false,
  ...over,
});

describe('isQuietHour', () => {
  describe.each([
    ['winter time', WINTER],
    ['summer time', SUMMER],
  ])('%s', (_label, at) => {
    it('21:59 is not quiet', () => expect(isQuietHour(new Date(at['21:59']))).toBe(false));
    it('22:00 is quiet', () => expect(isQuietHour(new Date(at['22:00']))).toBe(true));
    it('06:59 is quiet', () => expect(isQuietHour(new Date(at['06:59']))).toBe(true));
    it('07:00 is not quiet', () => expect(isQuietHour(new Date(at['07:00']))).toBe(false));
  });

  it('half past midnight is quiet, noon is not', () => {
    expect(isQuietHour(NIGHT)).toBe(true);
    expect(isQuietHour(DAY)).toBe(false);
  });
});

describe('shouldPush', () => {
  it('no preferences (no row, or the read failed) pushes as today, day and night', () => {
    expect(shouldPush({ kind: 'friend_request', prefs: null, now: DAY })).toBe(true);
    expect(shouldPush({ kind: 'friend_request', prefs: null, now: NIGHT })).toBe(true);
  });

  it('a row with nothing muted and quiet hours off pushes everything', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(shouldPush({ kind, prefs: prefs(), now: NIGHT })).toBe(true);
    }
  });

  it('a muted group does not push; the other groups still do', () => {
    const p = prefs({ mutedGroups: ['friends'] });
    expect(shouldPush({ kind: 'friend_request', prefs: p, now: DAY })).toBe(false);
    expect(shouldPush({ kind: 'friend_achievement', prefs: p, now: DAY })).toBe(false);
    expect(shouldPush({ kind: 'scorecard_submitted', prefs: p, now: DAY })).toBe(true);
    expect(shouldPush({ kind: 'game_started', prefs: p, now: DAY })).toBe(true);
  });

  it('all three groups muted: only «Rundene dine» pushes', () => {
    const p = prefs({ mutedGroups: ['scorecards', 'friends', 'signups'] });
    for (const kind of NOTIFICATION_KINDS) {
      expect([kind, shouldPush({ kind, prefs: p, now: DAY })]).toEqual([kind, pushGroupForKind(kind) === 'rounds']);
    }
  });

  it('the locked group pushes even when it stands in the list', () => {
    const p = prefs({ mutedGroups: ['rounds'] });
    expect(shouldPush({ kind: 'game_started', prefs: p, now: DAY })).toBe(true);
    expect(shouldPush({ kind: 'idea_built', prefs: p, now: DAY })).toBe(true);
  });

  it('quiet hours at night stop the groups that can be turned off', () => {
    const p = prefs({ quietHours: true });
    expect(shouldPush({ kind: 'friend_request', prefs: p, now: NIGHT })).toBe(false);
    expect(shouldPush({ kind: 'scorecard_submitted', prefs: p, now: NIGHT })).toBe(false);
    expect(shouldPush({ kind: 'registration_request', prefs: p, now: NIGHT })).toBe(false);
  });

  it('quiet hours at night still let «Rundene dine» push (the owner, 14.11: «Nei, runder plinger»)', () => {
    const p = prefs({ quietHours: true, mutedGroups: ['rounds'] });
    expect(shouldPush({ kind: 'game_started', prefs: p, now: NIGHT })).toBe(true);
    expect(shouldPush({ kind: 'idea_built', prefs: p, now: NIGHT })).toBe(true);
  });

  it('quiet hours on in the daytime change nothing', () => {
    const p = prefs({ quietHours: true });
    expect(shouldPush({ kind: 'friend_request', prefs: p, now: DAY })).toBe(true);
  });

  it('quiet hours follow the 22:00 and 07:00 bounds in winter and summer', () => {
    const p = prefs({ quietHours: true });
    for (const at of [WINTER, SUMMER]) {
      expect(shouldPush({ kind: 'friend_request', prefs: p, now: new Date(at['21:59']) })).toBe(true);
      expect(shouldPush({ kind: 'friend_request', prefs: p, now: new Date(at['22:00']) })).toBe(false);
      expect(shouldPush({ kind: 'friend_request', prefs: p, now: new Date(at['06:59']) })).toBe(false);
      expect(shouldPush({ kind: 'friend_request', prefs: p, now: new Date(at['07:00']) })).toBe(true);
    }
  });

  it('quiet hours off at night push as today', () => {
    expect(shouldPush({ kind: 'friend_request', prefs: prefs(), now: NIGHT })).toBe(true);
  });

  it('unknown values in the list are ignored', () => {
    const p = prefs({ mutedGroups: ['news', 'ukjent', ''] });
    for (const kind of NOTIFICATION_KINDS) {
      expect(shouldPush({ kind, prefs: p, now: DAY })).toBe(true);
    }
  });

  it('a group listed twice counts once', () => {
    const p = prefs({ mutedGroups: ['friends', 'friends'] });
    expect(shouldPush({ kind: 'friend_request', prefs: p, now: DAY })).toBe(false);
    expect(shouldPush({ kind: 'game_started', prefs: p, now: DAY })).toBe(true);
  });
});

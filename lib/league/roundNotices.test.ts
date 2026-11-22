import { describe, expect, it } from 'vitest';
import { CLOSING_REMINDER_LEAD_MS, dueNotices, noticeRecipients, type NoticeRound } from './roundNotices';

/**
 * Type A (#2638 Del 3): which of the round's two messages are due, and who
 * gets them. The edge-case table lives in the PR; each row is a case here.
 */

const NOW = Date.parse('2026-11-05T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function round(over: Partial<NoticeRound> = {}): NoticeRound {
  return {
    opens_at: new Date(NOW - 12 * 24 * HOUR).toISOString(),
    closes_at: new Date(NOW + 5 * 24 * HOUR).toISOString(),
    opening_notice_sent_at: null,
    closing_reminder_sent_at: null,
    ...over,
  };
}

describe('dueNotices', () => {
  it('an open round nobody has told yet: the opening message only, while over 48 hours are left', () => {
    expect(dueNotices(round(), NOW)).toEqual(['league_round_open']);
  });

  it('the opening message is due the moment the round opens', () => {
    expect(dueNotices(round({ opens_at: new Date(NOW).toISOString() }), NOW)).toEqual(['league_round_open']);
    expect(dueNotices(round({ opens_at: new Date(NOW + 1).toISOString() }), NOW)).toEqual([]);
  });

  it('under 48 hours left: the reminder is due; exactly 48 hours is not yet', () => {
    const told = { opening_notice_sent_at: new Date(NOW - 10 * 24 * HOUR).toISOString() };
    expect(
      dueNotices(round({ ...told, closes_at: new Date(NOW + CLOSING_REMINDER_LEAD_MS - 60_000).toISOString() }), NOW),
    ).toEqual(['league_round_closing']);
    expect(
      dueNotices(round({ ...told, closes_at: new Date(NOW + CLOSING_REMINDER_LEAD_MS).toISOString() }), NOW),
    ).toEqual([]);
  });

  it('a short round: both are due in the same run, the opening message first', () => {
    expect(
      dueNotices(round({ opens_at: new Date(NOW - HOUR).toISOString(), closes_at: new Date(NOW + 20 * HOUR).toISOString() }), NOW),
    ).toEqual(['league_round_open', 'league_round_closing']);
  });

  it('a stamped message is never due again', () => {
    const stamped = new Date(NOW - HOUR).toISOString();
    expect(
      dueNotices(
        round({
          closes_at: new Date(NOW + 20 * HOUR).toISOString(),
          opening_notice_sent_at: stamped,
          closing_reminder_sent_at: stamped,
        }),
        NOW,
      ),
    ).toEqual([]);
  });

  it('a closed round, or one that has not opened, gets nothing (also when it closes within 48 hours)', () => {
    expect(dueNotices(round({ closes_at: new Date(NOW).toISOString() }), NOW)).toEqual([]);
    expect(dueNotices(round({ closes_at: new Date(NOW - HOUR).toISOString() }), NOW)).toEqual([]);
    expect(
      dueNotices(
        round({ opens_at: new Date(NOW + HOUR).toISOString(), closes_at: new Date(NOW + 20 * HOUR).toISOString() }),
        NOW,
      ),
    ).toEqual([]);
  });

  it('PostgREST offsets and fractional seconds read as the same instants', () => {
    expect(
      dueNotices(
        round({ opens_at: '2026-10-23T22:00:00+00:00', closes_at: '2026-11-06T22:59:00.5+00:00' }),
        // 10:00 in Oslo: a daytime instant, so the night hold below is not in play.
        Date.parse('2026-11-05T09:00:00Z'),
      ),
    ).toEqual(['league_round_open', 'league_round_closing']);
  });
});

/**
 * #2974: nothing goes out in quiet hours (22:00–07:00 in Oslo, the same hours
 * as the push choices). What falls due at night goes on the first run after
 * 07:00. `now` is a parameter, so the instants are fixed dates.
 */
describe('dueNotices: nothing in quiet hours', () => {
  // The league's ordinary round: opens Monday 00:00 and closes Sunday 23:59 two
  // weeks later, Oslo time (winter, UTC+1).
  const winterRound = (over: Partial<NoticeRound> = {}) =>
    round({ opens_at: '2026-12-06T23:00:00Z', closes_at: '2026-12-20T22:59:00Z', ...over });

  it.each([
    ['06:59 is held', '2026-12-07T05:59:00Z', []],
    ['07:00 goes', '2026-12-07T06:00:00Z', ['league_round_open']],
    ['21:59 goes', '2026-12-07T20:59:00Z', ['league_round_open']],
    ['22:00 is held', '2026-12-07T21:00:00Z', []],
  ])('winter time: %s', (_name, at, expected) => {
    expect(dueNotices(winterRound(), Date.parse(at))).toEqual(expected);
  });

  it.each([
    ['06:59 is held', '2027-06-07T04:59:00Z', []],
    ['07:00 goes', '2027-06-07T05:00:00Z', ['league_round_open']],
  ])('summer time: %s', (_name, at, expected) => {
    expect(
      dueNotices(round({ opens_at: '2027-06-06T22:00:00Z', closes_at: '2027-06-20T21:59:00Z' }), Date.parse(at)),
    ).toEqual(expected);
  });

  it('the ordinary round: the opening message waits from 00:41 to 07:41 on the day it opens', () => {
    expect(dueNotices(winterRound(), Date.parse('2026-12-06T23:41:00Z'))).toEqual([]);
    expect(dueNotices(winterRound(), Date.parse('2026-12-07T06:41:00Z'))).toEqual(['league_round_open']);
  });

  it('the ordinary round: the reminder passes its 48 hours on Friday 23:59 and goes on Saturday 07:41', () => {
    const told = winterRound({ opening_notice_sent_at: '2026-12-07T06:41:00Z' });
    expect(dueNotices(told, Date.parse('2026-12-18T23:41:00Z'))).toEqual([]);
    expect(dueNotices(told, Date.parse('2026-12-19T06:41:00Z'))).toEqual(['league_round_closing']);
  });

  it('a round that closes before the night is over is not held: now is the last chance', () => {
    // 22:41 on the night the round closes at 23:59.
    expect(dueNotices(winterRound(), Date.parse('2026-12-20T21:41:00Z'))).toEqual([
      'league_round_open',
      'league_round_closing',
    ]);
    // 23:00, and the round closes 07:30: the 07:41 run would find it closed.
    const closesEarly = winterRound({ closes_at: '2026-12-08T06:30:00Z' });
    expect(dueNotices(closesEarly, Date.parse('2026-12-07T22:00:00Z'))).toEqual([
      'league_round_open',
      'league_round_closing',
    ]);
    // Closes 08:01: the first run after 07:00 reaches it, so it waits.
    const closesLater = winterRound({ closes_at: '2026-12-08T07:01:00Z' });
    expect(dueNotices(closesLater, Date.parse('2026-12-07T22:00:00Z'))).toEqual([]);
  });

  it('the night the clocks go back is an hour longer, and the hold follows the Oslo clock', () => {
    // 25 October 2026, 01:30 summer time. The night ends 07:00 winter time (06:00Z).
    const now = Date.parse('2026-10-24T23:30:00Z');
    const open = { opens_at: '2026-10-20T22:00:00Z' };
    // Closes 07:59 Oslo: before the first run after 07:00 can reach it.
    expect(dueNotices(round({ ...open, closes_at: '2026-10-25T06:59:00Z' }), now)).toEqual([
      'league_round_open',
      'league_round_closing',
    ]);
    // Closes 08:01 Oslo: held.
    expect(dueNotices(round({ ...open, closes_at: '2026-10-25T07:01:00Z' }), now)).toEqual([]);
  });
});

describe('noticeRecipients', () => {
  const flight = (status: string, players: Array<[string, string | null]>) => ({
    status,
    players: players.map(([userId, withdrawnAt]) => ({ userId, withdrawnAt })),
  });

  it('nobody in the league: nobody to tell', () => {
    expect(noticeRecipients([], [flight('finished', [['a', null]])])).toEqual([]);
  });

  it('one player without a flight gets it', () => {
    expect(noticeRecipients(['a'], [])).toEqual(['a']);
  });

  it('delivered and in-progress players are left out; a withdrawn flight leaves the player in', () => {
    expect(
      noticeRecipients(
        ['delivered', 'playing', 'scheduled', 'withdrew', 'missing'],
        [
          flight('finished', [['delivered', null]]),
          flight('active', [['playing', null]]),
          flight('scheduled', [['scheduled', null]]),
          flight('active', [['withdrew', '2026-11-04T10:00:00Z']]),
        ],
      ),
    ).toEqual(['withdrew', 'missing']);
  });

  it('a player who withdrew from one flight and delivered another has played', () => {
    expect(
      noticeRecipients(
        ['a'],
        [flight('active', [['a', '2026-11-04T10:00:00Z']]), flight('finished', [['a', null]])],
      ),
    ).toEqual([]);
  });

  it('a co-player in a flight who is not in the league is not told', () => {
    expect(noticeRecipients(['a'], [flight('active', [['guest', null]])])).toEqual(['a']);
  });

  it('the same player twice in the list is told once', () => {
    expect(noticeRecipients(['a', 'a', 'b'], [])).toEqual(['a', 'b']);
  });
});

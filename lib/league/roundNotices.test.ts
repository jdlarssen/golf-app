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
        Date.parse('2026-11-05T00:00:00Z'),
      ),
    ).toEqual(['league_round_open', 'league_round_closing']);
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

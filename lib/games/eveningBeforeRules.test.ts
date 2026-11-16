import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import { buildNotificationText, type NotificationTranslator } from '@/lib/notifications/cardContent';
import type { NotificationPayload } from '@/lib/notifications/types';
import {
  EVENING_NOTICE_HOUR,
  eveningCounts,
  eveningSweepWindow,
  isEveningNoticeDue,
  isTomorrowInOslo,
  summarizeUnanswered,
  type EveningGame,
  type EveningRosterRow,
} from './eveningBeforeRules';

/**
 * Type A (#2483): who gets the organiser's status the evening before, and when.
 * `now` is passed in, so the dates below are fixed on purpose: no test here
 * reads the clock. Oslo is UTC+1 in winter and UTC+2 in summer.
 */

const ORG = 'org';

function game(overrides: Partial<EveningGame> = {}): EveningGame {
  return {
    status: 'scheduled',
    // Saturday 21 November 2026, 09:00 Oslo (winter).
    scheduled_tee_off_at: '2026-11-21T08:00:00.000Z',
    created_at: '2026-01-02T12:00:00.000Z',
    created_by: ORG,
    tournament_id: null,
    source_game_id: null,
    league_round_id: null,
    organizer_evening_notice_sent_at: null,
    ...overrides,
  };
}

function row(user_id: string, overrides: Partial<EveningRosterRow> = {}): EveningRosterRow {
  return { user_id, withdrawn_at: null, accepted_at: '2026-11-11T10:00:00.000Z', is_guest: false, ...overrides };
}

const ROSTER = [row(ORG), row('kari', { accepted_at: null })];

const at = (iso: string) => Date.parse(iso);

describe('isEveningNoticeDue — the window', () => {
  // Friday 20 November 2026, Oslo = UTC+1: 18:00 Oslo is 17:00Z.
  it.each([
    ['17:59 Oslo the evening before', '2026-11-20T16:59:00.000Z', false],
    ['18:00 Oslo the evening before', '2026-11-20T17:00:00.000Z', true],
    ['23:59 Oslo the evening before', '2026-11-20T22:59:00.000Z', true],
    ['00:00 Oslo on the day itself', '2026-11-20T23:00:00.000Z', false],
    ['18:00 Oslo two evenings before', '2026-11-19T17:00:00.000Z', false],
    ['the evening of the round itself', '2026-11-21T19:00:00.000Z', false],
  ])('%s → %s', (_label, now, expected) => {
    expect(isEveningNoticeDue(game(), ROSTER, at(now))).toBe(expected);
  });

  it('the hour is 18, the owner\'s answer 2026-11-16', () => {
    expect(EVENING_NOTICE_HOUR).toBe(18);
  });

  // Summer time starts Sunday 29 March 2026 at 02:00. The evening before is a
  // winter Saturday (UTC+1); the round is in summer time (UTC+2).
  it('a Sunday round after the clocks go forward: Saturday 18:00 Oslo is 17:00Z', () => {
    const sunday = game({ scheduled_tee_off_at: '2026-03-29T07:00:00.000Z' }); // 09:00 CEST
    expect(isEveningNoticeDue(sunday, ROSTER, at('2026-03-28T16:59:00.000Z'))).toBe(false);
    expect(isEveningNoticeDue(sunday, ROSTER, at('2026-03-28T17:00:00.000Z'))).toBe(true);
    expect(isEveningNoticeDue(sunday, ROSTER, at('2026-03-28T22:59:00.000Z'))).toBe(true);
    expect(isEveningNoticeDue(sunday, ROSTER, at('2026-03-28T23:00:00.000Z'))).toBe(false);
  });

  // Winter time starts Sunday 25 October 2026 at 03:00. The evening before is
  // a summer Saturday (UTC+2); the round is in winter time (UTC+1).
  it('a Sunday round after the clocks go back: Saturday 18:00 Oslo is 16:00Z', () => {
    const sunday = game({ scheduled_tee_off_at: '2026-10-25T08:00:00.000Z' }); // 09:00 CET
    expect(isEveningNoticeDue(sunday, ROSTER, at('2026-10-24T15:59:00.000Z'))).toBe(false);
    expect(isEveningNoticeDue(sunday, ROSTER, at('2026-10-24T16:00:00.000Z'))).toBe(true);
    expect(isEveningNoticeDue(sunday, ROSTER, at('2026-10-24T21:59:00.000Z'))).toBe(true);
    expect(isEveningNoticeDue(sunday, ROSTER, at('2026-10-24T22:00:00.000Z'))).toBe(false);
  });

  it('an early round just after midnight still belongs to its own day', () => {
    const early = game({ scheduled_tee_off_at: '2026-11-20T23:30:00.000Z' }); // Sat 00:30 Oslo
    expect(isEveningNoticeDue(early, ROSTER, at('2026-11-20T17:00:00.000Z'))).toBe(true);
  });
});

describe('isEveningNoticeDue — which rounds', () => {
  const NOW = at('2026-11-20T18:00:00.000Z'); // Friday 19:00 Oslo

  it.each([
    ['a draft', { status: 'draft' }],
    ['a round in progress', { status: 'active' }],
    ['a finished round', { status: 'finished' }],
    ['a round without a tee-off', { scheduled_tee_off_at: null }],
    ['a cup match', { tournament_id: 'cup' }],
    ['a derived game', { source_game_id: 'host' }],
    ['a league flight', { league_round_id: 'round' }],
    ['a round without an organiser', { created_by: null }],
    ['a round already told', { organizer_evening_notice_sent_at: '2026-11-20T17:00:00.000Z' }],
    ['a round set up at 18:00 that evening', { created_at: '2026-11-20T17:00:00.000Z' }],
    ['a round set up later that evening', { created_at: '2026-11-20T17:30:00.000Z' }],
  ] as const)('%s → false', (_label, overrides) => {
    expect(isEveningNoticeDue(game(overrides as Partial<EveningGame>), ROSTER, NOW)).toBe(false);
  });

  it('a round set up at 17:59 that evening → true', () => {
    expect(isEveningNoticeDue(game({ created_at: '2026-11-20T16:59:00.000Z' }), ROSTER, NOW)).toBe(true);
  });

  it.each([
    ['an empty list', []],
    ['the organiser alone', [row(ORG)]],
    ['the organiser and a guest', [row(ORG), row('gjest', { is_guest: true })]],
    ['the organiser and someone who withdrew', [row(ORG), row('ola', { withdrawn_at: '2026-11-15T10:00:00.000Z' })]],
  ])('nobody to wait for (%s) → false', (_label, roster) => {
    expect(isEveningNoticeDue(game(), roster, NOW)).toBe(false);
  });

  it('a non-playing organiser with one player on the list → true', () => {
    expect(isEveningNoticeDue(game(), [row('kari')], NOW)).toBe(true);
  });

  it('everyone has confirmed → still due (the varsel says so)', () => {
    expect(isEveningNoticeDue(game(), [row(ORG), row('kari')], NOW)).toBe(true);
  });
});

describe('eveningSweepWindow', () => {
  it('is closed before 18:00 Oslo and open after', () => {
    expect(eveningSweepWindow(at('2026-11-20T16:59:00.000Z')).open).toBe(false);
    expect(eveningSweepWindow(at('2026-11-20T17:00:00.000Z')).open).toBe(true);
  });

  it('asks for every round the rule can say yes to tonight', () => {
    const now = at('2026-11-20T17:00:00.000Z');
    const w = eveningSweepWindow(now);
    expect(w.createdBefore).toBe('2026-11-20T17:00:00.000Z');
    // Tomorrow from 00:00 to 23:59 Oslo lies inside (teeOffAfter, teeOffBefore).
    for (const teeOff of ['2026-11-20T23:00:00.000Z', '2026-11-21T22:59:00.000Z']) {
      expect(Date.parse(teeOff) > Date.parse(w.teeOffAfter)).toBe(true);
      expect(Date.parse(teeOff) < Date.parse(w.teeOffBefore)).toBe(true);
    }
  });

  it('covers the whole next day also on the evening the clocks go back', () => {
    // Sat 24 Oct 2026 23:59 CEST; Sunday is 25 hours long and ends at 23:00Z.
    const w = eveningSweepWindow(at('2026-10-24T21:59:00.000Z'));
    expect(Date.parse('2026-10-25T22:59:00.000Z') < Date.parse(w.teeOffBefore)).toBe(true);
  });
});

describe('isTomorrowInOslo', () => {
  it.each([
    ['Friday 23:59 Oslo, round Saturday 09:00', '2026-11-20T22:59:00.000Z', true],
    ['Saturday 00:00 Oslo, round the same day', '2026-11-20T23:00:00.000Z', false],
    ['Thursday evening, round two days later', '2026-11-19T20:00:00.000Z', false],
    ['Friday 08:00 Oslo', '2026-11-20T07:00:00.000Z', true],
  ])('%s → %s', (_label, now, expected) => {
    expect(isTomorrowInOslo('2026-11-21T08:00:00.000Z', at(now))).toBe(expected);
  });
});

describe('eveningCounts', () => {
  it('counts confirmed and everyone not withdrawn; a guest counts as confirmed', () => {
    const roster = [
      row(ORG),
      row('gjest', { is_guest: true, accepted_at: null }),
      row('kari', { accepted_at: null }),
      row('ola', { accepted_at: null, withdrawn_at: '2026-11-15T10:00:00.000Z' }),
    ];
    const c = eveningCounts(roster);
    expect([c.confirmed.map((r) => r.user_id), c.unanswered.map((r) => r.user_id), c.total]).toEqual([
      [ORG, 'gjest'],
      ['kari'],
      3,
    ]);
  });
});

describe('summarizeUnanswered', () => {
  it.each([
    [['Kari'], { unanswered_names: ['Kari'], unanswered_more: 0 }],
    [['Kari', 'Ola', 'Per'], { unanswered_names: ['Kari', 'Ola', 'Per'], unanswered_more: 0 }],
    [['Kari', 'Ola', 'Per', 'Anne', 'Siv'], { unanswered_names: ['Kari', 'Ola', 'Per'], unanswered_more: 2 }],
    [['Kari', null, ''], { unanswered_names: ['Kari'], unanswered_more: 2 }],
    [[], { unanswered_names: [], unanswered_more: 0 }],
  ])('%j → %j', (names, expected) => {
    expect(summarizeUnanswered(names)).toEqual(expected);
  });
});

// The whole chain the varsel goes through: roster → counts → payload → text,
// in Norwegian through the real catalog.
describe('the varsel text', () => {
  const t = createTranslator({
    locale: 'no',
    messages: noMessages,
    namespace: 'inbox',
    timeZone: 'Europe/Oslo',
  }) as unknown as NotificationTranslator;

  function textFor(roster: EveningRosterRow[], names: Record<string, string>) {
    const c = eveningCounts(roster);
    const payload = {
      game_id: '11111111-1111-1111-1111-111111111111',
      game_name: 'Lørdagsrunden',
      tee_off_at: '2026-11-21T08:00:00.000Z',
      confirmed: c.confirmed.length,
      total: c.total,
      ...summarizeUnanswered(c.unanswered.map((r) => names[r.user_id] ?? null)),
    };
    return buildNotificationText('organizer_evening_status', payload as NotificationPayload, t);
  }

  const confirmedSeven = ['marte', 'jonas', 'anders', 'ida', 'sondre', 'tone', 'eirik'].map((id) => row(id));

  it('«7 av 8 har bekreftet. Kari har ikke svart.»', () => {
    expect(textFor([...confirmedSeven, row('kari', { accepted_at: null })], { kari: 'Kari' })).toEqual({
      title: 'I morgen: Lørdagsrunden',
      detail: '7 av 8 har bekreftet. Kari har ikke svart.',
    });
  });

  it('two names: «Kari og Ola»', () => {
    const roster = [...confirmedSeven.slice(0, 6), row('kari', { accepted_at: null }), row('ola', { accepted_at: null })];
    expect(textFor(roster, { kari: 'Kari', ola: 'Ola' }).detail).toBe(
      '6 av 8 har bekreftet. Kari og Ola har ikke svart.',
    );
  });

  it('over three: «Kari, Ola, Per og 2 til»', () => {
    const missing = ['kari', 'ola', 'per', 'anne', 'siv'].map((id) => row(id, { accepted_at: null }));
    const roster = [...confirmedSeven.slice(0, 3), ...missing];
    expect(textFor(roster, { kari: 'Kari', ola: 'Ola', per: 'Per', anne: 'Anne', siv: 'Siv' }).detail).toBe(
      '3 av 8 har bekreftet. Kari, Ola, Per og 2 til har ikke svart.',
    );
  });

  it('everyone confirmed, a guest among them: «Alle 8 har bekreftet.»', () => {
    const roster = [...confirmedSeven, row('gjest', { is_guest: true, accepted_at: null })];
    expect(textFor(roster, {}).detail).toBe('Alle 8 har bekreftet.');
  });

  it('two on the list, both confirmed: «Begge har bekreftet.»', () => {
    expect(textFor([row(ORG), row('kari')], {}).detail).toBe('Begge har bekreftet.');
  });
});

// ONE RULE, THREE PLACES: the hour in the cron gate (0242) is this module's.
it('the cron gate in 0242 opens at EVENING_NOTICE_HOUR', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/0242_evening_before_cron.sql'),
    'utf8',
  );
  const hours = [...sql.matchAll(/at time zone 'Europe\/Oslo'\) >= (\d+)/g)].map((m) => Number(m[1]));
  const cutoffs = [...sql.matchAll(/time '(\d+):00'/g)].map((m) => Number(m[1]));
  expect([hours, cutoffs]).toEqual([[EVENING_NOTICE_HOUR], [EVENING_NOTICE_HOUR]]);
});

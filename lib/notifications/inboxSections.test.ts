import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';
import type { AppLocale } from '@/i18n/routing';
import { NOTIFICATION_KINDS, type NotificationKind, type NotificationPayload } from './types';
import type { NotificationTranslator } from './cardContent';
import { NOTIFICATION_ICON } from './icons';
import { WAITING_KINDS, isWaitingRow } from './readOnVisit';
import { testPayloads } from './testPayloads';
import {
  buildInboxEntryView,
  buildInboxSections,
  countActionRows,
  findSettledActionIds,
  groupPeople,
  inboxActionKey,
  inboxGroupKey,
  inboxPerson,
  namesLine,
  rowPersonName,
  teeOffLine,
  trimToWholeDays,
  type InboxRow,
  type InboxTextContext,
  type SettledCard,
  type SettledInputs,
  type SettledOwnPlayer,
} from './inboxSections';

// 2026-10-01 is summer time in Oslo (UTC+2). NOW = 10:00 Oslo.
const NOW = new Date('2026-10-01T08:00:00Z').getTime();
const GAME = '11111111-1111-1111-1111-111111111111';
const GAME_2 = '22222222-2222-2222-2222-222222222222';
const REQ = '33333333-3333-3333-3333-333333333333';
const MARTE = '44444444-4444-4444-4444-444444444444';
const JONAS = '55555555-5555-5555-5555-555555555555';
const VIEWER = '66666666-6666-6666-6666-666666666666';
const LEAGUE = '77777777-7777-7777-7777-777777777777';
const ROUND = '88888888-8888-8888-8888-888888888888';

let seq = 0;
function row(
  kind: NotificationKind,
  payload: Record<string, unknown>,
  opts: { read?: boolean; at?: string; id?: string } = {},
): InboxRow {
  seq += 1;
  return {
    id: opts.id ?? `n-${seq}`,
    kind,
    payload: payload as NotificationPayload,
    read_at: opts.read ? '2026-10-01T07:59:00Z' : null,
    created_at: opts.at ?? new Date(NOW - seq * 60_000).toISOString(),
  };
}

const peer = (name: string | null, id?: string, opts?: Parameters<typeof row>[2]) =>
  row(
    'peer_approval_request',
    { game_id: GAME, game_name: 'Lørdagsrunden', submitter_name: name, ...(id ? { submitter_id: id } : {}) },
    opts,
  );
const delivered = (name: string | null, id?: string, opts?: Parameters<typeof row>[2]) =>
  row(
    'scorecard_submitted',
    { game_id: GAME, game_name: 'Lørdagsrunden', player_name: name, ...(id ? { player_id: id } : {}) },
    opts,
  );
const signup = (name: string, extra: Record<string, unknown> = {}, opts?: Parameters<typeof row>[2]) =>
  row('registration_request', { game_id: GAME_2, game_name: 'Onsdagsgolfen', requester_name: name, ...extra }, opts);

function tFor(locale: AppLocale, namespace: 'inbox' | 'finishedCard'): NotificationTranslator {
  return createTranslator({
    locale,
    messages: locale === 'no' ? noMessages : enMessages,
    namespace,
    timeZone: 'Europe/Oslo',
  }) as unknown as NotificationTranslator;
}

function ctx(locale: AppLocale = 'no', over: Partial<InboxTextContext> = {}): InboxTextContext {
  return {
    t: tFor(locale, 'inbox'),
    tFinished: tFor(locale, 'finishedCard'),
    locale,
    now: NOW,
    teeOffByGame: {},
    resultByGame: {},
    finishedGameIds: [],
    ...over,
  };
}

describe('inboxActionKey', () => {
  it.each([
    ['peer_approval_request', 'review'],
    ['deliver_reminder', 'deliver'],
    ['missing_score_reminder', 'enterScore'],
    ['scorecard_rejected', 'fixCard'],
    ['scorecard_reopened', 'fixCard'],
    ['friend_request', 'reply'],
    ['team_invite', 'reply'],
    ['club_join_request', 'reply'],
    ['team_member_withdrew', 'inviteNew'],
    ['player_added', 'confirm'],
    ['invite', 'confirm'],
    ['auto_start_blocked', 'seeMissing'],
    ['payment_reminder', 'seePayment'],
    ['all_scorecards_delivered', 'finishGame'],
    ['game_stale_reminder', 'finishGame'],
    ['league_round_open', 'playRound'],
    ['league_round_closing', 'playRound'],
    ['scorecard_submitted', null],
    ['scorecard_approved', null],
    ['game_finished', null],
    ['game_reopened', null],
    ['product_update', null],
    ['registration_approved', null],
    ['registration_rejected', null],
    ['registration_expired', null],
    ['cup_finished', null],
    ['cup_started', null],
    ['cup_signup', null],
    ['cup_lineup_revealed', null],
    ['club_role_changed', null],
    ['friend_accepted', null],
    ['game_started', null],
    ['achievement_unlocked', null],
    ['idea_built', null],
    ['game_cancelled', null],
    ['friend_achievement', null],
  ] as const)('%s → %s', (kind, expected) => {
    expect(inboxActionKey({ kind, payload: {} as NotificationPayload })).toBe(expected);
  });

  // #2440: no role — the varsel goes to the organiser, the server decides.
  it('registration_request: Godta/Avslå with request_id, a plain row without', () => {
    expect(inboxActionKey(signup('Kristian', { request_id: REQ }))).toBe('decide');
    expect(inboxActionKey(signup('Kristian'))).toBeNull();
  });

  it('a captain’s request (team_name) still gets Godta/Avslå', () => {
    expect(
      inboxActionKey(signup('Kristian', { request_id: REQ, team_name: 'Bogeybros' })),
    ).toBe('decide');
  });
});


describe('inboxGroupKey', () => {
  it('groups delivered cards, approval requests and open-signup heads-ups per game', () => {
    expect(inboxGroupKey(delivered('Marte'))).toBe(`scorecard_submitted:${GAME}`);
    expect(inboxGroupKey(peer('Marte'))).toBe(`peer_approval_request:${GAME}`);
    expect(inboxGroupKey(signup('Kristian'))).toBe(`registration_request:${GAME_2}`);
  });

  it('a pending request is answered one by one, so it never groups', () => {
    expect(inboxGroupKey(signup('Kristian', { request_id: REQ }))).toBeNull();
  });
});

describe('inboxPerson', () => {
  it('drops the nickname and gives first name + initials', () => {
    expect(inboxPerson('Marte Lie «Birdie»')).toEqual({ full: 'Marte Lie', short: 'Marte', initials: 'ML' });
  });

  it('keeps a masked address whole, initial = its first character', () => {
    expect(inboxPerson('ol•••@gmail.com')).toEqual({ full: 'ol•••@gmail.com', short: 'ol•••@gmail.com', initials: 'O' });
  });

  it('null / blank → null', () => {
    expect(inboxPerson(null)).toBeNull();
    expect(inboxPerson('   ')).toBeNull();
  });
});

describe('rowPersonName', () => {
  it.each([
    ['invite', 'invited_by_name'],
    ['team_invite', 'invited_by_name'],
    ['peer_approval_request', 'submitter_name'],
    ['scorecard_submitted', 'player_name'],
    ['scorecard_approved', 'approver_name'],
    ['scorecard_rejected', 'rejecter_name'],
    ['scorecard_reopened', 'actor_name'],
    ['game_reopened', 'actor_name'],
    ['friend_request', 'actor_name'],
    ['friend_accepted', 'actor_name'],
    ['registration_request', 'requester_name'],
    ['club_join_request', 'requester_name'],
    ['team_member_withdrew', 'withdrawn_player_name'],
    ['cup_signup', 'participant_name'],
    ['player_added', 'added_by_name'],
  ] as const)('%s reads %s', (kind, field) => {
    expect(rowPersonName({ kind, payload: { [field]: 'Ola' } as NotificationPayload })).toBe('Ola');
  });

  it('kinds without a person field → null', () => {
    expect(rowPersonName({ kind: 'game_finished', payload: { game_id: GAME, game_name: 'X' } })).toBeNull();
  });
});

describe('buildInboxSections', () => {
  it('empty → empty sections, chip 0', () => {
    expect(buildInboxSections([], { filter: 'all', now: NOW })).toEqual({
      action: [],
      today: [],
      earlier: [],
    });
    expect(countActionRows([])).toBe(0);
  });

  it('one unread approval request → one action group «1 scorekort»', () => {
    const s = buildInboxSections([peer('Marte', MARTE)], { filter: 'all', now: NOW });
    expect(s.action).toHaveLength(1);
    expect(s.action[0]).toMatchObject({ type: 'group', kind: 'peer_approval_request', gameId: GAME });
  });

  it('four delivered cards in one game → one row, placed where the newest is', () => {
    const rows = [
      delivered('Marte Lie', MARTE),
      row('friend_accepted', { actor_id: JONAS, actor_name: 'Anders' }),
      delivered('Jonas Berg', JONAS),
      delivered('Kari'),
      delivered('Per'),
    ];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW });
    expect(s.today.map((e) => e.type)).toEqual(['group', 'single']);
    expect(s.today[0]).toMatchObject({ type: 'group', rows: expect.any(Array) });
    expect((s.today[0] as { rows: InboxRow[] }).rows).toHaveLength(4);
  });

  it('groups form within a section, never across today/earlier', () => {
    const rows = [
      delivered('Marte', MARTE),
      delivered('Jonas', JONAS),
      delivered('Kari', undefined, { at: '2026-09-29T10:00:00Z' }),
      delivered('Per', undefined, { at: '2026-09-29T09:00:00Z' }),
    ];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW });
    expect(s.today).toHaveLength(1);
    expect(s.earlier).toHaveLength(1);
    expect(s.today[0]!.type).toBe('group');
    expect(s.earlier[0]!.type).toBe('group');
  });

  it('the same person twice is one person: a single row that still covers both rows', () => {
    const rows = [delivered('Marte', MARTE), delivered('Marte', MARTE)];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW });
    expect(s.today).toHaveLength(1);
    expect(s.today[0]).toMatchObject({ type: 'single' });
    expect((s.today[0] as { rows: InboxRow[] }).rows).toHaveLength(2);
  });

  it('a group is unread when one member is', () => {
    const rows = [delivered('Marte', MARTE, { read: true }), delivered('Jonas', JONAS)];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW });
    expect(s.today[0]).toMatchObject({ type: 'group', unread: true });
  });

  it('read approval requests leave KREVER HANDLING and group under I DAG', () => {
    const rows = [peer('Marte', MARTE, { read: true }), peer('Jonas', JONAS, { read: true })];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW });
    expect(s.action).toEqual([]);
    expect(s.today[0]).toMatchObject({ type: 'group', kind: 'peer_approval_request' });
  });

  it('midnight: 00:30 Oslo is today, 23:59 Oslo the day before is earlier', () => {
    const rows = [
      delivered('Marte', MARTE, { at: '2026-09-30T22:30:00Z' }),
      delivered('Jonas', JONAS, { at: '2026-09-30T21:59:00Z' }),
    ];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW });
    expect(s.today).toHaveLength(1);
    expect(s.earlier).toHaveLength(1);
  });

  it('filter action → only KREVER HANDLING; chip counts a group once', () => {
    const rows = [
      peer('Marte', MARTE),
      peer('Jonas', JONAS),
      signup('Kristian', { request_id: REQ }),
      delivered('Per'),
    ];
    const s = buildInboxSections(rows, { filter: 'action', now: NOW });
    expect(s.action).toHaveLength(2);
    expect(s.today).toEqual([]);
    expect(countActionRows(rows)).toBe(2);
  });

  it('filter friends → friend requests and friendships in every section', () => {
    const rows = [
      row('friend_request', { actor_id: JONAS, actor_name: 'Jonas' }),
      row('friend_accepted', { actor_id: MARTE, actor_name: 'Anders' }, { read: true }),
      delivered('Per'),
    ];
    const s = buildInboxSections(rows, { filter: 'friends', now: NOW });
    expect(s.action.map((e) => (e as { row: InboxRow }).row.kind)).toEqual(['friend_request']);
    expect(s.today.map((e) => (e as { row: InboxRow }).row.kind)).toEqual(['friend_accepted']);
  });

  // #2800: a friend's brag sits with the friends, never under KREVER HANDLING.
  it('filter friends → a friend’s eagle is there too, as a plain row', () => {
    const rows = [
      row('friend_achievement', {
        game_id: GAME,
        player_id: MARTE,
        player_name: 'Marte',
        course_name: 'Bogstad',
        league_id: null,
        moments: [{ kind: 'eagle', hole_number: 4 }],
      }),
      delivered('Per'),
    ];
    const s = buildInboxSections(rows, { filter: 'friends', now: NOW });
    expect(s.action).toEqual([]);
    expect(s.today.map((e) => (e as { row: InboxRow }).row.kind)).toEqual(['friend_achievement']);
  });
});

describe('groupPeople', () => {
  it('dedupes by card owner id, else by name; nameless rows count but show no name', () => {
    const p = groupPeople([
      delivered('Marte Lie', MARTE),
      delivered('Marte L.', MARTE),
      delivered('Jonas'),
      delivered('jonas'),
      delivered(null),
    ]);
    expect(p.total).toBe(3);
    expect(p.named.map((n) => n.short)).toEqual(['Marte', 'Jonas']);
  });
});

describe('groupPeople across the deploy (#2263)', () => {
  it('an older row without the card id and a newer one with it are the same person', () => {
    const p = groupPeople([delivered('Marte Lie', MARTE), delivered('Marte Lie')]);
    expect(p.total).toBe(1);
    expect(p.named.map((n) => n.initials)).toEqual(['ML']);
  });

  it('two people with the same name but different ids stay two', () => {
    expect(groupPeople([delivered('Ola Nordmann', MARTE), delivered('Ola Nordmann', JONAS)]).total).toBe(2);
  });
});

describe('namesLine', () => {
  const people = (...names: (string | null)[]) => groupPeople(names.map((n) => peer(n)));
  it.each([
    [['Marte'], 'Marte'],
    [['Marte', 'Jonas'], 'Marte og Jonas'],
    [['Marte', 'Jonas', 'Kari'], 'Marte, Jonas og Kari'],
    [['Marte', 'Jonas', 'Kari', 'Per'], 'Marte, Jonas og 2 til'],
    [['Marte', null], 'Marte og 1 til'],
    [[null], 'En spiller'],
    [[null, null], '2 spillere'],
  ] as const)('no: %j → «%s»', (names, expected) => {
    expect(namesLine(people(...names), ctx('no'))).toBe(expected);
  });

  it('en: «Marte, Jonas and 2 more»', () => {
    expect(namesLine(people('Marte', 'Jonas', 'Kari', 'Per'), ctx('en'))).toBe('Marte, Jonas and 2 more');
  });
});

describe('teeOffLine', () => {
  it.each([
    ['no', '2026-10-01T15:30:00Z', '1. okt kl. 17:30'],
    // Summer time ends 25 Oct: 16:30Z is 17:30 in Oslo.
    ['no', '2026-10-25T16:30:00Z', '25. okt kl. 17:30'],
    ['en', '2026-10-01T15:30:00Z', '1 Oct at 17:30'],
    ['en', '2026-10-25T16:30:00Z', '25 Oct at 17:30'],
  ] as const)('%s %s → «%s»', (locale, iso, expected) => {
    expect(teeOffLine(iso, ctx(locale))).toBe(expected);
  });

  it('no start time → null', () => {
    expect(teeOffLine(null, ctx())).toBeNull();
  });
});

describe('buildInboxEntryView', () => {
  function view(rows: InboxRow[], section: 'action' | 'today' | 'earlier', c = ctx()) {
    const s = buildInboxSections(rows, { filter: 'all', now: NOW });
    return buildInboxEntryView(s[section][0]!, section, c);
  }

  it('the artboard’s approval row', () => {
    const v = view([peer('Marte Lie', MARTE), peer('Jonas Berg', JONAS)], 'action');
    expect(v.title).toBe('2 scorekort venter på deg');
    expect(v.subtitle).toBe('Lørdagsrunden · Marte og Jonas har levert');
    expect(v.actionKey).toBe('review');
    expect(v.destination).toBe(`/games/${GAME}/approve`);
  });

  it('one approval request: «1 scorekort venter på deg» / «Marte har levert»', () => {
    const v = view([peer('Marte Lie', MARTE)], 'action');
    expect(v.title).toBe('1 scorekort venter på deg');
    expect(v.subtitle).toBe('Lørdagsrunden · Marte har levert');
  });

  it('the artboard’s signup request, with start time and greeting', () => {
    const v = view(
      [signup('Kristian Holm', { request_id: REQ, message: ' Gleder meg! ' })],
      'action',
      ctx('no', { teeOffByGame: { [GAME_2]: '2026-10-01T15:30:00Z' } }),
    );
    expect(v.title).toBe('Kristian vil bli med');
    expect(v.subtitle).toBe('Onsdagsgolfen · 1. okt kl. 17:30');
    expect(v.quote).toBe('«Gleder meg!»');
    expect(v.actionKey).toBe('decide');
  });

  it('a captain’s request names the team; no start time → just the game', () => {
    const v = view([signup('Kristian', { request_id: REQ, team_name: 'Bogeybros' })], 'action');
    expect(v.subtitle).toBe('Onsdagsgolfen · Lag Bogeybros');
  });

  it('the artboard’s group row «4 scorekort levert», ML JB +2', () => {
    const rows = [
      delivered('Marte Lie', MARTE, { at: new Date(NOW - 120_000).toISOString() }),
      delivered('Jonas Berg', JONAS, { at: new Date(NOW - 180_000).toISOString() }),
      delivered('Kari Nes', undefined, { at: new Date(NOW - 240_000).toISOString() }),
      delivered('Per Ås', undefined, { at: new Date(NOW - 300_000).toISOString() }),
    ];
    const v = view(rows, 'today');
    expect(v.title).toBe('4 scorekort levert');
    expect(v.subtitle).toBe('Lørdagsrunden · sist for 2 min siden');
    expect(v.avatar).toEqual({ kind: 'people', initials: ['ML', 'JB'], more: 2 });
    expect(v.destination).toBe(`/games/${GAME}`);
  });

  it('read approval requests: «N scorekort levert» or «Marte leverte scorekortet», never «venter»', () => {
    const two = view([peer('Marte', MARTE, { read: true }), peer('Jonas', JONAS, { read: true })], 'today');
    expect(two.title).toBe('2 scorekort levert');
    expect(two.destination).toBe(`/games/${GAME}/approve`);
    const one = view([peer('Marte Lie', MARTE, { read: true })], 'today');
    expect(one.title).toBe('Marte leverte scorekortet');
    expect(one.subtitle).toMatch(/^Lørdagsrunden · /);
  });

  it('signup heads-ups: «N nye påmeldinger» while all unread, else «N påmeldinger»', () => {
    expect(view([signup('Kristian'), signup('Ola')], 'today').title).toBe('2 nye påmeldinger');
    expect(view([signup('Kristian'), signup('Ola', {}, { read: true })], 'today').title).toBe('2 påmeldinger');
    expect(view([signup('Kristian Holm')], 'today').title).toBe('Kristian meldte seg på');
  });

  it('#2440: a pending request goes to the signup page; a heads-up too', () => {
    expect(view([signup('Kristian', { request_id: REQ })], 'action').destination).toBe(
      `/admin/games/${GAME_2}/signups`,
    );
    expect(view([signup('Kristian')], 'today').destination).toBe(`/admin/games/${GAME_2}/signups`);
  });

  it.each([
    ['link', 'Anders la deg til som venn'],
    ['accept', 'Anders godtok venneforespørselen din'],
    [undefined, 'Anders ble venn med deg'],
  ] as const)('friendship via=%s → «%s», subtitle only the time', (via, title) => {
    const v = view(
      [row('friend_accepted', { actor_id: MARTE, actor_name: 'Anders Moe', ...(via ? { via } : {}) }, { at: new Date(NOW - 3_600_000).toISOString() })],
      'today',
    );
    expect(v.title).toBe(title);
    expect(v.subtitle).toBe('for 1 time siden');
    expect(v.avatar).toEqual({ kind: 'people', initials: ['AM'], more: 0 });
  });

  it('en friendship texts', () => {
    const v = view([row('friend_accepted', { actor_id: MARTE, actor_name: 'Anders', via: 'link' })], 'today', ctx('en'));
    expect(v.title).toBe('Anders added you as a friend');
  });

  describe('Resultatet er klart', () => {
    const finished = (at = '2026-09-30T18:00:00Z') =>
      row('game_finished', { game_id: GAME, game_name: 'Onsdagsgolfen' }, { at });

    it('placement → place disc, «2. plass av 12» for screen readers, «i går»', () => {
      const v = view([finished()], 'earlier', ctx('no', {
        resultByGame: { [GAME]: { kind: 'placement', rank: 2, fieldSize: 12, isTeam: false } },
        finishedGameIds: [GAME],
      }));
      expect(v.avatar).toEqual({ kind: 'place', rank: 2 });
      expect(v.placeLabel).toBe('2. plass av 12');
      expect(v.subtitle).toBe('Onsdagsgolfen · i går');
    });

    it('a win is the same light disc with «1»', () => {
      const v = view([finished()], 'earlier', ctx('no', {
        resultByGame: { [GAME]: { kind: 'placement', rank: 1, fieldSize: 12, isTeam: false } },
        finishedGameIds: [GAME],
      }));
      expect(v.avatar).toEqual({ kind: 'place', rank: 1 });
      expect(v.placeLabel).toBe('1. plass av 12');
    });

    it('skins shows the place', () => {
      const v = view([finished()], 'earlier', ctx('no', {
        resultByGame: { [GAME]: { kind: 'skins', rank: 3, fieldSize: 8, skins: 2 } },
        finishedGameIds: [GAME],
      }));
      expect(v.avatar).toEqual({ kind: 'place', rank: 3 });
    });

    it('matchplay: outcome in the subtitle, no place disc', () => {
      const v = view([finished()], 'earlier', ctx('no', {
        resultByGame: { [GAME]: { kind: 'matchplay', outcome: 'win', margin: '3&2' } },
        finishedGameIds: [GAME],
      }));
      expect(v.avatar).toEqual({ kind: 'icon', icon: 'pokal' });
      expect(v.subtitle).toBe('Onsdagsgolfen · Du vant 3&2 · i går');
    });

    // #2712 (owner 31.10): a league flight played alone has no placement.
    it('a league flight played alone: «Godkjent» in the subtitle, no place disc', () => {
      const v = view([finished()], 'earlier', ctx('no', {
        resultByGame: { [GAME]: { kind: 'placement', rank: 1, fieldSize: 1, isTeam: false } },
        finishedGameIds: [GAME],
        leagueFlightGameIds: [GAME],
      }));
      expect(v.avatar.kind).not.toBe('place');
      expect(v.placeLabel).toBeNull();
      expect(v.subtitle).toBe('Onsdagsgolfen · Godkjent · i går');
    });

    it('a league flight of several keeps its place', () => {
      const v = view([finished()], 'earlier', ctx('no', {
        resultByGame: { [GAME]: { kind: 'placement', rank: 1, fieldSize: 2, isTeam: false } },
        finishedGameIds: [GAME],
        leagueFlightGameIds: [GAME],
      }));
      expect(v.avatar).toEqual({ kind: 'place', rank: 1 });
    });

    it('a reopened game shows no place', () => {
      const v = view([finished()], 'earlier', ctx('no', {
        resultByGame: { [GAME]: { kind: 'placement', rank: 2, fieldSize: 12, isTeam: false } },
        finishedGameIds: [],
      }));
      expect(v.avatar).toEqual({ kind: 'icon', icon: 'pokal' });
      expect(v.placeLabel).toBeNull();
    });
  });

  it.each([
    ['deliver_reminder', { game_id: GAME, game_name: 'X' }, 'Påminnelse om scorekortet'],
    ['scorecard_rejected', { game_id: GAME, game_name: 'X', rejecter_name: 'Ola' }, 'Scorekortet ble sendt tilbake'],
    ['friend_request', { actor_id: MARTE, actor_name: 'Jonas Berg' }, 'Jonas sendte deg en venneforespørsel'],
    ['team_invite', { game_id: GAME, game_short_id: 'abcd1234', game_name: 'X', team_name: 'Lag 1', invited_by_name: 'Ola', request_id: REQ }, 'Ola inviterte deg til Lag 1'],
    ['club_join_request', { group_id: GAME, group_name: 'Klubben', requester_name: 'Ola' }, 'Ola ba om å bli med i klubben'],
    ['payment_reminder', { game_id: GAME, game_name: 'X', entry_fee_kr: 200 }, 'Påminnelse om startkontingenten'],
    ['player_added', { game_id: GAME, game_name: 'X', added_by_name: 'Ola Nordmann' }, 'Ola la deg til i X'],
  ] as const)('read %s says it in the past: «%s»', (kind, payload, title) => {
    expect(view([row(kind, payload, { read: true })], 'today').title).toBe(title);
  });

  describe('#2203: the organiser’s two finish rows', () => {
    const at = new Date(NOW - 120_000).toISOString();
    const allIn = (opts: Parameters<typeof row>[2] = {}) =>
      row('all_scorecards_delivered', { game_id: GAME, game_name: 'Lørdagsrunden' }, { at, ...opts });
    const stale = (opts: Parameters<typeof row>[2] = {}) =>
      row('game_stale_reminder', { game_id: GAME, game_name: 'Lørdagsrunden' }, { at, ...opts });

    it('«Alle har levert» waits under KREVER HANDLING with «Avslutt spillet»', () => {
      const v = view([allIn()], 'action');
      expect(v.title).toBe('Alle har levert');
      expect(v.subtitle).toBe('Lørdagsrunden · for 2 min siden');
      expect(v.actionKey).toBe('finishGame');
      expect(v.destination).toBe(`/games/${GAME}/avslutt`);
      expect(tFor('no', 'inbox')(`buttons.${v.actionKey}`)).toBe('Avslutt spillet');
    });

    it('the stale reminder names the game in the title and says why below it', () => {
      const v = view([stale()], 'action');
      expect(v.title).toBe('Lørdagsrunden står stille');
      expect(v.subtitle).toBe(
        'Det har ikke kommet nye slag på et døgn. Avslutt spillet når du er klar. · for 2 min siden',
      );
      expect(v.actionKey).toBe('finishGame');
      expect(v.destination).toBe(`/games/${GAME}/avslutt`);
    });

    it('read, both say it in the past; the game name shows once in each row', () => {
      const done = view([allIn({ read: true })], 'today');
      expect(done.title).toBe('Alle leverte');
      expect(`${done.title} ${done.subtitle}`.match(/Lørdagsrunden/g)).toHaveLength(1);
      const reminded = view([stale({ read: true })], 'today');
      expect(reminded.title).toBe('Påminnelse om å avslutte Lørdagsrunden');
      expect(reminded.subtitle).toMatch(/^Det har ikke kommet nye slag på et døgn/);
    });

    it('en: both rows and the button read in English', () => {
      const v = view([allIn()], 'action', ctx('en'));
      expect(v.title).toBe('Everyone has delivered');
      expect(tFor('en', 'inbox')(`buttons.${v.actionKey}`)).toBe('Finish the game');
      expect(view([stale({ read: true })], 'today', ctx('en')).title).toBe(
        'Reminder to finish Lørdagsrunden',
      );
    });
  });

  describe('#2638: the league round’s two rows', () => {
    const at = new Date(NOW - 120_000).toISOString();
    // 22:59 UTC on 6 November is 23:59 in Oslo (winter time, UTC+1).
    const round = (
      kind: 'league_round_open' | 'league_round_closing',
      closesAt = '2026-11-06T22:59:00.000Z',
      opts: Parameters<typeof row>[2] = {},
    ) =>
      row(
        kind,
        { league_id: LEAGUE, league_name: 'Vinterligaen', round_id: ROUND, round_label: 'Runde 3', closes_at: closesAt },
        { at, ...opts },
      );

    it('«er åpen» waits under KREVER HANDLING with the deadline and «Spill runden»', () => {
      const v = view([round('league_round_open')], 'action');
      expect(v.title).toBe('Runde 3 i Vinterligaen er åpen');
      expect(v.subtitle).toBe('Spill den når det passer deg. Fristen er fredag 6. nov. kl. 23:59. · for 2 min siden');
      expect(v.actionKey).toBe('playRound');
      expect(v.destination).toBe(`/liga/${LEAGUE}`);
      expect(tFor('no', 'inbox')(`buttons.${v.actionKey}`)).toBe('Spill runden');
    });

    it('the reminder names the deadline in the title and says why below it', () => {
      const v = view([round('league_round_closing')], 'action');
      expect(v.title).toBe('Runde 3 i Vinterligaen stenger fredag 6. nov. kl. 23:59');
      expect(v.subtitle).toBe('Du har ikke spilt den ennå. · for 2 min siden');
      expect(v.actionKey).toBe('playRound');
      expect(v.destination).toBe(`/liga/${LEAGUE}`);
    });

    it('summer time: 21:59 UTC is still 23:59 on the Oslo clock', () => {
      const v = view([round('league_round_closing', '2027-06-04T21:59:00.000Z')], 'action');
      expect(v.title).toBe('Runde 3 i Vinterligaen stenger fredag 4. juni kl. 23:59');
    });

    it('en: the rows and the button read in English', () => {
      expect(view([round('league_round_closing')], 'action', ctx('en')).title).toBe(
        'Runde 3 in Vinterligaen closes Friday, Nov 6 at 23:59',
      );
      expect(view([round('league_round_open')], 'action', ctx('en')).subtitle).toBe(
        'Play it when it suits you. The deadline is Friday, Nov 6 at 23:59. · 2 min ago',
      );
      expect(tFor('en', 'inbox')('buttons.playRound')).toBe('Play the round');
    });
  });

  // #2480: a kind this code does not know (written by a newer build) is left
  // off the board and out of the «Krever handling» count, never thrown on.
  it('#2480: skips a row of an unknown kind on the board and in the action count', () => {
    const unknown = { ...row('invite', { game_id: GAME, game_name: 'X', invited_by_name: 'Per' }), id: 'u1', kind: 'game_from_a_newer_build' } as unknown as InboxRow;
    const known = row('invite', { game_id: GAME, game_name: 'Y', invited_by_name: 'Per' });
    const s = buildInboxSections([unknown, known], { filter: 'all', now: NOW });
    const ids = [...s.action, ...s.today, ...s.earlier].flatMap((e) => (e.type === 'single' ? e.rows : e.rows).map((r) => r.id));
    expect(ids).toEqual([known.id]);
    expect(countActionRows([unknown, known])).toBe(1);
  });

  // #2480: the row names the game in the title and the new tee-off below it,
  // in Oslo time, like the league deadline. It is news, not a task.
  it('#2480: a moved round shows the new time under the title, in Oslo time', () => {
    const at = new Date(NOW - 120_000).toISOString();
    const v = view(
      [
        row(
          'game_moved',
          {
            game_id: GAME,
            game_name: 'Lørdagsrunden',
            tee_off_at: '2026-11-08T08:00:00.000Z',
            course_changed: false,
            moved_by_name: 'Kari Arrangør',
          },
          { at },
        ),
      ],
      'today',
    );
    expect(v.title).toBe('Lørdagsrunden er flyttet');
    expect(v.subtitle).toBe('Ny tid: søndag 8. nov. kl. 09:00. Samme bane og tee. · for 2 min siden');
    expect(v.actionKey).toBeNull();
    expect(v.destination).toBe(`/games/${GAME}`);
  });

  it('detail kinds keep the detail before the time; a rejection reason is free text', () => {
    const v = view(
      [row('registration_rejected', { game_id: GAME, game_name: 'X', reason: 'Fullt' }, { read: true })],
      'today',
    );
    expect(v.subtitle).toMatch(/^Fullt · /);
    expect(v.subtitleIsFreeText).toBe(true);
    expect(v.destination).toBeNull();
  });

  // #2800: who got what, the holes and the course; the trophy, and a first name
  // like every other row. Friends open Venner, a league opens the league.
  describe('friend_achievement', () => {
    const brag = (extra: Record<string, unknown> = {}) =>
      row('friend_achievement', {
        game_id: GAME,
        player_id: MARTE,
        player_name: 'Marte Lie',
        course_name: 'Bogstad',
        league_id: null,
        moments: [
          { kind: 'eagle', hole_number: 4 },
          { kind: 'hole_in_one', hole_number: 12 },
        ],
        ...extra,
      });

    it('a friend’s round: first name and the best moment, holes and course, to Venner', () => {
      const v = view([brag()], 'today');
      expect(v.title).toBe('Marte fikk hole-in-one');
      expect(v.subtitle).toMatch(/^Hull 4 og 12 på Bogstad · /);
      expect(v.avatar).toEqual({ kind: 'icon', icon: 'pokal' });
      expect(v.destination).toBe('/profile/venner');
      expect(v.actionKey).toBeNull();
    });

    it('a league round opens the league', () => {
      const v = view([brag({ league_id: GAME_2 })], 'today');
      expect(v.destination).toBe(`/liga/${GAME_2}`);
    });

    it('in English', () => {
      const v = view([brag()], 'today', ctx('en'));
      expect(v.title).toBe('Marte got a hole-in-one');
      expect(v.subtitle).toMatch(/^Holes 4 and 12 at Bogstad · /);
    });
  });

  // #2481: the round is gone, so nothing to open. Who cancelled and when the
  // round was, then the greeting in full (it is the reason, never clipped).
  describe('game_cancelled', () => {
    const cancelled = (extra: Record<string, unknown> = {}) =>
      row('game_cancelled', {
        game_name: 'Lørdagsrunden',
        tee_off_at: '2026-10-03T07:00:00Z',
        organizer_name: 'Jørgen Larssen',
        ...extra,
      });

    it('names the organiser by first name, the round’s Oslo time, and quotes the greeting', () => {
      const v = view([cancelled({ message: 'Banen er stengt på grunn av frost.' })], 'today');
      expect(v.title).toBe('Lørdagsrunden er avlyst');
      expect(v.subtitle).toMatch(/^Jørgen har avlyst runden lørdag 3\. okt\. kl\. 09:00 · /);
      expect(v.body).toBe('«Banen er stengt på grunn av frost.»');
      expect(v.subtitleIsFreeText).toBe(false);
      expect(v.destination).toBeNull();
      expect(v.actionKey).toBeNull();
      expect(v.avatar).toEqual({ kind: 'icon', icon: 'flagg' });
    });

    it('without a greeting, a date or a name it still says what happened', () => {
      const v = view([cancelled({ tee_off_at: null, organizer_name: null })], 'today');
      expect(v.subtitle).toMatch(/^Arrangøren har avlyst runden · /);
      expect(v.body).toBeNull();
    });

    it('in English', () => {
      const v = view([cancelled({ message: 'The course is closed.' })], 'today', ctx('en'));
      expect(v.title).toBe('Lørdagsrunden has been cancelled');
      expect(v.subtitle).toMatch(/^Jørgen cancelled the round on Saturday, Oct 3 at 09:00 · /);
      expect(v.body).toBe('“The course is closed.”');
    });
  });

  it('product_update keeps its body and its call to action, no arrow target', () => {
    const v = view(
      [row('product_update', { source_id: GAME, title: 'Nytt i Tørny', body: 'Lang tekst', link: '/cup', cta_label: 'Se cupene' })],
      'today',
    );
    expect(v.title).toBe('Nytt i Tørny');
    expect(v.body).toBe('Lang tekst');
    expect(v.cta).toEqual({ href: '/cup', label: 'Se cupene' });
    expect(v.destination).toBeNull();
  });

  it('other rows: «{kontekst} · {tid}», or just the time without context', () => {
    const game = view([row('game_started', { game_id: GAME, game_name: 'Lørdagsrunden' }, { at: new Date(NOW - 120_000).toISOString() })], 'today');
    expect(game.subtitle).toBe('Lørdagsrunden · for 2 min siden');
    const idea = view([row('idea_built', { submission_id: GAME }, { at: new Date(NOW - 120_000).toISOString() })], 'today');
    expect(idea.subtitle).toBe('for 2 min siden');
  });

  it('#2568: idea_built shows the admin\'s line and goes to the link', () => {
    const at = { at: new Date(NOW - 120_000).toISOString() };
    const plain = view([row('idea_built', { submission_id: GAME }, at)], 'today');
    const idea = view(
      [row('idea_built', { submission_id: GAME, summary: 'Ryder Cup-oppsettet er klart', link: '/cup' }, at)],
      'today',
    );
    expect(idea.subtitle).toBe('Ryder Cup-oppsettet er klart · for 2 min siden');
    expect(idea.subtitleIsFreeText).toBe(true);
    expect(idea.destination).toBe('/cup');
    expect(idea.title).toBe(plain.title);
    expect(idea.avatar).toEqual({ kind: 'icon', icon: NOTIFICATION_ICON.idea_built });
  });
});

describe('trimToWholeDays', () => {
  it('under the limit → unchanged', () => {
    const rows = [delivered('A'), delivered('B')];
    expect(trimToWholeDays(rows, 3)).toBe(rows);
  });

  it('at the limit → drops the oldest Oslo day', () => {
    const rows = [
      delivered('A', undefined, { at: '2026-10-01T07:00:00Z' }),
      delivered('B', undefined, { at: '2026-09-30T10:00:00Z' }),
      delivered('C', undefined, { at: '2026-09-30T09:00:00Z' }),
    ];
    expect(trimToWholeDays(rows, 3).map((r) => r.payload)).toEqual([rows[0]!.payload]);
  });

  it('all on one day → keeps them rather than show nothing', () => {
    const rows = [delivered('A'), delivered('B')];
    expect(trimToWholeDays(rows, 2)).toHaveLength(2);
  });
});

describe('findSettledActionIds', () => {
  const PLAYING: SettledOwnPlayer = { paid_at: null, submitted_at: null, accepted_at: 'a', withdrawn_at: null };
  const card = (user_id: string, over: Partial<SettledCard> = {}, game_id = GAME): SettledCard => ({
    game_id,
    user_id,
    submitted_at: null,
    approved_at: null,
    withdrawn_at: null,
    marker_user_id: null,
    ...over,
  });
  // The viewer plays both games, which are running.
  const base: SettledInputs = {
    viewerId: VIEWER,
    now: NOW,
    requestStatus: new Map(),
    cards: [],
    own: new Map([
      [GAME, PLAYING],
      [GAME_2, PLAYING],
    ]),
    gameStatus: new Map([
      [GAME, 'active'],
      [GAME_2, 'active'],
    ]),
    ownRequestStatus: new Map(),
    pendingFriendIds: new Set(),
    pendingClubIds: new Set(),
    playedRoundIds: new Set(),
  };
  const inFinishedGame = { gameStatus: new Map([[GAME, 'finished']]) };
  const gameGone = { gameStatus: new Map<string, string>() };
  const ownIs = (over: Partial<SettledOwnPlayer>) => ({ own: new Map([[GAME, { ...PLAYING, ...over }]]) });
  const notInGame = { own: new Map<string, SettledOwnPlayer>() };

  it('a signup request no longer pending (or gone) is settled', () => {
    const pending = signup('A', { request_id: REQ });
    const decided = signup('B', { request_id: 'r-2' });
    const gone = signup('C', { request_id: 'r-3' });
    const ids = findSettledActionIds([pending, decided, gone], {
      ...base,
      gameStatus: new Map([[GAME_2, 'scheduled']]),
      requestStatus: new Map([[REQ, 'pending'], ['r-2', 'approved']]),
    });
    expect(ids).toEqual([decided.id, gone.id]);
  });

  it('a request still pending in a game that has started is settled (#2263 follow-up)', () => {
    const inStarted = signup('A', { request_id: REQ });
    const ids = findSettledActionIds([inStarted], {
      ...base,
      requestStatus: new Map([[REQ, 'pending']]),
      gameStatus: new Map([[GAME_2, 'active']]),
    });
    expect(ids).toEqual([inStarted.id]);
  });

  describe('peer_approval_request', () => {
    it('is settled when THAT card is approved, sent back or withdrawn', () => {
      const approved = peer('Marte', MARTE);
      const reopened = peer('Jonas', JONAS);
      const left = peer('Per', 'per-id');
      const waiting = peer('Kari', 'kari-id');
      const ids = findSettledActionIds([approved, reopened, left, waiting], {
        ...base,
        cards: [
          card(MARTE, { submitted_at: 'x', approved_at: 'y' }),
          card(JONAS),
          card('per-id', { submitted_at: 'x', withdrawn_at: 'z' }),
          card('kari-id', { submitted_at: 'x' }),
        ],
      });
      expect(ids).toEqual([approved.id, reopened.id, left.id]);
    });

    it('an older request without submitter_id is settled once nobody else waits', () => {
      const old = peer('Marte');
      const mine = card(VIEWER, { submitted_at: 'x' });
      expect(findSettledActionIds([old], { ...base, cards: [mine] })).toEqual([old.id]);
      expect(
        findSettledActionIds([old], { ...base, cards: [mine, card(MARTE, { submitted_at: 'x' })] }),
      ).toEqual([]);
    });

    it('is settled when the game is over or the viewer is out, since nobody can approve then', () => {
      const r = peer('Marte', MARTE);
      const cards = [card(MARTE, { submitted_at: 'x' })];
      expect(findSettledActionIds([r], { ...base, cards })).toEqual([]);
      expect(findSettledActionIds([r], { ...base, cards, ...inFinishedGame })).toEqual([r.id]);
      expect(findSettledActionIds([r], { ...base, cards, ...gameGone })).toEqual([r.id]);
      expect(findSettledActionIds([r], { ...base, cards, ...notInGame })).toEqual([r.id]);
      expect(findSettledActionIds([r], { ...base, cards, ...ownIs({ withdrawn_at: 'z' }) })).toEqual([r.id]);
    });
  });

  describe('league_marker_request', () => {
    const request = () =>
      row('league_marker_request', {
        league_id: LEAGUE,
        league_name: 'Liga',
        game_id: GAME,
        player_id: MARTE,
        player_name: 'Marte',
      });
    const delivered = { submitted_at: 'x', marker_user_id: VIEWER };

    it('waits while the card is delivered and the viewer is still its marker', () => {
      expect(findSettledActionIds([request()], { ...base, cards: [card(MARTE, delivered)] })).toEqual([]);
    });

    it.each([
      ['approved', { ...delivered, approved_at: 'y' }],
      ['sent back', { ...delivered, submitted_at: null }],
      ['withdrawn', { ...delivered, withdrawn_at: 'z' }],
      ['given another marker', { ...delivered, marker_user_id: JONAS }],
    ])('is settled when the card is %s', (_label, over) => {
      const r = request();
      expect(findSettledActionIds([r], { ...base, cards: [card(MARTE, over)] })).toEqual([r.id]);
    });

    it('is settled when the flight is no longer active, as the marker page says', () => {
      const r = request();
      expect(
        findSettledActionIds([r], { ...base, cards: [card(MARTE, delivered)], ...inFinishedGame }),
      ).toEqual([r.id]);
    });
  });

  describe('reminders about your own card', () => {
    const pay = () => row('payment_reminder', { game_id: GAME, game_name: 'X', entry_fee_kr: 200 });
    const deliver = () => row('deliver_reminder', { game_id: GAME, game_name: 'X' });
    // #2268: a delivered card has every hole, so the hole reminder is done too.
    const hole = () => row('missing_score_reminder', { game_id: GAME, game_name: 'X', holes: [10] });

    it('wait until the fee is paid or the card delivered', () => {
      const rows = [pay(), deliver(), hole()];
      expect(findSettledActionIds(rows, base)).toEqual([]);
      expect(findSettledActionIds(rows, { ...base, ...ownIs({ paid_at: 'x' }) })).toEqual([rows[0]!.id]);
      expect(findSettledActionIds(rows, { ...base, ...ownIs({ submitted_at: 'y' }) })).toEqual([
        rows[1]!.id,
        rows[2]!.id,
      ]);
    });

    it.each([
      ['the game is over', inFinishedGame],
      ['the game is gone', gameGone],
      ['the viewer has withdrawn', ownIs({ withdrawn_at: 'z' })],
      ['the viewer is off the roster', notInGame],
    ])('are settled when %s', (_label, over) => {
      const rows = [pay(), deliver(), hole()];
      expect(findSettledActionIds(rows, { ...base, ...over })).toEqual(rows.map((r) => r.id));
    });
  });

  describe('deliver_reminder for kept cards (#2759)', () => {
    const kept = () =>
      row('deliver_reminder', {
        game_id: GAME,
        game_name: 'X',
        others_count: 2,
        card_user_ids: [MARTE, JONAS],
      });

    it('waits while one of the kept cards is undelivered, also after the keeper delivered their own', () => {
      const cards = [card(MARTE, { submitted_at: 'x' }), card(JONAS)];
      expect(findSettledActionIds([kept()], { ...base, cards, ...ownIs({ submitted_at: 'y' }) })).toEqual([]);
    });

    it('is settled when every kept card is delivered, withdrawn or gone', () => {
      const r = kept();
      expect(
        findSettledActionIds([r], {
          ...base,
          cards: [card(MARTE, { submitted_at: 'x' }), card(JONAS, { withdrawn_at: 'z' })],
        }),
      ).toEqual([r.id]);
      expect(findSettledActionIds([r], { ...base, cards: [card(MARTE, { submitted_at: 'x' })] })).toEqual([r.id]);
    });

    it('one undelivered card outside the kept ones keeps nothing lit', () => {
      const r = kept();
      expect(
        findSettledActionIds([r], {
          ...base,
          cards: [
            card(MARTE, { submitted_at: 'x' }),
            card(JONAS, { submitted_at: 'x' }),
            card('someone-else'),
          ],
        }),
      ).toEqual([r.id]);
    });

    it('a row from before the ids existed is only settled by the end of the game', () => {
      const legacy = row('deliver_reminder', { game_id: GAME, game_name: 'X', others_count: 2 });
      expect(isWaitingRow(legacy)).toBe(false);
      expect(findSettledActionIds([legacy], { ...base, ...ownIs({ submitted_at: 'y' }) })).toEqual([]);
      expect(findSettledActionIds([legacy], { ...base, ...inFinishedGame })).toEqual([legacy.id]);
    });
  });

  describe('scorecard_rejected and scorecard_reopened', () => {
    const rejected = (extra: Record<string, unknown> = {}, at?: string) =>
      row('scorecard_rejected', { game_id: GAME, game_name: 'X', rejecter_name: 'Per', ...extra }, { at });
    const reopened = (at?: string) =>
      row('scorecard_reopened', { game_id: GAME, game_name: 'X', actor_name: 'Per' }, { at });
    const copyOf = (id: string, name: string, at?: string) => rejected({ player_id: id, player_name: name }, at);

    it('your own card: waits until you deliver it again', () => {
      const rows = [rejected(), reopened()];
      expect(findSettledActionIds([rows[0]!], base)).toEqual([]);
      expect(findSettledActionIds([rows[1]!], base)).toEqual([]);
      expect(findSettledActionIds([rows[0]!], { ...base, ...ownIs({ submitted_at: 'x' }) })).toEqual([rows[0]!.id]);
      expect(findSettledActionIds([rows[1]!], { ...base, ...ownIs({ submitted_at: 'x' }) })).toEqual([rows[1]!.id]);
    });

    it('the deliverer’s copy follows the card it names, never the deliverer’s own', () => {
      const copy = copyOf(MARTE, 'Marte');
      // The deliverer's own card is delivered; Marte's is not.
      const stands = { ...base, ...ownIs({ submitted_at: 'x' }), cards: [card(MARTE)] };
      expect(findSettledActionIds([copy], stands)).toEqual([]);
      expect(
        findSettledActionIds([copy], { ...base, cards: [card(MARTE, { submitted_at: 'x' })] }),
      ).toEqual([copy.id]);
      expect(findSettledActionIds([copy], { ...base, cards: [card(MARTE, { withdrawn_at: 'z' })] })).toEqual([copy.id]);
      expect(findSettledActionIds([copy], { ...base, cards: [] })).toEqual([copy.id]);
      expect(findSettledActionIds([copy], { ...base, cards: [card(MARTE)], ...inFinishedGame })).toEqual([copy.id]);
    });

    it('two cards sent back: neither row settles the other', () => {
      const own = rejected({}, '2026-10-01T06:00:00Z');
      const copy = copyOf(MARTE, 'Marte', '2026-10-01T07:00:00Z');
      expect(findSettledActionIds([copy, own], { ...base, cards: [card(MARTE)] })).toEqual([]);
    });

    it('the same card sent back twice: only the newest waits', () => {
      const first = rejected({}, '2026-10-01T06:00:00Z');
      const second = reopened('2026-10-01T07:00:00Z');
      expect(findSettledActionIds([second, first], base)).toEqual([first.id]);
      const copy1 = copyOf(MARTE, 'Marte', '2026-10-01T06:00:00Z');
      const copy2 = copyOf(MARTE, 'Marte', '2026-10-01T07:00:00Z');
      const copy3 = copyOf(JONAS, 'Jonas', '2026-10-01T05:00:00Z');
      expect(
        findSettledActionIds([copy2, copy1, copy3], { ...base, cards: [card(MARTE), card(JONAS)] }),
      ).toEqual([copy1.id]);
    });

    it('a copy from before player_id existed does not wait, and the end of the game settles it', () => {
      const legacy = rejected({ player_name: 'Marte' });
      expect(isWaitingRow(legacy)).toBe(false);
      expect(findSettledActionIds([legacy], { ...base, ...ownIs({ submitted_at: 'x' }) })).toEqual([]);
      expect(findSettledActionIds([legacy], { ...base, ...inFinishedGame })).toEqual([legacy.id]);
    });

    it.each([
      ['the game is over', inFinishedGame],
      ['the game is gone', gameGone],
      ['the viewer has withdrawn', ownIs({ withdrawn_at: 'z' })],
      ['the viewer is off the roster', notInGame],
    ])('your own card is settled when %s', (_label, over) => {
      const r = rejected();
      expect(findSettledActionIds([r], { ...base, ...over })).toEqual([r.id]);
    });
  });

  describe('invite and player_added', () => {
    const invite = () => row('invite', { game_id: GAME, game_name: 'X', invited_by_name: 'Per' });
    const added = () => row('player_added', { game_id: GAME, game_name: 'X', added_by_name: 'Per' });

    it('wait until the seat is confirmed', () => {
      const rows = [invite(), added()];
      expect(findSettledActionIds(rows, { ...base, ...ownIs({ accepted_at: null }) })).toEqual([]);
      expect(findSettledActionIds(rows, { ...base, ...ownIs({ accepted_at: 'x' }) })).toEqual(rows.map((r) => r.id));
    });

    it.each([
      ['the game is over', inFinishedGame],
      ['the game is gone', gameGone],
      ['the viewer has withdrawn', { own: new Map([[GAME, { ...PLAYING, accepted_at: null, withdrawn_at: 'z' }]]) }],
      ['the viewer is off the roster', notInGame],
    ])('are settled when %s', (_label, over) => {
      const rows = [invite(), added()];
      const unconfirmed = { ...base, ...ownIs({ accepted_at: null }) };
      expect(findSettledActionIds(rows, { ...unconfirmed, ...over })).toEqual(rows.map((r) => r.id));
    });
  });

  describe('team_invite (#2759)', () => {
    const invite = () =>
      row('team_invite', {
        game_id: GAME,
        game_short_id: 'abcd1234',
        game_name: 'X',
        team_name: 'Lag',
        invited_by_name: 'Per',
        request_id: REQ,
      });
    const scheduled = { gameStatus: new Map([[GAME, 'scheduled']]) };
    const answered = (status: string) => ({ ownRequestStatus: new Map([[GAME, status]]) });
    const unconfirmed = ownIs({ accepted_at: null });

    it('in an open game: the request is approved already, and the row waits on the confirmed seat', () => {
      const r = invite();
      const open = { ...base, ...scheduled, ...answered('approved') };
      expect(findSettledActionIds([r], { ...open, ...unconfirmed })).toEqual([]);
      expect(findSettledActionIds([r], { ...open, ...ownIs({ accepted_at: 'x' }) })).toEqual([r.id]);
    });

    it('in a manual game: waits for the invitee’s answer, also when opening the team page changed nothing', () => {
      const r = invite();
      const pending = { ...base, ...scheduled, ...answered('pending'), ...notInGame };
      expect(findSettledActionIds([r], pending)).toEqual([]);
    });

    it('is settled when the invitee said yes before the captain has a team (no seat to confirm yet)', () => {
      const r = invite();
      expect(
        findSettledActionIds([r], { ...base, ...scheduled, ...answered('approved'), ...notInGame }),
      ).toEqual([r.id]);
    });

    it.each(['rejected', 'withdrawn'])('is settled when the request is %s', (status) => {
      const r = invite();
      expect(findSettledActionIds([r], { ...base, ...scheduled, ...answered(status), ...unconfirmed })).toEqual([r.id]);
    });

    it('is settled when the captain removed the invitee (no request left)', () => {
      const r = invite();
      expect(findSettledActionIds([r], { ...base, ...scheduled, ...unconfirmed })).toEqual([r.id]);
    });

    it('is settled when a seat was withdrawn, or the game is over or gone', () => {
      const r = invite();
      const approved = { ...base, ...answered('approved') };
      expect(
        findSettledActionIds([r], { ...approved, ...scheduled, own: new Map([[GAME, { ...PLAYING, accepted_at: null, withdrawn_at: 'z' }]]) }),
      ).toEqual([r.id]);
      expect(findSettledActionIds([r], { ...approved, ...unconfirmed, ...inFinishedGame })).toEqual([r.id]);
      expect(findSettledActionIds([r], { ...approved, ...unconfirmed, ...gameGone })).toEqual([r.id]);
    });

    it('a pending answer cannot be given once the round has started', () => {
      const r = invite();
      expect(findSettledActionIds([r], { ...base, ...answered('pending'), ...notInGame })).toEqual([r.id]);
    });
  });

  it('team_member_withdrew has nothing that says it is done, but the team is closed once the round starts', () => {
    const r = row('team_member_withdrew', {
      game_id: GAME,
      game_short_id: 'abcd1234',
      game_name: 'X',
      withdrawn_player_name: 'Per',
      team_name: 'Lag',
    });
    expect(isWaitingRow(r)).toBe(false);
    expect(findSettledActionIds([r], { ...base, gameStatus: new Map([[GAME, 'scheduled']]) })).toEqual([]);
    expect(findSettledActionIds([r], base)).toEqual([r.id]);
  });

  it('#2203: both finish rows are settled once the game is finished, not before', () => {
    const allIn = row('all_scorecards_delivered', { game_id: GAME, game_name: 'X' });
    const stale = row('game_stale_reminder', { game_id: GAME, game_name: 'X' });
    const other = row('game_stale_reminder', { game_id: GAME_2, game_name: 'Y' });
    expect(
      findSettledActionIds([allIn, stale, other], {
        ...base,
        gameStatus: new Map([
          [GAME, 'finished'],
          [GAME_2, 'active'],
        ]),
      }),
    ).toEqual([allIn.id, stale.id]);
    expect(findSettledActionIds([allIn, stale], base)).toEqual([]);
  });

  it('auto_start_blocked stands until the game has left «scheduled»', () => {
    const r = row('auto_start_blocked', { game_id: GAME, game_name: 'X', reason: 'no_players' });
    expect(findSettledActionIds([r], { ...base, gameStatus: new Map([[GAME, 'scheduled']]) })).toEqual([]);
    expect(findSettledActionIds([r], base)).toEqual([r.id]);
    expect(findSettledActionIds([r], { ...base, ...gameGone })).toEqual([r.id]);
  });

  it('friend_request stands while that friendship is still pending', () => {
    const waits = row('friend_request', { actor_id: MARTE, actor_name: 'Marte' });
    const answered = row('friend_request', { actor_id: JONAS, actor_name: 'Jonas' });
    expect(
      findSettledActionIds([waits, answered], { ...base, pendingFriendIds: new Set([MARTE]) }),
    ).toEqual([answered.id]);
  });

  it('club_join_request stands while someone waits in a club the viewer can answer for', () => {
    const waits = row('club_join_request', { group_id: 'club-1', group_name: 'A', requester_name: 'Marte' });
    const done = row('club_join_request', { group_id: 'club-2', group_name: 'B', requester_name: 'Jonas' });
    expect(
      findSettledActionIds([waits, done], { ...base, pendingClubIds: new Set(['club-1']) }),
    ).toEqual([done.id]);
  });

  describe('league rounds', () => {
    const closes = '2026-10-01T21:59:00.000Z';
    const payload = (closesAt = closes, round = ROUND) => ({
      league_id: LEAGUE,
      league_name: 'Liga',
      round_id: round,
      round_label: 'Runde 1',
      closes_at: closesAt,
    });

    it('#2638: settled once the deadline has passed, not before', () => {
      const open = row('league_round_open', payload());
      const closing = row('league_round_closing', payload());
      expect(findSettledActionIds([open, closing], { ...base, now: Date.parse(closes) })).toEqual([open.id, closing.id]);
      expect(findSettledActionIds([open, closing], { ...base, now: Date.parse(closes) - 1 })).toEqual([]);
    });

    it('#2759: settled once the viewer has played the round or is in it', () => {
      const open = row('league_round_open', payload());
      const closing = row('league_round_closing', payload());
      expect(
        findSettledActionIds([open, closing], { ...base, playedRoundIds: new Set([ROUND]) }),
      ).toEqual([open.id, closing.id]);
      expect(
        findSettledActionIds([open, closing], { ...base, playedRoundIds: new Set(['annen-runde']) }),
      ).toEqual([]);
    });

    it('#2638: an extended deadline settles the older reminder for the same round, not the newest', () => {
      const old = row('league_round_closing', payload('2026-10-02T10:00:00.000Z'), { at: '2026-10-01T06:00:00Z' });
      const renewed = row('league_round_closing', payload('2026-10-02T20:00:00.000Z'), { at: '2026-10-01T07:00:00Z' });
      const otherRound = row('league_round_closing', payload('2026-10-02T10:00:00.000Z', 'annen-runde'), {
        at: '2026-10-01T05:00:00Z',
      });
      const opened = row('league_round_open', payload('2026-10-02T10:00:00.000Z'), { at: '2026-10-01T04:00:00Z' });
      expect(findSettledActionIds([renewed, old, otherRound, opened], base)).toEqual([old.id]);
      // The newer reminder counts even when it is already read.
      const readRenewed = { ...renewed, read_at: '2026-10-01T07:30:00Z' };
      expect(findSettledActionIds([readRenewed, old], base)).toEqual([old.id]);
    });
  });

  it('read rows are never touched', () => {
    expect(
      findSettledActionIds([signup('A', { request_id: REQ }, { read: true })], { ...base, ...gameGone }),
    ).toEqual([]);
  });

  it('every waiting kind has a rule: in a game that is gone or a round that has closed, nothing stays lit', () => {
    const rows = WAITING_KINDS.map((kind) =>
      row(kind, {
        ...testPayloads[kind],
        closes_at: new Date(NOW).toISOString(),
        ...(kind === 'registration_request' ? { request_id: REQ } : {}),
      }),
    );
    const settled = findSettledActionIds(rows, { ...base, ...gameGone, ...notInGame });
    expect(rows.filter((r) => !settled.includes(r.id)).map((r) => r.kind)).toEqual([]);
  });
});

describe('isWaitingRow', () => {
  // The kinds under «Krever handling» that have no data to say they are done,
  // or no action at all. A new action kind must take a side here.
  it('every action kind waits, except the one without data', () => {
    const noData = NOTIFICATION_KINDS.filter(
      (kind) => inboxActionKey({ kind, payload: testPayloads[kind] }) !== null && !WAITING_KINDS.includes(kind),
    );
    expect(noData).toEqual(['team_member_withdrew']);
  });

  it('a kind without a button does not wait, and a signup heads-up has none', () => {
    const noAction = NOTIFICATION_KINDS.filter(
      (kind) => inboxActionKey({ kind, payload: testPayloads[kind] }) === null,
    );
    for (const kind of noAction) {
      expect(isWaitingRow({ kind, payload: testPayloads[kind] }), kind).toBe(false);
    }
    expect(WAITING_KINDS).toContain('registration_request');
    expect(isWaitingRow({ kind: 'registration_request', payload: { game_id: GAME, game_name: 'X', request_id: REQ } })).toBe(true);
  });
});

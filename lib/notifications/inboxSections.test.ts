import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';
import type { AppLocale } from '@/i18n/routing';
import type { NotificationKind, NotificationPayload } from './types';
import type { NotificationTranslator } from './cardContent';
import {
  buildInboxEntryView,
  buildInboxSections,
  countActionRows,
  findSettledActionIds,
  groupPeople,
  inboxActionKey,
  inboxDestination,
  inboxGroupKey,
  inboxPerson,
  namesLine,
  rowPersonName,
  teeOffLine,
  trimToWholeDays,
  type InboxRow,
  type InboxTextContext,
} from './inboxSections';

// 2026-10-01 is summer time in Oslo (UTC+2). NOW = 10:00 Oslo.
const NOW = new Date('2026-10-01T08:00:00Z').getTime();
const GAME = '11111111-1111-1111-1111-111111111111';
const GAME_2 = '22222222-2222-2222-2222-222222222222';
const REQ = '33333333-3333-3333-3333-333333333333';
const MARTE = '44444444-4444-4444-4444-444444444444';
const JONAS = '55555555-5555-5555-5555-555555555555';
const VIEWER = '66666666-6666-6666-6666-666666666666';

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
    isAdmin: true,
    teeOffByGame: {},
    resultByGame: {},
    finishedGameIds: [],
    ...over,
  };
}

const ADMIN = { isAdmin: true };
const PLAYER = { isAdmin: false };

describe('inboxActionKey', () => {
  it.each([
    ['peer_approval_request', 'review'],
    ['deliver_reminder', 'deliver'],
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
  ] as const)('%s → %s', (kind, expected) => {
    expect(inboxActionKey({ kind, payload: {} as NotificationPayload }, ADMIN)).toBe(expected);
  });

  it('registration_request: only with request_id, and only for admin', () => {
    expect(inboxActionKey(signup('Kristian', { request_id: REQ }), ADMIN)).toBe('decide');
    expect(inboxActionKey(signup('Kristian'), ADMIN)).toBeNull();
    expect(inboxActionKey(signup('Kristian', { request_id: REQ }), PLAYER)).toBeNull();
  });

  it('a captain’s request (team_name) still gets Godta/Avslå', () => {
    expect(
      inboxActionKey(signup('Kristian', { request_id: REQ, team_name: 'Bogeybros' }), ADMIN),
    ).toBe('decide');
  });
});

describe('inboxDestination', () => {
  it('signups have no target for a non-admin organiser', () => {
    expect(inboxDestination(signup('Kristian', { request_id: REQ }), PLAYER)).toBeNull();
    expect(inboxDestination(signup('Kristian'), PLAYER)).toBeNull();
    expect(inboxDestination(signup('Kristian'), ADMIN)).toBe(`/admin/games/${GAME_2}/signups`);
  });

  it('everything else follows notificationDestination', () => {
    expect(inboxDestination(peer('Marte'), PLAYER)).toBe(`/games/${GAME}/approve`);
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
    expect(buildInboxSections([], { filter: 'all', now: NOW, isAdmin: true })).toEqual({
      action: [],
      today: [],
      earlier: [],
    });
    expect(countActionRows([], ADMIN)).toBe(0);
  });

  it('one unread approval request → one action group «1 scorekort»', () => {
    const s = buildInboxSections([peer('Marte', MARTE)], { filter: 'all', now: NOW, isAdmin: true });
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
    const s = buildInboxSections(rows, { filter: 'all', now: NOW, isAdmin: true });
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
    const s = buildInboxSections(rows, { filter: 'all', now: NOW, isAdmin: true });
    expect(s.today).toHaveLength(1);
    expect(s.earlier).toHaveLength(1);
    expect(s.today[0]!.type).toBe('group');
    expect(s.earlier[0]!.type).toBe('group');
  });

  it('the same person twice is one person: a single row that still covers both rows', () => {
    const rows = [delivered('Marte', MARTE), delivered('Marte', MARTE)];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW, isAdmin: true });
    expect(s.today).toHaveLength(1);
    expect(s.today[0]).toMatchObject({ type: 'single' });
    expect((s.today[0] as { rows: InboxRow[] }).rows).toHaveLength(2);
  });

  it('a group is unread when one member is', () => {
    const rows = [delivered('Marte', MARTE, { read: true }), delivered('Jonas', JONAS)];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW, isAdmin: true });
    expect(s.today[0]).toMatchObject({ type: 'group', unread: true });
  });

  it('read approval requests leave KREVER HANDLING and group under I DAG', () => {
    const rows = [peer('Marte', MARTE, { read: true }), peer('Jonas', JONAS, { read: true })];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW, isAdmin: true });
    expect(s.action).toEqual([]);
    expect(s.today[0]).toMatchObject({ type: 'group', kind: 'peer_approval_request' });
  });

  it('midnight: 00:30 Oslo is today, 23:59 Oslo the day before is earlier', () => {
    const rows = [
      delivered('Marte', MARTE, { at: '2026-09-30T22:30:00Z' }),
      delivered('Jonas', JONAS, { at: '2026-09-30T21:59:00Z' }),
    ];
    const s = buildInboxSections(rows, { filter: 'all', now: NOW, isAdmin: true });
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
    const s = buildInboxSections(rows, { filter: 'action', now: NOW, isAdmin: true });
    expect(s.action).toHaveLength(2);
    expect(s.today).toEqual([]);
    expect(countActionRows(rows, ADMIN)).toBe(2);
    // The same request is a plain row for a non-admin organiser.
    expect(countActionRows(rows, PLAYER)).toBe(1);
  });

  it('filter friends → friend requests and friendships in every section', () => {
    const rows = [
      row('friend_request', { actor_id: JONAS, actor_name: 'Jonas' }),
      row('friend_accepted', { actor_id: MARTE, actor_name: 'Anders' }, { read: true }),
      delivered('Per'),
    ];
    const s = buildInboxSections(rows, { filter: 'friends', now: NOW, isAdmin: true });
    expect(s.action.map((e) => (e as { row: InboxRow }).row.kind)).toEqual(['friend_request']);
    expect(s.today.map((e) => (e as { row: InboxRow }).row.kind)).toEqual(['friend_accepted']);
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
    const s = buildInboxSections(rows, { filter: 'all', now: NOW, isAdmin: c.isAdmin });
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
    expect(v.destination).toBe(`/admin/games/${GAME}`);
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

  it('a request a non-admin organiser cannot answer: plain row, no target', () => {
    const v = view([signup('Kristian', { request_id: REQ })], 'today', ctx('no', { isAdmin: false }));
    expect(v.title).toBe('Kristian meldte seg på');
    expect(v.destination).toBeNull();
    expect(v.actionKey).toBeNull();
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
      expect(v.avatar.kind).toBe('emoji');
      expect(v.subtitle).toBe('Onsdagsgolfen · Du vant 3&2 · i går');
    });

    it('a reopened game shows no place', () => {
      const v = view([finished()], 'earlier', ctx('no', {
        resultByGame: { [GAME]: { kind: 'placement', rank: 2, fieldSize: 12, isTeam: false } },
        finishedGameIds: [],
      }));
      expect(v.avatar.kind).toBe('emoji');
      expect(v.placeLabel).toBeNull();
    });
  });

  it.each([
    ['deliver_reminder', { game_id: GAME, game_name: 'X' }, 'Påminnelse om scorekortet'],
    ['scorecard_rejected', { game_id: GAME, game_name: 'X', rejecter_name: 'Ola' }, 'Scorekortet ble sendt i retur'],
    ['friend_request', { actor_id: MARTE, actor_name: 'Jonas Berg' }, 'Jonas sendte deg en venneforespørsel'],
    ['team_invite', { game_id: GAME, game_short_id: 'abcd1234', game_name: 'X', team_name: 'Lag 1', invited_by_name: 'Ola', request_id: REQ }, 'Ola inviterte deg til Lag 1'],
    ['club_join_request', { group_id: GAME, group_name: 'Klubben', requester_name: 'Ola' }, 'Ola ba om å bli med i klubben'],
    ['payment_reminder', { game_id: GAME, game_name: 'X', entry_fee_kr: 200 }, 'Påminnelse om startkontingenten'],
    ['player_added', { game_id: GAME, game_name: 'X', added_by_name: 'Ola Nordmann' }, 'Ola la deg til i X'],
  ] as const)('read %s says it in the past: «%s»', (kind, payload, title) => {
    expect(view([row(kind, payload, { read: true })], 'today').title).toBe(title);
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

  it('other rows: «{kontekst} · {tid}», or just the time without context', () => {
    const game = view([row('game_started', { game_id: GAME, game_name: 'Lørdagsrunden' }, { at: new Date(NOW - 120_000).toISOString() })], 'today');
    expect(game.subtitle).toBe('Lørdagsrunden · for 2 min siden');
    const idea = view([row('idea_built', { submission_id: GAME }, { at: new Date(NOW - 120_000).toISOString() })], 'today');
    expect(idea.subtitle).toBe('for 2 min siden');
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
  const base = {
    viewerId: VIEWER,
    requestStatus: new Map<string, string>(),
    cards: [] as { game_id: string; user_id: string; submitted_at: string | null; approved_at: string | null }[],
    own: new Map<string, { paid_at: string | null; submitted_at: string | null }>(),
  };

  it('a signup request no longer pending (or gone) is settled', () => {
    const pending = signup('A', { request_id: REQ });
    const decided = signup('B', { request_id: 'r-2' });
    const gone = signup('C', { request_id: 'r-3' });
    const ids = findSettledActionIds([pending, decided, gone], {
      ...base,
      requestStatus: new Map([[REQ, 'pending'], ['r-2', 'approved']]),
    });
    expect(ids).toEqual([decided.id, gone.id]);
  });

  it('an approval request is settled when THAT card is approved or reopened', () => {
    const approved = peer('Marte', MARTE);
    const reopened = peer('Jonas', JONAS);
    const waiting = peer('Kari', 'kari-id');
    const ids = findSettledActionIds([approved, reopened, waiting], {
      ...base,
      cards: [
        { game_id: GAME, user_id: MARTE, submitted_at: 'x', approved_at: 'y' },
        { game_id: GAME, user_id: JONAS, submitted_at: null, approved_at: null },
        { game_id: GAME, user_id: 'kari-id', submitted_at: 'x', approved_at: null },
      ],
    });
    expect(ids).toEqual([approved.id, reopened.id]);
  });

  it('an older request without submitter_id is settled once nobody else waits', () => {
    const old = peer('Marte');
    const own = { game_id: GAME, user_id: VIEWER, submitted_at: 'x', approved_at: null };
    expect(findSettledActionIds([old], { ...base, cards: [own] })).toEqual([old.id]);
    expect(
      findSettledActionIds([old], {
        ...base,
        cards: [own, { game_id: GAME, user_id: MARTE, submitted_at: 'x', approved_at: null }],
      }),
    ).toEqual([]);
  });

  it('paid fee and delivered card settle their reminders; a reminder for kept cards does not', () => {
    const pay = row('payment_reminder', { game_id: GAME, game_name: 'X', entry_fee_kr: 200 });
    const deliver = row('deliver_reminder', { game_id: GAME, game_name: 'X' });
    const kept = row('deliver_reminder', { game_id: GAME, game_name: 'X', others_count: 2 });
    const ids = findSettledActionIds([pay, deliver, kept], {
      ...base,
      own: new Map([[GAME, { paid_at: 'x', submitted_at: 'y' }]]),
    });
    expect(ids).toEqual([pay.id, deliver.id]);
  });

  it('read rows are never touched', () => {
    expect(findSettledActionIds([signup('A', { request_id: REQ }, { read: true })], base)).toEqual([]);
  });
});

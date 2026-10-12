import { describe, it, expect } from 'vitest';
import {
  CASCADE_STATUSES,
  isCascadeStatus,
  groupSignupRequests,
  inboxGroups,
  historyGroups,
  seatsNeeded,
  signupCapacity,
  signupFlag,
  inboxCounts,
  signupInboxState,
  canToggleSignups,
  signupAgo,
  showsSignupsLink,
  firstNamesLine,
  sortRoster,
  type SignupRequestLike,
} from './signupInbox';

/**
 * The signups inbox (#2288) and the roster count behind its capacity line
 * (#2291). Pure rules: the page and the cards only render what these return.
 */

type Row = SignupRequestLike & { name?: string };

function solo(id: string, status: Row['status'] = 'pending', userId = `u-${id}`): Row {
  return { id, userId, status, isTeamCaptain: false, teamRequestId: null };
}
function captain(id: string, status: Row['status'] = 'pending', userId = `u-${id}`): Row {
  return { id, userId, status, isTeamCaptain: true, teamRequestId: null };
}
function child(id: string, captainId: string, status: Row['status'] = 'pending', userId = `u-${id}`): Row {
  return { id, userId, status, isTeamCaptain: false, teamRequestId: captainId };
}
const ids = (groups: Row[][]) => groups.map((g) => g.map((r) => r.id));

describe('CASCADE_STATUSES og isCascadeStatus', () => {
  it('er pending og approved, i den rekkefølgen', () => {
    expect([...CASCADE_STATUSES]).toEqual(['pending', 'approved']);
  });

  it.each([
    ['pending', true],
    ['approved', true],
    ['rejected', false],
    ['withdrawn', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(isCascadeStatus(status)).toBe(expected);
  });
});

describe('groupSignupRequests', () => {
  it.each<{ name: string; rows: Row[]; expected: string[][] }>([
    {
      name: 'kaptein tar med barna sine',
      rows: [captain('c'), child('a', 'c'), child('b', 'c')],
      expected: [['c', 'a', 'b']],
    },
    {
      name: 'tidlig godtatt barn (#2061) følger kapteinen',
      rows: [captain('c'), child('a', 'c', 'approved')],
      expected: [['c', 'a']],
    },
    {
      name: 'barn uten kaptein i lista blir eget kort',
      rows: [child('a', 'gone')],
      expected: [['a']],
    },
    {
      name: 'rekkefølgen er lista sin, også når barnet står før kapteinen',
      rows: [solo('s1'), child('a', 'c'), captain('c'), solo('s2')],
      expected: [['s1'], ['c', 'a'], ['s2']],
    },
  ])('$name', ({ rows, expected }) => {
    expect(ids(groupSignupRequests(rows))).toEqual(expected);
  });
});

describe('inboxGroups', () => {
  it.each<{ name: string; rows: Row[]; expected: string[][] }>([
    {
      name: 'ventende kaptein med et barn som har sagt ja → ett kort med begge',
      rows: [captain('c'), child('a', 'c', 'approved')],
      expected: [['c', 'a']],
    },
    {
      name: 'godkjent solosøker → ingen kort',
      rows: [solo('s', 'approved')],
      expected: [],
    },
    {
      name: 'godkjent kaptein med barn → ingen kort',
      rows: [captain('c', 'approved'), child('a', 'c', 'approved')],
      expected: [],
    },
    {
      name: 'avvist barn av ventende kaptein er ikke med',
      rows: [captain('c'), child('a', 'c', 'rejected'), child('b', 'c')],
      expected: [['c', 'b']],
    },
    {
      name: 'løst godkjent barn (kapteinen avvist) står ikke som om det ventet',
      rows: [captain('c', 'rejected'), child('a', 'c', 'approved')],
      expected: [],
    },
    {
      name: 'ingen forespørsler → ingen kort',
      rows: [],
      expected: [],
    },
    {
      // A teammate still waiting after the captain was approved stood under
      // «Venter» on main; it must not vanish from the inbox.
      name: 'ventende lagkamerat med godkjent kaptein → eget kort',
      rows: [captain('c', 'approved'), child('a', 'c')],
      expected: [['a']],
    },
    {
      name: 'godkjent kaptein: bare de ventende lagkameratene får kort',
      rows: [captain('c', 'approved'), child('a', 'c', 'approved'), child('b', 'c')],
      expected: [['b']],
    },
  ])('$name', ({ rows, expected }) => {
    expect(ids(inboxGroups(rows))).toEqual(expected);
  });
});

describe('historyGroups', () => {
  it('avvist lag blir én gruppe på to', () => {
    const rows = [captain('c', 'rejected'), child('a', 'c', 'rejected')];
    expect(ids(historyGroups(rows, 'rejected'))).toEqual([['c', 'a']]);
  });

  it('trukket lag blir én gruppe på to', () => {
    const rows = [captain('c', 'withdrawn'), child('a', 'c', 'withdrawn')];
    expect(ids(historyGroups(rows, 'withdrawn'))).toEqual([['c', 'a']]);
  });

  it('godkjent lag blir én gruppe på to', () => {
    const rows = [captain('c', 'approved'), child('a', 'c', 'approved')];
    expect(ids(historyGroups(rows, 'approved'))).toEqual([['c', 'a']]);
  });

  it('et barn som har sagt ja mens kapteinen venter, står i innkurven, ikke i Godkjent', () => {
    const rows = [captain('c'), child('a', 'c', 'approved'), solo('s', 'approved')];
    expect(ids(historyGroups(rows, 'approved'))).toEqual([['s']]);
    expect(ids(inboxGroups(rows))).toEqual([['c', 'a']]);
  });

  it('tar bare rader med akkurat den statusen', () => {
    const rows = [solo('p'), solo('r', 'rejected'), solo('w', 'withdrawn')];
    expect(ids(historyGroups(rows, 'rejected'))).toEqual([['r']]);
  });
});

describe('seatsNeeded', () => {
  it.each<{ name: string; group: Row[]; roster: string[]; expected: number }>([
    { name: 'solosøker utenfor lista', group: [solo('s')], roster: [], expected: 1 },
    { name: 'solosøker som alt står på lista', group: [solo('s')], roster: ['u-s'], expected: 0 },
    {
      name: 'lagkamerat som alt står på lista telles ikke',
      group: [captain('c'), child('a', 'c')],
      roster: ['u-a'],
      expected: 1,
    },
    {
      name: 'samme bruker to ganger telles én gang',
      group: [captain('c', 'pending', 'x'), child('a', 'c', 'pending', 'x')],
      roster: [],
      expected: 1,
    },
  ])('$name → $expected', ({ group, roster, expected }) => {
    expect(seatsNeeded(group, roster)).toBe(expected);
  });
});

describe('signupCapacity', () => {
  it('uten tak → null', () => {
    expect(signupCapacity({ cap: null, rosterCount: 8, queued: 3 })).toBeNull();
  });

  it.each([
    // Eiersvar 2 («Tak minus de som er med»): køen trekkes ikke fra.
    { cap: 12, rosterCount: 8, queued: 3, expected: { taken: 8, queued: 3, free: 4, over: 0, full: false } },
    { cap: 5, rosterCount: 4, queued: 2, expected: { taken: 4, queued: 2, free: 1, over: 0, full: false } },
    { cap: 5, rosterCount: 5, queued: 1, expected: { taken: 5, queued: 1, free: 0, over: 0, full: true } },
    { cap: 5, rosterCount: 6, queued: 0, expected: { taken: 6, queued: 0, free: 0, over: 1, full: true } },
  ])('$rosterCount av $cap med $queued i kø', ({ cap, rosterCount, queued, expected }) => {
    expect(signupCapacity({ cap, rosterCount, queued })).toEqual(expected);
  });

  it('har ingen freeAfterQueue', () => {
    const capacity = signupCapacity({ cap: 12, rosterCount: 8, queued: 3 });
    expect(Object.keys(capacity ?? {}).sort()).toEqual(['free', 'full', 'over', 'queued', 'taken']);
  });
});

describe('signupFlag', () => {
  const team = [captain('c'), child('a', 'c')];
  const cap = (rosterCount: number, capValue = 5) =>
    signupCapacity({ cap: capValue, rosterCount, queued: 0 });

  it.each<{ name: string; group: Row[]; capacity: ReturnType<typeof signupCapacity>; roster: string[]; expected: unknown }>([
    { name: 'uten tak', group: team, capacity: null, roster: [], expected: null },
    { name: 'lag trenger 2, 1 ledig', group: team, capacity: cap(4), roster: [], expected: { kind: 'teamShort', needed: 2, free: 1 } },
    { name: 'lag trenger 2, ingen ledige', group: team, capacity: cap(5), roster: [], expected: { kind: 'teamNone', needed: 2 } },
    { name: 'lag trenger færre enn ledige', group: team, capacity: cap(3), roster: [], expected: null },
    { name: 'lagkamerat alt på lista, så behovet faller', group: team, capacity: cap(4), roster: ['u-a'], expected: null },
    { name: 'solo på fullt spill', group: [solo('s')], capacity: cap(5), roster: [], expected: { kind: 'soloFull' } },
    { name: 'solo med ledig plass', group: [solo('s')], capacity: cap(4), roster: [], expected: null },
    { name: 'solo som alt står på lista, fullt spill', group: [solo('s')], capacity: cap(5), roster: ['u-s'], expected: null },
  ])('$name', ({ group, capacity, roster, expected }) => {
    expect(signupFlag(group, capacity, roster)).toEqual(expected);
  });
});

describe('inboxCounts (#2291)', () => {
  const active = (userId: string) => ({ user_id: userId, withdrawn_at: null });
  const withdrawn = (userId: string) => ({ user_id: userId, withdrawn_at: '2026-10-01T10:00:00Z' });

  it('en trukket game_players-rad telles ikke', () => {
    const counts = inboxCounts({ roster: [active('a'), withdrawn('b')], requests: [] });
    expect(counts.rosterCount).toBe(1);
    expect(counts.activeRosterUserIds).toEqual(['a']);
  });

  it('tre godkjente forespørsler og to aktive rader gir 2 med, ikke 3 eller 5', () => {
    const counts = inboxCounts({
      roster: [active('u-x'), active('u-y')],
      requests: [solo('x', 'approved'), solo('y', 'approved'), solo('z', 'approved')],
    });
    expect(counts.rosterCount).toBe(2);
  });

  it('en tidlig godtatt lagkamerat er ikke med, men trenger plass', () => {
    const counts = inboxCounts({
      roster: [],
      requests: [captain('c'), child('a', 'c', 'approved')],
    });
    expect(counts.rosterCount).toBe(0);
    expect(counts.queued).toBe(2);
  });

  // «VENTER PÅ DEG · N» is `queued`: the people in the inbox who still need a
  // seat (O3). An applicant already on the roster keeps their card until the
  // organiser decides, but takes no seat, so N can be lower than the cards.
  it('en søker som alt står på lista, har kort, men telles ikke i køen', () => {
    const rows = [solo('s', 'pending', 'u-on'), solo('t')];
    const counts = inboxCounts({ roster: [active('u-on')], requests: rows });
    expect(ids(inboxGroups(rows))).toEqual([['s'], ['t']]);
    expect(counts.queued).toBe(1);
  });

  it('køen teller personer, ikke kort, og ser bare på innkurven', () => {
    const waiting = [captain('c'), child('a', 'c', 'approved'), solo('s')];
    expect(inboxCounts({ roster: [], requests: waiting }).queued).toBe(3);

    const withHistory = [
      ...waiting,
      solo('ok', 'approved'),
      captain('rc', 'rejected'),
      child('ra', 'rc', 'rejected'),
      solo('w', 'withdrawn'),
    ];
    expect(inboxCounts({ roster: [], requests: withHistory }).queued).toBe(3);
  });
});

describe('signupInboxState', () => {
  const base = {
    status: 'scheduled' as const,
    registration_mode: 'open' as const,
    signups_closed_at: null as string | null,
    group_id: null as string | null,
  };
  const CLOSED = '2026-10-01T10:00:00Z';

  it.each([
    { name: 'pågår', game: { ...base, status: 'active' as const }, expected: 'locked' },
    { name: 'avsluttet', game: { ...base, status: 'finished' as const }, expected: 'locked' },
    { name: 'låst med stengt påmelding', game: { ...base, status: 'finished' as const, signups_closed_at: CLOSED }, expected: 'locked' },
    { name: 'utkast', game: { ...base, status: 'draft' as const }, expected: 'draft' },
    { name: 'utkast med stengt påmelding', game: { ...base, status: 'draft' as const, signups_closed_at: CLOSED }, expected: 'draft' },
    { name: 'bare inviterte', game: { ...base, registration_mode: 'invite_only' as const }, expected: 'inviteOnly' },
    { name: 'bare inviterte, stengt', game: { ...base, registration_mode: 'invite_only' as const, signups_closed_at: CLOSED }, expected: 'inviteOnly' },
    { name: 'åpen', game: base, expected: 'open' },
    { name: 'manuell godkjenning', game: { ...base, registration_mode: 'manual_approval' as const }, expected: 'open' },
    { name: 'stengt', game: { ...base, signups_closed_at: CLOSED }, expected: 'closed' },
    // Eiersvar 5: klubbrunde med «bare inviterte» er åpen for medlemmene.
    { name: 'klubbrunde, bare inviterte', game: { ...base, registration_mode: 'invite_only' as const, group_id: 'g' }, expected: 'open' },
    { name: 'klubbrunde, bare inviterte, stengt', game: { ...base, registration_mode: 'invite_only' as const, group_id: 'g', signups_closed_at: CLOSED }, expected: 'closed' },
  ])('$name → $expected', ({ game, expected }) => {
    expect(signupInboxState(game)).toBe(expected);
  });
});

describe('canToggleSignups', () => {
  it.each([
    ['scheduled', 'open', null, true],
    ['scheduled', 'manual_approval', null, true],
    ['scheduled', 'invite_only', 'group-1', true],
    ['scheduled', 'invite_only', null, false],
    ['draft', 'open', null, false],
    ['active', 'manual_approval', null, false],
    ['finished', 'invite_only', 'group-1', false],
  ] as const)('%s / %s / gruppe %s → %s', (status, mode, groupId, expected) => {
    expect(canToggleSignups(status, mode, groupId)).toBe(expected);
  });
});

describe('showsSignupsLink («Påmeldinger» på «Styr spillere»)', () => {
  const round = {
    status: 'scheduled' as const,
    registrationMode: 'invite_only' as const,
    groupId: null as string | null,
    tournamentId: null as string | null,
    pendingCount: 0 as number | null,
  };

  it.each([
    { name: 'planlagt, bare inviterte', round, expected: true },
    { name: 'utkast, manuell godkjenning', round: { ...round, status: 'draft' as const, registrationMode: 'manual_approval' as const }, expected: true },
    { name: 'planlagt, åpen påmelding', round: { ...round, registrationMode: 'open' as const }, expected: true },
    { name: 'utkast, åpen påmelding (kan ikke stenges ennå)', round: { ...round, status: 'draft' as const, registrationMode: 'open' as const }, expected: false },
    { name: 'pågår, ingen ventende', round: { ...round, status: 'active' as const }, expected: false },
    { name: 'ferdig, ingen ventende', round: { ...round, status: 'finished' as const }, expected: false },
    { name: 'ferdig med ventende forespørsel (#1060)', round: { ...round, status: 'finished' as const, pendingCount: 1 }, expected: true },
    { name: 'pågår, tellingen feilet', round: { ...round, status: 'active' as const, pendingCount: null }, expected: false },
    { name: 'cupkamp før start', round: { ...round, tournamentId: 'cup-1' }, expected: false },
    { name: 'cupkamp med ventende', round: { ...round, tournamentId: 'cup-1', pendingCount: 2 }, expected: false },
  ])('$name → $expected', ({ round: r, expected }) => {
    expect(showsSignupsLink(r)).toBe(expected);
  });
});

describe('signupAgo (Oslo-kalenderdag)', () => {
  it.each([
    { name: 'samme dag', now: '2026-10-07T19:30:00Z', signup: '2026-10-07T07:12:00Z', expected: 'today' },
    { name: 'i går, rett etter midnatt i Oslo', now: '2026-10-07T22:05:00Z', signup: '2026-10-07T19:14:00Z', expected: 'yesterday' },
    { name: 'eldre', now: '2026-10-07T19:30:00Z', signup: '2026-10-05T10:00:00Z', expected: 'date' },
    // Døgnet med 23 timer (sommertid inn 29. mars): 30. mars 00:30 i Oslo.
    { name: 'etter døgnet med 23 timer', now: '2026-03-29T22:30:00Z', signup: '2026-03-29T08:00:00Z', expected: 'yesterday' },
    // Døgnet med 25 timer (sommertid ut 25. okt): 25. okt 23:30 i Oslo.
    { name: 'døgnet med 25 timer', now: '2026-10-25T22:30:00Z', signup: '2026-10-24T10:00:00Z', expected: 'yesterday' },
  ])('$name → $expected', ({ now, signup, expected }) => {
    expect(signupAgo(signup, Date.parse(now)).kind).toBe(expected);
  });

  it('gir tidspunktet videre til formateringen', () => {
    const iso = '2026-10-05T10:00:00Z';
    expect(signupAgo(iso, Date.parse('2026-10-07T19:30:00Z')).date.toISOString()).toBe(
      '2026-10-05T10:00:00.000Z',
    );
  });
});

describe('firstNamesLine', () => {
  const NAMES = ['Jonas Berg', 'Marte Lie', 'Anders Moe', 'Kari Nord', 'Ola Vik', 'Per Ås', 'Siri Ek', 'Tor Li'];

  it.each([
    { count: 1, firstNames: ['Jonas'], rest: 0 },
    { count: 3, firstNames: ['Jonas', 'Marte', 'Anders'], rest: 0 },
    { count: 8, firstNames: ['Jonas', 'Marte', 'Anders'], rest: 5 },
  ])('$count navn', ({ count, firstNames, rest }) => {
    expect(firstNamesLine(NAMES.slice(0, count), 3)).toEqual({ firstNames, rest });
  });
});

describe('sortRoster', () => {
  it('alfabetisk på norsk, med bruker-id som siste nøkkel', () => {
    const rows = [
      { userId: 'z', displayName: 'Øyvind' },
      { userId: 'b', displayName: 'Kari' },
      { userId: 'y', displayName: 'Ærlig' },
      { userId: 'a', displayName: 'Kari' },
      { userId: 'x', displayName: 'Anders' },
    ];
    expect(sortRoster(rows).map((r) => r.userId)).toEqual(['x', 'a', 'b', 'y', 'z']);
  });
});

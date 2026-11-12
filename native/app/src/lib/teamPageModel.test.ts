// #2840 del 3: reglene på lagsiden (Type A). Tegningen v3.1, «3. Lagsiden», er fasiten.
import type { AppTeamPageMember, AppTeamPageTeam } from '../../../../lib/games/appRoundInviteView';
import {
  answeredYes,
  canEditTeam,
  freeSlotCount,
  memberState,
  menuActions,
  orderedMembers,
  teamLineup,
} from './teamPageModel';

const member = (id: string, status: AppTeamPageMember['status'], isGuest = false): AppTeamPageMember => ({
  requestId: `r-${id}`,
  userId: `u-${id}`,
  displayName: id,
  status,
  isGuest,
});

/** Tegningens lag: du er kaptein, Ola har sagt ja, Kari venter, Per takket nei. */
function team(overrides: Partial<AppTeamPageTeam> = {}): AppTeamPageTeam {
  return {
    kind: 'captain',
    game: {
      id: 'g1',
      shortId: 'abcd2345',
      name: 'Onsdagsgolfen',
      courseName: 'Byneset',
      joinEffect: 'instant',
      signupsClosed: false,
      teamSize: 4,
      teeOffAt: null,
    },
    myRowId: 'r-meg',
    myStatus: 'approved',
    teamName: 'Birdie-jegerne',
    captain: { requestId: 'r-meg', userId: 'u-meg', displayName: 'Martin Berg', status: 'approved' },
    members: [member('Per', 'rejected'), member('Kari', 'pending'), member('Ola', 'approved')],
    ...overrides,
  };
}

describe('statusen', () => {
  it.each([
    ['approved', 'approved'],
    ['pending', 'pending'],
    ['rejected', 'declined'],
    ['withdrawn', 'declined'],
  ] as const)('%s er %s', (status, state) => {
    expect(memberState(status)).toBe(state);
  });

  it('lista står ja, venter, nei, og ellers som serveren sendte den', () => {
    const ordered = orderedMembers([member('A', 'pending'), member('B', 'withdrawn'), member('C', 'approved'), member('D', 'pending')]);
    expect(ordered.map((m) => m.displayName)).toEqual(['C', 'A', 'D', 'B']);
  });
});

describe('ledige plasser', () => {
  it.each([
    ['tegningen: alle tre radene holder en plass', team(), 0],
    ['Kari fjernet (raden er slettet)', team({ members: [member('Ola', 'approved'), member('Per', 'rejected')] }), 1],
    ['bare kapteinen', team({ members: [] }), 3],
    ['uten lagstørrelse', team({ game: { ...team().game, teamSize: null } }), 0],
    ['flere rader enn plasser', team({ game: { ...team().game, teamSize: 2 } }), 0],
  ])('%s', (_label, value, free) => {
    expect(freeSlotCount(value)).toBe(free);
  });
});

describe('«n av m har svart ja»', () => {
  it('tegningen: du og Ola av deg, Ola og Kari', () => {
    expect(answeredYes(team())).toEqual({ yes: 2, of: 3 });
  });

  it('kapteinen som venter på arrangøren, teller som et ja', () => {
    expect(answeredYes(team({ captain: { ...team().captain!, status: 'pending' } }))).toEqual({ yes: 2, of: 3 });
  });

  it('uten kaptein teller bare medspillerne', () => {
    expect(answeredYes(team({ captain: null }))).toEqual({ yes: 1, of: 2 });
  });
});

describe('«•••»', () => {
  it.each([
    ['venter på svar', member('Kari', 'pending'), ['resend', 'remove']],
    ['med på laget', member('Ola', 'approved'), ['transfer', 'remove']],
    ['en gjest kan ikke bli kaptein (0228)', member('Gjest', 'approved', true), ['remove']],
    ['takket nei: ingen meny, «Bytt med en venn» i stedet', member('Per', 'rejected'), []],
    ['trakk seg', member('Per', 'withdrawn'), []],
  ])('%s', (_label, value, actions) => {
    expect(menuActions(value)).toEqual(actions);
  });
});

describe('oppstillingen', () => {
  it('kapteinen med merket først, så ja, venter og nei, de to siste bleke', () => {
    expect(
      teamLineup(team()).map((e) => (e.kind === 'free' ? 'ledig' : [e.name, e.isYou, e.captain, e.faded])),
    ).toEqual([
      ['Martin Berg', true, true, false],
      ['Ola', false, false, false],
      ['Kari', false, false, true],
      ['Per', false, false, true],
    ]);
  });

  it('den som takket nei, er merket, så raden på runden kan la skiva være', () => {
    expect(teamLineup(team()).map((e) => e.kind === 'person' && e.declined)).toEqual([false, false, false, true]);
  });

  it('en ledig plass står stiplet til slutt', () => {
    const lineup = teamLineup(team({ members: [member('Ola', 'approved'), member('Kari', 'pending')] }));
    expect(lineup.map((e) => e.kind)).toEqual(['person', 'person', 'person', 'free']);
  });

  it('medspilleren ser seg selv blant de andre, og kapteinen er ikke deg', () => {
    const lineup = teamLineup(
      team({ kind: 'member', myRowId: 'r-Ola', captain: { requestId: 'r-kari', userId: 'u-kari', displayName: 'Kari Nord', status: 'approved' } }),
    );
    expect(lineup.filter((e) => e.kind === 'person' && e.isYou).map((e) => e.kind === 'person' && e.name)).toEqual(['Ola']);
  });
});

describe('hvem kan endre laget', () => {
  it.each([
    ['kapteinen', team(), true],
    ['kapteinen etter at påmeldingen er stengt', team({ game: { ...team().game, signupsClosed: true } }), false],
    ['medspilleren', team({ kind: 'member' }), false],
  ])('%s', (_label, value, can) => {
    expect(canEditTeam(value)).toBe(can);
  });
});

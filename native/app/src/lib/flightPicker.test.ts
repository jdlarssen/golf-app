// #2750: flightvelgeren i appen (Type A). Hvem som ser raden, hva arket viser og
// hva arket gjør med svaret. Tegningen er fasiten for ordene den alene eier;
// ordene nettsiden også bruker, hentes fra `messages/no.json` og sammenlignes
// tegn for tegn, som i `waitingRoom.test.ts`.
import source from '../../../../messages/no.json';
import type { BundlePlayer } from '../data/gameBundle';
import type { JoinFlightFailure } from '../data/joinFlight';
import { homeBundle, homePlayer } from '../test/homeFixtures';
import {
  FLIGHT_PICKER_TEXT,
  buildFlightPicker,
  describeJoinFlightFailure,
  flightPickerVisible,
  joinFlightOutcome,
  type PickerFlight,
} from './flightPicker';

const web = source.game.waitingRoom;

/** `n` spillere i tillegg til meg, uten flight med mindre noe annet sies. */
function others(n: number, flightNumber: number | null = null): BundlePlayer[] {
  return Array.from({ length: n }, (_, i) =>
    homePlayer({ userId: `p${i + 1}`, name: `Spiller${i + 1} Etternavn`, flightNumber }),
  );
}

function bundleWith(
  players: BundlePlayer[],
  game: { gameMode?: string; modeConfig?: Record<string, unknown>; status?: string } = {},
) {
  return homeBundle({
    game: {
      status: 'scheduled',
      gameMode: 'stableford',
      modeConfig: { kind: 'stableford', team_size: 1 },
      ...game,
    },
    players,
  });
}

function me(flightNumber: number | null = null, extra: Partial<BundlePlayer> = {}): BundlePlayer {
  return homePlayer({ userId: 'me', name: 'Meg Selv', flightNumber, ...extra });
}

describe('flightPickerVisible', () => {
  const five = [me(), ...others(4)];

  it.each<[string, BundlePlayer[], Parameters<typeof bundleWith>[1], boolean]>([
    ['fem aktive', five, {}, true],
    ['fire aktive: én flight, ingenting å velge', [me(), ...others(3)], {}, false],
    [
      'fem påmeldt, men én trukket: fire aktive',
      [me(), ...others(3), homePlayer({ userId: 'ute', withdrawnAt: '2026-11-01T08:00:00.000Z' })],
      {},
      false,
    ],
    ['wolf er alltid én gruppe', five, { gameMode: 'wolf', modeConfig: { kind: 'wolf' } }, false],
    [
      'lagformat: flighten er laget',
      five,
      { gameMode: 'texas_scramble', modeConfig: { kind: 'texas_scramble', team_size: 4 } },
      false,
    ],
    [
      'par-stableford: flighten er laget',
      five,
      { modeConfig: { kind: 'stableford', team_size: 2 } },
      false,
    ],
    ['matchplay: flighten er siden', five, { gameMode: 'singles_matchplay', modeConfig: {} }, false],
    [
      'jeg har lag',
      [me(1, { teamNumber: 1 }), ...others(4)],
      {},
      false,
    ],
    ['arrangør som ikke spiller', others(5), {}, false],
  ])('%s', (_label, players, game, expected) => {
    expect(flightPickerVisible(bundleWith(players, game), 'me', 'scheduled')).toBe(expected);
  });

  it.each(['gated', 'notPlayer', 'withdrawn', 'draft', 'active', 'finished', 'none'] as const)(
    'stubben %s: ingen rad',
    (kind) => {
      expect(flightPickerVisible(bundleWith(five), 'me', kind)).toBe(false);
    },
  );
});

describe('buildFlightPicker', () => {
  function flights(model: ReturnType<typeof buildFlightPicker>): PickerFlight[] {
    return model.sections.flatMap((s) => s.flights);
  }

  it('uten flight: tegningens tekst, og samme flighter som nettet (én tom ekstra)', () => {
    const model = buildFlightPicker(
      bundleWith([
        me(),
        homePlayer({ userId: 'a', name: 'Marte Lien', flightNumber: 1 }),
        homePlayer({ userId: 'b', name: 'Jonas Berg', flightNumber: 1 }),
        homePlayer({ userId: 'c', name: 'Anders Moe', flightNumber: 1 }),
        homePlayer({ userId: 'd', name: 'Kristian Hol', flightNumber: 2 }),
        homePlayer({ userId: 'e', name: 'Eirik Dahl', flightNumber: 2 }),
      ]),
      'me',
    );

    expect(model.myFlight).toBeNull();
    expect(model.title).toBe('Velg flight');
    expect(model.rowSub).toBe('Du er ikke plassert i en flight ennå.');
    expect(model.hint).toBe(web.notInFlight);
    expect(model.sections.map((s) => [s.title, s.flights.map((f) => f.number)])).toEqual([
      ['Ledige plasser', [1, 2, 3]],
    ]);
    expect(flights(model)[0]).toEqual({
      number: 1,
      label: 'Flight 1',
      names: 'Marte, Jonas og Anders',
      namesMuted: false,
      count: '3/4',
      status: 'Bli med',
      mine: false,
      full: false,
      disabled: false,
      a11y: 'Flight 1, 3 av 4, Marte, Jonas og Anders. Bli med',
    });
    expect(flights(model)[2]).toMatchObject({
      number: 3,
      names: 'Ingen ennå',
      namesMuted: true,
      count: '0/4',
      status: 'Bli med',
      disabled: false,
    });
  });

  it('i en flight: «Din» først, sperret og merket, og «Du» først i navnene', () => {
    const model = buildFlightPicker(
      bundleWith([
        homePlayer({ userId: 'a', name: 'Marte Lien', flightNumber: 1 }),
        homePlayer({ userId: 'b', name: 'Jonas Berg', flightNumber: 1 }),
        homePlayer({ userId: 'c', name: 'Anders Moe', flightNumber: 1 }),
        homePlayer({ userId: 'd', name: 'Kristian Hol', flightNumber: 2 }),
        me(2),
        homePlayer({ userId: 'e', name: 'Eirik Dahl', flightNumber: 2 }),
      ]),
      'me',
    );

    expect(model.myFlight).toBe(2);
    expect(model.title).toBe('Bytt flight');
    expect(model.rowSub).toBe('Du står i flight 2.');
    expect(model.hint).toBe('Trykk på en annen flight for å bytte.');
    expect(model.sections.map((s) => [s.title, s.flights.map((f) => f.number)])).toEqual([
      ['Din flight', [2]],
      ['Ledige plasser', [1, 3]],
    ]);
    expect(flights(model)[0]).toMatchObject({
      names: 'Du, Kristian og Eirik',
      count: '3/4',
      status: web.flightYours,
      mine: true,
      full: false,
      disabled: true,
    });
    expect(flights(model)[1].status).toBe('Bytt hit');
    expect(flights(model)[1].disabled).toBe(false);
  });

  it('full flight: egen seksjon nederst, sperret, og min egen fulle flight er «Din»', () => {
    const model = buildFlightPicker(
      bundleWith([
        ...others(4, 1),
        me(2),
        homePlayer({ userId: 'x', name: 'Xander', flightNumber: 2 }),
        homePlayer({ userId: 'y', name: 'Yngve', flightNumber: 2 }),
        homePlayer({ userId: 'z', name: 'Zara', flightNumber: 2 }),
      ]),
      'me',
    );

    expect(model.sections.map((s) => [s.title, s.flights.map((f) => f.number)])).toEqual([
      ['Din flight', [2]],
      ['Ledige plasser', [3]],
      ['Fulle flighter', [1]],
    ]);
    expect(flights(model)[0]).toMatchObject({
      namesMuted: true,
      count: '4/4',
      status: web.flightYours,
      full: false,
    });
    expect(flights(model)[2]).toMatchObject({
      namesMuted: true,
      count: '4/4',
      status: web.flightFull,
      full: true,
      disabled: true,
    });
  });

  it('trukne står ikke i noen flight, og teller ikke på plassene', () => {
    const model = buildFlightPicker(
      bundleWith([
        me(),
        ...others(4, 1).slice(0, 3),
        homePlayer({ userId: 'ute', name: 'Ute', flightNumber: 1, withdrawnAt: '2026-11-01T08:00:00.000Z' }),
        homePlayer({ userId: 'k', name: 'Kari', flightNumber: 2 }),
      ]),
      'me',
    );

    expect(flights(model)[0]).toMatchObject({ number: 1, count: '3/4', full: false });
    expect(flights(model)[0].names).not.toContain('Ute');
  });

  it('en flight høyere enn tilbudet er med så lenge noen står der, som på nettet', () => {
    const model = buildFlightPicker(
      bundleWith([me(), ...others(4), homePlayer({ userId: 'h', name: 'Høy', flightNumber: 7 })]),
      'me',
    );

    expect(flights(model).map((f) => f.number)).toEqual([1, 2, 3, 7]);
  });

  it('klubbturnering: 12 flighter og den tomme ekstra', () => {
    const players: BundlePlayer[] = [];
    for (let flight = 1; flight <= 12; flight++) {
      for (let seat = 0; seat < 4; seat++) {
        players.push(homePlayer({ userId: `f${flight}-${seat}`, name: `N${flight}x${seat}`, flightNumber: flight }));
      }
    }
    players[24] = me(7);

    const model = buildFlightPicker(bundleWith(players), 'me');

    expect(flights(model).map((f) => f.number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
    expect(model.sections.map((s) => s.flights.length)).toEqual([1, 1, 11]);
  });

  it('en venn uten profil: appens plassholder, som billetten', () => {
    const model = buildFlightPicker(
      bundleWith([me(), ...others(3, 2), homePlayer({ userId: 'n', name: null, flightNumber: 1 })]),
      'me',
    );

    expect(flights(model)[0].names).toBe('Ukjent spiller');
  });
});

describe('ordene nettsiden også bruker', () => {
  it('står tegn for tegn likt med messages/no.json', () => {
    expect(FLIGHT_PICKER_TEXT.yours).toBe(web.flightYours);
    expect(FLIGHT_PICKER_TEXT.full).toBe(web.flightFull);
    expect(FLIGHT_PICKER_TEXT.notInFlight).toBe(web.notInFlight);
    expect(web.flightLabel.replace('{number}', '4')).toBe(FLIGHT_PICKER_TEXT.flightLabel(4));
  });

  it.each<[JoinFlightFailure, string]>([
    ['flight_full', web.errors.flight_full],
    ['bad_flight', web.errors.bad_flight],
    ['not_member', web.errors.not_member],
    ['game_not_scheduled', web.errors.game_not_scheduled],
    ['flight_bound_to_team', web.errors.flight_bound_to_team],
    ['flight_failed', web.errors.db_error],
  ])('%s', (reason, text) => {
    expect(describeJoinFlightFailure(reason)).toBe(text);
  });

  it('uten nett sier appen det, og lover ikke at noe går gjennom senere', () => {
    expect(describeJoinFlightFailure('offline')).toBe(
      'Du er uten nett. Prøv igjen når nettet er tilbake.',
    );
    expect(describeJoinFlightFailure('network')).toBe(describeJoinFlightFailure('offline'));
  });
});

describe('joinFlightOutcome', () => {
  it('ok: lukker og henter på nytt, uten melding', () => {
    expect(joinFlightOutcome({ ok: true })).toEqual({ close: true, refetch: true, notice: null });
  });

  it('runden har startet: lukker og henter, så stubben skifter tilstand', () => {
    expect(joinFlightOutcome({ ok: false, reason: 'game_not_scheduled' })).toEqual({
      close: true,
      refetch: true,
      notice: null,
    });
  });

  it.each<JoinFlightFailure>(['flight_full', 'bad_flight', 'not_member', 'flight_bound_to_team', 'flight_failed', 'network'])(
    '%s: arket står, feilen vises og lista hentes på nytt',
    (reason) => {
      expect(joinFlightOutcome({ ok: false, reason })).toEqual({
        close: false,
        refetch: true,
        notice: describeJoinFlightFailure(reason),
      });
    },
  );

  it('uten nett: arket står, feilen vises med én gang, ingen henting', () => {
    expect(joinFlightOutcome({ ok: false, reason: 'offline' })).toEqual({
      close: false,
      refetch: false,
      notice: describeJoinFlightFailure('offline'),
    });
  });
});

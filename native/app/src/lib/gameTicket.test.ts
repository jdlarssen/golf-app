// #2255: reglene bak startbilletten (Type A).
//
// Billetten og stubben tegner bare det disse funksjonene svarer. Her låses
// felt 2 (lag, side, flight, spillere), faktalinja, DINE SLAG før og etter
// start, navnelista, kartlenken og hvilken stubb som tegnes i hvilken gren.
import type { BundleTeeRatings, GameBundle } from '../data/gameBundle';
import { homeBundle, homePlayer } from '../test/homeFixtures';
import {
  mapSearchUrl,
  rosterNames,
  slotField,
  startField,
  ticketFacts,
  ticketHeaderLine,
  ticketSlot,
  ticketStrokes,
  ticketStub,
} from './gameTicket';

const at = '2026-09-17T08:00:00.000Z';

const RATINGS: BundleTeeRatings = {
  lengthMeters: 6124,
  slopeMens: 125,
  courseRatingMens: 71.5,
  parTotalMens: 72,
  slopeLadies: 128,
  courseRatingLadies: 73,
  parTotalLadies: 72,
  slopeJuniors: null,
  courseRatingJuniors: null,
  parTotalJuniors: null,
};

function bundleWith(
  game: Parameters<typeof homeBundle>[0]['game'],
  players: GameBundle['players'],
  extra: Partial<GameBundle> = {},
): GameBundle {
  return { ...homeBundle({ game, players }), teeBoxName: 'Gul', teeRatings: RATINGS, ...extra };
}

describe('ticketSlot — felt 2', () => {
  const flights = [
    homePlayer({ userId: 'me', flightNumber: 2 }),
    homePlayer({ userId: 'a', flightNumber: 1 }),
    homePlayer({ userId: 'b', flightNumber: 2 }),
    homePlayer({ userId: 'c', flightNumber: 3 }),
    // Trukket i en fjerde flight: flighten finnes ikke lenger på banen.
    homePlayer({ userId: 'd', flightNumber: 4, withdrawnAt: at }),
  ];

  it.each([
    [
      'tre flighter, jeg i flight 2 → FLIGHT 2 av 3 (den trukne flighten telles ikke)',
      bundleWith({ gameMode: 'stableford' }, flights),
      { label: 'Flight', value: '2 av 3' },
    ],
    [
      'Texas scramble → LAG n',
      bundleWith({ gameMode: 'texas_scramble', modeConfig: { kind: 'texas_scramble', team_size: 2 } }, [
        homePlayer({ userId: 'me', teamNumber: 3, flightNumber: 2 }),
        homePlayer({ userId: 'a', teamNumber: 3, flightNumber: 1 }),
      ]),
      { label: 'Lag', value: '3' },
    ],
    [
      'singles matchplay → SIDE 2 (#1880: en side, ikke et lag)',
      bundleWith({ gameMode: 'singles_matchplay' }, [
        homePlayer({ userId: 'me', teamNumber: 2 }),
        homePlayer({ userId: 'a', teamNumber: 1 }),
      ]),
      { label: 'Side', value: '2' },
    ],
    [
      'fourball → SIDE 1',
      bundleWith({ gameMode: 'fourball_matchplay' }, [
        homePlayer({ userId: 'me', teamNumber: 1 }),
        homePlayer({ userId: 'a', teamNumber: 2 }),
      ]),
      { label: 'Side', value: '1' },
    ],
    [
      '4-spillers stableford uten flighter → SPILLERE 4, trukket spiller telles ikke',
      bundleWith({ gameMode: 'stableford' }, [
        homePlayer({ userId: 'me', flightNumber: null }),
        homePlayer({ userId: 'a', flightNumber: null }),
        homePlayer({ userId: 'b', flightNumber: null }),
        homePlayer({ userId: 'c', flightNumber: null }),
        homePlayer({ userId: 'x', flightNumber: null, withdrawnAt: at }),
      ]),
      { label: 'Spillere', value: '4' },
    ],
    [
      'alle i samme flight → SPILLERE, ikke «FLIGHT 1 av 1»',
      bundleWith({ gameMode: 'stableford' }, [
        homePlayer({ userId: 'me', flightNumber: 1 }),
        homePlayer({ userId: 'a', flightNumber: 1 }),
      ]),
      { label: 'Spillere', value: '2' },
    ],
    [
      'lagformat uten lag satt ennå → faller videre til spillere',
      bundleWith({ gameMode: 'best_ball', modeConfig: { kind: 'best_ball', team_size: 2 } }, [
        homePlayer({ userId: 'me', teamNumber: null, flightNumber: null }),
        homePlayer({ userId: 'a', teamNumber: null, flightNumber: null }),
      ]),
      { label: 'Spillere', value: '2' },
    ],
    [
      'matchplay med side utenfor 1–2 → ingen SIDE',
      bundleWith({ gameMode: 'singles_matchplay' }, [
        homePlayer({ userId: 'me', teamNumber: 3, flightNumber: null }),
      ]),
      { label: 'Spillere', value: '1' },
    ],
    [
      'wolf bruker team_number som rotasjonsplass → ikke LAG',
      bundleWith({ gameMode: 'wolf' }, [
        homePlayer({ userId: 'me', teamNumber: 1, flightNumber: null }),
        homePlayer({ userId: 'a', teamNumber: 2, flightNumber: null }),
        homePlayer({ userId: 'b', teamNumber: 3, flightNumber: null }),
      ]),
      { label: 'Spillere', value: '3' },
    ],
  ])('%s', (_case, bundle, expected) => {
    expect(slotField(ticketSlot(bundle, 'me'))).toEqual(expected);
  });
});

describe('ticketHeaderLine', () => {
  it.each([
    ['stableford bruker den generelle andelen', 'stableford', 85, 'Tee: Gul · Stableford · 85\u00A0% handicap'],
    ['fourball har sin egen andel i mode_config', 'fourball_matchplay', 85, 'Tee: Gul · Fourball'],
    ['texas scramble likeså', 'texas_scramble', 100, 'Tee: Gul · Texas scramble'],
    ['uten lagret andel står ingen prosent', 'stableford', undefined, 'Tee: Gul · Stableford'],
  ])('%s', (_case, gameMode, pct, expected) => {
    const bundle = bundleWith({ gameMode, hcpAllowancePct: pct }, [homePlayer({ userId: 'me' })]);
    expect(ticketHeaderLine(bundle)).toBe(expected);
  });

  it('uten tee og ukjent format står det som finnes', () => {
    const bundle = { ...bundleWith({ gameMode: 'ukjent' }, []), teeBoxName: null };
    expect(ticketHeaderLine(bundle)).toBe('');
  });
});

describe('ticketFacts', () => {
  it.each([
    ['herre: hele linja', 'mens', '18\u00A0hull · Par\u00A072 · 6\u00A0124\u00A0m · Slope\u00A0125 · CR\u00A071,5'],
    ['dame: dame-ratingen, CR uten desimal', 'ladies', '18\u00A0hull · Par\u00A072 · 6\u00A0124\u00A0m · Slope\u00A0128 · CR\u00A073'],
    ['junior uten rating: bare hull og lengde', 'juniors', '18\u00A0hull · 6\u00A0124\u00A0m'],
    ['ukjent kjønn fra basen: som manglende rating', 'x', '18\u00A0hull · 6\u00A0124\u00A0m'],
  ])('%s', (_case, teeGender, expected) => {
    const bundle = bundleWith({}, [homePlayer({ userId: 'me', teeGender })]);
    expect(ticketFacts(bundle, bundle.players[0])).toBe(expected);
  });

  it('uten tee står bare hullene, og en halv runde har ikke 18-hullstallene (par, lengde, CR)', () => {
    const noTee = { ...bundleWith({}, [homePlayer({ userId: 'me' })]), teeRatings: null };
    expect(ticketFacts(noTee, noTee.players[0])).toBe('18\u00A0hull');
    const front9 = bundleWith({ holeSegment: 'front9' }, [homePlayer({ userId: 'me' })]);
    // Par, lengde og CR er tallene for hele banen; slope står.
    expect(ticketFacts(front9, front9.players[0])).toBe('9\u00A0hull · Slope\u00A0125');
    // Den som ikke er spiller (arrangøren), har ikke noe kjønn å lese rating for.
    expect(ticketFacts(front9, undefined)).toBe('9\u00A0hull');
  });
});

describe('ticketStrokes — DINE SLAG', () => {
  const stableford = { gameMode: 'stableford', modeConfig: { kind: 'stableford', team_size: 1 } };

  it('etter start: det frosne tallet, samme som scorekorthodet', () => {
    const bundle = bundleWith(stableford, [homePlayer({ userId: 'me', courseHandicap: 15 })]);
    expect(
      ticketStrokes({ bundle, me: bundle.players[0], profileHcpIndex: null, teamMode: false, teamHandicap: null }),
    ).toBe('15');
  });

  it('fourball med 85 %: spillehandicapen slagene fordeles fra, ikke banehandicapen', () => {
    const bundle = bundleWith(
      { gameMode: 'fourball_matchplay', modeConfig: { kind: 'fourball_matchplay', team_size: 2, allowance_pct: 85 } },
      [homePlayer({ userId: 'me', courseHandicap: 20, teamNumber: 1 })],
    );
    expect(
      ticketStrokes({ bundle, me: bundle.players[0], profileHcpIndex: null, teamMode: false, teamHandicap: null }),
    ).toBe('17');
  });

  it('pluss-handicap vises med pluss, som i Golfbox', () => {
    const bundle = bundleWith(stableford, [homePlayer({ userId: 'me', courseHandicap: -2 })]);
    expect(
      ticketStrokes({ bundle, me: bundle.players[0], profileHcpIndex: null, teamMode: false, teamHandicap: null }),
    ).toBe('+2');
  });

  it('før start: regnet fra hcp-indeksen med spillets andel, samme vei som frysingen', () => {
    // 12,4 × 125/113 + (71,5 − 72) = 13,22 → 13; 85 % av 13 = 11,05 → 11.
    const bundle = bundleWith({ ...stableford, status: 'scheduled', hcpAllowancePct: 85 }, [
      homePlayer({ userId: 'me', courseHandicap: null }),
    ]);
    expect(
      ticketStrokes({ bundle, me: bundle.players[0], profileHcpIndex: 12.4, teamMode: false, teamHandicap: null }),
    ).toBe('11');
  });

  it('lagkort i scramble før start: «—», ikke 0 — lagshandicapen finnes først når handicapene er frosset', () => {
    // Motoren regner et manglende banehandicap som 0, og lagshandicapen blir da 0.
    const bundle = bundleWith(
      { gameMode: 'texas_scramble', modeConfig: { kind: 'texas_scramble', team_size: 2 }, status: 'scheduled' },
      [homePlayer({ userId: 'me', courseHandicap: null, teamNumber: 1 })],
    );
    expect(
      ticketStrokes({ bundle, me: bundle.players[0], profileHcpIndex: 12.4, teamMode: true, teamHandicap: 0 }),
    ).toBe('—');
  });

  it('lagkort i scramble: lagets handicap fra motoren', () => {
    const bundle = bundleWith({ gameMode: 'texas_scramble', modeConfig: { kind: 'texas_scramble', team_size: 2 } }, [
      homePlayer({ userId: 'me', courseHandicap: 18, teamNumber: 1 }),
    ]);
    expect(
      ticketStrokes({ bundle, me: bundle.players[0], profileHcpIndex: null, teamMode: true, teamHandicap: 6 }),
    ).toBe('6');
  });

  it.each([
    ['reveal-runde som pågår', { ...stableford, scoreVisibility: 'reveal' }, 15, 12.4],
    ['reveal-runde før start', { ...stableford, scoreVisibility: 'reveal', status: 'scheduled' }, null, 12.4],
    ['før start uten hcp-indeks', { ...stableford, status: 'scheduled' }, null, null],
  ])('%s → «—»', (_case, game, courseHandicap, hcp) => {
    const bundle = bundleWith(game, [homePlayer({ userId: 'me', courseHandicap })]);
    expect(
      ticketStrokes({ bundle, me: bundle.players[0], profileHcpIndex: hcp, teamMode: false, teamHandicap: null }),
    ).toBe('—');
  });

  it('uten meg i rosteret → «—»', () => {
    const bundle = bundleWith(stableford, []);
    expect(ticketStrokes({ bundle, me: undefined, profileHcpIndex: 10, teamMode: false, teamHandicap: null })).toBe(
      '—',
    );
  });
});

describe('rosterNames', () => {
  it.each([
    [[], 'Du'],
    [['Marte'], 'Du og Marte'],
    [['Marte', 'Jonas', 'Kristian'], 'Du, Marte, Jonas og Kristian'],
    [['A', 'B', 'C', 'D'], 'Du, A, B, C og D'],
    // Som avatarene: fire med navn, resten som et tall.
    [['A', 'B', 'C', 'D', 'E', 'F'], 'Du, A, B, C, D og 2 til'],
  ])('%j → %s', (names, expected) => {
    expect(rosterNames(names)).toBe(expected);
  });
});

describe('startField', () => {
  it('dato og klokkeslett i lokaltid, og en hel setning for skjermleseren', () => {
    const local = new Date(2026, 9, 3, 9, 30).toISOString(); // lørdag 3. oktober
    expect(startField(local)).toEqual({
      date: 'Lør 3. okt',
      clock: 'kl. 09:30',
      a11y: 'Start: lørdag 3. oktober kl. 09:30',
    });
  });

  it('uten tid: «Tid ikke satt»', () => {
    expect(startField(null)).toEqual({ date: null, clock: null, a11y: 'Start: Tid ikke satt' });
    expect(startField('ikke en dato')).toEqual({ date: null, clock: null, a11y: 'Start: Tid ikke satt' });
  });
});

describe('mapSearchUrl', () => {
  it('Kart på iPhone, geo-søk på Android, banenavnet kodet', () => {
    expect(mapSearchUrl('Losby Golf', 'ios')).toBe('https://maps.apple.com/?q=Losby%20Golf');
    expect(mapSearchUrl('Byneset & Co', 'android')).toBe('geo:0,0?q=Byneset%20%26%20Co');
  });
});

describe('ticketStub — samme grener og rekkefølge som før', () => {
  const me = homePlayer({ userId: 'me' });
  const base = {
    status: 'active',
    gate: null,
    me,
    filled: [] as number[],
    totalHoles: 18,
    submittedAt: null,
    approvedAt: null,
    requirePeerApproval: false,
  };
  const seven = [1, 2, 3, 4, 5, 6, 7];
  const all = Array.from({ length: 18 }, (_, i) => i + 1);

  it.each([
    ['stengt format slår alt', { gate: 'mode' as const, me: undefined }, { kind: 'gated', reason: 'mode' }],
    ['ikke spiller', { me: undefined }, { kind: 'notPlayer' }],
    [
      'trukket av seg selv',
      { me: { ...me, withdrawnAt: at, withdrawnByUserId: 'me' }, status: 'scheduled' },
      { kind: 'withdrawn', bySelf: true },
    ],
    [
      'trukket av arrangøren',
      { me: { ...me, withdrawnAt: at, withdrawnByUserId: 'org' } },
      { kind: 'withdrawn', bySelf: false },
    ],
    ['utkast', { status: 'draft' }, { kind: 'draft' }],
    ['planlagt', { status: 'scheduled' }, { kind: 'scheduled' }],
    [
      'avsluttet med plass',
      { status: 'finished', me: { ...me, resultSummary: { kind: 'placement' as const, rank: 3, fieldSize: 12, isTeam: false } } },
      { kind: 'finished', result: { text: '3. plass av 12', isWin: false } },
    ],
    [
      'avsluttet med seier: gull',
      { status: 'finished', me: { ...me, resultSummary: { kind: 'placement' as const, rank: 1, fieldSize: 12, isTeam: false } } },
      { kind: 'finished', result: { text: '🥇 Du vant', isWin: true } },
    ],
    ['avsluttet uten plass', { status: 'finished' }, { kind: 'finished', result: null }],
    ['ukjent status', { status: 'rar' }, { kind: 'none' }],
    ['aktiv, 0 hull', {}, { kind: 'active', state: 'not_started', played: 0, total: 18, nextHole: 1 }],
    ['aktiv, 7 hull', { filled: seven }, { kind: 'active', state: 'in_progress', played: 7, total: 18, nextHole: 8 }],
    [
      'aktiv, hull 1–3 og 5 ført: neste er det første tomme',
      { filled: [1, 2, 3, 5] },
      { kind: 'active', state: 'in_progress', played: 4, total: 18, nextHole: 4 },
    ],
    ['aktiv, alle 18', { filled: all }, { kind: 'active', state: 'ready_to_submit', played: 18, total: 18, nextHole: 1 }],
    [
      'levert, venter på makker',
      { filled: all, submittedAt: at, requirePeerApproval: true },
      { kind: 'active', state: 'submitted_pending_approval', played: 18, total: 18, nextHole: 1 },
    ],
    [
      'levert og godkjent',
      { filled: all, submittedAt: at, approvedAt: at, requirePeerApproval: true },
      { kind: 'active', state: 'submitted_approved', played: 18, total: 18, nextHole: 1 },
    ],
  ])('%s', (_case, overrides, expected) => {
    expect(ticketStub({ ...base, ...overrides })).toEqual(expected);
  });
});

// Native N3 (#1825): flight-utvalget på hull-siden.
//
// Reglene selv er delte (`lib/games/flightScope.ts` — TS-tvillingen til
// `can_score_for`), så det som testes her er oversettelsen: at bundelens
// camelCase kommer riktig inn i dem, og at de fire grenene i webbens
// `resolveFlight` gir samme utvalg i appen.
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { LocalScore } from '../data/db';
import type { BundlePlayer } from '../data/gameBundle';
import {
  canApprove,
  deliverForButton,
  findInRoster,
  flightDeliveryButton,
  flightDeliveryFor,
  flightDeliveryLines,
  partialDeliveryNotice,
  pendingApprovals,
  resolveFlight,
  rosterMarks,
  rosterStatus,
  shouldConfirmParticipation,
  toRoster,
} from './roster';

function player(overrides: Partial<BundlePlayer> & { userId: string }): BundlePlayer {
  return {
    name: overrides.userId,
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: 12,
    teeGender: 'mens',
    acceptedAt: null,
    submittedAt: null,
    submittedByUserId: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    isGuest: false,
    ...overrides,
  };
}

const SOLO: GameMode = 'solo_strokeplay';

function idsOf(entries: { user_id: string }[]): string[] {
  return entries.map((e) => e.user_id);
}

describe('resolveFlight', () => {
  it('≤4 aktive: alle er i samme gruppe, uansett flight-nummer', () => {
    const roster = toRoster([
      player({ userId: 'a', flightNumber: 1 }),
      player({ userId: 'b', flightNumber: 2 }),
      player({ userId: 'c', flightNumber: 2 }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, SOLO, me))).toEqual(['a', 'b', 'c']);
  });

  it('>4 aktive: bare min egen flight', () => {
    const roster = toRoster([
      player({ userId: 'a', flightNumber: 1 }),
      player({ userId: 'b', flightNumber: 1 }),
      player({ userId: 'c', flightNumber: 2 }),
      player({ userId: 'd', flightNumber: 2 }),
      player({ userId: 'e', flightNumber: 2 }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, SOLO, me))).toEqual(['a', 'b']);
  });

  it('>4 aktive uten egen flight: hele rosteret (arv fra flight-løse spill)', () => {
    const roster = toRoster([
      player({ userId: 'a' }),
      player({ userId: 'b', flightNumber: 1 }),
      player({ userId: 'c', flightNumber: 1 }),
      player({ userId: 'd', flightNumber: 2 }),
      player({ userId: 'e', flightNumber: 2 }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, SOLO, me))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('wolf er én gruppe også med fem spillere', () => {
    const roster = toRoster([
      player({ userId: 'a', flightNumber: 1 }),
      player({ userId: 'b', flightNumber: 2 }),
      player({ userId: 'c', flightNumber: 2 }),
      player({ userId: 'd', flightNumber: 2 }),
      player({ userId: 'e', flightNumber: 2 }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, 'wolf', me))).toHaveLength(5);
  });

  it('trukkede spillere står aldri på banen — heller ikke som kapasitet', () => {
    // Fem rader, men bare fire aktive: spillet ER én flight, og den trukkede
    // vises ikke.
    const roster = toRoster([
      player({ userId: 'a', flightNumber: 1 }),
      player({ userId: 'b', flightNumber: 2 }),
      player({ userId: 'c', flightNumber: 2 }),
      player({ userId: 'd', flightNumber: 2 }),
      player({ userId: 'e', flightNumber: 2, withdrawnAt: '2026-08-30T08:00:00.000Z' }),
    ]);
    const me = findInRoster(roster, 'a')!;

    expect(idsOf(resolveFlight(roster, SOLO, me))).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('pendingApprovals', () => {
  // #2220: lista finnes bare der webben viser godkjenn-beskjeden sin
  // (`PendingApprovalsBanner.tsx:29`): runden krever godkjenning OG pågår.
  // Uten gaten ba appen makkerne godkjenne i vanlige runder, og i avsluttede.
  // Første rad er den gamle testen: leverte, ikke godkjente kort fra
  // flight-makkere — aldri mitt eget.
  it.each([
    [true, 'active', ['mate']],
    [false, 'active', []],
    [true, 'finished', []],
    [true, 'scheduled', []],
  ])(
    'requirePeerApproval=%p og status=%p gir %p',
    (requirePeerApproval: boolean, status: string, expected: string[]) => {
      const roster = toRoster([
        player({ userId: 'me', submittedAt: '2026-08-30T10:00:00.000Z' }),
        player({ userId: 'mate', submittedAt: '2026-08-30T10:05:00.000Z' }),
        player({ userId: 'nothanded' }),
        player({
          userId: 'done',
          submittedAt: '2026-08-30T10:01:00.000Z',
          approvedAt: '2026-08-30T10:02:00.000Z',
        }),
      ]);
      const game = { gameMode: SOLO, status, requirePeerApproval };

      expect(idsOf(pendingApprovals(roster, game, 'me'))).toEqual(expected);
    },
  );
});

describe('den som leverte kortet, godkjenner det ikke (#2200)', () => {
  // Oversettelsen er det som testes: `submittedByUserId` må komme fram til den
  // delte regelen, ellers ber appen meg godkjenne et kort jeg leverte selv.
  const roster = toRoster([
    player({ userId: 'me', submittedAt: '2026-09-27T10:00:00.000Z' }),
    player({
      userId: 'mate',
      submittedAt: '2026-09-27T10:00:00.000Z',
      submittedByUserId: 'me',
    }),
    player({
      userId: 'other',
      submittedAt: '2026-09-27T10:05:00.000Z',
      submittedByUserId: 'other',
    }),
  ]);
  const game = { gameMode: SOLO, status: 'active', requirePeerApproval: true };

  it('holder kortet jeg leverte for makkeren utenfor lista mi', () => {
    expect(idsOf(pendingApprovals(roster, game, 'me'))).toEqual(['other']);
  });

  it('sier nei i enkeltoppslaget også', () => {
    expect(canApprove(roster, SOLO, 'me', 'mate')).toBe(false);
    expect(canApprove(roster, SOLO, 'me', 'other')).toBe(true);
  });
});

describe('flightDeliveryFor (#2200)', () => {
  // Regelen er den delte `flightDeliveryCandidates` og testes der. Her testes
  // at bundelen og de lokale slagene kommer riktig inn, og at svaret er
  // bundel-spillere i roster-rekkefølge.
  const GAME = { gameMode: SOLO, holeSegment: 'full', sourceGameId: null };

  /** Et fullt kort for `userId`, tastet av `enteredBy`. */
  function card(userId: string, enteredBy: string): LocalScore[] {
    return Array.from({ length: 18 }, (_, i) => ({
      id: `g:${userId}:${i + 1}`,
      gameId: 'g',
      userId,
      holeNumber: i + 1,
      strokes: 4,
      putts: null,
      enteredBy,
      clientUpdatedAt: '2026-09-27T10:00:00.000Z',
      serverUpdatedAt: '2026-09-27T10:00:01.000Z',
    }));
  }

  it('gir makkeren jeg førte for og gjesten med fullt kort, ikke den som førte selv', () => {
    const players = [
      player({ userId: 'guest', isGuest: true }),
      player({ userId: 'me' }),
      player({ userId: 'mate' }),
      player({ userId: 'self' }),
    ];
    const scores = [
      ...card('me', 'me'),
      ...card('mate', 'me'),
      ...card('self', 'self'),
      // En gjest kan ikke levere selv, så det holder at kortet er fullt.
      ...card('guest', 'self'),
    ];

    const mates = flightDeliveryFor({ game: GAME, players }, scores, 'me');
    expect(mates.map((p) => p.userId)).toEqual(['guest', 'mate']);
    expect(mates[0]).toBe(players[0]);
  });

  it('gir ingen når ingen kort er fulle', () => {
    const players = [player({ userId: 'me' }), player({ userId: 'mate' })];
    const scores = card('mate', 'me').slice(0, 17);

    expect(flightDeliveryFor({ game: GAME, players }, scores, 'me')).toEqual([]);
  });
});

describe('setningene for levering for flighten (#2200)', () => {
  const ola = player({ userId: 'ola', name: 'Ola' });
  const kari = player({ userId: 'kari', name: 'Kari' });
  const gjest = player({ userId: 'gjest', name: 'Per', isGuest: true });
  const gjest2 = player({ userId: 'gjest2', name: 'Liv', isGuest: true });

  it.each([
    ['én vanlig spiller', [ola], ['Lever også kortet til Ola.', 'Du har ført alle hullene.']],
    [
      'flere vanlige spillere',
      [ola, kari],
      ['Lever også kortene til Ola og Kari.', 'Du har ført alle hullene.'],
    ],
    [
      'én gjest alene',
      [gjest],
      ['Lever også kortet til Per.', 'Per er gjest og kan ikke levere selv.'],
    ],
    [
      'vanlige spillere og én gjest',
      [ola, kari, gjest],
      [
        'Lever også kortene til Ola, Kari og Per.',
        'Du har ført alle hullene til Ola og Kari.',
        'Per er gjest og kan ikke levere selv.',
      ],
    ],
    [
      'flere gjester',
      [gjest, gjest2],
      ['Lever også kortene til Per og Liv.', 'Per og Liv er gjester og kan ikke levere selv.'],
    ],
  ] as [string, BundlePlayer[], string[]][])('%s', (_label, candidates, expected) => {
    expect(flightDeliveryLines(candidates)).toEqual(expected);
  });

  it('teller mitt eget kort med på knappen', () => {
    expect(flightDeliveryButton([ola, gjest])).toBe('Lever 3 kort ✓');
  });

  it('navngir makkerne når mitt eget kort alt er levert', () => {
    expect(deliverForButton([ola, kari])).toBe('Lever for Ola og Kari ✓');
  });

  // Serveren spør regelen selv og kan levere færre enn knappen lovet (slagene
  // på serveren er nyere enn telefonens). Da skal ikke skjermen late som alt
  // gikk: `null` betyr at alle ble levert.
  it.each([
    ['alle levert', 2, 2, null],
    ['ingen makkere spurt', 0, 0, null],
    ['den ene makkeren ble ikke levert', 0, 1, 'Makkerkortet ble ikke levert. Noen kan ha levert det eller ført et hull på det i mellomtiden.'],
    ['ingen av flere', 0, 2, 'Ingen av de 2 makkerkortene ble levert. Noen kan ha levert dem eller ført hull på dem i mellomtiden.'],
    ['noen av flere', 1, 3, '1 av 3 makkerkort ble levert. Noen kan ha levert de andre eller ført hull på dem i mellomtiden.'],
  ] as [string, number, number, string | null][])(
    'beskjeden når serveren leverte færre: %s',
    (_label, delivered, asked, expected) => {
      expect(partialDeliveryNotice(delivered, asked)).toBe(expected);
    },
  );
});

describe('rosterStatus', () => {
  const deliverer = player({ userId: 'ola', name: 'Ola Nordmann', nickname: 'Olabola' });
  const at = '2026-09-27T10:00:00.000Z';

  it.each([
    ['en annen leverte', { submittedAt: at, submittedByUserId: 'ola' }, 'Levert av Olabola'],
    ['spilleren leverte selv', { submittedAt: at, submittedByUserId: 'me' }, 'Levert'],
    ['leverandøren er ukjent', { submittedAt: at, submittedByUserId: null }, 'Levert'],
    ['leverandøren står ikke i rosteret', { submittedAt: at, submittedByUserId: 'x' }, 'Levert'],
    [
      'kortet er godkjent',
      { submittedAt: at, submittedByUserId: 'ola', approvedAt: at },
      'Godkjent',
    ],
    ['spilleren er trukket', { submittedAt: at, submittedByUserId: 'ola', withdrawnAt: at }, 'Trukket'],
    ['ingenting er levert', {}, null],
  ] as [string, Partial<BundlePlayer>, string | null][])('%s', (_label, overrides, expected) => {
    const me = player({ userId: 'me', ...overrides });
    expect(rosterStatus(me, [me, deliverer])).toBe(expected);
  });
});

describe('shouldConfirmParticipation', () => {
  // #463: «besøk = bekreftelse». Fire grener, og bare den første skal skrive.
  it.each([
    ['ubekreftet i et planlagt spill', { acceptedAt: null }, 'scheduled', true],
    ['ubekreftet i et spill som går', { acceptedAt: null }, 'active', true],
    [
      'alt bekreftet',
      { acceptedAt: '2026-08-30T08:00:00.000Z' },
      'scheduled',
      false,
    ],
    ['arrangørens kladd — ingen er invitert ennå', { acceptedAt: null }, 'draft', false],
  ] as [string, { acceptedAt: string | null }, string, boolean][])(
    '%s → %s',
    (_label, me, status, expected) => {
      expect(shouldConfirmParticipation(me, status)).toBe(expected);
    },
  );

  it('skriver ikke for noen som ikke står på rosteret', () => {
    expect(shouldConfirmParticipation(undefined, 'active')).toBe(false);
  });
});

describe('rosterMarks', () => {
  // #1874: i wolf og round robin ER `team_number` = `flight_number` plassen i
  // rotasjonen, ikke et lag og ikke en ball. «Flight 3 · Lag 3» fikk eieren til
  // å tro at spillerne gikk hver for seg. Merkelappene under er derfor ikke
  // kosmetikk — de er forskjellen på sann og usann informasjon.

  /** n spillere med slot 1..n, slik `assignRotationSlots` setter dem ved start. */
  function rotation(n: number, overrides: Partial<BundlePlayer>[] = []): BundlePlayer[] {
    return Array.from({ length: n }, (_, i) =>
      player({
        userId: `p${i + 1}`,
        teamNumber: i + 1,
        flightNumber: i + 1,
        ...(overrides[i] ?? {}),
      }),
    );
  }

  it('sier hvilke hull rotasjons-plassen gir Wolf-rollen, i stedet for lag og flight', () => {
    const players = rotation(4);
    expect(rosterMarks(players[2], 'wolf', players)).toEqual([
      'Wolf på hull 3, 7, 11 og 15',
    ]);
  });

  it('lister hele runden når tre spiller — den lengste merkelappen som finnes', () => {
    const players = rotation(3);
    expect(rosterMarks(players[2], 'wolf', players)).toEqual([
      'Wolf på hull 3, 6, 9, 12, 15 og 18',
    ]);
  });

  // Den ene grenen som kan gi appen en ANNEN wolf enn nettsiden: n telles av
  // `wolfRotationPlayers` (alle med slot, trukne også), akkurat som webbens
  // `computeWolfContext`. Filtrerte vi bort den trukne her, ville rosteret sagt
  // hull 3, 6, 9 … mens `WolfChoiceCard` sa hull 3, 7, 11 … på samme runde.
  it('teller trukne spillere med i rotasjonen — samme n som nettsiden', () => {
    const players = rotation(4, [{}, {}, {}, { withdrawnAt: '2026-09-01T10:00:00.000Z' }]);
    expect(rosterMarks(players[2], 'wolf', players)).toEqual([
      'Wolf på hull 3, 7, 11 og 15',
    ]);
    expect(rosterMarks(players[3], 'wolf', players)).toEqual([
      'Wolf på hull 4, 8, 12 og 16',
      'Trukket',
    ]);
  });

  it.each([
    ['rotasjonen ikke er trukket ennå', null, 4],
    ['plassen ikke finnes lenger i rotasjonen', 9, 4],
    ['spillertallet er utenfor wolf', 1, 6],
  ] as [string, number | null, number][])(
    'lar wolf-raden stå uten merkelapp når %s',
    (_label, teamNumber, n) => {
      const players = rotation(n);
      const me = player({ userId: 'me', teamNumber, flightNumber: teamNumber });
      expect(rosterMarks(me, 'wolf', [...players, me])).toEqual([]);
    },
  );

  it('merker ikke rotasjonen i round robin — rekkefølgen der er rent kosmetisk', () => {
    const players = rotation(4);
    expect(rosterMarks(players[1], 'round_robin', players)).toEqual([]);
  });

  it('lar lag-formatene stå som før', () => {
    const me = player({ userId: 'a', teamNumber: 1, flightNumber: 2 });
    expect(rosterMarks(me, 'best_ball', [me])).toEqual(['Flight 2', 'Lag 1']);
  });

  // #1880: i matchplay er `team_number` en side i duellen, ikke et lag, og
  // flighten er alltid 1 — en merkelapp som aldri endrer seg er bare støy.
  it('kaller matchplay-plassen en side, uten flight — og gjetter ikke på stale sider', () => {
    const me = player({ userId: 'a', teamNumber: 2, flightNumber: 1 });
    expect(rosterMarks(me, 'singles_matchplay', [me])).toEqual(['Side 2']);

    const stale = player({ userId: 'b', teamNumber: 3, flightNumber: 1 });
    expect(rosterMarks(stale, 'fourball_matchplay', [stale])).toEqual([]);
  });

  it('holder status-merkene uendret', () => {
    const approved = player({
      userId: 'a',
      flightNumber: 1,
      submittedAt: '2026-09-01T09:00:00.000Z',
      approvedAt: '2026-09-01T10:00:00.000Z',
    });
    expect(rosterMarks(approved, SOLO, [approved])).toEqual(['Flight 1', 'Godkjent']);

    const submitted = player({
      userId: 'b',
      flightNumber: 1,
      submittedAt: '2026-09-01T09:00:00.000Z',
    });
    expect(rosterMarks(submitted, SOLO, [submitted])).toEqual(['Flight 1', 'Levert']);
  });
});

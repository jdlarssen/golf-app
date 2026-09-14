// Native N3 (#1825): flight-utvalget på hull-siden.
//
// Reglene selv er delte (`lib/games/flightScope.ts` — TS-tvillingen til
// `can_score_for`), så det som testes her er oversettelsen: at bundelens
// camelCase kommer riktig inn i dem, og at de fire grenene i webbens
// `resolveFlight` gir samme utvalg i appen.
import type { GameMode } from '../../../../lib/scoring/modes/types';
import type { BundlePlayer } from '../data/gameBundle';
import {
  findInRoster,
  pendingApprovals,
  resolveFlight,
  rosterMarks,
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
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
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
  it('lister leverte, ikke godkjente kort fra flight-makkere — aldri mitt eget', () => {
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

    expect(idsOf(pendingApprovals(roster, SOLO, 'me'))).toEqual(['mate']);
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

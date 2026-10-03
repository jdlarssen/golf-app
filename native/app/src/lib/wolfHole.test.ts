// Native (#1832): hvem er Wolf, og er det meg?
//
// Dette er den ene utledningen appen og webben MÅ svare likt på. Blir de
// uenige, taster to spillere i samme flight mot hver sin virkelighet: den ene
// får valg-knappene, den andre venter på et valg som aldri kommer — og motoren
// lar hullet stå «pending» for begge.
//
// Rotasjonen selv er dekket i `lib/wolf/wolfRotation.test.ts` (webbens suite).
// Det som testes her er DET APPEN LEGGER OPPÅ: hvilke spillere som utgjør
// rotasjonen, hva badgen sier, og når valg-knappene i det hele tatt finnes.
import type { ModeResult } from '../../../../lib/scoring/modes/types';
import type { BundlePlayer } from '../data/gameBundle';
import {
  WOLF_CHOICES_UNAVAILABLE,
  wolfHoleState,
  wolfPointsByUser,
  wolfRotationPlayers,
  wolfStake,
} from './wolfHole';

function player(overrides: Partial<BundlePlayer> & { userId: string }): BundlePlayer {
  return {
    name: `Spiller ${overrides.userId}`,
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: 0,
    teeGender: 'mens',
    acceptedAt: null,
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    withdrawnByUserId: null,
    submittedByUserId: null,
    isGuest: false,
    ...overrides,
  };
}

/** Fire spillere med rotasjonsslot 1–4 — standard wolf-oppsett. */
const FOUR = [
  player({ userId: 'p1', name: 'Per Persen', teamNumber: 1 }),
  player({ userId: 'p2', name: 'Ada Aas', teamNumber: 2 }),
  player({ userId: 'p3', name: 'Kari Kvist', teamNumber: 3 }),
  player({ userId: 'p4', name: 'Ola Olsen', teamNumber: 4 }),
];

const NO_POINTS = new Map<string, number>();

function stateFor(
  overrides: Partial<Parameters<typeof wolfHoleState>[0]> = {},
) {
  return wolfHoleState({
    holeNumber: 1,
    myUserId: 'p1',
    gameStatus: 'active',
    players: FOUR,
    choices: [],
    pointsByUser: NO_POINTS,
    stake: 1,
    hideNumbers: false,
    ...overrides,
  });
}

describe('wolfRotationPlayers', () => {
  it('tar med alle med slot — også en trukket spiller, for antallet styrer regelen', () => {
    // Webbens `computeWolfContext` filtrerer IKKE på `withdrawn_at`, og n er
    // ikke kosmetikk: den setter både rotasjonslengden (R = floor(18/n)·n) og
    // lone-/blind-potten. Filtrerer appen her, får de to ulik wolf på hull 17.
    const rotation = wolfRotationPlayers([
      ...FOUR,
      player({ userId: 'wd', teamNumber: 5, withdrawnAt: '2026-08-31T09:00:00Z' }),
      // Uten slot er du ikke i rotasjonen i det hele tatt.
      player({ userId: 'ingen-slot' }),
    ]);

    expect(rotation.map((entry) => entry.userId)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'wd',
    ]);
    expect(rotation.map((entry) => entry.teamNumber)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('wolfPointsByUser', () => {
  it('gir motorens wolf-totaler, og et tomt kart for alt annet', () => {
    const wolfResult = {
      kind: 'wolf',
      players: [
        { userId: 'p1', totalPoints: 6 },
        { userId: 'p2', totalPoints: 2 },
      ],
    } as unknown as ModeResult;

    expect([...wolfPointsByUser(wolfResult).entries()]).toEqual([
      ['p1', 6],
      ['p2', 2],
    ]);
    // Ingen valg hentet → adapteren svarte `missing-choices` → ingen poeng.
    expect(wolfPointsByUser(null).size).toBe(0);
    // Og et resultat fra et annet format skal aldri lekke inn som wolf-poeng.
    expect(
      wolfPointsByUser({ kind: 'stableford', players: [] } as unknown as ModeResult)
        .size,
    ).toBe(0);
  });
});

describe('wolfStake', () => {
  it('gir motorens innsats på hullet, og grunninnsatsen 1 for alt annet', () => {
    // #2313: innsatsen kommer fra motorens hull-rad, aldri en egen telling av
    // delte hull her.
    const wolfResult = {
      kind: 'wolf',
      players: [],
      holes: [
        { holeNumber: 1, stake: 1 },
        { holeNumber: 2, stake: 2 },
      ],
    } as unknown as ModeResult;

    expect(wolfStake(wolfResult, 2)).toBe(2);
    expect(wolfStake(wolfResult, 1)).toBe(1);
    expect(wolfStake(null, 2)).toBe(1);
    expect(
      wolfStake({ kind: 'stableford', players: [] } as unknown as ModeResult, 2),
    ).toBe(1);
  });
});

describe('wolfHoleState — hvem er Wolf', () => {
  // n = 4 → R = 16 rotasjonshull, deretter trailing på 17 og 18.
  it.each<[number, string]>([
    [1, 'p1'],
    [2, 'p2'],
    [3, 'p3'],
    [4, 'p4'],
    [5, 'p1'],
    [16, 'p4'],
  ])('hull %i går til slot-spilleren %s', (holeNumber, expected) => {
    expect(stateFor({ holeNumber }).wolfUserId).toBe(expected);
  });

  it.each<[number]>([[17], [18]])(
    'hull %i er trailing-wolf: den som ligger sist etter motorens poeng',
    (holeNumber) => {
      const points = new Map([
        ['p1', 5],
        ['p2', 0],
        ['p3', 2],
        ['p4', 9],
      ]);
      expect(stateFor({ holeNumber, pointsByUser: points }).wolfUserId).toBe('p2');
    },
  );

  it('svarer «det er meg» kun for slot-spilleren selv', () => {
    expect(stateFor({ holeNumber: 2, myUserId: 'p2' }).iAmWolf).toBe(true);
    expect(stateFor({ holeNumber: 2, myUserId: 'p1' }).iAmWolf).toBe(false);
  });

  it('lar en lagret rad overstyre rotasjonen', () => {
    // Hull 7 tilhører slot 3, men raden sier p1 — typisk admin-override eller
    // en trailing-wolf som ble låst før noen rakk å regne på nytt.
    expect(stateFor({ holeNumber: 7 }).wolfUserId).toBe('p3');
    expect(
      stateFor({
        holeNumber: 7,
        choices: [
          { holeNumber: 7, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }).wolfUserId,
    ).toBe('p1');
  });
});

describe('wolfHoleState — badge og valg-knapper', () => {
  it.each<
    [
      string,
      Parameters<typeof wolfHoleState>[0]['choices'],
      string,
      string | null,
      Partial<Parameters<typeof wolfHoleState>[0]>?,
    ]
  >([
    ['ingen har valgt, og jeg er ikke Wolf', [], 'p2', 'Wolf: Per Persen — venter på valg'],
    ['ingen har valgt, og det er meg', [], 'p1', 'Du er Wolf på dette hullet'],
    [
      'partner valgt',
      [{ holeNumber: 1, wolfUserId: 'p1', choice: 'partner', partnerUserId: 'p3' }],
      'p2',
      'Wolf: Per Persen — partner: Kari Kvist',
    ],
    [
      'lone wolf — potten er n',
      [{ holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null }],
      'p2',
      'Wolf: Per Persen (Lone Wolf — 4 poeng)',
    ],
    [
      'blind wolf — potten er n + 2',
      [{ holeNumber: 1, wolfUserId: 'p1', choice: 'blind', partnerUserId: null }],
      'p2',
      'Wolf: Per Persen (Blind Wolf — 6 poeng)',
    ],
    [
      'lone wolf etter et delt hull — potten er n ganger innsatsen',
      [{ holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null }],
      'p2',
      'Wolf: Per Persen (Lone Wolf — 8 poeng)',
      { stake: 2 },
    ],
    [
      'blind wolf etter et delt hull — potten er (n + 2) ganger innsatsen',
      [{ holeNumber: 1, wolfUserId: 'p1', choice: 'blind', partnerUserId: null }],
      'p2',
      'Wolf: Per Persen (Blind Wolf — 12 poeng)',
      { stake: 2 },
    ],
    [
      'lone wolf i en blind runde som pågår — ingen tall',
      [{ holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null }],
      'p2',
      'Wolf: Per Persen (Lone Wolf)',
      { stake: 2, hideNumbers: true },
    ],
    [
      'blind wolf i en blind runde som pågår — ingen tall',
      [{ holeNumber: 1, wolfUserId: 'p1', choice: 'blind', partnerUserId: null }],
      'p2',
      'Wolf: Per Persen (Blind Wolf)',
      { stake: 2, hideNumbers: true },
    ],
  ])('%s', (_label, choices, myUserId, expected, extra = {}) => {
    expect(stateFor({ choices, myUserId, ...extra }).badgeText).toBe(expected);
  });

  it.each<
    [
      string,
      Partial<Parameters<typeof wolfHoleState>[0]>,
      {
        partnerSubtitle: string | null;
        loneSubtitle: string;
        blindSubtitle: string;
        stakeLine: string | null;
      },
      boolean,
    ]
  >([
    [
      'etter et delt hull lover valget innsatsen ganger gevinsten',
      { stake: 2 },
      {
        partnerSubtitle: 'Vinner-siden får 4 hver',
        loneSubtitle: 'Alene mot resten. Vinner du, får du 8.',
        blindSubtitle: 'Meldt før utslag. Vinner du, får du 12.',
        stakeLine: 'Innsatsen er 2 ganger etter delte hull.',
      },
      true,
    ],
    [
      'vanlig innsats gir grunntallene og ingen innsatslinje',
      { stake: 1 },
      {
        partnerSubtitle: 'Vinner-siden får 2 hver',
        loneSubtitle: 'Alene mot resten. Vinner du, får du 4.',
        blindSubtitle: 'Meldt før utslag. Vinner du, får du 6.',
        stakeLine: null,
      },
      true,
    ],
    [
      'i en blind runde som pågår står det verken poeng eller innsats',
      { stake: 2, hideNumbers: true },
      {
        partnerSubtitle: null,
        loneSubtitle: 'Alene mot resten',
        blindSubtitle: 'Meldt før utslag',
        stakeLine: null,
      },
      false,
    ],
  ])('valgtekstene: %s', (_label, extra, expected, hasPayout) => {
    const state = stateFor({ myUserId: 'p1', ...extra });
    expect(state.choiceTexts).toEqual(expected);
    expect(state.payout !== null).toBe(hasPayout);
  });

  it('åpner valg-knappene kun for Wolf selv, i en aktiv runde uten valg', () => {
    const mine = stateFor({ myUserId: 'p1' });
    expect(mine.showChoiceUi).toBe(true);
    // Alle andre i rotasjonen — ingen skrivekontroller. RLS ville avvist dem,
    // og en knapp som garantert feiler er verre enn ingen knapp.
    expect(mine.partnerOptions.map((option) => option.name)).toEqual([
      'Ada Aas',
      'Kari Kvist',
      'Ola Olsen',
    ]);
    expect(stateFor({ myUserId: 'p2' }).showChoiceUi).toBe(false);
    expect(stateFor({ myUserId: 'p2' }).partnerOptions).toEqual([]);

    // Valget er gjort → badgen forteller det, knappene er borte (webbens
    // modal åpner seg heller ikke to ganger på samme hull).
    expect(
      stateFor({
        myUserId: 'p1',
        choices: [
          { holeNumber: 1, wolfUserId: 'p1', choice: 'lone', partnerUserId: null },
        ],
      }).showChoiceUi,
    ).toBe(false);
    // Runden er ikke aktiv → ingen knapper.
    expect(stateFor({ myUserId: 'p1', gameStatus: 'finished' }).showChoiceUi).toBe(
      false,
    );
  });

  it('sier fra i stedet for å gjette når valgene ikke er hentet', () => {
    // `undefined` er ikke «ingen har valgt». En badge bygget på en henting som
    // feilet ser like autoritativ ut som en ekte — og det var grunnen til at
    // formatet var gatet i det hele tatt.
    const unknown = stateFor({ myUserId: 'p1', choices: undefined });

    expect(unknown.notice).toBe(WOLF_CHOICES_UNAVAILABLE);
    expect(unknown.badgeText).toBeNull();
    expect(unknown.wolfUserId).toBeNull();
    expect(unknown.iAmWolf).toBe(false);
    expect(unknown.showChoiceUi).toBe(false);
  });
});

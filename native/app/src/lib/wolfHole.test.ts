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
  wolfOrderStrip,
  wolfStake,
  wolfStandings,
  wolfTurnFromEngine,
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

// #2314: ulven på hullet kommer fra motorens rad, så appen, nettsiden og
// tavla alltid viser samme ulv. Rotasjonen er bare reserve når motoren mangler.
describe('ulven fra motoren (#2314)', () => {
  const engineResult = {
    kind: 'wolf',
    scoring: 'net',
    rotation: 'catch_up',
    holes: [
      { holeNumber: 17, wolfUserId: 'p3', catchUp: true, pointsByPlayer: {} },
      { holeNumber: 18, wolfUserId: 'p4', catchUp: false, pointsByPlayer: {} },
    ],
    players: [],
  } as unknown as ModeResult;

  it('wolfTurnFromEngine leser ulven og catch-up fra hullets rad', () => {
    expect(wolfTurnFromEngine(engineResult, 17)).toEqual({ userId: 'p3', catchUp: true });
    expect(wolfTurnFromEngine(engineResult, 18)).toEqual({ userId: 'p4', catchUp: false });
    expect(wolfTurnFromEngine(engineResult, 5)).toBeNull();
    expect(wolfTurnFromEngine(null, 17)).toBeNull();
  });

  it('motorens ulv vinner over rotasjonen', () => {
    const state = stateFor({
      holeNumber: 17,
      myUserId: 'p3',
      engineTurn: { userId: 'p3', catchUp: true },
    });
    expect(state.wolfUserId).toBe('p3');
    expect(state.iAmWolf).toBe(true);
    expect(state.catchUp).toBe(true);
  });

  it('en lagret rad vinner, og beholder catch-up når det er samme spiller', () => {
    const choice = { holeNumber: 17, wolfUserId: 'p3', choice: 'lone' as const, partnerUserId: null };
    expect(
      stateFor({ holeNumber: 17, choices: [choice], engineTurn: { userId: 'p3', catchUp: true } }),
    ).toMatchObject({ wolfUserId: 'p3', catchUp: true });
    expect(
      stateFor({ holeNumber: 17, choices: [choice], engineTurn: { userId: 'p2', catchUp: true } }),
    ).toMatchObject({ wolfUserId: 'p3', catchUp: false });
  });

  it('uten motoren faller den tilbake på regelen', () => {
    const points = new Map([['p1', 8], ['p2', 4], ['p3', 4], ['p4', 4]]);
    expect(
      stateFor({ holeNumber: 17, pointsByUser: points, engineTurn: null, rule: 'catch_up' }),
    ).toMatchObject({ wolfUserId: 'p2', catchUp: true });
    expect(
      stateFor({ holeNumber: 17, pointsByUser: new Map([['p1', 3]]), engineTurn: null, rule: 'catch_up' }),
    ).toMatchObject({ wolfUserId: 'p1', catchUp: false });
    expect(stateFor({ holeNumber: 17, pointsByUser: points, engineTurn: null })).toMatchObject({
      wolfUserId: 'p2',
      catchUp: false,
    });
  });
});

describe('gangen, catch-up-linja og stillingen (#2314)', () => {
  const CATCH_UP_17 = { userId: 'p2', catchUp: true };
  const BEHIND = new Map([['p1', 9], ['p2', 4], ['p3', 6], ['p4', 6]]);

  it('flowLine står for de andre på et ubesvart hull i et aktivt spill', () => {
    expect(stateFor({ myUserId: 'p2' }).flowLine).toBe(
      'Per Persen slår sist og sier ja eller nei rett etter hvert utslag. Blind Wolf meldes før noen slår.',
    );
  });

  it.each([
    ['for ulven selv', { myUserId: 'p1' }],
    ['når valget er lagret', {
      myUserId: 'p2',
      choices: [{ holeNumber: 1, wolfUserId: 'p1', choice: 'lone' as const, partnerUserId: null }],
    }],
    ['når spillet ikke er aktivt', { myUserId: 'p2', gameStatus: 'finished' }],
    ['når valgene ikke kunne hentes', { myUserId: 'p2', choices: undefined }],
  ])('flowLine er null %s', (_label, overrides) => {
    expect(stateFor(overrides).flowLine).toBeNull();
  });

  it('catch-up-linja sier avstanden før hullet, til ulven og til de andre', () => {
    const base = { holeNumber: 17, engineTurn: CATCH_UP_17, pointsByUser: BEHIND };
    expect(stateFor({ ...base, myUserId: 'p2' }).catchUpLine).toBe(
      'Du ligger 5 poeng bak lederen, så du er ulv på dette hullet.',
    );
    expect(stateFor({ ...base, myUserId: 'p3' }).catchUpLine).toBe(
      'Ada Aas ligger 5 poeng bak lederen og er ulv på dette hullet.',
    );
  });

  it('i en blind runde som pågår står merket, men ikke linja med poeng', () => {
    const state = stateFor({
      holeNumber: 17,
      myUserId: 'p2',
      engineTurn: CATCH_UP_17,
      pointsByUser: BEHIND,
      hideNumbers: true,
    });
    expect(state.catchUp).toBe(true);
    expect(state.catchUpLine).toBeNull();
  });

  it('uten catch-up er det verken merke eller linje', () => {
    const state = stateFor({ holeNumber: 17, engineTurn: { userId: 'p1', catchUp: false } });
    expect(state.catchUp).toBe(false);
    expect(state.catchUpLine).toBeNull();
  });

  const STANDINGS = new Map([
    ['p1', { rank: 2, points: 6 }],
    ['p2', { rank: 1, points: 14 }],
    ['p3', { rank: 3, points: 2 }],
    ['p4', { rank: 4, points: 0 }],
  ]);

  it('partnerknappene viser stillingen når noen har poeng', () => {
    const options = stateFor({ standings: STANDINGS }).partnerOptions;
    expect(options.map((o) => o.standing)).toEqual(['1. · 14 p', '3. · 2 p', '4. · 0 p']);
    expect(options[0]?.accessibilityLabel).toBe('Partner: Ada Aas, 1. plass, 14 poeng');
  });

  it('ingen stilling før noen har fått poeng, og aldri i en blind runde', () => {
    const zero = new Map([...STANDINGS].map(([id, s]) => [id, { ...s, points: 0 }]));
    expect(stateFor({ standings: zero }).partnerOptions.every((o) => o.standing === null)).toBe(true);
    const hidden = stateFor({ standings: STANDINGS, hideNumbers: true }).partnerOptions;
    expect(hidden.every((o) => o.standing === null)).toBe(true);
    expect(hidden[0]?.accessibilityLabel).toBe('Partner: Ada Aas');
  });

  it('wolfStandings leser plass og poeng fra motoren', () => {
    const result = {
      kind: 'wolf',
      players: [{ userId: 'p2', rank: 1, totalPoints: 14 }],
    } as unknown as ModeResult;
    expect([...wolfStandings(result).entries()]).toEqual([['p2', { rank: 1, points: 14 }]]);
    expect(wolfStandings(null).size).toBe(0);
  });
});

describe('wolfOrderStrip — Wolf-rekkefølgen (#2314)', () => {
  function stripFor(overrides: Partial<Parameters<typeof wolfOrderStrip>[0]> = {}) {
    return wolfOrderStrip({
      holeNumber: 7,
      myUserId: 'p3',
      gameStatus: 'active',
      players: FOUR,
      choices: [],
      pointsBefore: NO_POINTS,
      rule: 'catch_up',
      currentWolfUserId: 'p3',
      ...overrides,
    });
  }

  it('dette hullet og de tre neste, med «Deg» og fornavn', () => {
    expect(stripFor()).toEqual({
      columns: [
        { hole: 7, label: 'Deg', isMine: true, accessibilityLabel: 'Hull 7: Deg' },
        { hole: 8, label: 'Ola', isMine: false, accessibilityLabel: 'Hull 8: Ola' },
        { hole: 9, label: 'Per', isMine: false, accessibilityLabel: 'Hull 9: Per' },
        { hole: 10, label: 'Ada', isMine: false, accessibilityLabel: 'Hull 10: Ada' },
      ],
      ruleLine: null,
    });
  });

  it('catch-up-hull som ikke er avgjort: «Avgjøres», og regel-linja for nye spill', () => {
    const strip = stripFor({ holeNumber: 15, currentWolfUserId: 'p3' });
    expect(strip?.columns.map((c) => c.label)).toEqual(['Deg', 'Ola', 'Avgjøres', 'Avgjøres']);
    expect(strip?.columns[2]?.accessibilityLabel).toBe('Hull 17: avgjøres etter hull 16');
    expect(strip?.ruleLine).toBe(
      'Fra hull 17: ligger den som er sist, minst 4 poeng bak lederen, blir den ulv. Ellers går rundgangen videre.',
    );
  });

  it('gamle spill får dagens linje', () => {
    expect(stripFor({ holeNumber: 15, rule: 'trailing' })?.ruleLine).toBe(
      'Fra hull 17 blir den som ligger sist etter forrige hull, Wolf.',
    );
  });

  it('hullet du står på har ulven fra hull-tilstanden, og stripa slutter ved 18', () => {
    const strip = stripFor({ holeNumber: 17, currentWolfUserId: 'p2' });
    expect(strip?.columns).toEqual([
      { hole: 17, label: 'Ada', isMine: false, accessibilityLabel: 'Hull 17: Ada' },
      {
        hole: 18,
        label: 'Avgjøres',
        isMine: false,
        accessibilityLabel: 'Hull 18: avgjøres etter hull 17',
      },
    ]);
  });

  it.each([
    ['et spill som ikke er aktivt', { gameStatus: 'scheduled' }],
    ['færre enn tre i rotasjonen', { players: FOUR.slice(0, 2) }],
  ])('ingen stripe i %s', (_label, overrides) => {
    expect(stripFor(overrides)).toBeNull();
  });
});

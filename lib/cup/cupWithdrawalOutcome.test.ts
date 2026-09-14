import { describe, it, expect } from 'vitest';
import type { GameStatus } from '@/lib/games/status';
import { buildCupRoster } from './cupRoster';
import {
  WITHDRAWAL_LATE_WINDOW_MS,
  isDecidedByWithdrawal,
  isNotStartedCupMatch,
  isPlayOnChoicePending,
  resolveCupMatchWithdrawal,
  type CupWithdrawalInput,
} from './cupWithdrawalOutcome';

/**
 * #1814 — konvoluttregelen for et trekk underveis i en cup (Type A).
 *
 * Regelen har ETT hjem: utfallet lagres aldri, det utledes av `withdrawn_at`
 * mot `scheduled_tee_off_at`. Alle grener i eierbeslutning E2/E3/E4 er
 * enumerert her; plumbingen (`cupMatchEntry` → `computeCupLeaderboard`) tester
 * ikke regelen på nytt.
 */

const TEE_OFF = '2026-09-10T08:00:00.000Z';
/** Nøyaktig 30 minutter før tee-off — grensa er «mindre enn», så dette er I TIDE. */
const AT_BOUNDARY = '2026-09-10T07:30:00.000Z';
/** Ett sekund innenfor vinduet → sen. */
const JUST_INSIDE = '2026-09-10T07:30:01.000Z';
const EARLY = '2026-09-09T20:00:00.000Z';
const AFTER_TEE_OFF = '2026-09-10T08:15:00.000Z';

function singles(overrides: Partial<CupWithdrawalInput> = {}): CupWithdrawalInput {
  return {
    status: 'scheduled',
    gameMode: 'singles_matchplay',
    scheduledTeeOffAt: TEE_OFF,
    playOn: false,
    players: [
      { userId: 'a1', side: 1, withdrawnAt: null },
      { userId: 'b1', side: 2, withdrawnAt: null },
    ],
    ...overrides,
  };
}

function fourball(overrides: Partial<CupWithdrawalInput> = {}): CupWithdrawalInput {
  return {
    status: 'scheduled',
    gameMode: 'fourball_matchplay',
    scheduledTeeOffAt: TEE_OFF,
    playOn: false,
    players: [
      { userId: 'a1', side: 1, withdrawnAt: null },
      { userId: 'a2', side: 1, withdrawnAt: null },
      { userId: 'b1', side: 2, withdrawnAt: null },
      { userId: 'b2', side: 2, withdrawnAt: null },
    ],
    ...overrides,
  };
}

describe('WITHDRAWAL_LATE_WINDOW_MS', () => {
  it('er 30 minutter — eneste hjem for tallet', () => {
    expect(WITHDRAWAL_LATE_WINDOW_MS).toBe(30 * 60 * 1000);
  });
});

describe('resolveCupMatchWithdrawal — ingen avgjørelse', () => {
  it('gir null når ingen har trukket seg', () => {
    expect(resolveCupMatchWithdrawal(singles())).toBeNull();
  });

  it.each([['active'], ['finished']] as const)(
    'gir null for en %s kamp — startede og ferdige kamper røres aldri (E3)',
    (status) => {
      expect(
        resolveCupMatchWithdrawal(
          singles({
            status,
            players: [
              { userId: 'a1', side: 1, withdrawnAt: EARLY },
              { userId: 'b1', side: 2, withdrawnAt: null },
            ],
          }),
        ),
      ).toBeNull();
    },
  );

  it('ignorerer trukne rader uten side (team_number utenfor 1/2)', () => {
    // En rad uten lag hører til ingen side (marshal-/reserve-rusk i eldre
    // cuper). Den skal hverken avgjøre kampen eller havne i «{navn} trakk seg».
    const rogue = { userId: 'x9', side: 3 as 1 | 2, withdrawnAt: EARLY };

    expect(
      resolveCupMatchWithdrawal(singles({ players: [rogue] })),
    ).toBeNull();

    expect(
      resolveCupMatchWithdrawal(
        singles({
          players: [
            { userId: 'a1', side: 1, withdrawnAt: EARLY },
            { userId: 'b1', side: 2, withdrawnAt: null },
            rogue,
          ],
        }),
      ),
    ).toMatchObject({ outcome: 'halved', withdrawnUserIds: ['a1'] });
  });
});

describe('resolveCupMatchWithdrawal — én side trukket (E2)', () => {
  const cases: Array<
    [name: string, withdrawnAt: string, teeOff: string | null, outcome: 'halved' | 'walkover', winnerSide: 1 | 2 | 'tied', late: boolean]
  > = [
    ['i god tid → halvert', EARLY, TEE_OFF, 'halved', 'tied', false],
    ['nøyaktig 30 min før → halvert (grensa er «mindre enn»)', AT_BOUNDARY, TEE_OFF, 'halved', 'tied', false],
    ['ett sekund innenfor vinduet → walkover', JUST_INSIDE, TEE_OFF, 'walkover', 2, true],
    ['etter tee-off → walkover', AFTER_TEE_OFF, TEE_OFF, 'walkover', 2, true],
    ['uten planlagt tee-off → aldri sen, halvert', AFTER_TEE_OFF, null, 'halved', 'tied', false],
  ];

  it.each(cases)(
    'side 1 trekker seg %s',
    (_name, withdrawnAt, teeOff, outcome, winnerSide, late) => {
      const result = resolveCupMatchWithdrawal(
        singles({
          scheduledTeeOffAt: teeOff,
          players: [
            { userId: 'a1', side: 1, withdrawnAt },
            { userId: 'b1', side: 2, withdrawnAt: null },
          ],
        }),
      );
      expect(result).toEqual({
        outcome,
        winnerSide,
        withdrawnSide: 1,
        withdrawnUserIds: ['a1'],
        late,
      });
    },
  );

  it('speiler utfallet når det er side 2 som trekker seg', () => {
    expect(
      resolveCupMatchWithdrawal(
        singles({
          players: [
            { userId: 'a1', side: 1, withdrawnAt: null },
            { userId: 'b1', side: 2, withdrawnAt: JUST_INSIDE },
          ],
        }),
      ),
    ).toEqual({
      outcome: 'walkover',
      winnerSide: 1,
      withdrawnSide: 2,
      withdrawnUserIds: ['b1'],
      late: true,
    });
  });

  it('én sen rad gjør hele siden sen, selv om makkeren trakk seg i tide', () => {
    expect(
      resolveCupMatchWithdrawal(
        fourball({
          players: [
            { userId: 'a1', side: 1, withdrawnAt: EARLY },
            { userId: 'a2', side: 1, withdrawnAt: JUST_INSIDE },
            { userId: 'b1', side: 2, withdrawnAt: null },
            { userId: 'b2', side: 2, withdrawnAt: null },
          ],
        }),
      ),
    ).toEqual({
      outcome: 'walkover',
      winnerSide: 2,
      withdrawnSide: 1,
      withdrawnUserIds: ['a1', 'a2'],
      late: true,
    });
  });
});

describe('resolveCupMatchWithdrawal — begge sider trukket', () => {
  it.each([
    ['begge i tide', EARLY, EARLY, false],
    ['én sen', EARLY, JUST_INSIDE, true],
    ['begge sene', JUST_INSIDE, AFTER_TEE_OFF, true],
  ] as const)(
    'halveres alltid — %s (ingen får gratis poeng)',
    (_name, side1At, side2At, late) => {
      expect(
        resolveCupMatchWithdrawal(
          singles({
            players: [
              { userId: 'a1', side: 1, withdrawnAt: side1At },
              { userId: 'b1', side: 2, withdrawnAt: side2At },
            ],
          }),
        ),
      ).toEqual({
        outcome: 'halved',
        winnerSide: 'tied',
        withdrawnSide: 'both',
        withdrawnUserIds: ['a1', 'b1'],
        late,
      });
    },
  );
});

describe('resolveCupMatchWithdrawal — fourball «makkeren spiller alene» (E4)', () => {
  it('gir null når flagget er satt og makkeren står igjen', () => {
    expect(
      resolveCupMatchWithdrawal(
        fourball({
          playOn: true,
          players: [
            { userId: 'a1', side: 1, withdrawnAt: JUST_INSIDE },
            { userId: 'a2', side: 1, withdrawnAt: null },
            { userId: 'b1', side: 2, withdrawnAt: null },
            { userId: 'b2', side: 2, withdrawnAt: null },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('avgjør kampen uten flagget, selv om makkeren står igjen', () => {
    expect(
      resolveCupMatchWithdrawal(
        fourball({
          playOn: false,
          players: [
            { userId: 'a1', side: 1, withdrawnAt: EARLY },
            { userId: 'a2', side: 1, withdrawnAt: null },
            { userId: 'b1', side: 2, withdrawnAt: null },
            { userId: 'b2', side: 2, withdrawnAt: null },
          ],
        }),
      ),
    ).toEqual({
      outcome: 'halved',
      winnerSide: 'tied',
      withdrawnSide: 1,
      withdrawnUserIds: ['a1'],
      late: false,
    });
  });

  it('avgjør kampen når BEGGE på siden trekker seg, uansett flagg', () => {
    expect(
      resolveCupMatchWithdrawal(
        fourball({
          playOn: true,
          players: [
            { userId: 'a1', side: 1, withdrawnAt: JUST_INSIDE },
            { userId: 'a2', side: 1, withdrawnAt: JUST_INSIDE },
            { userId: 'b1', side: 2, withdrawnAt: null },
            { userId: 'b2', side: 2, withdrawnAt: null },
          ],
        }),
      ),
    ).toEqual({
      outcome: 'walkover',
      winnerSide: 2,
      withdrawnSide: 1,
      withdrawnUserIds: ['a1', 'a2'],
      late: true,
    });
  });

  it.each([
    ['foursomes_matchplay'],
    ['greensome_matchplay'],
    ['chapman_matchplay'],
    ['gruesome_matchplay'],
  ] as const)(
    'ignorerer flagget for %s — delt ball har ikke noe alene-valg (E4)',
    (gameMode) => {
      expect(
        resolveCupMatchWithdrawal(
          fourball({
            gameMode,
            playOn: true,
            players: [
              { userId: 'a1', side: 1, withdrawnAt: EARLY },
              { userId: 'a2', side: 1, withdrawnAt: null },
              { userId: 'b1', side: 2, withdrawnAt: null },
              { userId: 'b2', side: 2, withdrawnAt: null },
            ],
          }),
        ),
      ).toEqual({
        outcome: 'halved',
        winnerSide: 'tied',
        withdrawnSide: 1,
        withdrawnUserIds: ['a1'],
        late: false,
      });
    },
  );

  it('spiller videre på begge sider når hver side har én igjen', () => {
    expect(
      resolveCupMatchWithdrawal(
        fourball({
          playOn: true,
          players: [
            { userId: 'a1', side: 1, withdrawnAt: EARLY },
            { userId: 'a2', side: 1, withdrawnAt: null },
            { userId: 'b1', side: 2, withdrawnAt: EARLY },
            { userId: 'b2', side: 2, withdrawnAt: null },
          ],
        }),
      ),
    ).toBeNull();
  });
});

/**
 * #1964 — "not started" has one home. The truth table is typed as
 * Record<GameStatus, boolean>, so a new status in the union fails to compile
 * here until someone decides which side of the line it falls on. Each row also
 * checks that the two pure consumers agree with the helper: the roster's
 * «Trukket» flag and the envelope rule (E3).
 */
const NOT_STARTED: Record<GameStatus, boolean> = {
  draft: true,
  scheduled: true,
  active: false,
  finished: false,
};

describe('isNotStartedCupMatch — ett hjem for «ikke startet» (#1964)', () => {
  it.each(Object.entries(NOT_STARTED) as [GameStatus, boolean][])(
    '%s → %s, og rosteret og konvoluttregelen er enige',
    (status, notStarted) => {
      expect(isNotStartedCupMatch(status)).toBe(notStarted);

      const roster = buildCupRoster([
        {
          status,
          players: [
            {
              user_id: 'a1',
              team_number: 1,
              users: { name: 'a1', nickname: null },
              withdrawn_at: EARLY,
            },
          ],
        },
      ]);
      expect(roster.team1[0].withdrawn).toBe(notStarted);

      const decision = resolveCupMatchWithdrawal(
        singles({
          status,
          players: [
            { userId: 'a1', side: 1, withdrawnAt: EARLY },
            { userId: 'b1', side: 2, withdrawnAt: null },
          ],
        }),
      );
      expect(decision !== null).toBe(notStarted);
    },
  );

  it('regner en ukjent status som startet — trekket skriver aldri på den', () => {
    expect(isNotStartedCupMatch('cancelled')).toBe(false);
  });
});

/**
 * #1967 — "choice pending" has one home. A match waits on the organiser while
 * nobody has recorded the play-on choice (the mode_config key is missing) and
 * "spiller alene" would still get the match played. cupMatchEntry (organiser
 * surfaces and the cup page) and the waiting room both ask this helper.
 */
describe('isPlayOnChoicePending — «valg venter» (#1967)', () => {
  const ONE_WITHDRAWN: CupWithdrawalInput['players'] = [
    { userId: 'a1', side: 1, withdrawnAt: EARLY },
    { userId: 'a2', side: 1, withdrawnAt: null },
    { userId: 'b1', side: 2, withdrawnAt: null },
    { userId: 'b2', side: 2, withdrawnAt: null },
  ];
  const NO_CHOICE = { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 };

  it.each<[string, Partial<CupWithdrawalInput>, unknown, boolean]>([
    ['ingen har valgt, og makkeren kan spille alene', { players: ONE_WITHDRAWN }, NO_CHOICE, true],
    ['mode_config mangler helt', { players: ONE_WITHDRAWN }, null, true],
    [
      'arrangøren har valgt regelen',
      { players: ONE_WITHDRAWN },
      { ...NO_CHOICE, withdrawal_play_on: false },
      false,
    ],
    [
      'arrangøren har valgt at makkeren spiller alene',
      { players: ONE_WITHDRAWN, playOn: true },
      { ...NO_CHOICE, withdrawal_play_on: true },
      false,
    ],
    [
      'ingen har trukket seg',
      {
        players: [
          { userId: 'a1', side: 1, withdrawnAt: null },
          { userId: 'a2', side: 1, withdrawnAt: null },
          { userId: 'b1', side: 2, withdrawnAt: null },
          { userId: 'b2', side: 2, withdrawnAt: null },
        ],
      },
      NO_CHOICE,
      false,
    ],
    [
      'hele den ene siden har trukket seg',
      {
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'a2', side: 1, withdrawnAt: EARLY },
          { userId: 'b1', side: 2, withdrawnAt: null },
          { userId: 'b2', side: 2, withdrawnAt: null },
        ],
      },
      NO_CHOICE,
      false,
    ],
    [
      'én på hver side har trukket seg — alltid halvert (#2032)',
      {
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'a2', side: 1, withdrawnAt: null },
          { userId: 'b1', side: 2, withdrawnAt: EARLY },
          { userId: 'b2', side: 2, withdrawnAt: null },
        ],
      },
      NO_CHOICE,
      false,
    ],
    [
      'én på hver side, den ene sent — fortsatt halvert (#2032)',
      {
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'a2', side: 1, withdrawnAt: null },
          { userId: 'b1', side: 2, withdrawnAt: JUST_INSIDE },
          { userId: 'b2', side: 2, withdrawnAt: null },
        ],
      },
      NO_CHOICE,
      false,
    ],
    ['kampen står fortsatt i utkast', { status: 'draft', players: ONE_WITHDRAWN }, NO_CHOICE, false],
    ['kampen er i gang', { status: 'active', players: ONE_WITHDRAWN }, NO_CHOICE, false],
    [
      'foursomes har ikke alene-valget',
      { gameMode: 'foursomes_matchplay', players: ONE_WITHDRAWN },
      NO_CHOICE,
      false,
    ],
  ])('%s', (_name, overrides, modeConfig, expected) => {
    expect(isPlayOnChoicePending(fourball(overrides), modeConfig)).toBe(expected);
  });
});

/**
 * #2033 — "decided by withdrawal" means the rule outcome is final. While the
 * organiser's play-on choice is pending, the outcome is provisional and the
 * match is still to be played, so the remaining partner keeps the withdraw
 * link on the cup page. Each row builds the match the way cupMatchEntry does:
 * the raw rule result plus the pending flag.
 */
describe('isDecidedByWithdrawal — avgjort ved trekk (#2033)', () => {
  const NO_CHOICE = { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 };

  it.each<[string, CupWithdrawalInput, unknown, boolean]>([
    ['ingen har trukket seg', fourball(), NO_CHOICE, false],
    [
      'singles, trukket i god tid → halvert',
      singles({
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'b1', side: 2, withdrawnAt: null },
        ],
      }),
      null,
      true,
    ],
    [
      'singles, trukket sent → walkover',
      singles({
        players: [
          { userId: 'a1', side: 1, withdrawnAt: JUST_INSIDE },
          { userId: 'b1', side: 2, withdrawnAt: null },
        ],
      }),
      null,
      true,
    ],
    [
      'fourball, én trukket og ingen har valgt — valget venter',
      fourball({
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'a2', side: 1, withdrawnAt: null },
          { userId: 'b1', side: 2, withdrawnAt: null },
          { userId: 'b2', side: 2, withdrawnAt: null },
        ],
      }),
      NO_CHOICE,
      false,
    ],
    [
      'fourball, én trukket og arrangøren valgte regelen',
      fourball({
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'a2', side: 1, withdrawnAt: null },
          { userId: 'b1', side: 2, withdrawnAt: null },
          { userId: 'b2', side: 2, withdrawnAt: null },
        ],
      }),
      { ...NO_CHOICE, withdrawal_play_on: false },
      true,
    ],
    [
      'fourball, én trukket og makkeren spiller alene',
      fourball({
        playOn: true,
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'a2', side: 1, withdrawnAt: null },
          { userId: 'b1', side: 2, withdrawnAt: null },
          { userId: 'b2', side: 2, withdrawnAt: null },
        ],
      }),
      { ...NO_CHOICE, withdrawal_play_on: true },
      false,
    ],
    [
      'fourball, én på hver side og ingen har valgt — alltid halvert (#2032)',
      fourball({
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'a2', side: 1, withdrawnAt: null },
          { userId: 'b1', side: 2, withdrawnAt: EARLY },
          { userId: 'b2', side: 2, withdrawnAt: null },
        ],
      }),
      NO_CHOICE,
      true,
    ],
    [
      'fourball, hele den ene siden har trukket seg',
      fourball({
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'a2', side: 1, withdrawnAt: EARLY },
          { userId: 'b1', side: 2, withdrawnAt: null },
          { userId: 'b2', side: 2, withdrawnAt: null },
        ],
      }),
      NO_CHOICE,
      true,
    ],
  ])('%s', (_name, input, modeConfig, expected) => {
    expect(
      isDecidedByWithdrawal({
        withdrawal: resolveCupMatchWithdrawal(input),
        playOnChoicePending: isPlayOnChoicePending(input, modeConfig),
      }),
    ).toBe(expected);
  });

  it('mangler flaggene, regnes et trekk som avgjort og ingen trekk som åpen', () => {
    // CupMatchInput.playOnChoicePending and .withdrawal are optional: a missing
    // pending flag means "not pending", a missing withdrawal means "no withdrawal".
    const withdrawal = resolveCupMatchWithdrawal(
      singles({
        players: [
          { userId: 'a1', side: 1, withdrawnAt: EARLY },
          { userId: 'b1', side: 2, withdrawnAt: null },
        ],
      }),
    );
    expect(isDecidedByWithdrawal({ withdrawal })).toBe(true);
    expect(isDecidedByWithdrawal({})).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  WITHDRAWAL_LATE_WINDOW_MS,
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
    expect(
      resolveCupMatchWithdrawal(
        singles({
          players: [
            { userId: 'a1', side: 1, withdrawnAt: null },
            { userId: 'b1', side: 2, withdrawnAt: null },
          ],
        }),
      ),
    ).toBeNull();
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

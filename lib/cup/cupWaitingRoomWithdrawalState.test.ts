import { describe, it, expect } from 'vitest';
import type { CupMatchWithdrawal } from './cupWithdrawalOutcome';
import {
  cupWaitingRoomWithdrawalState,
  type CupWaitingRoomWithdrawalInput,
  type CupWaitingRoomWithdrawalState,
} from './cupWaitingRoomWithdrawalState';

/**
 * #2040 — cup-trekk-tilstanden i venterommet til en planlagt kamp (Type A).
 *
 * Tabellen er transkribert fra blokka som sto inline i `GameHomePage`, rad for
 * rad. Selve regelen (`resolveCupMatchWithdrawal`, `isPlayOnChoicePending`)
 * testes i `cupWithdrawalOutcome.test.ts`; her låses bare hva venterommet
 * utleder av den: navnene, makkeren som venter og laget som får walkover.
 */

const TEE_OFF = '2026-09-10T08:00:00.000Z';
/** Ett sekund innenfor 30-minutters-vinduet → sent. */
const JUST_INSIDE = '2026-09-10T07:30:01.000Z';
const EARLY = '2026-09-09T20:00:00.000Z';

const NAMES: Record<string, string> = {
  a1: 'Anna',
  a2: 'Arne',
  b1: 'Bjørn',
  b2: 'Berit',
};

const ACTIVE_CUP = { status: 'active', team_1_name: 'Ørnene', team_2_name: 'Falkene' };
const FB_NO_CHOICE = { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 };

/** Én rå `game_players`-rad, i samme form som `gwp.players`. */
function player(user_id: string, team_number: number, withdrawn_at: string | null) {
  return { user_id, team_number, withdrawn_at };
}

function waitingRoom(
  players: CupWaitingRoomWithdrawalInput['players'],
  overrides: Partial<CupWaitingRoomWithdrawalInput> = {},
): CupWaitingRoomWithdrawalInput {
  return {
    tournamentId: 't1',
    gameMode: 'singles_matchplay',
    scheduledTeeOffAt: TEE_OFF,
    modeConfig: null,
    players,
    cup: ACTIVE_CUP,
    nameOf: (userId) => NAMES[userId] ?? userId,
    teamFallback: (side) => `Lag ${side}`,
    ...overrides,
  };
}

function fourball(
  players: CupWaitingRoomWithdrawalInput['players'],
  overrides: Partial<CupWaitingRoomWithdrawalInput> = {},
): CupWaitingRoomWithdrawalInput {
  return waitingRoom(players, {
    gameMode: 'fourball_matchplay',
    modeConfig: FB_NO_CHOICE,
    ...overrides,
  });
}

const EMPTY: CupWaitingRoomWithdrawalState = {
  decision: null,
  decidedNames: '',
  pendingPartner: null,
  winnerTeam: '',
};

const WALKOVER_A1: CupMatchWithdrawal = {
  outcome: 'walkover',
  winnerSide: 2,
  withdrawnSide: 1,
  withdrawnUserIds: ['a1'],
  late: true,
};

const HALVED_A1: CupMatchWithdrawal = {
  outcome: 'halved',
  winnerSide: 'tied',
  withdrawnSide: 1,
  withdrawnUserIds: ['a1'],
  late: false,
};

/** Singles der a1 trakk seg innenfor vinduet. */
const LATE_SINGLES = [player('a1', 1, JUST_INSIDE), player('b1', 2, null)];
/** Fourball der a1 trakk seg tidlig og a2 står igjen. */
const EARLY_FOURBALL = [
  player('a1', 1, EARLY),
  player('a2', 1, null),
  player('b1', 2, null),
  player('b2', 2, null),
];

describe('cupWaitingRoomWithdrawalState — venterommets cup-trekk (#2040)', () => {
  it.each<[string, CupWaitingRoomWithdrawalInput, CupWaitingRoomWithdrawalState]>([
    [
      'R1 ikke-cup: alt tomt selv om noen har trukket seg',
      waitingRoom([player('a1', 1, EARLY), player('b1', 2, null)], {
        tournamentId: null,
        cup: null,
      }),
      EMPTY,
    ],
    [
      'R2 cup, ingen har trukket seg: alt tomt',
      waitingRoom([player('a1', 1, null), player('b1', 2, null)]),
      EMPTY,
    ],
    [
      'R3 walkover med lagnavn: laget til side 2',
      waitingRoom(LATE_SINGLES),
      { decision: WALKOVER_A1, decidedNames: 'Anna', pendingPartner: null, winnerTeam: 'Falkene' },
    ],
    [
      'R4 walkover der side 1 vinner',
      waitingRoom([player('a1', 1, null), player('b1', 2, JUST_INSIDE)]),
      {
        decision: {
          outcome: 'walkover',
          winnerSide: 1,
          withdrawnSide: 2,
          withdrawnUserIds: ['b1'],
          late: true,
        },
        decidedNames: 'Bjørn',
        pendingPartner: null,
        winnerTeam: 'Ørnene',
      },
    ],
    [
      'R5 walkover med blankt lagnavn: reserven «Lag 2»',
      waitingRoom(LATE_SINGLES, {
        cup: { status: 'active', team_1_name: 'Ørnene', team_2_name: '   ' },
      }),
      { decision: WALKOVER_A1, decidedNames: 'Anna', pendingPartner: null, winnerTeam: 'Lag 2' },
    ],
    [
      'R6 walkover uten cup-rad: reserven «Lag 2»',
      waitingRoom(LATE_SINGLES, { cup: null }),
      { decision: WALKOVER_A1, decidedNames: 'Anna', pendingPartner: null, winnerTeam: 'Lag 2' },
    ],
    [
      'R7 walkover, lagnavnet trimmes',
      waitingRoom(LATE_SINGLES, {
        cup: { status: 'active', team_1_name: 'Ørnene', team_2_name: '  Falkene ' },
      }),
      { decision: WALKOVER_A1, decidedNames: 'Anna', pendingPartner: null, winnerTeam: 'Falkene' },
    ],
    [
      'R8 halvert (tidlig trekk på én side): ingen vinnerlag',
      waitingRoom([player('a1', 1, EARLY), player('b1', 2, null)]),
      { decision: HALVED_A1, decidedNames: 'Anna', pendingPartner: null, winnerTeam: '' },
    ],
    [
      'R9 valget venter og makkeren står igjen',
      fourball(EARLY_FOURBALL),
      { decision: HALVED_A1, decidedNames: 'Anna', pendingPartner: 'Arne', winnerTeam: '' },
    ],
    [
      'R10 valget venter når mode_config mangler',
      fourball(EARLY_FOURBALL, { modeConfig: null }),
      { decision: HALVED_A1, decidedNames: 'Anna', pendingPartner: 'Arne', winnerTeam: '' },
    ],
    [
      'R11 valget venter og trekket er sent: walkover, makker og vinnerlag',
      fourball([
        player('a1', 1, JUST_INSIDE),
        player('a2', 1, null),
        player('b1', 2, null),
        player('b2', 2, null),
      ]),
      { decision: WALKOVER_A1, decidedNames: 'Anna', pendingPartner: 'Arne', winnerTeam: 'Falkene' },
    ],
    [
      'R12 valget venter, men cupen er utkast: ingen makker',
      fourball(EARLY_FOURBALL, {
        cup: { status: 'draft', team_1_name: 'Ørnene', team_2_name: 'Falkene' },
      }),
      { decision: HALVED_A1, decidedNames: 'Anna', pendingPartner: null, winnerTeam: '' },
    ],
    [
      'R13 valget venter, men cup-raden mangler: ingen makker',
      fourball(EARLY_FOURBALL, { cup: null }),
      { decision: HALVED_A1, decidedNames: 'Anna', pendingPartner: null, winnerTeam: '' },
    ],
    [
      'R14 arrangøren valgte «etter regelen»: ingen makker',
      fourball(EARLY_FOURBALL, { modeConfig: { ...FB_NO_CHOICE, withdrawal_play_on: false } }),
      { decision: HALVED_A1, decidedNames: 'Anna', pendingPartner: null, winnerTeam: '' },
    ],
    [
      'R15 arrangøren valgte «spiller alene»: kampen spilles',
      fourball(EARLY_FOURBALL, { modeConfig: { ...FB_NO_CHOICE, withdrawal_play_on: true } }),
      EMPTY,
    ],
    [
      'R16 én trukket på hver side: halvert, ingen makker (#2032)',
      fourball([
        player('a1', 1, EARLY),
        player('a2', 1, null),
        player('b1', 2, EARLY),
        player('b2', 2, null),
      ]),
      {
        decision: {
          outcome: 'halved',
          winnerSide: 'tied',
          withdrawnSide: 'both',
          withdrawnUserIds: ['a1', 'b1'],
          late: false,
        },
        decidedNames: 'Anna/Bjørn',
        pendingPartner: null,
        winnerTeam: '',
      },
    ],
    [
      'R17 én trukket på hver side, den ene sent: fortsatt halvert',
      fourball([
        player('a1', 1, EARLY),
        player('a2', 1, null),
        player('b1', 2, JUST_INSIDE),
        player('b2', 2, null),
      ]),
      {
        decision: {
          outcome: 'halved',
          winnerSide: 'tied',
          withdrawnSide: 'both',
          withdrawnUserIds: ['a1', 'b1'],
          late: true,
        },
        decidedNames: 'Anna/Bjørn',
        pendingPartner: null,
        winnerTeam: '',
      },
    ],
    [
      'R18 hele side 1 trukket: ingen makker igjen',
      fourball([
        player('a1', 1, EARLY),
        player('a2', 1, EARLY),
        player('b1', 2, null),
        player('b2', 2, null),
      ]),
      {
        decision: {
          outcome: 'halved',
          winnerSide: 'tied',
          withdrawnSide: 1,
          withdrawnUserIds: ['a1', 'a2'],
          late: false,
        },
        decidedNames: 'Anna/Arne',
        pendingPartner: null,
        winnerTeam: '',
      },
    ],
    [
      'R19 foursomes har ikke alene-valget: ingen makker',
      fourball(EARLY_FOURBALL, { gameMode: 'foursomes_matchplay' }),
      { decision: HALVED_A1, decidedNames: 'Anna', pendingPartner: null, winnerTeam: '' },
    ],
    [
      'R20 en spiller utenfor side 1 og 2 teller ikke',
      waitingRoom([player('a1', 1, null), player('b1', 2, null), player('x1', 0, EARLY)]),
      EMPTY,
    ],
  ])('%s', (_label, input, expected) => {
    expect(cupWaitingRoomWithdrawalState(input)).toEqual(expected);
  });
});

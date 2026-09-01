// native/app/src/lib/endGamePlan.test.ts
// Native N6c (#1856): reglene avslutt-skjermen tegner etter.
//
// Type A — ren logikk, ingen render, ingen nett. Skjermen har én render-test
// (`screens/EndGame.test.tsx`) som beviser koblingen; tallene og grenene her
// gjentas ikke der.
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import {
  buildFinishPlan,
  canFinish,
  needsPeerApproval,
  sideSlots,
  toSideWinners,
  withdrawUserIds,
  NO_WINNER,
} from './endGamePlan';

const ME = 'user-me';
const MATE = 'user-mate';
const THIRD = 'user-third';

function player(
  overrides: Partial<BundlePlayer> & { userId: string },
): BundlePlayer {
  return {
    name: overrides.userId,
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: null,
    teeGender: 'mens',
    acceptedAt: null,
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    ...overrides,
  };
}

function game(overrides: Partial<BundleGame> = {}): BundleGame {
  return {
    id: 'game-1',
    name: 'Torsdagsrunden',
    status: 'active',
    // Stableford støtter frafall — grunnlinja for de fleste testene under.
    gameMode: 'stableford',
    modeConfig: null,
    courseId: 'course-1',
    teeBoxId: 'tee-1',
    requirePeerApproval: false,
    scheduledTeeOffAt: null,
    holeSegment: 'full',
    sourceGameId: null,
    createdBy: ME,
    scoreVisibility: 'live',
    tournamentId: null,
    foursomesSide1TeeStarterUserId: null,
    foursomesSide2TeeStarterUserId: null,
    sideTournamentEnabled: false,
    sideLdCount: 0,
    sideCtpCount: 0,
    sideDisabledCategories: [],
    ...overrides,
  };
}

function bundle(
  players: BundlePlayer[],
  gameOverrides: Partial<BundleGame> = {},
): GameBundle {
  return {
    game: game(gameOverrides),
    players,
    courseName: 'Testbanen',
    teeBoxName: 'Gul',
    holes: [],
    fetchedAt: '2026-09-01T10:00:00.000Z',
  };
}

const SUBMITTED = '2026-09-01T09:00:00.000Z';
const APPROVED = '2026-09-01T09:30:00.000Z';

describe('needsPeerApproval', () => {
  it.each([
    ['levert og godkjent', SUBMITTED, APPROVED, false],
    ['levert, ikke godkjent', SUBMITTED, null, true],
    ['verken levert eller godkjent', null, null, false],
    // Uoppnåelig i dag (`reopenScorecard` nuller begge sammen), men fail-closed
    // for en fremtidig sti som bare nuller den ene halvdelen.
    ['godkjent uten levering', null, APPROVED, true],
  ] as [string, string | null, string | null, boolean][])(
    'svarer %s → %s',
    (_label, submittedAt, approvedAt, expected) => {
      expect(needsPeerApproval(submittedAt, approvedAt)).toBe(expected);
    },
  );
});

describe('sideSlots', () => {
  it('gir ingen slots når sideturneringen er av — også med tellere satt', () => {
    expect(
      sideSlots(game({ sideTournamentEnabled: false, sideLdCount: 2 })),
    ).toEqual([]);
  });

  it('teller LD først, så CTP, med hull-nummeret som position', () => {
    expect(
      sideSlots(
        game({ sideTournamentEnabled: true, sideLdCount: 2, sideCtpCount: 1 }),
      ),
    ).toEqual([
      { key: 'ld-1', category: 'longest_drive', position: 1 },
      { key: 'ld-2', category: 'longest_drive', position: 2 },
      { key: 'ctp-1', category: 'closest_to_pin', position: 1 },
    ]);
  });

  it('leser IKKE sideDisabledCategories — webbens avslutt-skjema gjør det ikke', () => {
    // Legacy fra #1139. Skjulte appen en slot nettsiden ber om, ville raden
    // stått ukåret uten at noen av flatene kunne fylle den.
    expect(
      sideSlots(
        game({
          sideTournamentEnabled: true,
          sideLdCount: 1,
          sideDisabledCategories: ['longest_drive'],
        }),
      ),
    ).toHaveLength(1);
  });
});

describe('buildFinishPlan', () => {
  it('holder trukne spillere utenfor alle tre listene', () => {
    const plan = buildFinishPlan(
      bundle([
        player({ userId: ME, submittedAt: SUBMITTED }),
        player({ userId: MATE, withdrawnAt: '2026-09-01T08:00:00.000Z' }),
      ]),
      ME,
    );
    expect(plan.active.map((p) => p.userId)).toEqual([ME]);
    expect(plan.missing).toEqual([]);
    expect(plan.unapproved).toEqual([]);
  });

  it('lister hvem som mangler levering, og hvem av dem appen kan trekke', () => {
    const plan = buildFinishPlan(
      bundle([
        player({ userId: ME }),
        player({ userId: MATE }),
        player({ userId: THIRD, submittedAt: SUBMITTED }),
      ]),
      ME,
    );
    // Arrangørens EGEN rad kan ikke trekkes: `guard_game_players_self_update`
    // (0147) svarer 42501 uansett hva appen prøver.
    expect(plan.missing).toEqual([
      { player: expect.objectContaining({ userId: ME }), withdrawable: false },
      { player: expect.objectContaining({ userId: MATE }), withdrawable: true },
    ]);
  });

  it('merker ingen som trekkbar i et format uten frafall', () => {
    const plan = buildFinishPlan(
      bundle([player({ userId: MATE })], { gameMode: 'texas_scramble' }),
      ME,
    );
    expect(plan.missing.map((entry) => entry.withdrawable)).toEqual([false]);
  });

  it('lister manglende godkjenning kun når spillet krever den', () => {
    const players = [
      player({ userId: ME, submittedAt: SUBMITTED, approvedAt: APPROVED }),
      player({ userId: MATE, submittedAt: SUBMITTED }),
    ];
    expect(buildFinishPlan(bundle(players), ME).unapproved).toEqual([]);
    expect(
      buildFinishPlan(
        bundle(players, { requirePeerApproval: true }),
        ME,
      ).unapproved.map((p) => p.userId),
    ).toEqual([MATE]);
  });
});

describe('canFinish', () => {
  const none = new Set<string>();

  it('er klar når alle har levert og det ikke er noe å kåre', () => {
    const plan = buildFinishPlan(
      bundle([player({ userId: ME, submittedAt: SUBMITTED })]),
      ME,
    );
    expect(canFinish(plan, none, {})).toBe(true);
  });

  it('krever en kvittering per manglende levering', () => {
    const plan = buildFinishPlan(
      bundle([player({ userId: ME }), player({ userId: MATE })]),
      ME,
    );
    expect(canFinish(plan, new Set([ME]), {})).toBe(false);
    expect(canFinish(plan, new Set([ME, MATE]), {})).toBe(true);
  });

  it('lar ALDRI manglende godkjenning krysses bort', () => {
    // Kjernen i gaten: «avslutt likevel» hopper over en manglende LEVERING,
    // aldri over en manglende GODKJENNING. Appen har ingen overstyring.
    const plan = buildFinishPlan(
      bundle([player({ userId: MATE, submittedAt: SUBMITTED })], {
        requirePeerApproval: true,
      }),
      ME,
    );
    expect(canFinish(plan, new Set([ME, MATE, THIRD]), {})).toBe(false);
  });

  it('krever et eksplisitt valg i hver slot — ingen implisitt null', () => {
    const plan = buildFinishPlan(
      bundle([player({ userId: ME, submittedAt: SUBMITTED })], {
        sideTournamentEnabled: true,
        sideLdCount: 1,
        sideCtpCount: 1,
      }),
      ME,
    );
    expect(canFinish(plan, none, {})).toBe(false);
    expect(canFinish(plan, none, { 'ld-1': ME })).toBe(false);
    expect(canFinish(plan, none, { 'ld-1': ME, 'ctp-1': NO_WINNER })).toBe(true);
  });
});

describe('withdrawUserIds', () => {
  it('sender kun de avkryssede radene appen HAR lov til å trekke', () => {
    const plan = buildFinishPlan(
      bundle([player({ userId: ME }), player({ userId: MATE })]),
      ME,
    );
    // Begge er kvittert ut, men egen rad går videre som `allowMissing` — ikke
    // som et frafall Postgres uansett ville nektet.
    expect(withdrawUserIds(plan, new Set([ME, MATE]))).toEqual([MATE]);
    expect(withdrawUserIds(plan, new Set([ME]))).toEqual([]);
  });
});

describe('toSideWinners', () => {
  const slots = sideSlots(
    game({ sideTournamentEnabled: true, sideLdCount: 2, sideCtpCount: 1 }),
  );

  it('skriver «Ingen kvalifiserte» som en ekte null, og lar samme spiller ta to slots', () => {
    expect(
      toSideWinners(slots, {
        'ld-1': MATE,
        'ld-2': MATE,
        'ctp-1': NO_WINNER,
      }),
    ).toEqual([
      { category: 'longest_drive', position: 1, winner_user_id: MATE },
      { category: 'longest_drive', position: 2, winner_user_id: MATE },
      { category: 'closest_to_pin', position: 1, winner_user_id: null },
    ]);
  });

  it('gir ingen rad for en slot uten valg', () => {
    // Knappen er sperret før det kan skje (`canFinish`); her låses at et
    // manglende valg ikke stille blir til en null-vinner.
    expect(toSideWinners(slots, { 'ld-1': MATE })).toEqual([
      { category: 'longest_drive', position: 1, winner_user_id: MATE },
    ]);
  });
});

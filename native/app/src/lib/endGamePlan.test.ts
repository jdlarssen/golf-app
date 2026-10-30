// native/app/src/lib/endGamePlan.test.ts
// Native N6c (#1856): reglene avslutt-skjermen tegner etter.
//
// Type A — ren logikk, ingen render, ingen nett. Skjermen har én render-test
// (`screens/EndGame.test.tsx`) som beviser koblingen; tallene og grenene her
// gjentas ikke der.
import type { EndRoundFailure } from '../data/endGame';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import {
  activeChoices,
  buildFinishPlan,
  canFinish,
  confirmSummary,
  deliveryCounts,
  finishBlockers,
  returnsToList,
  sideSlots,
  toSideWinners,
  winnerCandidates,
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
    withdrawnByUserId: null,
    submittedByUserId: null,
    isGuest: false,
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
    leagueRoundId: null,
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

// `needsPeerApproval` er testet i `lib/games/finishGate.test.ts` (#2222).

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

describe('winnerCandidates (#2284)', () => {
  it('tar ikke med en spiller som er huket av for frafall', () => {
    // Frafallet skrives før kåringen, og databasen (0193) nekter da vinneren.
    // Da ville «Ingenting ble lagret» vært feil, for frafallet står.
    const plan = buildFinishPlan(
      bundle([
        player({ userId: ME, submittedAt: SUBMITTED }),
        player({ userId: MATE }),
        player({ userId: THIRD }),
      ]),
      ME,
    );
    const ids = (acknowledged: Set<string>) =>
      winnerCandidates(plan, acknowledged).map((p) => p.userId);
    expect(ids(new Set())).toEqual([ME, MATE, THIRD]);
    expect(ids(new Set([MATE]))).toEqual([ME, THIRD]);
  });

  it('beholder en kvittert spiller som ikke trekkes', () => {
    // Egen rad og formater uten frafall er kvittert, ikke trukket — de er
    // fortsatt i runden og kan kåres.
    const own = buildFinishPlan(bundle([player({ userId: ME })]), ME);
    expect(winnerCandidates(own, new Set([ME])).map((p) => p.userId)).toEqual([ME]);

    const noWd = buildFinishPlan(
      bundle([player({ userId: ME }), player({ userId: MATE })], {
        gameMode: 'texas_scramble',
      }),
      ME,
    );
    expect(
      winnerCandidates(noWd, new Set([MATE])).map((p) => p.userId),
    ).toEqual([ME, MATE]);
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

describe('activeChoices (#2284)', () => {
  const active = [player({ userId: ME }), player({ userId: MATE })];

  it('beholder valg som peker på en aktiv spiller, og «Ingen kvalifiserte»', () => {
    const choices = { 'ld-1': MATE, 'ctp-1': NO_WINNER };
    expect(activeChoices(choices, active)).toEqual(choices);
  });

  it('dropper et valg som peker på en spiller som ikke lenger er aktiv', () => {
    // Vinneren trakk seg: etter refresh er hen borte fra velgeren, og et valg
    // som ble stående ville vært usynlig og blitt sendt på nytt ved neste trykk.
    expect(
      activeChoices({ 'ld-1': THIRD, 'ld-2': MATE, 'ctp-1': NO_WINNER }, active),
    ).toEqual({ 'ld-2': MATE, 'ctp-1': NO_WINNER });
  });

  it('gir samme objekt tilbake når ingenting endres', () => {
    // Skjermen regner den ut på hver render; ingen grunn til et nytt objekt
    // når ingenting er droppet.
    const choices = { 'ld-1': ME };
    expect(activeChoices(choices, active)).toBe(choices);
  });
});

// -----------------------------------------------------------------------------
// #2578: fremdriftskortet, «Åpner når …», bekreft-siden og avslagene
// -----------------------------------------------------------------------------

const FOURTH = 'user-fourth';

describe('deliveryCounts', () => {
  it('teller levert, godkjent, venter og mangler — trukne teller ikke', () => {
    const plan = buildFinishPlan(
      bundle(
        [
          player({ userId: ME, submittedAt: SUBMITTED, approvedAt: APPROVED }),
          player({ userId: MATE, submittedAt: SUBMITTED }),
          player({ userId: THIRD }),
          player({ userId: FOURTH, withdrawnAt: SUBMITTED }),
        ],
        { requirePeerApproval: true },
      ),
      ME,
    );
    expect(deliveryCounts(plan)).toEqual({
      total: 3,
      delivered: 2,
      approved: 1,
      waiting: 1,
      missing: 1,
    });
  });

  it('har ingen som venter når runden ikke krever godkjenning', () => {
    const plan = buildFinishPlan(
      bundle([
        player({ userId: ME, submittedAt: SUBMITTED }),
        player({ userId: MATE, submittedAt: SUBMITTED }),
        player({ userId: THIRD }),
      ]),
      ME,
    );
    expect(deliveryCounts(plan)).toEqual({
      total: 3,
      delivered: 2,
      approved: 2,
      waiting: 0,
      missing: 1,
    });
  });
});

describe('finishBlockers', () => {
  const sideOn = { sideTournamentEnabled: true, sideLdCount: 1, sideCtpCount: 1 };
  const waiting = buildFinishPlan(
    bundle(
      [
        player({ userId: ME, submittedAt: SUBMITTED, approvedAt: APPROVED }),
        player({ userId: MATE, submittedAt: SUBMITTED }),
        player({ userId: THIRD }),
        player({ userId: FOURTH }),
      ],
      { requirePeerApproval: true, ...sideOn },
    ),
    ME,
  );
  const clear = buildFinishPlan(
    bundle([player({ userId: ME, submittedAt: SUBMITTED })]),
    ME,
  );

  it('navngir hvem som venter, hvem som ikke er huket av, og om vinnerne mangler', () => {
    const blockers = finishBlockers(waiting, new Set([FOURTH]), { 'ld-1': ME });
    expect(blockers.unapproved.map((p) => p.userId)).toEqual([MATE]);
    expect(blockers.unacknowledged.map((p) => p.userId)).toEqual([THIRD]);
    expect(blockers.winnersOpen).toBe(true);
  });

  it('er tom når alt er gjort', () => {
    expect(finishBlockers(clear, new Set(), {})).toEqual({
      unapproved: [],
      unacknowledged: [],
      winnersOpen: false,
    });
  });
});

describe('confirmSummary', () => {
  const sideOn = { sideTournamentEnabled: true, sideLdCount: 1, sideCtpCount: 1 };

  it('regner ut hvem som trekkes, hvem som går uten kort og vinner per slot', () => {
    // MATE kan trekkes; arrangørens egen rad kan ikke, så den går uten kort.
    const plan = buildFinishPlan(
      bundle(
        [
          player({ userId: ME }),
          player({ userId: MATE }),
          player({ userId: THIRD, submittedAt: SUBMITTED }),
          player({ userId: FOURTH, submittedAt: SUBMITTED }),
        ],
        sideOn,
      ),
      ME,
    );
    const summary = confirmSummary(plan, new Set([ME, MATE]), {
      'ld-1': THIRD,
      'ctp-1': NO_WINNER,
    });
    expect(summary.withdrawn.map((p) => p.userId)).toEqual([MATE]);
    expect(summary.noCard.map((p) => p.userId)).toEqual([ME]);
    // Beslutning 6: resultatet er de aktive minus dem som trekkes.
    expect(summary.resultCount).toBe(3);
    expect(summary.deliveredCount).toBe(2);
    expect(summary.winners.map((w) => [w.slot.key, w.winner?.userId ?? null])).toEqual([
      ['ld-1', THIRD],
      ['ctp-1', null],
    ]);
  });

  it('har ingen trukne og ingen uten kort når alle har levert', () => {
    const plan = buildFinishPlan(
      bundle([
        player({ userId: ME, submittedAt: SUBMITTED }),
        player({ userId: MATE, submittedAt: SUBMITTED }),
      ]),
      ME,
    );
    expect(confirmSummary(plan, new Set(), {})).toEqual({
      resultCount: 2,
      deliveredCount: 2,
      withdrawn: [],
      noCard: [],
      winners: [],
    });
  });
});

describe('returnsToList', () => {
  // Kartet, ikke en liste, er porten: en ny kode i `EndRoundFailure` uten rad
  // her gir rød `tsc`, så noen må ta stilling til om den sender tilbake.
  const EXPECTED = {
    'no-session': false,
    offline: false,
    'not-found': false,
    'cup-game': false,
    'not-active': false,
    'no-players': false,
    'not-all-submitted': false,
    'not-all-approved': false,
    'withdrawal-unsupported': false,
    'withdraw-after-submit': true,
    'withdraw-after-submit-partial': true,
    'db-withdraw': false,
    'db-winners': false,
    'winner-withdrawn': true,
    'rls-denied': false,
    'no-rows': false,
    db: false,
  } satisfies Record<EndRoundFailure, boolean>;

  it.each(Object.entries(EXPECTED) as [EndRoundFailure, boolean][])(
    '«%s» → %s',
    (reason, expected) => {
      expect(returnsToList(reason)).toBe(expected);
    },
  );
});

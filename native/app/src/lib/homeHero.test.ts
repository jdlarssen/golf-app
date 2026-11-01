// #2254: heltekortet på Hjem — hvilken runde som blir helt, og hva kortet sier.
//
// Reglene er lånt, ikke skrevet på nytt: neste hull og tilstanden kommer fra
// samme hjelpere som spillets side (`GameHome.tsx`), og plassen fra tavla
// (`computeLiveBoard` + `viewerStanding`). Testene låser at heltekortet faktisk
// spør dem, med tall som kan regnes for hånd: par 4 på alle hull og
// banehandicap 0, så 4 slag gir 2 poeng, 3 slag gir 3 og 5 slag gir 1.
import {
  holeScores,
  homeBundle,
  homeCard,
  homePlayer,
} from '../test/homeFixtures';
import { buildHeroModel, pickHeroCard } from './homeHero';

const ME = 'me';

describe('pickHeroCard', () => {
  it('gjør runden med nyest tee-off, eller opprettet-tid, til helt og lar resten stå i rekkefølge', () => {
    const early = homeCard({ gameId: 'early', createdAt: '2026-09-01T08:00:00.000Z' });
    const teed = homeCard({
      gameId: 'teed',
      createdAt: '2026-08-01T08:00:00.000Z',
      scheduledTeeOffAt: '2026-09-29T08:00:00.000Z',
    });
    const created = homeCard({ gameId: 'created', createdAt: '2026-09-20T08:00:00.000Z' });

    const { hero, rest } = pickHeroCard([early, teed, created]);

    expect(hero?.gameId).toBe('teed');
    expect(rest.map((c) => c.gameId)).toEqual(['early', 'created']);
  });

  it('lar den første i lista vinne ved likt tidspunkt', () => {
    const a = homeCard({ gameId: 'a', scheduledTeeOffAt: '2026-09-29T08:00:00.000Z' });
    const b = homeCard({ gameId: 'b', scheduledTeeOffAt: '2026-09-29T08:00:00.000Z' });
    expect(pickHeroCard([a, b]).hero?.gameId).toBe('a');
    expect(pickHeroCard([b, a]).hero?.gameId).toBe('b');
  });

  it('gir ingen helt uten aktive runder', () => {
    expect(pickHeroCard([])).toEqual({ hero: null, rest: [] });
  });
});

describe('buildHeroModel', () => {
  const trio = [
    homePlayer({ userId: ME }),
    homePlayer({ userId: 'leader' }),
    homePlayer({ userId: 'third' }),
  ];
  const liveScores = [
    ...holeScores('g-live', ME, 7, 4),
    ...holeScores('g-live', 'leader', 7, 3),
    ...holeScores('g-live', 'third', 7, 5),
  ];

  it('midt i en live stableford-runde: neste hull, spilte hull og plassen fra tavla', () => {
    const model = buildHeroModel({
      bundle: homeBundle({ players: trio }),
      scores: liveScores,
      userId: ME,
    });

    expect(model).toMatchObject({
      gate: null,
      state: 'continue',
      holeCount: 18,
      played: 7,
      nextHole: 8,
      action: { kind: 'hole', holeNumber: 8 },
      unit: 'points',
      approvals: 0,
    });
    expect(model.standing).toMatchObject({
      rank: 2,
      tied: false,
      fieldSize: 3,
      total: 14,
      holesPlayed: 7,
      gap: 7,
    });
  });

  it('gir lederen plass 1 uten avstand', () => {
    const model = buildHeroModel({
      bundle: homeBundle({ players: trio }),
      scores: liveScores,
      userId: 'leader',
    });
    expect(model.standing).toMatchObject({ rank: 1, gap: null, total: 21 });
  });

  it('viser ingen plass før spilleren har spilt et hull', () => {
    const model = buildHeroModel({
      bundle: homeBundle({ players: trio }),
      scores: holeScores('g-live', 'leader', 3, 4),
      userId: ME,
    });
    expect(model).toMatchObject({ played: 0, nextHole: 1, standing: null, unit: null });
    expect(model.action).toEqual({ kind: 'hole', holeNumber: 1 });
  });

  it('peker på «Lever scorekort» når alle hull er tastet', () => {
    const model = buildHeroModel({
      bundle: homeBundle({ players: trio }),
      scores: holeScores('g-live', ME, 18, 4),
      userId: ME,
    });
    expect(model).toMatchObject({ played: 18, state: 'continue', action: { kind: 'submit' } });
  });

  it('levert, til godkjenning og trukket gir tilstanden og ingen knapp', () => {
    const submitted = buildHeroModel({
      bundle: homeBundle({
        players: [homePlayer({ userId: ME, submittedAt: '2026-09-29T12:00:00.000Z' })],
      }),
      scores: holeScores('g-live', ME, 18, 4),
      userId: ME,
    });
    expect(submitted).toMatchObject({ state: 'submitted', action: null });

    const pending = buildHeroModel({
      bundle: homeBundle({
        game: { requirePeerApproval: true },
        players: [homePlayer({ userId: ME, submittedAt: '2026-09-29T12:00:00.000Z' })],
      }),
      scores: holeScores('g-live', ME, 18, 4),
      userId: ME,
    });
    expect(pending).toMatchObject({ state: 'pending_approval', action: null });

    const withdrawn = buildHeroModel({
      bundle: homeBundle({
        players: [
          homePlayer({ userId: ME, withdrawnAt: '2026-09-29T10:00:00.000Z' }),
          homePlayer({ userId: 'leader' }),
        ],
      }),
      scores: [...holeScores('g-live', ME, 7, 4), ...holeScores('g-live', 'leader', 7, 3)],
      userId: ME,
    });
    expect(withdrawn).toMatchObject({ state: 'withdrawn', action: null, standing: null });
  });

  // #2751: laget deler hull 7–18, men hver spiller leverer sitt eget kort.
  it('Patsome: makkerens levering stempler ikke mitt kort, og jeg kan levere fra kortet', () => {
    const players = [
      homePlayer({ userId: 'a-captain', teamNumber: 1, submittedAt: '2026-09-29T12:00:00.000Z' }),
      homePlayer({ userId: ME, teamNumber: 1 }),
    ];
    const scores = [...holeScores('g-live', ME, 6, 4), ...holeScores('g-live', 'a-captain', 18, 4).slice(6)];

    const model = buildHeroModel({
      bundle: homeBundle({ game: { gameMode: 'patsome' }, players }),
      scores,
      userId: ME,
    });

    expect(model).toMatchObject({ gate: null, played: 18, state: 'continue', action: { kind: 'submit' } });
  });

  it('Patsome: fortsett-knappen peker på første tomme hull over segmentgrensa', () => {
    const players = [homePlayer({ userId: 'a-captain', teamNumber: 1 }), homePlayer({ userId: ME, teamNumber: 1 })];
    const model = buildHeroModel({
      bundle: homeBundle({ game: { gameMode: 'patsome' }, players }),
      scores: [...holeScores('g-live', ME, 6, 4), ...holeScores('g-live', 'a-captain', 7, 4).slice(6)],
      userId: ME,
    });
    expect(model).toMatchObject({ played: 7, nextHole: 8, action: { kind: 'hole', holeNumber: 8 } });
  });

  it('en avledet kamp føres ikke: «åpne runden» uten stengt format', () => {
    const model = buildHeroModel({
      bundle: homeBundle({ game: { gameMode: 'singles_matchplay', sourceGameId: 'host-game' }, players: trio }),
      scores: [],
      userId: ME,
    });
    expect(model.gate).toBeNull();
    expect(model.action).toEqual({ kind: 'open' });
  });

  it('et reveal-spill viser ikke plass eller poeng', () => {
    const model = buildHeroModel({
      bundle: homeBundle({ game: { scoreVisibility: 'reveal' }, players: trio }),
      scores: liveScores,
      userId: ME,
    });
    expect(model).toMatchObject({ played: 7, nextHole: 8, standing: null, unit: null });
  });

  it('i et lagformat teller kapteinens rader, og plassen står ikke', () => {
    // «a-captain» er leksikografisk minst på lag 1 og eier lagets rader.
    const players = [
      homePlayer({ userId: ME, teamNumber: 1 }),
      homePlayer({ userId: 'a-captain', teamNumber: 1 }),
      homePlayer({ userId: 'b-other', teamNumber: 2 }),
      homePlayer({ userId: 'c-other', teamNumber: 2 }),
    ];
    const model = buildHeroModel({
      bundle: homeBundle({ game: { gameMode: 'texas_scramble' }, players }),
      scores: [...holeScores('g-live', 'a-captain', 5, 4), ...holeScores('g-live', 'b-other', 9, 4)],
      userId: ME,
    });
    expect(model).toMatchObject({
      gate: null,
      played: 5,
      nextHole: 6,
      action: { kind: 'hole', holeNumber: 6 },
      standing: null,
    });
  });

  it('i et lagformat regner levert på lagets stempel, som spillets side', () => {
    const players = [
      homePlayer({ userId: ME, teamNumber: 1 }),
      homePlayer({ userId: 'a-captain', teamNumber: 1, submittedAt: '2026-09-29T12:00:00.000Z' }),
    ];
    const model = buildHeroModel({
      bundle: homeBundle({ game: { gameMode: 'texas_scramble' }, players }),
      scores: holeScores('g-live', 'a-captain', 18, 4),
      userId: ME,
    });
    expect(model).toMatchObject({ state: 'submitted', action: null });
  });

  it('teller kortene som venter på godkjenningen min', () => {
    const model = buildHeroModel({
      bundle: homeBundle({
        game: { requirePeerApproval: true },
        players: [
          homePlayer({ userId: ME }),
          homePlayer({ userId: 'mate', submittedAt: '2026-09-29T12:00:00.000Z' }),
        ],
      }),
      scores: holeScores('g-live', ME, 7, 4),
      userId: ME,
    });
    expect(model.approvals).toBe(1);
  });

  it('åpner runden når jeg ikke står i rosteret, eller bundelen sier at runden ikke pågår', () => {
    const notMine = buildHeroModel({
      bundle: homeBundle({ players: [homePlayer({ userId: 'someone' })] }),
      scores: [],
      userId: ME,
    });
    expect(notMine).toMatchObject({ action: { kind: 'open' }, standing: null, approvals: 0 });

    const finished = buildHeroModel({
      bundle: homeBundle({ game: { status: 'finished' }, players: trio }),
      scores: liveScores,
      userId: ME,
    });
    expect(finished).toMatchObject({ action: { kind: 'open' }, standing: null });
  });
});

// #2712 (eieren 31.10): en ligaflight med én spiller har ingen plass på Hjem.
describe('buildHeroModel — ligaflight alene (#2712)', () => {
  const solo = [homePlayer({ userId: ME })];
  const scores = holeScores('g-live', ME, 7, 4);
  it('ligaflight med én spiller → leagueSolo', () => {
    const model = buildHeroModel({
      bundle: homeBundle({ players: solo, game: { leagueRoundId: 'runde-1', requirePeerApproval: true } }),
      scores,
      userId: ME,
    });
    expect(model.leagueSolo).toBe(true);
  });
  it('ligaflight med flere spillere og vanlig spill alene → som før', () => {
    expect(
      buildHeroModel({
        bundle: homeBundle({
          players: [homePlayer({ userId: ME }), homePlayer({ userId: 'mate' })],
          game: { leagueRoundId: 'runde-1', requirePeerApproval: true },
        }),
        scores,
        userId: ME,
      }).leagueSolo,
    ).toBe(false);
    expect(buildHeroModel({ bundle: homeBundle({ players: solo }), scores, userId: ME }).leagueSolo).toBe(false);
  });
  it('vanlig liga alene (etter et frafall): ingen plass, men ingen markør å vente på', () => {
    const model = buildHeroModel({
      bundle: homeBundle({ players: solo, game: { leagueRoundId: 'runde-1', requirePeerApproval: false } }),
      scores,
      userId: ME,
    });
    expect(model.leagueSolo).toBe(true);
    expect(model.leagueMarker).toBe(false);
  });
  it('simulatorliga alene: markøren godkjenner', () => {
    expect(
      buildHeroModel({
        bundle: homeBundle({ players: solo, game: { leagueRoundId: 'runde-1', requirePeerApproval: true } }),
        scores,
        userId: ME,
      }).leagueMarker,
    ).toBe(true);
  });
});

// #2752: hele runden på en delt cup-dag. Testene bruker best ball på begge
// halvdeler fordi tallene er de samme; delt kort dekkes av `teamPlay.test.ts`.
describe('delt cup-dag', () => {
  const SIBLING = {
    gameId: 'back9',
    gameMode: 'best_ball' as const,
    holeSegment: 'back9' as const,
    mySubmittedAt: null,
    myTeamNumber: 1,
  };
  const me = homePlayer({ userId: ME, teamNumber: 1 });
  const front9 = (segmentSibling: typeof SIBLING | null = SIBLING) => ({
    ...homeBundle({ game: { id: 'front9', gameMode: 'best_ball', holeSegment: 'front9' }, players: [me] }),
    segmentSibling,
  });
  const back9 = (submittedAt: string | null = null) =>
    homeBundle({
      game: { id: 'back9', gameMode: 'best_ball', holeSegment: 'back9' },
      players: [homePlayer({ userId: ME, teamNumber: 1, submittedAt })],
    });
  const holes = (gameId: string, from: number, to: number) =>
    holeScores(gameId, ME, to - from + 1, 4).map((score, index) => ({
      ...score,
      holeNumber: from + index,
    }));

  describe('én halvdel for seg', () => {
    it('andre halvdel starter på hull 10 og teller ni hull', () => {
      const model = buildHeroModel({ bundle: back9(), scores: [], userId: ME });
      expect(model).toMatchObject({
        holeCount: 9,
        played: 0,
        nextHole: 10,
        action: { kind: 'hole', holeNumber: 10 },
      });
    });

    it('andre halvdel med alle hull ført: lever', () => {
      const model = buildHeroModel({ bundle: back9(), scores: holes('back9', 10, 18), userId: ME });
      expect(model).toMatchObject({ played: 9, action: { kind: 'submit' } });
    });

    it('første halvdel med alle hull ført: broen til hull 10, ikke «lever»', () => {
      const model = buildHeroModel({ bundle: front9(), scores: holes('front9', 1, 9), userId: ME });
      expect(model.action).toEqual({ kind: 'hole', holeNumber: 10, gameId: 'back9' });
    });

    it('første halvdel uten søsken: lever, som på nettet', () => {
      const model = buildHeroModel({ bundle: front9(null), scores: holes('front9', 1, 9), userId: ME });
      expect(model.action).toEqual({ kind: 'submit' });
    });
  });

  describe('hele runden på Hjem', () => {
    const fold = (front: number, backTo: number) =>
      buildHeroModel({
        bundle: front9(),
        scores: front > 0 ? holes('front9', 1, front) : [],
        userId: ME,
        sibling: { bundle: back9(), scores: backTo >= 10 ? holes('back9', 10, backTo) : [] },
      });
    const DELIVERED = '2026-11-01T12:00:00Z';
    const deliveredSibling = { ...SIBLING, mySubmittedAt: DELIVERED };
    const frontWith = (submittedAt: string | null) => ({
      ...homeBundle({
        game: { id: 'front9', gameMode: 'best_ball', holeSegment: 'front9' },
        players: [homePlayer({ userId: ME, teamNumber: 1, submittedAt })],
      }),
      segmentSibling: deliveredSibling,
    });

    it('midt i første halvdel: neste hull der, av 18', () => {
      expect(fold(3, 0)).toMatchObject({
        holeCount: 18,
        played: 3,
        nextHole: 4,
        action: { kind: 'hole', holeNumber: 4 },
      });
    });

    it('første halvdel ført: hull 10 i andre halvdel', () => {
      expect(fold(9, 0).action).toEqual({ kind: 'hole', holeNumber: 10, gameId: 'back9' });
    });

    it('midt i andre halvdel: neste hull der, ikke hull 10 på nytt', () => {
      expect(fold(9, 12)).toMatchObject({
        played: 12,
        nextHole: 13,
        action: { kind: 'hole', holeNumber: 13, gameId: 'back9' },
      });
    });

    it('alle 18 ført: leveringen i andre halvdel', () => {
      expect(fold(9, 18).action).toEqual({ kind: 'submit', gameId: 'back9' });
    });

    it('levert: én levering merket begge, så kortet har ingen knapp', () => {
      const model = buildHeroModel({
        bundle: frontWith(DELIVERED),
        scores: holes('front9', 1, 9),
        userId: ME,
        sibling: { bundle: back9(DELIVERED), scores: holes('back9', 10, 18) },
      });
      expect(model).toMatchObject({ state: 'submitted', action: null, played: 18 });
    });

    it('første halvdel sendt tilbake etter leveringen: den leverer selv igjen', () => {
      const model = buildHeroModel({
        bundle: frontWith(null),
        scores: holes('front9', 1, 9),
        userId: ME,
        sibling: { bundle: back9(DELIVERED), scores: holes('back9', 10, 18) },
      });
      expect(model).toMatchObject({ state: 'continue', action: { kind: 'submit' } });
    });
  });
});

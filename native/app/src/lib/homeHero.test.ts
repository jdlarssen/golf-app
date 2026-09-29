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

  it('et stengt spill gir «åpne runden» og hverken ring-tall eller plass', () => {
    for (const game of [
      { gameMode: 'patsome' },
      { holeSegment: 'front9' },
      { sourceGameId: 'host-game' },
    ]) {
      const model = buildHeroModel({
        bundle: homeBundle({ game, players: trio }),
        scores: liveScores,
        userId: ME,
      });
      expect(model.gate).not.toBeNull();
      expect(model.action).toEqual({ kind: 'open' });
      expect(model.standing).toBeNull();
    }
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

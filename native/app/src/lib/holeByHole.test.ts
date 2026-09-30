// #2255 PR 3a–3c: hvilke runder appen har «Hull for hull» for, og at modellen
// bygges fra bundelen og de lokale slagene med samme motor som tavla.
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { buildHoleByHole, holeByHoleKind, waitsForChoices, type HoleByHoleModel } from './holeByHole';

/** Solo-kortet, eller en feil hvis modellen er et annet format. */
function soloCard(model: HoleByHoleModel | null) {
  if (!model || (model.kind !== 'solo-stableford' && model.kind !== 'solo-strokeplay')) {
    throw new Error(`forventet solo, fikk ${model?.kind}`);
  }
  return model.card;
}

describe('holeByHoleKind', () => {
  it.each([
    ['stableford', { kind: 'stableford', team_size: 1, points_table: 'standard' }, 'solo-stableford'],
    ['modified_stableford', { kind: 'modified_stableford', team_size: 1 }, 'solo-stableford'],
    ['solo_strokeplay', { kind: 'solo_strokeplay' }, 'solo-strokeplay'],
    ['wolf', { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' }, 'wolf'],
    ['nines', { kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: 'net' }, 'nines'],
    ['round_robin', { kind: 'round_robin', team_size: 1, teams_count: 4, allowance_pct: 85 }, 'round-robin'],
    ['acey_deucey', { kind: 'acey_deucey', team_size: 1, acey_deucey_scoring: 'net' }, 'acey-deucey'],
    ['bingo_bango_bongo', { kind: 'bingo_bango_bongo', team_size: 1 }, 'bingo-bango-bongo'],
    // Webben har ingen egen visning for lag-stableford: tavla.
    ['stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }, null],
    // Matchplay og scramble har ingen «Hull for hull» på webben heller.
    ['singles_matchplay', { kind: 'singles_matchplay', team_size: 1, teams_count: 2 }, null],
    ['texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 25 }, null],
    // Webben har visningen, men appen har den ikke ennå: flisa står som «Tavla».
    ['best_ball', { kind: 'best_ball', team_size: 2 }, null],
    // Skins og Nassau bygges etter sine egne tegninger (#2317, #2327), ikke som en webkopi.
    ['skins', { kind: 'skins' }, null],
    ['nassau', { kind: 'nassau' }, null],
    // En config som peker på et annet format, og et ukjent format.
    ['stableford', { kind: 'solo_strokeplay' }, null],
    ['ukjent', {}, null],
  ])('%s %j → %s', (gameMode, modeConfig, expected) => {
    expect(holeByHoleKind({ gameMode, modeConfig })).toBe(expected);
  });
});

describe('buildHoleByHole', () => {
  const players = [
    homePlayer({ userId: 'ola', name: 'Ola Kompis', courseHandicap: 0 }),
    homePlayer({ userId: 'kari', name: 'Kari', courseHandicap: 0 }),
  ];

  it('solo stableford: stillingen og hullene fra samme motor som tavla, og undertittelen er formatet', () => {
    const bundle = homeBundle({
      game: { id: 'g1', status: 'finished', gameMode: 'stableford', modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' } },
      players,
    });
    // Par 4 overalt; Ola 4 slag (2 p) på hull 1–3, Kari 5 slag (1 p) på hull 1–2.
    const scores = [...holeScores('g1', 'ola', 3, 4), ...holeScores('g1', 'kari', 2, 5)];
    const model = buildHoleByHole(bundle, scores);
    expect(model?.kind).toBe('solo-stableford');
    expect(model?.subtitle).toBe('Stableford');
    expect(soloCard(model).standings.map((s) => [s.userId, s.total])).toEqual([
      ['ola', 6],
      ['kari', 2],
    ]);
    expect(soloCard(model).front.holes[0]!.rows.map((r) => r.value)).toEqual([2, 1]);
    expect(soloCard(model).back.holes).toHaveLength(9);
  });

  it('solo slagspill: undertittelen er «Slagspill · Netto»', () => {
    const bundle = homeBundle({
      game: { id: 'g2', status: 'finished', gameMode: 'solo_strokeplay', modeConfig: { kind: 'solo_strokeplay' } },
      players,
    });
    const model = buildHoleByHole(bundle, holeScores('g2', 'ola', 2, 4));
    expect(model?.kind).toBe('solo-strokeplay');
    expect(model?.subtitle).toBe('Slagspill · Netto');
    expect(soloCard(model).standings[0]!.userId).toBe('ola');
  });

  it('Wolf: kortene fra valgene og slagene, med ulvens side først og netto i undertittelen', () => {
    const wolfPlayers = ['a', 'b', 'c', 'd'].map((userId, i) =>
      homePlayer({ userId, name: userId.toUpperCase(), teamNumber: i + 1, courseHandicap: 0 }),
    );
    const bundle = homeBundle({
      game: {
        id: 'gw',
        status: 'finished',
        gameMode: 'wolf',
        modeConfig: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' },
      },
      players: wolfPlayers,
    });
    // Hull 1: A er ulv (plass 1) og tar B. A 4, B 5, C 5, D 6: ulvens side vinner.
    const scores = [
      ...holeScores('gw', 'a', 1, 4),
      ...holeScores('gw', 'b', 1, 5),
      ...holeScores('gw', 'c', 1, 5),
      ...holeScores('gw', 'd', 1, 6),
    ];
    const model = buildHoleByHole(bundle, scores, {
      wolfChoices: [{ holeNumber: 1, wolfUserId: 'a', choice: 'partner', partnerUserId: 'b' }],
    });
    expect(model?.kind).toBe('wolf');
    if (model?.kind !== 'wolf') return;
    expect(model.subtitle).toBe('Wolf · Netto');
    const hole1 = model.wolf.holes[0]!;
    expect([hole1.wolfUserId, hole1.choiceKey, hole1.partnerUserId, hole1.outcomeKey]).toEqual([
      'a',
      'choicePartner',
      'b',
      'outcomeWolfVant',
    ]);
    expect(hole1.rows.slice(0, 2).map((r) => r.side)).toEqual(['wolf', 'wolf']);
  });

  it('Nines: kortene fra slagene, lik score deler plassen og stillingen avgjør, brutto ved siden av netto', () => {
    // Spillerne i motsatt rekkefølge av stillingen, så motorens rekkefølge
    // ikke er den ferdige.
    const ninesPlayers = [
      homePlayer({ userId: 'c', name: 'C', courseHandicap: 0 }),
      homePlayer({ userId: 'b', name: 'B', courseHandicap: 18 }),
      homePlayer({ userId: 'a', name: 'A', courseHandicap: 0 }),
    ];
    const bundle = homeBundle({
      game: {
        id: 'gn',
        status: 'finished',
        gameMode: 'nines',
        modeConfig: { kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: 'net' },
      },
      players: ninesPlayers,
    });
    // Hull 1: A 4, B 5 med et slag (netto 4), C 5. A og B delt lavest: 4 poeng hver, C 1.
    const scores = [
      ...holeScores('gn', 'a', 1, 4),
      ...holeScores('gn', 'b', 1, 5),
      ...holeScores('gn', 'c', 1, 5),
    ];
    const model = buildHoleByHole(bundle, scores);
    expect(model?.kind).toBe('nines');
    if (model?.kind !== 'nines') return;
    expect(model.subtitle).toBe('Nines · Netto');
    const hole1 = model.nines.holes[0]!;
    expect(hole1.pot).toBe(9);
    expect(hole1.rows.map((r) => [r.userId, r.placement, r.pointsShown, r.grossShown, r.effectiveScore])).toEqual([
      ['a', 1, 4, null, 4],
      ['b', 1, 4, 5, 4],
      ['c', 3, 1, null, 5],
    ]);
    // Hull 2 er ikke spilt: ingen pott.
    expect(model.nines.holes[1]!.pot).toBeNull();
  });

  it('Round Robin: segmentene med konstellasjonen, sidene i rotasjonen, vinneren og brutto ved siden av', () => {
    // Spillerne i motsatt rekkefølge av rotasjonsplassene, så motorens
    // rekkefølge inn ikke er den ferdige.
    const rrPlayers = [
      homePlayer({ userId: 'd', name: 'D', teamNumber: 4 }),
      homePlayer({ userId: 'c', name: 'C', teamNumber: 3, courseHandicap: 18 }),
      homePlayer({ userId: 'b', name: 'B', teamNumber: 2 }),
      homePlayer({ userId: 'a', name: 'A', teamNumber: 1 }),
    ];
    const bundle = homeBundle({
      game: {
        id: 'gr',
        status: 'finished',
        gameMode: 'round_robin',
        modeConfig: { kind: 'round_robin', team_size: 1, teams_count: 4, allowance_pct: 100 },
      },
      players: rrPlayers,
    });
    // Hull 1 (A+B mot C+D): A 5, B 5, C 5 med et slag (netto 4), D 6. C+D vant.
    // Hull 7 (A+C mot B+D): A 4, C 5 (netto 4), B 4, D 5. Delt.
    const scores = [
      ...holeScores('gr', 'a', 1, 5),
      ...holeScores('gr', 'b', 1, 5),
      ...holeScores('gr', 'c', 1, 5),
      ...holeScores('gr', 'd', 1, 6),
      ...holeScores('gr', 'a', 7, 4, 7),
      ...holeScores('gr', 'b', 7, 4, 7),
      ...holeScores('gr', 'c', 7, 5, 7),
      ...holeScores('gr', 'd', 7, 5, 7),
    ];
    const model = buildHoleByHole(bundle, scores);
    expect(model?.kind).toBe('round-robin');
    if (model?.kind !== 'round-robin') return;
    expect(model.subtitle).toBe('Round Robin');
    const { segments } = model.roundRobin;
    expect(segments.map((s) => [s.segment, s.side1PlayerIds, s.side2PlayerIds, s.holes.length])).toEqual([
      [1, ['a', 'b'], ['c', 'd'], 6],
      [2, ['a', 'c'], ['b', 'd'], 6],
      [3, ['a', 'd'], ['b', 'c'], 6],
    ]);
    const hole1 = segments[0]!.holes[0]!;
    expect(hole1.outcomeKey).toBeNull();
    expect(hole1.sides.map((s) => s.isWinner)).toEqual([false, true]);
    expect(
      hole1.sides.flatMap((s) => s.rows.map((r) => [r.userId, r.isContributor, r.grossShown, r.net])),
    ).toEqual([
      ['a', true, null, 5],
      ['b', true, null, 5],
      ['c', true, 5, 4],
      ['d', false, null, 6],
    ]);
    // Hull 2 er ikke spilt, hull 7 er delt.
    expect(segments[0]!.holes[1]!.outcomeKey).toBe('outcomeChipVenter');
    expect(segments[1]!.holes[0]!.outcomeKey).toBe('outcomeChipTied');
  });

  it('Acey Deucey: lavest først med ace og deuce, lik score etter stillingen, poeng med fortegn og brutto ved siden av', () => {
    // Spillerne i motsatt rekkefølge av stillingen, så motorens rekkefølge
    // inn ikke er den ferdige.
    const adPlayers = [
      homePlayer({ userId: 'd', name: 'D' }),
      homePlayer({ userId: 'c', name: 'C' }),
      homePlayer({ userId: 'b', name: 'B', courseHandicap: 18 }),
      homePlayer({ userId: 'a', name: 'A' }),
    ];
    const bundle = homeBundle({
      game: {
        id: 'ga',
        status: 'finished',
        gameMode: 'acey_deucey',
        modeConfig: { kind: 'acey_deucey', team_size: 1, acey_deucey_scoring: 'net' },
      },
      players: adPlayers,
    });
    // Hull 1: A 3 (ace), B 5 med et slag (netto 4), C 4, D 6 (deuce). B og C
    // er like på hullet og i stillingen (0 poeng hver): den faste rekkefølgen
    // gir B før C, motsatt av motorens rekkefølge inn.
    const scores = [
      ...holeScores('ga', 'a', 1, 3),
      ...holeScores('ga', 'b', 1, 5),
      ...holeScores('ga', 'c', 1, 4),
      ...holeScores('ga', 'd', 1, 6),
    ];
    const model = buildHoleByHole(bundle, scores);
    expect(model?.kind).toBe('acey-deucey');
    if (model?.kind !== 'acey-deucey') return;
    expect(model.subtitle).toBe('Acey Deucey · Netto');
    const [hole1, hole2] = model.aceyDeucey.holes;
    expect(hole1!.scored).toBe(true);
    expect(hole1!.rows.map((r) => [r.userId, r.tone, r.pointsText, r.grossShown, r.effectiveScore])).toEqual([
      ['a', 'ace', '+3', null, 3],
      ['b', 'neutral', '0', 5, 4],
      ['c', 'neutral', '0', null, 4],
      ['d', 'deuce', '\u22123', null, 6],
    ]);
    // Hull 2 er ikke spilt: ingen poeng og ingen tone, radene etter stillingen.
    expect(hole2!.scored).toBe(false);
    expect(hole2!.rows.map((r) => [r.userId, r.tone, r.pointsText])).toEqual([
      ['a', 'neutral', null],
      ['b', 'neutral', null],
      ['c', 'neutral', null],
      ['d', 'neutral', null],
    ]);
  });

  it('Bingo Bango Bongo: kortene fra valgene, ikke fra slagene; feieren, «Feiet!» og hull som venter', () => {
    const bundle = homeBundle({
      game: {
        id: 'gb',
        status: 'finished',
        gameMode: 'bingo_bango_bongo',
        modeConfig: { kind: 'bingo_bango_bongo', team_size: 1 },
      },
      players: ['a', 'b', 'c'].map((userId) => homePlayer({ userId, name: userId.toUpperCase() })),
    });
    // Slagene teller ikke: B har det beste hullet, men A tar prestasjonene.
    const scores = [...holeScores('gb', 'a', 1, 6), ...holeScores('gb', 'b', 1, 3)];
    const extras = {
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'a', bangoUserId: 'c', bongoUserId: 'a' },
        { holeNumber: 2, bingoUserId: 'b', bangoUserId: 'b', bongoUserId: 'b' },
        { holeNumber: 3, bingoUserId: 'c', bangoUserId: null, bongoUserId: null },
      ],
    };
    const model = buildHoleByHole(bundle, scores, extras);
    expect(model?.kind).toBe('bingo-bango-bongo');
    if (model?.kind !== 'bingo-bango-bongo') return;
    expect(model.subtitle).toBe('Bingo Bango Bongo');
    const [hole1, hole2, hole3, hole4] = model.bingoBangoBongo.holes;
    expect(model.bingoBangoBongo.holes).toHaveLength(18);
    expect(hole1!.rows.map((r) => [r.category, r.hintKey, r.userId, r.isSweeper])).toEqual([
      ['bingo', 'firstOnGreen', 'a', true],
      ['bango', 'nearestPin', 'c', false],
      ['bongo', 'firstInHole', 'a', true],
    ]);
    expect([hole1!.sweptAll, hole1!.pending]).toEqual([false, false]);
    expect([hole2!.sweptAll, hole2!.pending]).toEqual([true, false]);
    expect(hole3!.rows.map((r) => r.userId)).toEqual(['c', null, null]);
    // Hull 4 har ingen rad: det venter, uten prestasjoner.
    expect([hole4!.pending, hole4!.rows]).toEqual([true, []]);
  });

  it('Bingo Bango Bongo uten valgene: motoren kan ikke regne, og modellen er null', () => {
    const bundle = homeBundle({
      game: { id: 'gb', status: 'finished', gameMode: 'bingo_bango_bongo', modeConfig: { kind: 'bingo_bango_bongo', team_size: 1 } },
      players: [homePlayer({ userId: 'a' })],
    });
    expect(buildHoleByHole(bundle, [])).toBeNull();
    expect(buildHoleByHole(bundle, [], { bingoBangoBongoHoles: [] })?.kind).toBe('bingo-bango-bongo');
  });

  it('et format uten appens «Hull for hull» gir null', () => {
    const bundle = homeBundle({
      game: { id: 'g3', gameMode: 'skins', modeConfig: { kind: 'skins' } },
      players,
    });
    expect(buildHoleByHole(bundle, [])).toBeNull();
  });
});

describe('waitsForChoices', () => {
  it('Wolf venter til valgene er hentet; en tom liste er et svar', () => {
    expect(waitsForChoices({ gameMode: 'wolf', modeConfig: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' } }, {})).toBe(true);
    expect(waitsForChoices({ gameMode: 'wolf', modeConfig: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' } }, { wolfChoices: [] })).toBe(false);
    expect(waitsForChoices({ gameMode: 'stableford', modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' } }, {})).toBe(false);
    expect(waitsForChoices({ gameMode: 'nines', modeConfig: { kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: 'net' } }, {})).toBe(false);
    expect(waitsForChoices({ gameMode: 'round_robin', modeConfig: { kind: 'round_robin', team_size: 1, teams_count: 4, allowance_pct: 85 } }, {})).toBe(false);
    expect(waitsForChoices({ gameMode: 'acey_deucey', modeConfig: { kind: 'acey_deucey', team_size: 1, acey_deucey_scoring: 'net' } }, {})).toBe(false);
    expect(waitsForChoices({ gameMode: 'skins', modeConfig: { kind: 'skins' } }, {})).toBe(false);
  });

  it('Bingo Bango Bongo venter til prestasjonene er hentet; en tom liste er et svar', () => {
    expect(waitsForChoices({ gameMode: 'bingo_bango_bongo', modeConfig: { kind: 'bingo_bango_bongo', team_size: 1 } }, {})).toBe(true);
    expect(waitsForChoices({ gameMode: 'bingo_bango_bongo', modeConfig: { kind: 'bingo_bango_bongo', team_size: 1 } }, { bingoBangoBongoHoles: [] })).toBe(false);
    // Wolfs valg er ikke BBBs, og omvendt.
    expect(waitsForChoices({ gameMode: 'bingo_bango_bongo', modeConfig: { kind: 'bingo_bango_bongo', team_size: 1 } }, { wolfChoices: [] })).toBe(true);
    expect(waitsForChoices({ gameMode: 'wolf', modeConfig: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' } }, { bingoBangoBongoHoles: [] })).toBe(true);
  });
});

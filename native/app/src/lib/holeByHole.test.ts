// #2255 PR 3a: hvilke runder appen har «Hull for hull» for, og at modellen
// bygges fra bundelen og de lokale slagene med samme motor som tavla.
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { buildHoleByHole, holeByHoleKind, waitsForChoices, type HoleByHoleModel } from './holeByHole';

/** Solo-kortet, eller en feil hvis modellen er et annet format. */
function soloCard(model: HoleByHoleModel | null) {
  if (!model || model.kind === 'wolf') throw new Error(`forventet solo, fikk ${model?.kind}`);
  return model.card;
}

describe('holeByHoleKind', () => {
  it.each([
    ['stableford', { kind: 'stableford', team_size: 1, points_table: 'standard' }, 'solo-stableford'],
    ['modified_stableford', { kind: 'modified_stableford', team_size: 1 }, 'solo-stableford'],
    ['solo_strokeplay', { kind: 'solo_strokeplay' }, 'solo-strokeplay'],
    ['wolf', { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' }, 'wolf'],
    // Webben har ingen egen visning for lag-stableford: tavla.
    ['stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }, null],
    // Matchplay og scramble har ingen «Hull for hull» på webben heller.
    ['singles_matchplay', { kind: 'singles_matchplay', team_size: 1, teams_count: 2 }, null],
    ['texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 25 }, null],
    // Webben har visningen, men appen har den ikke ennå (PR 3c): flisa står som «Tavla».
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
    expect(waitsForChoices('wolf', {})).toBe(true);
    expect(waitsForChoices('wolf', { wolfChoices: [] })).toBe(false);
    expect(waitsForChoices('solo-stableford', {})).toBe(false);
    expect(waitsForChoices(null, {})).toBe(false);
  });
});

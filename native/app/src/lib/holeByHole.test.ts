// #2255 PR 3a: hvilke runder appen har «Hull for hull» for, og at modellen
// bygges fra bundelen og de lokale slagene med samme motor som tavla.
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { buildHoleByHole, holeByHoleKind } from './holeByHole';

describe('holeByHoleKind', () => {
  it.each([
    ['stableford', { kind: 'stableford', team_size: 1, points_table: 'standard' }, 'solo-stableford'],
    ['modified_stableford', { kind: 'modified_stableford', team_size: 1 }, 'solo-stableford'],
    ['solo_strokeplay', { kind: 'solo_strokeplay' }, 'solo-strokeplay'],
    // Webben har ingen egen visning for lag-stableford: tavla.
    ['stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }, null],
    // Matchplay og scramble har ingen «Hull for hull» på webben heller.
    ['singles_matchplay', { kind: 'singles_matchplay', team_size: 1, teams_count: 2 }, null],
    ['texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 25 }, null],
    // Webben har visningen, men appen har den ikke ennå (PR 3b/3c): flisa står som «Tavla».
    ['wolf', { kind: 'wolf' }, null],
    ['best_ball', { kind: 'best_ball', team_size: 2 }, null],
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
    expect(model?.card.standings.map((s) => [s.userId, s.total])).toEqual([
      ['ola', 6],
      ['kari', 2],
    ]);
    expect(model?.card.front.holes[0]!.rows.map((r) => r.value)).toEqual([2, 1]);
    expect(model?.card.back.holes).toHaveLength(9);
  });

  it('solo slagspill: undertittelen er «Slagspill · Netto»', () => {
    const bundle = homeBundle({
      game: { id: 'g2', status: 'finished', gameMode: 'solo_strokeplay', modeConfig: { kind: 'solo_strokeplay' } },
      players,
    });
    const model = buildHoleByHole(bundle, holeScores('g2', 'ola', 2, 4));
    expect(model?.kind).toBe('solo-strokeplay');
    expect(model?.subtitle).toBe('Slagspill · Netto');
    expect(model?.card.standings[0]!.userId).toBe('ola');
  });

  it('et format uten appens «Hull for hull» gir null', () => {
    const bundle = homeBundle({
      game: { id: 'g3', gameMode: 'wolf', modeConfig: { kind: 'wolf' } },
      players,
    });
    expect(buildHoleByHole(bundle, [])).toBeNull();
  });
});

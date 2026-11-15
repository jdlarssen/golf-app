// #2894 PR 2: Æreslista og banneret, regnet ut av svaret. Type A: årene og tellingen
// (med flertall), toppkortet, og banneret sine regler (7 dager, «+1 til», lukket slag).
import type { AereslisteRow } from '../../../../lib/stats/aeresliste';
import { buildAereslisteModel, buildRareShotBanner, daysSincePlayed, yearCount } from './aeresliste';

const row = (
  kind: AereslisteRow['kind'],
  name: string,
  playedOn: string,
  hole = 7,
  courseName: string | null = 'Bogstad',
  isViewer = false,
): AereslisteRow => ({ kind, name, initials: 'XX', isViewer, hole, courseName, playedOn, key: `${name}-${playedOn}` });

// Jest kjører i UTC (jest.config.js); 15. november kl. 12 er samme dag overalt i Europa.
const NOW = new Date(2026, 10, 15, 12, 0);

describe('yearCount', () => {
  it('counts hole-in-one (same word in plural) and albatross (plural «albatrosser»), leaving out a kind with none', () => {
    const h = row('hole_in_one', 'A', '2026-01-01');
    const a = row('albatross', 'B', '2026-01-01');
    expect(yearCount([h, h, a])).toBe('2 hole-in-one · 1 albatross');
    expect(yearCount([a, a])).toBe('2 albatrosser');
    expect(yearCount([h])).toBe('1 hole-in-one');
  });
});

describe('buildAereslisteModel', () => {
  it('is empty without rows', () => {
    expect(buildAereslisteModel({ rows: [] })).toEqual({ kind: 'empty' });
  });

  it('puts the newest on top and groups the years in the order they come, newest first within the year', () => {
    const model = buildAereslisteModel({
      rows: [
        row('hole_in_one', 'Jonas B.', '2026-09-21'),
        row('albatross', 'Anders M.', '2026-07-09', 12, 'Holtsmark'),
        row('hole_in_one', 'Marte L.', '2025-08-30', 16, 'Grini'),
        row('albatross', 'Marie-Christine B.', '2024-08-17', 4, null),
      ],
    });
    if (model.kind !== 'list') throw new Error('expected a list');
    expect(model.hero).toEqual({
      label: 'Nyeste hole-in-one',
      name: 'Jonas B.',
      line: 'Hull 7 på Bogstad · 21. sep',
      mark: '1',
      spoken: 'Nyeste hole-in-one, Jonas B., hull 7 på Bogstad, 21. september',
    });
    expect(model.years.map((y) => [y.year, y.count, y.rows.map((r) => r.name)])).toEqual([
      ['2026', '1 hole-in-one · 1 albatross', ['Jonas B.', 'Anders M.']],
      ['2025', '1 hole-in-one', ['Marte L.']],
      ['2024', '1 albatross', ['Marie-Christine B.']],
    ]);
    expect(model.years[2].rows[0]).toMatchObject({ mark: '−3', where: ' · hull 4', date: '17. aug' });
  });
});

describe('daysSincePlayed', () => {
  it('counts calendar days, not hours', () => {
    expect(daysSincePlayed('2026-11-15', NOW)).toBe(0);
    expect(daysSincePlayed('2026-11-14', new Date(2026, 10, 15, 0, 5))).toBe(1);
    expect(daysSincePlayed('2026-11-08', NOW)).toBe(7);
    expect(daysSincePlayed('2026-10-31', NOW)).toBe(15);
  });
});

describe('buildRareShotBanner', () => {
  it('shows the newest shot for 7 days (6 days old yes, 7 days old no)', () => {
    expect(buildRareShotBanner([row('hole_in_one', 'Marte L.', '2026-11-09')], NOW, null)).toMatchObject({
      shot: 'Hole-in-one',
      name: 'Marte L.',
      where: 'Hull 7 på Bogstad',
      mark: '1',
      more: null,
      spoken: 'Hole-in-one: Marte L., hull 7 på Bogstad. Åpner æreslista.',
    });
    expect(buildRareShotBanner([row('hole_in_one', 'Marte L.', '2026-11-08')], NOW, null)).toBeNull();
    expect(buildRareShotBanner([], NOW, null)).toBeNull();
  });

  it('says «+N til» for the other shots in the same 7 days, not for older ones', () => {
    const rows = [
      row('albatross', 'Anders M.', '2026-11-14', 12, 'Holtsmark'),
      row('hole_in_one', 'Marte L.', '2026-11-12'),
      row('hole_in_one', 'Per K.', '2026-11-10'),
      row('hole_in_one', 'Ola N.', '2026-11-01'),
    ];
    expect(buildRareShotBanner(rows, NOW, null)).toMatchObject({ shot: 'Albatross', mark: '−3', more: '+2 til' });
    expect(buildRareShotBanner(rows.slice(0, 2), NOW, null)?.more).toBe('+1 til');
  });

  it('stays closed for the closed shot, and a new newest shot gives a new banner', () => {
    const old = row('hole_in_one', 'Marte L.', '2026-11-12');
    expect(buildRareShotBanner([old], NOW, old.key)).toBeNull();
    const fresh = row('albatross', 'Anders M.', '2026-11-14');
    expect(buildRareShotBanner([fresh, old], NOW, old.key)?.key).toBe(fresh.key);
  });

  it('marks your own shot and says «deg» to the screen reader; without a course it says the hole alone', () => {
    const own = row('hole_in_one', 'Sigrid A.', '2026-11-15', 5, null, true);
    expect(buildRareShotBanner([own], NOW, null)).toMatchObject({
      isViewer: true,
      name: 'Sigrid A.',
      where: 'Hull 5',
      spoken: 'Hole-in-one: Sigrid A., deg, hull 5. Åpner æreslista.',
    });
  });
});

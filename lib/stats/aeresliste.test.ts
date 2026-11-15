import { describe, it, expect } from 'vitest';
import { buildAeresliste, shotKey } from './aeresliste';
import type { RareMoment } from './rareMoments';

/**
 * Type A (#2894 PR 2): what Æreslista sends. Pure, no database: the shaping, the order,
 * the privacy rule (no ids, short names) and the switch «Del sjeldne slag med alle».
 */

const names = new Map([
  ['u-marte', 'Marte Larsen'],
  ['u-per', 'Per Knutsen'],
  ['u-me', 'Kari Nordmann'],
  ['u-anon', ''],
]);
const nicknames = new Map<string, string>();

const m = (over: Partial<RareMoment> & Pick<RareMoment, 'userId' | 'playedOn'>): RareMoment => ({
  kind: 'hole_in_one',
  hole: 7,
  courseName: 'Bogstad',
  ...over,
});

const build = (moments: RareMoment[], optOuts: string[] = []) =>
  buildAeresliste({ moments, optOuts: new Set(optOuts), viewerUserId: 'u-me', names, nicknames });

describe('buildAeresliste', () => {
  it('sends hole-in-one and albatross with a short name, newest first, never eagle', () => {
    const { rows } = build([
      m({ userId: 'u-per', playedOn: '2025-06-02' }),
      m({ userId: 'u-marte', playedOn: '2026-09-21', kind: 'albatross', hole: 12, courseName: 'Holtsmark' }),
      m({ userId: 'u-marte', playedOn: '2026-10-01', kind: 'eagle' }),
    ]);

    expect(rows.map((r) => [r.kind, r.name, r.playedOn])).toEqual([
      ['albatross', 'Marte L.', '2026-09-21'],
      ['hole_in_one', 'Per K.', '2025-06-02'],
    ]);
    expect(rows[0]).toMatchObject({ initials: 'ML', hole: 12, courseName: 'Holtsmark', isViewer: false });
  });

  it('sends only the eight row keys: no user id, game id, strokes or tee', () => {
    const { rows } = build([m({ userId: 'u-marte', playedOn: '2026-09-21' })]);

    expect(Object.keys(rows[0]).sort()).toEqual(
      ['courseName', 'hole', 'initials', 'isViewer', 'key', 'kind', 'name', 'playedOn'],
    );
    expect(JSON.stringify(rows)).not.toContain('u-marte');
  });

  it('marks the viewer’s own shot', () => {
    const { rows } = build([m({ userId: 'u-me', playedOn: '2026-05-04' })]);

    expect(rows[0]).toMatchObject({ name: 'Kari N.', isViewer: true });
  });

  it('leaves out a player who said no to sharing, also for that player', () => {
    const shots = [m({ userId: 'u-marte', playedOn: '2026-09-21' }), m({ userId: 'u-me', playedOn: '2026-05-04' })];

    expect(build(shots, ['u-marte']).rows.map((r) => r.name)).toEqual(['Kari N.']);
    expect(build(shots, ['u-me']).rows.map((r) => r.name)).toEqual(['Marte L.']);
  });

  it('leaves out a player with no name to show', () => {
    expect(build([m({ userId: 'u-anon', playedOn: '2026-09-21' })]).rows).toEqual([]);
  });

  it('on the same day the rarer kind comes first', () => {
    const { rows } = build([
      m({ userId: 'u-per', playedOn: '2026-07-09', kind: 'albatross' }),
      m({ userId: 'u-marte', playedOn: '2026-07-09' }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(['hole_in_one', 'albatross']);
  });

  it('gives each shot a stable opaque key, different per shot', () => {
    const a = m({ userId: 'u-marte', playedOn: '2026-09-21' });
    const b = m({ userId: 'u-marte', playedOn: '2026-09-21', hole: 8 });

    expect(shotKey(a)).toBe(shotKey({ ...a }));
    expect(shotKey(a)).not.toBe(shotKey(b));
    expect(shotKey(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(build([a]).rows[0].key).toBe(shotKey(a));
  });
});

import { describe, it, expect } from 'vitest';
import { buildAeresbrettView, type AeresbrettInput } from './appAeresbrettView';

/**
 * Type A (#2259): the shape `/api/aeresbrett` sends the app. The ranking rules have
 * their own suite (`aeresbrett.test.ts`); here: names, privacy, the viewer's rows,
 * the leader, and the season flags.
 */

const base: AeresbrettInput = {
  seasonYear: 2026,
  currentYear: 2026,
  viewerUserId: 'meg',
  wins: [],
  rounds: [],
  birdies: [],
  moments: [],
  names: [
    ['anne', 'Anne Berg'],
    ['bjorn', 'Bjørn Hansen'],
    ['meg', 'Kari Nordmann'],
    ['solo', 'Ola'],
  ],
  nicknames: [['kallenavn', 'Rakka']],
};

const view = (over: Partial<AeresbrettInput>) => buildAeresbrettView({ ...base, ...over });

describe('buildAeresbrettView', () => {
  it('shortens names to «Fornavn E.» and gives initials', () => {
    const { boards } = view({ wins: [['anne', 3]] });
    expect(boards.wins.rows).toEqual([
      { place: 1, name: 'Anne B.', initials: 'AB', count: 3, isViewer: false },
    ]);
  });

  it('sends only the five row keys: no user id, game, date or stroke', () => {
    const { boards } = view({ wins: [['anne', 3]], rounds: [['anne', 5]], birdies: [['anne', 2]] });
    for (const board of [boards.wins, boards.birdies!, boards.rounds]) {
      for (const r of board.rows) {
        expect(Object.keys(r).sort()).toEqual(['count', 'initials', 'isViewer', 'name', 'place']);
      }
    }
    expect(JSON.stringify(boards)).not.toContain('anne"');
  });

  it('falls back to the nickname, and leaves out a player with neither name nor nickname', () => {
    const { boards } = view({
      wins: [['kallenavn', 2], ['ukjent', 5], ['solo', 1]],
    });
    expect(boards.wins.rows.map((r) => r.name)).toEqual(['Rakka', 'Ola']);
  });

  it('marks the viewer\'s row and gives «Din plass»', () => {
    const { boards } = view({ wins: [['anne', 4], ['meg', 2]] });
    expect(boards.wins.rows.map((r) => [r.name, r.isViewer])).toEqual([
      ['Anne B.', false],
      ['Kari N.', true],
    ]);
    expect(boards.wins.me).toEqual({ place: 2, count: 2, toTop5: null });
  });

  it('gives the viewer outside the top ten a place but no row', () => {
    const many = Array.from({ length: 11 }, (_, i) => [`u${i}`, 20 - i] as const);
    const { boards } = view({
      wins: [...many, ['meg', 1]],
      names: [...many.map(([id], i) => [id, `Spiller N${i}`] as const), ['meg', 'Kari Nordmann']],
    });
    expect(boards.wins.rows).toHaveLength(10);
    expect(boards.wins.rows.some((r) => r.isViewer)).toBe(false);
    // The fifth row has 16 wins (20 - 4); the viewer has 1.
    expect(boards.wins.me).toEqual({ place: 12, count: 1, toTop5: 15 });
  });

  it('has a leader only when one player holds place 1', () => {
    expect(view({ wins: [['anne', 4], ['bjorn', 2]] }).boards.wins.leader?.name).toBe('Anne B.');
    expect(view({ wins: [['anne', 4], ['bjorn', 4]] }).boards.wins.leader).toBeNull();
    expect(view({ wins: [] }).boards.wins.leader).toBeNull();
  });

  it('keeps the birdie tab as null when that read failed, and the others as they are', () => {
    const { boards } = view({ wins: [['anne', 1]], birdies: null });
    expect(boards.birdies).toBeNull();
    expect(boards.wins.rows).toHaveLength(1);
  });

  it('flags a past season as over, this year as running, and no season as empty', () => {
    expect(view({}).seasonOver).toBe(false);
    expect(view({ seasonYear: 2025, currentYear: 2026 }).seasonOver).toBe(true);
    const empty = view({ seasonYear: null });
    expect(empty.seasonOver).toBe(false);
    expect(empty.seasonYear).toBeNull();
  });
});

describe('buildAeresbrettView: sjeldne slag', () => {
  const moment = (userId: string, kind: 'hole_in_one' | 'albatross' | 'eagle', playedOn: string, hole = 7) => ({
    kind,
    userId,
    hole,
    courseName: 'Bogstad',
    playedOn,
  });

  it('shortens names, marks your own row and sends only the seven row keys', () => {
    const { moments } = view({ moments: [moment('anne', 'eagle', '2026-06-12'), moment('meg', 'eagle', '2026-06-01')] });
    expect(moments?.map((m) => [m.name, m.isViewer])).toEqual([
      ['Anne B.', false],
      ['Kari N.', true],
    ]);
    for (const m of moments ?? []) {
      expect(Object.keys(m).sort()).toEqual(['courseName', 'hole', 'initials', 'isViewer', 'kind', 'name', 'playedOn']);
    }
    expect(JSON.stringify(moments)).not.toContain('"anne"');
  });

  it('puts hole-in-one first, then albatross, then eagle, and the newest first within each', () => {
    const { moments } = view({
      moments: [
        moment('bjorn', 'eagle', '2026-09-30'),
        moment('anne', 'hole_in_one', '2026-06-12'),
        moment('bjorn', 'hole_in_one', '2026-08-02'),
        moment('anne', 'albatross', '2026-07-01'),
        moment('anne', 'eagle', '2026-05-20'),
      ],
    });
    expect(moments?.map((m) => [m.kind, m.playedOn])).toEqual([
      ['hole_in_one', '2026-08-02'],
      ['hole_in_one', '2026-06-12'],
      ['albatross', '2026-07-01'],
      ['eagle', '2026-09-30'],
      ['eagle', '2026-05-20'],
    ]);
  });

  it('leaves out a player with neither name nor nickname', () => {
    const { moments } = view({ moments: [moment('ukjent', 'eagle', '2026-06-12'), moment('solo', 'eagle', '2026-06-11')] });
    expect(moments?.map((m) => m.name)).toEqual(['Ola']);
  });

  it('is null when the strokes read failed, and the tabs are unaffected', () => {
    const v = view({ wins: [['anne', 1]], moments: null });
    expect(v.moments).toBeNull();
    expect(v.boards.wins.rows).toHaveLength(1);
  });

  it('is an empty list when there are none', () => {
    expect(view({ moments: [] }).moments).toEqual([]);
  });
});

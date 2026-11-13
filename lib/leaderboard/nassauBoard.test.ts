import { describe, it, expect } from 'vitest';
import { AFTER_13, fours, nassauResult as nassau } from './__fixtures__/nassauResult';
import { summarizeNassau } from './nassauBoard';

describe('summarizeNassau — the state of each match', () => {
  it.each([
    ['nobody has played', { a: [], b: [] }, ['waiting', 'waiting', 'waiting']],
    ['five holes in', { a: fours(5), b: fours(5) }, ['live', 'waiting', 'live']],
    ['the front 9 played by all', { a: fours(9), b: fours(9) }, ['decided', 'waiting', 'live']],
    ['all 18 played by all', { a: fours(18), b: fours(18) }, ['decided', 'decided', 'decided']],
  ] as const)('%s', (_label, strokes, expected) => {
    const board = summarizeNassau(nassau({ ...strokes }), { finished: false, viewerUserId: null });
    expect([board.sections.front9.state, board.sections.back9.state, board.sections.total18.state]).toEqual(
      expected,
    );
  });

  it('a match is decided only when every player has played all its holes', () => {
    // a and b are through the front 9, c is on hole 8: the engine already has
    // a winner (someone completed it), but the card keeps a leader and no winner.
    const result = nassau({ a: [3, ...fours(8)], b: fours(9), c: fours(8) });
    expect(result.sections.front9.winnerUserIds).toEqual(['a']);
    const front = summarizeNassau(result, { finished: false, viewerUserId: null }).sections.front9;
    expect(front.state).toBe('live');
    expect(front.leaderUserIds).toEqual(['a']);
  });

  it('a finished game decides every match, with the engine’s winners', () => {
    const result = nassau({ a: [3, ...fours(8)], b: fours(9), c: fours(8) });
    const board = summarizeNassau(result, { finished: true, viewerUserId: null });
    expect(board.sections.front9.state).toBe('decided');
    expect(board.sections.front9.leaderUserIds).toEqual(['a']);
    // Nobody played a back-9 hole: decided, and nobody won it.
    expect(board.sections.back9.state).toBe('decided');
    expect(board.sections.back9.leaderUserIds).toEqual([]);
    expect(board.sections.back9.leaderHeadline).toBeNull();
  });

  it('a tied match is decided with two winners; a live tie has two leaders', () => {
    const decided = summarizeNassau(nassau({ a: fours(9), b: fours(9), c: [5, ...fours(8)] }), {
      finished: false,
      viewerUserId: null,
    });
    expect(decided.sections.front9.state).toBe('decided');
    expect([...decided.sections.front9.leaderUserIds].sort()).toEqual(['a', 'b']);
    const live = summarizeNassau(nassau({ a: fours(4), b: fours(4), c: [5, ...fours(3)] }), {
      finished: false,
      viewerUserId: null,
    });
    expect(live.sections.front9.state).toBe('live');
    expect([...live.sections.front9.leaderUserIds].sort()).toEqual(['a', 'b']);
  });

  it('counts holes as the furthest player in the match has come', () => {
    const board = summarizeNassau(nassau(AFTER_13), { finished: false, viewerUserId: null });
    expect([board.sections.back9.holesDone, board.sections.back9.holesTotal]).toEqual([4, 9]);
    expect([board.sections.total18.holesDone, board.sections.total18.holesTotal]).toEqual([13, 18]);
    expect(board.sections.front9.leaderHeadline?.text).toBe('33');
  });
});

describe('summarizeNassau — the viewer’s line', () => {
  it('matches the artboard after 13 holes', () => {
    const board = summarizeNassau(nassau(AFTER_13), { finished: false, viewerUserId: 'meg' });
    // Front 9: 3rd, two behind Marte (35 vs 33 over 9 holes each).
    expect(board.sections.front9.viewer).toEqual({ rank: 3, tied: false, gap: 2, lead: null });
    // Back 9: leads Marte by one (15 vs 16 over four holes each).
    expect(board.sections.back9.leaderUserIds).toEqual(['meg']);
    expect(board.sections.back9.viewer).toEqual({ rank: 1, tied: false, gap: null, lead: 1 });
    // Total: 2nd, one behind Marte (50 vs 49 over 13 holes each).
    expect(board.sections.total18.viewer).toEqual({ rank: 2, tied: false, gap: 1, lead: null });
  });

  it.each([
    // b has played one hole more than the viewer in back 9.
    ['net strokes compare only equal holes', undefined, null],
    ['net to par compares across holes', 'net_to_par' as const, 1],
  ])('%s', (_label, ranking, gap) => {
    const strokes = { b: [...fours(9), 4, 4, 4, 4, 3], meg: [...fours(9), 4, 4, 4, 4] };
    const board = summarizeNassau(nassau(strokes, ranking), { finished: false, viewerUserId: 'meg' });
    expect(board.sections.back9.viewer?.rank).toBe(2);
    expect(board.sections.back9.viewer?.gap).toBe(gap);
  });

  it('a viewer tied for the lead has no gap and no lead', () => {
    const board = summarizeNassau(nassau({ meg: fours(4), b: fours(4), c: [5, ...fours(3)] }), {
      finished: false,
      viewerUserId: 'meg',
    });
    expect(board.sections.front9.viewer).toEqual({ rank: 1, tied: true, gap: null, lead: null });
  });

  it('is null for a viewer who is not in the game, and while a match waits', () => {
    const board = summarizeNassau(nassau(AFTER_13), { finished: false, viewerUserId: 'arrangør' });
    expect(board.sections.front9.viewer).toBeNull();
    const fresh = summarizeNassau(nassau({ meg: [], b: [] }), { finished: false, viewerUserId: 'meg' });
    expect(fresh.sections.front9.viewer).toBeNull();
  });
});

describe('summarizeNassau — sweep', () => {
  it('Marte has won the only decided match alone: she can take all three, stop her on back 9', () => {
    const board = summarizeNassau(nassau(AFTER_13), { finished: false, viewerUserId: 'meg' });
    expect(board.sweep).toEqual({ userId: 'marte', openSection: 'back9' });
  });

  it.each([
    ['a tied front 9', { a: fours(9), b: fours(9), c: [5, ...fours(8)] }, false],
    ['every match decided', { a: [3, ...fours(17)], b: fours(18) }, true],
  ] as const)('none for %s', (_label, strokes, finished) => {
    const board = summarizeNassau(nassau({ ...strokes }), { finished, viewerUserId: null });
    expect(board.sweep).toBeNull();
  });
});

describe('summarizeNassau — the match open from the start', () => {
  it.each([
    ['hole 5', { a: fours(5), b: fours(5) }, false, 'front9'],
    ['hole 13', AFTER_13, false, 'back9'],
    // Everyone through the front 9, nobody has started back 9.
    ['the turn', { a: fours(9), b: fours(9) }, false, 'back9'],
    ['a finished game', { a: fours(18), b: fours(18) }, true, 'total18'],
  ] as const)('%s', (_label, strokes, finished, expected) => {
    const board = summarizeNassau(nassau({ ...strokes }), { finished, viewerUserId: null });
    expect(board.defaultSection).toBe(expected);
  });
});

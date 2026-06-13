import { describe, it, expect } from 'vitest';
import { finishedResultBadge } from './finishedResultBadge';

describe('finishedResultBadge', () => {
  it('placement rank 1 (individ) → youWon, isWin', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 1, fieldSize: 4, isTeam: false }),
    ).toEqual({ key: 'result.youWon', isWin: true });
  });

  it('placement rank 1 (lag) → teamWon, isWin', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 1, fieldSize: 3, isTeam: true }),
    ).toEqual({ key: 'result.teamWon', isWin: true });
  });

  it('placement rank > 1 (individ) → placement, ikke win', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 2, fieldSize: 4, isTeam: false }),
    ).toEqual({
      key: 'result.placement',
      values: { rank: 2, fieldSize: 4 },
      isWin: false,
    });
  });

  it('placement rank > 1 (lag) → teamPlacement', () => {
    expect(
      finishedResultBadge({ kind: 'placement', rank: 2, fieldSize: 4, isTeam: true }),
    ).toMatchObject({ key: 'result.teamPlacement', isWin: false });
  });

  it('matchplay win → matchWon med margin, isWin', () => {
    expect(
      finishedResultBadge({ kind: 'matchplay', outcome: 'win', margin: '3&2' }),
    ).toEqual({ key: 'result.matchWon', values: { margin: '3&2' }, isWin: true });
  });

  it('matchplay loss → matchLost, ikke win', () => {
    expect(
      finishedResultBadge({ kind: 'matchplay', outcome: 'loss', margin: '2 up' }),
    ).toEqual({ key: 'result.matchLost', values: { margin: '2 up' }, isWin: false });
  });

  it('matchplay tie → matchTied, ingen margin', () => {
    expect(
      finishedResultBadge({ kind: 'matchplay', outcome: 'tie', margin: null }),
    ).toEqual({ key: 'result.matchTied', isWin: false });
  });

  it('skins rank 1 med skins > 0 → skinsWon, isWin', () => {
    expect(
      finishedResultBadge({ kind: 'skins', skins: 4, rank: 1, fieldSize: 4 }),
    ).toEqual({ key: 'result.skinsWon', values: { count: 4 }, isWin: true });
  });

  it('skins rank 1 men 0 skins → skins, IKKE win (ingen «🥇 0 skins»)', () => {
    expect(
      finishedResultBadge({ kind: 'skins', skins: 0, rank: 1, fieldSize: 4 }),
    ).toEqual({ key: 'result.skins', values: { count: 0 }, isWin: false });
  });

  it('skins rank > 1 → skins, ikke win', () => {
    expect(
      finishedResultBadge({ kind: 'skins', skins: 1, rank: 3, fieldSize: 4 }),
    ).toEqual({ key: 'result.skins', values: { count: 1 }, isWin: false });
  });
});

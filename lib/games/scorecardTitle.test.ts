import { describe, it, expect } from 'vitest';
import { scorecardTitle } from './scorecardTitle';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

describe('scorecardTitle', () => {
  it('returnerer «Lagets scorekort» for best-ball', () => {
    const cfg: GameModeConfig = {
      kind: 'best_ball',
      team_size: 2,
      teams_count: 4,
    };
    expect(scorecardTitle('best_ball', cfg)).toEqual({
      title: 'Lagets scorekort',
      cardLabel: 'Lagets scorekort',
    });
  });

  it('returnerer «Lagets scorekort» for par-stableford (team_size=2)', () => {
    const cfg: GameModeConfig = {
      kind: 'stableford',
      team_size: 2,
      points_table: 'standard',
    };
    expect(scorecardTitle('stableford', cfg)).toEqual({
      title: 'Lagets scorekort',
      cardLabel: 'Lagets scorekort',
    });
  });

  it('returnerer «Mitt scorekort» for solo stableford (team_size=1)', () => {
    const cfg: GameModeConfig = {
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    };
    expect(scorecardTitle('stableford', cfg)).toEqual({
      title: 'Mitt scorekort',
      cardLabel: 'Mitt scorekort',
    });
  });

  it('returnerer «Match-scorekort» for singles matchplay', () => {
    const cfg: GameModeConfig = {
      kind: 'singles_matchplay',
      team_size: 1,
      teams_count: 2,
    };
    expect(scorecardTitle('singles_matchplay', cfg)).toEqual({
      title: 'Match-scorekort',
      cardLabel: 'Match-scorekort',
    });
  });

  it('returnerer «Mitt scorekort» for solo strokeplay', () => {
    const cfg: GameModeConfig = {
      kind: 'solo_strokeplay',
      team_size: 1,
    };
    expect(scorecardTitle('solo_strokeplay', cfg)).toEqual({
      title: 'Mitt scorekort',
      cardLabel: 'Mitt scorekort',
    });
  });

  it('returnerer «Lagets scorekort» for texas scramble (2-mannslag)', () => {
    const cfg: GameModeConfig = {
      kind: 'texas_scramble',
      team_size: 2,
      teams_count: 4,
      team_handicap_pct: 25,
    };
    expect(scorecardTitle('texas_scramble', cfg)).toEqual({
      title: 'Lagets scorekort',
      cardLabel: 'Lagets scorekort',
    });
  });

  it('returnerer «Match-scorekort» for fourball matchplay', () => {
    const cfg: GameModeConfig = {
      kind: 'fourball_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 85,
    };
    expect(scorecardTitle('fourball_matchplay', cfg)).toEqual({
      title: 'Match-scorekort',
      cardLabel: 'Match-scorekort',
    });
  });

  it('returnerer «Lagets scorekort» for texas scramble (4-mannslag)', () => {
    const cfg: GameModeConfig = {
      kind: 'texas_scramble',
      team_size: 4,
      teams_count: 2,
      team_handicap_pct: 10,
    };
    expect(scorecardTitle('texas_scramble', cfg)).toEqual({
      title: 'Lagets scorekort',
      cardLabel: 'Lagets scorekort',
    });
  });
});

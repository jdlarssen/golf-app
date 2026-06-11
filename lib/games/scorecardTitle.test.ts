import { describe, it, expect } from 'vitest';
import { scorecardTitle } from './scorecardTitle';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

describe('scorecardTitle', () => {
  it('returnerer team-nøkler for best-ball', () => {
    const cfg: GameModeConfig = {
      kind: 'best_ball',
      team_size: 2,
      teams_count: 4,
    };
    expect(scorecardTitle('best_ball', cfg)).toEqual({
      titleKey: 'kickerTeam',
      cardLabelKey: 'cardLabelTeam',
    });
  });

  it('returnerer team-nøkler for par-stableford (team_size=2)', () => {
    const cfg: GameModeConfig = {
      kind: 'stableford',
      team_size: 2,
      points_table: 'standard',
    };
    expect(scorecardTitle('stableford', cfg)).toEqual({
      titleKey: 'kickerTeam',
      cardLabelKey: 'cardLabelTeam',
    });
  });

  it('returnerer solo-nøkler for solo stableford (team_size=1)', () => {
    const cfg: GameModeConfig = {
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    };
    expect(scorecardTitle('stableford', cfg)).toEqual({
      titleKey: 'kickerSolo',
      cardLabelKey: 'cardLabelSolo',
    });
  });

  it('returnerer matchplay-nøkler for singles matchplay', () => {
    const cfg: GameModeConfig = {
      kind: 'singles_matchplay',
      team_size: 1,
      teams_count: 2,
    };
    expect(scorecardTitle('singles_matchplay', cfg)).toEqual({
      titleKey: 'kickerMatch',
      cardLabelKey: 'cardLabelMatch',
    });
  });

  it('returnerer solo-nøkler for solo strokeplay', () => {
    const cfg: GameModeConfig = {
      kind: 'solo_strokeplay',
      team_size: 1,
    };
    expect(scorecardTitle('solo_strokeplay', cfg)).toEqual({
      titleKey: 'kickerSolo',
      cardLabelKey: 'cardLabelSolo',
    });
  });

  it('returnerer team-nøkler for texas scramble (2-mannslag)', () => {
    const cfg: GameModeConfig = {
      kind: 'texas_scramble',
      team_size: 2,
      teams_count: 4,
      team_handicap_pct: 25,
    };
    expect(scorecardTitle('texas_scramble', cfg)).toEqual({
      titleKey: 'kickerTeam',
      cardLabelKey: 'cardLabelTeam',
    });
  });

  it('returnerer matchplay-nøkler for fourball matchplay', () => {
    const cfg: GameModeConfig = {
      kind: 'fourball_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 85,
    };
    expect(scorecardTitle('fourball_matchplay', cfg)).toEqual({
      titleKey: 'kickerMatch',
      cardLabelKey: 'cardLabelMatch',
    });
  });

  it('returnerer team-nøkler for texas scramble (4-mannslag)', () => {
    const cfg: GameModeConfig = {
      kind: 'texas_scramble',
      team_size: 4,
      teams_count: 2,
      team_handicap_pct: 10,
    };
    expect(scorecardTitle('texas_scramble', cfg)).toEqual({
      titleKey: 'kickerTeam',
      cardLabelKey: 'cardLabelTeam',
    });
  });
});

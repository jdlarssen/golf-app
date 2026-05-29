import { describe, it, expect } from 'vitest';
import { formatDisplayLabel } from './formatLabel';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

describe('formatDisplayLabel', () => {
  it('navngir standard Stableford team_size 2 som «4BBB Stableford»', () => {
    const cfg: GameModeConfig = {
      kind: 'stableford',
      team_size: 2,
      points_table: 'standard',
    };
    expect(formatDisplayLabel('stableford', cfg)).toBe('4BBB Stableford');
  });

  it('navngir modifisert Stableford team_size 2 som «4BBB Modifisert Stableford»', () => {
    const cfg: GameModeConfig = {
      kind: 'modified_stableford',
      team_size: 2,
      points_table: 'modified',
    };
    expect(formatDisplayLabel('modified_stableford', cfg)).toBe(
      '4BBB Modifisert Stableford',
    );
  });

  it('beholder «Stableford» for solo (team_size 1)', () => {
    const cfg: GameModeConfig = {
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    };
    expect(formatDisplayLabel('stableford', cfg)).toBe('Stableford');
  });

  it('beholder «Modifisert Stableford» for solo', () => {
    const cfg: GameModeConfig = {
      kind: 'modified_stableford',
      team_size: 1,
      points_table: 'modified',
    };
    expect(formatDisplayLabel('modified_stableford', cfg)).toBe(
      'Modifisert Stableford',
    );
  });

  it('rører ikke ikke-stableford lag-moduser (best ball er ikke 4BBB-stableford)', () => {
    const cfg: GameModeConfig = {
      kind: 'best_ball',
      team_size: 2,
      teams_count: 4,
    };
    expect(formatDisplayLabel('best_ball', cfg)).toBe('Best ball');
  });

  it('faller tilbake til MODE_LABELS for andre moduser', () => {
    const cases: Array<[GameMode, GameModeConfig]> = [
      ['texas_scramble', { kind: 'texas_scramble', team_size: 4, teams_count: 2, team_handicap_pct: 10 }],
      ['singles_matchplay', { kind: 'singles_matchplay', team_size: 1, teams_count: 2 }],
      ['solo_strokeplay', { kind: 'solo_strokeplay', team_size: 1 }],
      ['skins', { kind: 'skins', team_size: 1, skins_scoring: 'net' }],
    ];
    for (const [mode, cfg] of cases) {
      expect(formatDisplayLabel(mode, cfg)).not.toMatch(/4BBB/);
    }
  });
});

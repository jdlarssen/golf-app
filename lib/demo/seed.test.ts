import { describe, it, expect } from 'vitest';
import { buildDemoContext, DEMO_HOLES, DEMO_PLAYERS, DEMO_YOU_ID } from './seed';
import { computeLeaderboard } from '@/lib/scoring';

// Type A: verifiserer demo-deriveringen (buildDemoContext), IKKE stableford-
// matten — den er dekket i lib/scoring. Vi sjekker at konteksten er velformet
// og at «Deg» dukker opp/forsvinner riktig i tavla.

describe('demo seed', () => {
  it('har 4 spillere og 3 hull', () => {
    expect(DEMO_PLAYERS).toHaveLength(4);
    expect(DEMO_HOLES).toHaveLength(3);
    expect(DEMO_PLAYERS.filter((p) => p.isYou)).toHaveLength(1);
  });

  it('uten innmatede scorer: kun de 3 motstanderne har scorer, «Deg» har 0 spilte hull', () => {
    const ctx = buildDemoContext({});
    // 3 motstandere × 3 hull = 9 scorer, ingen «Deg»-scorer
    expect(ctx.scores).toHaveLength(9);
    expect(ctx.scores.some((s) => s.userId === DEMO_YOU_ID)).toBe(false);

    const result = computeLeaderboard(ctx);
    if (result.kind !== 'stableford' || result.variant !== 'solo') {
      throw new Error('forventet solo stableford-resultat');
    }
    expect(result.players).toHaveLength(4);
    const you = result.players.find((p) => p.userId === DEMO_YOU_ID);
    expect(you?.holesPlayed).toBe(0);
  });

  it('når alle «Deg»-hull tastes: du er på tavla med 3 spilte hull', () => {
    const ctx = buildDemoContext({ 1: 5, 2: 4, 3: 6 });
    const result = computeLeaderboard(ctx);
    if (result.kind !== 'stableford' || result.variant !== 'solo') {
      throw new Error('forventet solo stableford-resultat');
    }
    const you = result.players.find((p) => p.userId === DEMO_YOU_ID);
    expect(you?.holesPlayed).toBe(3);
    expect(you?.totalPoints).toBeGreaterThan(0);
  });
});

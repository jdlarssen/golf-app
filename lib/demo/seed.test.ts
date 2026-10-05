import { describe, it, expect } from 'vitest';
import { buildDemoContext, demoGrossFor, DEMO_HOLES, DEMO_PLAYERS, DEMO_YOU_ID } from './seed';
import { computeLeaderboard } from '@/lib/scoring';

// Type A: verifiserer demo-deriveringen (buildDemoContext), IKKE stableford-
// matten — den er dekket i lib/scoring. Vi sjekker at konteksten er velformet
// og at «Deg» dukker opp/forsvinner riktig i tavla.

describe('demo seed', () => {
  it('har 3 spillere og 3 hull, hull 2 har indeks 13', () => {
    expect(DEMO_PLAYERS.map((p) => p.name)).toEqual(['Deg', 'Marte', 'Jonas']);
    expect(DEMO_PLAYERS.filter((p) => p.isYou)).toHaveLength(1);
    expect(DEMO_HOLES).toHaveLength(3);
    expect(DEMO_HOLES[1]).toEqual({ number: 2, par: 3, strokeIndex: 13 });
  });

  it('uten innmatede scorer: ingen slag for noen, alle tre står på tavla med 0 hull', () => {
    const ctx = buildDemoContext({});
    expect(ctx.scores).toHaveLength(0);

    const result = computeLeaderboard(ctx);
    if (result.kind !== 'stableford' || result.variant !== 'solo') {
      throw new Error('forventet solo stableford-resultat');
    }
    expect(result.players).toHaveLength(3);
    expect(result.players.every((p) => p.holesPlayed === 0)).toBe(true);
  });

  it('ett tastet hull gir tre slag: ditt og motspillernes på samme hull (#2281)', () => {
    const ctx = buildDemoContext({ 1: 5 });
    expect(ctx.scores.map((s) => [s.userId, s.holeNumber, s.gross])).toEqual(
      expect.arrayContaining([
        [DEMO_YOU_ID, 1, 5],
        ['marte', 1, 4],
        ['jonas', 1, 6],
      ]),
    );
    expect(ctx.scores).toHaveLength(3);
  });

  it('når alle «Deg»-hull tastes: du er på tavla med 3 spilte hull', () => {
    const result = computeLeaderboard(buildDemoContext({ 1: 5, 2: 4, 3: 6 }));
    if (result.kind !== 'stableford' || result.variant !== 'solo') {
      throw new Error('forventet solo stableford-resultat');
    }
    const you = result.players.find((p) => p.userId === DEMO_YOU_ID);
    expect(you?.holesPlayed).toBe(3);
    expect(you?.totalPoints).toBeGreaterThan(0);
  });

  it('demoGrossFor gir motspillernes faste slag, og null for deg', () => {
    expect([1, 2, 3].map((h) => demoGrossFor('marte', h))).toEqual([4, 2, 6]);
    expect([1, 2, 3].map((h) => demoGrossFor('jonas', h))).toEqual([6, 3, 7]);
    expect(demoGrossFor(DEMO_YOU_ID, 1)).toBeNull();
  });
});

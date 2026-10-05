import { describe, it, expect } from 'vitest';
import { demoStanding } from './standing';

// Type A (#2281): the demo strip's place, gap and arrow. The numbers are worked
// out by hand from the seed (lib/demo/seed.ts), standard stableford:
//   strokes received — you (CH 16) 1/1/1, Marte (CH 8) 1/0/1, Jonas (CH 10) 1/0/1
//   hole 1 (par 4): Marte 4 → 3 p, Jonas 6 → 1 p, you 5 → 2 p, you 6 → 1 p
//   hole 2 (par 3): Marte 2 → 3 p, Jonas 3 → 2 p, you 2 → 4 p, you 3 → 3 p
//   hole 3 (par 5): Marte 6 → 2 p, Jonas 7 → 1 p, you 5 → 3 p
// Ranks, gaps and movement come from the live board (lib/leaderboard/liveBoard.ts),
// so these cases check that the demo feeds it the right rows.

describe('demoStanding', () => {
  it('is null before your first score', () => {
    expect(demoStanding({})).toBeNull();
  });

  it('5 on hole 1: 2nd, 1 point behind Marte, down 1 from the shared 1st', () => {
    // Marte 3, you 2, Jonas 1. Before hole 1 all three share 1st on 0.
    expect(demoStanding({ 1: 5 })).toEqual({
      rank: 2,
      tied: false,
      leaderName: 'Marte',
      gap: 1,
      movement: -1,
    });
  });

  it('5 then 2: shared 1st with Marte, up 1', () => {
    // Marte 3 + 3 = 6, you 2 + 4 = 6, Jonas 1 + 2 = 3. Before hole 2 you were 2nd.
    expect(demoStanding({ 1: 5, 2: 2 })).toEqual({
      rank: 1,
      tied: true,
      leaderName: 'Marte',
      gap: null,
      movement: 1,
    });
  });

  it('5 then 3: 2nd both times, so no movement', () => {
    // Marte 6, you 2 + 3 = 5, Jonas 3 → 2nd, 1 behind; 2nd after hole 1 too.
    expect(demoStanding({ 1: 5, 2: 3 })).toEqual({
      rank: 2,
      tied: false,
      leaderName: 'Marte',
      gap: 1,
      movement: 0,
    });
  });

  it('5, 2, 5: you lead alone', () => {
    // You 6 + 3 = 9, Marte 6 + 2 = 8, Jonas 3 + 1 = 4. Shared 1st before hole 3.
    expect(demoStanding({ 1: 5, 2: 2, 3: 5 })).toEqual({
      rank: 1,
      tied: false,
      leaderName: null,
      gap: null,
      movement: 0,
    });
  });

  it('6 on hole 1: shared 2nd with Jonas, 2 behind Marte', () => {
    // Marte 3, you 1, Jonas 1.
    expect(demoStanding({ 1: 6 })).toEqual({
      rank: 2,
      tied: true,
      leaderName: 'Marte',
      gap: 2,
      movement: -1,
    });
  });

  it('a skipped hole: the opponents count only the holes you entered', () => {
    // Holes 1 and 3: Marte 3 + 2 = 5, you 2 + 3 = 5, Jonas 1 + 1 = 2. Before
    // your latest hole (3) you were 2nd on hole 1 alone.
    expect(demoStanding({ 1: 5, 3: 5 })).toEqual({
      rank: 1,
      tied: true,
      leaderName: 'Marte',
      gap: null,
      movement: 1,
    });
  });
});

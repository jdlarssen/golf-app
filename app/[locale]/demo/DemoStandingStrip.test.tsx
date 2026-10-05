import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoStandingStrip } from './DemoStandingStrip';
import type { DemoStanding } from '@/lib/demo/standing';

// Type C — stripa i demoen (#2281): hvilken tekst hver plass-gren viser, og
// hva skjermleseren får. Plassene selv regnes i lib/demo/standing (Type A);
// her står de som faste innganger. Labels fra messages/no.json via
// vitest.setup-mocken.

const behind: DemoStanding = { rank: 2, tied: false, leaderName: 'Marte', gap: 1, movement: -1 };

describe('DemoStandingStrip', () => {
  it.each<[string, DemoStanding | null, string, string, string | null]>([
    ['uten slag', null, 'Alle står likt. Tast slaget ditt.', 'Tavla: alle står likt', null],
    [
      'bak lederen',
      behind,
      '2. plass · 1 poeng bak Marte',
      'Tavla: 2. plass, 1 poeng bak Marte, ned 1 plass siden forrige hull',
      '▼ 1',
    ],
    [
      'delt plass bak lederen',
      { ...behind, tied: true, gap: 2 },
      'Delt 2. plass · 2 poeng bak Marte',
      'Tavla: delt 2. plass, 2 poeng bak Marte, ned 1 plass siden forrige hull',
      '▼ 1',
    ],
    [
      'alene i ledelsen',
      { rank: 1, tied: false, leaderName: null, gap: null, movement: 2 },
      '1. plass · Du leder',
      'Tavla: 1. plass, du leder, opp 2 plasser siden forrige hull',
      '▲ 2',
    ],
    [
      'delt ledelse',
      { rank: 1, tied: true, leaderName: 'Marte', gap: null, movement: 0 },
      'Delt 1. plass med Marte',
      'Tavla: delt 1. plass med Marte',
      null,
    ],
  ])('%s', (_case, standing, text, label, arrow) => {
    render(<DemoStandingStrip standing={standing} open={false} onToggle={() => {}} board={null} />);
    const strip = screen.getByTestId('demo-standing');
    expect(strip).toHaveAttribute('aria-label', label);
    // The zero-width strut keeps the line height; it is not text.
    expect(strip.children[1].textContent?.replace('​', '')).toBe(text);
    const shown = screen.queryByTestId('demo-standing-arrow');
    expect(shown?.textContent ?? null).toBe(arrow);
  });
});

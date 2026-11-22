// Type B: a cup with exactly one match reads «1 av 1 kamp spilt», not «1 av 1
// kamper spilt». Runs the real catalogs through next-intl's formatter.
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import no from '@/messages/no.json';
import en from '@/messages/en.json';

type Tr = (key: string, values: Record<string, number>) => string;
const nb = createTranslator({ locale: 'no', messages: no as never }) as unknown as Tr;
const gb = createTranslator({ locale: 'en', messages: en as never }) as unknown as Tr;

describe('match counts take a plural on the total', () => {
  it('dashboard cup row (no)', () => {
    expect(nb('admin.dashboard.playerCupProgress', { played: 1, total: 1 })).toBe('1 av 1 kamp spilt');
    expect(nb('admin.dashboard.playerCupProgress', { played: 1, total: 8 })).toBe('1 av 8 kamper spilt');
  });
  it('cup page summary (no, en)', () => {
    expect(nb('cup.manage.matchesSummary', { points: 3, finished: 1, total: 1 })).toContain('1 av 1 match spilt');
    expect(nb('cup.manage.matchesSummary', { points: 3, finished: 1, total: 4 })).toContain('1 av 4 matcher spilt');
    expect(gb('cup.manage.matchesSummary', { points: 3, finished: 1, total: 1 })).toContain('1 of 1 match played');
    expect(gb('cup.manage.matchesSummary', { points: 3, finished: 1, total: 4 })).toContain('1 of 4 matches played');
  });
});

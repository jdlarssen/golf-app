import { describe, it, expect } from 'vitest';
import type { GameModeConfig } from '@/lib/scoring/modes/types';
import { embedSnippetHeight } from './embedHeight';

// Type A (#2330): the height «Kopier koden til nettsiden» asks for. The
// compact card's arithmetic is tested in snippet.test.ts.

const logo = (n: number) => ({
  category: 'placement',
  position: n,
  description: 'Premie',
  sponsor: `Sponsor ${n}`,
  sponsorLogoPath: `uid/${n}.webp`,
});

describe('embedSnippetHeight', () => {
  it('a solo stableford game gets the compact card, sized by its sponsor logos', () => {
    const game = { game_mode: 'stableford' as const, mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' } as GameModeConfig };
    expect(embedSnippetHeight({ ...game, prizes: null })).toEqual({ compact: true, height: 349 });
    expect(embedSnippetHeight({ ...game, prizes: [logo(1), logo(2)] })).toEqual({ compact: true, height: 393 });
  });

  it('a texas scramble keeps the full board at 700 px, sponsors or not', () => {
    const game = { game_mode: 'texas_scramble' as const, mode_config: { kind: 'texas_scramble', team_size: 2 } as GameModeConfig };
    expect(embedSnippetHeight({ ...game, prizes: [logo(1)] })).toEqual({ compact: false, height: 700 });
  });

  it('unreadable prizes count as no sponsors', () => {
    const game = { game_mode: 'solo_strokeplay' as const, mode_config: { kind: 'solo_strokeplay', team_size: 1 } as GameModeConfig };
    expect(embedSnippetHeight({ ...game, prizes: 'not a list' })).toEqual({ compact: true, height: 349 });
  });
});

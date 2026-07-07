/**
 * #1051 premiebord — Zod-validering + pruning (Type A) + trap #4 agreement.
 *
 * The ≤7-slott-taket lever to steder: PRIZE_MAX_SLOTS (her) og DB-CHECK-en i
 * 0136_game_prizes.sql. Agreement-testen leser migrasjonen og asserterer at de
 * er enige, så en framtidig endring av det ene uten det andre feiler høylytt
 * (speiler teeRatingDbCheck.test.ts-mønsteret).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  parsePrizes,
  safeParsePrizes,
  prunePrizes,
  PRIZE_MAX_SLOTS,
  PRIZE_DESCRIPTION_MAX,
  PRIZE_SPONSOR_MAX,
  type GamePrize,
} from './prizes';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../supabase/migrations/0136_game_prizes.sql',
);

function prize(overrides: Partial<GamePrize> = {}): GamePrize {
  return {
    category: 'placement',
    position: 1,
    description: 'Middag for to',
    sponsor: null,
    ...overrides,
  };
}

describe('games.prizes DB CHECK ↔ Zod agreement (trap #4)', () => {
  it('DB CHECK jsonb_array_length bound matches PRIZE_MAX_SLOTS', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
    const m = sql.match(/jsonb_array_length\(prizes\)\s*<=\s*(\d+)/i);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(PRIZE_MAX_SLOTS);
  });

  it('DB CHECK constrains prizes to a jsonb array', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
    expect(sql).toMatch(/jsonb_typeof\(prizes\)\s*=\s*'array'/i);
  });
});

describe('parsePrizes — valid input', () => {
  it('accepts an empty list', () => {
    expect(parsePrizes([])).toEqual([]);
  });

  it('accepts the full 7-slot board (3 placement + 2 LD + 2 CTP)', () => {
    const board: GamePrize[] = [
      prize({ category: 'placement', position: 1 }),
      prize({ category: 'placement', position: 2 }),
      prize({ category: 'placement', position: 3 }),
      prize({ category: 'longest_drive', position: 1 }),
      prize({ category: 'longest_drive', position: 2 }),
      prize({ category: 'closest_to_pin', position: 1 }),
      prize({ category: 'closest_to_pin', position: 2 }),
    ];
    expect(parsePrizes(board)).toHaveLength(7);
  });

  it('keeps a sponsor string and a null sponsor', () => {
    const parsed = parsePrizes([
      prize({ position: 1, sponsor: 'Klubbshoppen' }),
      prize({ position: 2, sponsor: null }),
    ]);
    expect(parsed[0].sponsor).toBe('Klubbshoppen');
    expect(parsed[1].sponsor).toBeNull();
  });
});

describe('parsePrizes — rejects invalid input', () => {
  it('rejects an 8th slot (over PRIZE_MAX_SLOTS)', () => {
    const eight = Array.from({ length: 8 }, (_, i) =>
      prize({ category: 'longest_drive', position: i + 1 }),
    );
    expect(() => parsePrizes(eight)).toThrow();
  });

  it('rejects a duplicate (category, position) slot', () => {
    expect(() =>
      parsePrizes([
        prize({ category: 'placement', position: 1 }),
        prize({ category: 'placement', position: 1 }),
      ]),
    ).toThrow();
  });

  it.each([
    ['placement', 4],
    ['placement', 0],
    ['longest_drive', 3],
    ['closest_to_pin', 3],
  ] as const)('rejects %s position %i (out of range)', (category, position) => {
    expect(() => parsePrizes([prize({ category, position })])).toThrow();
  });

  it('rejects an empty description', () => {
    expect(() => parsePrizes([prize({ description: '' })])).toThrow();
  });

  it('rejects a description over the max length', () => {
    expect(() =>
      parsePrizes([prize({ description: 'x'.repeat(PRIZE_DESCRIPTION_MAX + 1) })]),
    ).toThrow();
  });

  it('rejects a sponsor over the max length', () => {
    expect(() =>
      parsePrizes([prize({ sponsor: 'x'.repeat(PRIZE_SPONSOR_MAX + 1) })]),
    ).toThrow();
  });

  it('rejects an unknown category', () => {
    expect(() => parsePrizes([{ ...prize(), category: 'skins' }])).toThrow();
  });
});

describe('safeParsePrizes — defensive read path', () => {
  it('returns the parsed list for valid input', () => {
    expect(safeParsePrizes([prize({ position: 1 })])).toHaveLength(1);
  });

  it('returns [] for a malformed blob instead of throwing', () => {
    expect(safeParsePrizes('not-an-array')).toEqual([]);
    expect(safeParsePrizes([{ nonsense: true }])).toEqual([]);
    expect(safeParsePrizes(null)).toEqual([]);
  });
});

describe('prunePrizes — beskjærer til gyldige slott', () => {
  const full: GamePrize[] = [
    prize({ category: 'placement', position: 1 }),
    prize({ category: 'placement', position: 2 }),
    prize({ category: 'placement', position: 3 }),
    prize({ category: 'longest_drive', position: 1 }),
    prize({ category: 'longest_drive', position: 2 }),
    prize({ category: 'closest_to_pin', position: 1 }),
    prize({ category: 'closest_to_pin', position: 2 }),
  ];

  it('keeps everything when podium + both side-counts are active', () => {
    expect(
      prunePrizes(full, { hasPodium: true, ldCount: 2, ctpCount: 2 }),
    ).toHaveLength(7);
  });

  it('drops placement prizes when there is no podium (matchplay)', () => {
    const pruned = prunePrizes(full, {
      hasPodium: false,
      ldCount: 2,
      ctpCount: 2,
    });
    expect(pruned.every((p) => p.category !== 'placement')).toBe(true);
    expect(pruned).toHaveLength(4);
  });

  it('drops LD/CTP slots above the active counts', () => {
    const pruned = prunePrizes(full, {
      hasPodium: true,
      ldCount: 1,
      ctpCount: 0,
    });
    // 3 placement + LD1 only, no CTP
    expect(pruned).toHaveLength(4);
    expect(pruned.filter((p) => p.category === 'longest_drive')).toHaveLength(1);
    expect(pruned.filter((p) => p.category === 'closest_to_pin')).toHaveLength(0);
  });

  it('empties the board when nothing is active', () => {
    expect(
      prunePrizes(full, { hasPodium: false, ldCount: 0, ctpCount: 0 }),
    ).toEqual([]);
  });
});

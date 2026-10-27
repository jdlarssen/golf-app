import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  JOIN_CODE_RE,
  isJoinCode,
  newJoinCode,
  writeWithFreshJoinCode,
} from './joinCode';

/**
 * Type A for the code in a league's shareable link (#2662), plus the trap #4
 * agreement test: the TS shape and the DB CHECK in 0221 are the same rule.
 */

describe('newJoinCode', () => {
  it('draws 8 characters from [0-9a-z]', () => {
    for (let i = 0; i < 200; i++) {
      expect(newJoinCode()).toMatch(/^[0-9a-z]{8}$/);
    }
  });

  it('skips bytes past the last full alphabet run, so no character is favoured', () => {
    // 252 = 7 × 36: bytes 252–255 would wrap onto 0–3 and are drawn again.
    const bytes = [255, 252, 0, 1, 35, 36, 71, 251, 253, 10, 20];
    const fill = vi.fn((buf: Uint8Array) => {
      for (let i = 0; i < buf.length; i++) buf[i] = bytes.shift() ?? 0;
      return buf;
    });
    // Kept: 0 1 35 36 71 251 10 20 → 0 1 z 0 z z a k.
    expect(newJoinCode(fill)).toBe('01z0zzak');
  });
});

describe('isJoinCode', () => {
  it.each([
    ['abcd2345', true],
    ['00000000', true],
    ['ABCD2345', false],
    ['abcd234', false],
    ['abcd23456', false],
    ['abcd-234', false],
    ['', false],
  ])('%j → %s', (code, ok) => {
    expect(isJoinCode(code)).toBe(ok);
  });
});

describe('writeWithFreshJoinCode', () => {
  it('writes once when the first code is free', async () => {
    const write = vi.fn(async (_code: string) => ({ error: null }));
    expect(await writeWithFreshJoinCode(write)).toEqual({ error: null });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('draws one new code after a unique violation (23505)', async () => {
    const write = vi
      .fn<(code: string) => Promise<{ error: { code: string } | null }>>()
      .mockResolvedValueOnce({ error: { code: '23505' } })
      .mockResolvedValueOnce({ error: null });
    expect(await writeWithFreshJoinCode(write)).toEqual({ error: null });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][0]).not.toBe(write.mock.calls[1][0]);
  });

  it('gives up after the second try and returns its error', async () => {
    const write = vi.fn(async (_code: string) => ({ error: { code: '23505' } }));
    expect(await writeWithFreshJoinCode(write)).toEqual({ error: { code: '23505' } });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('does not retry any other error', async () => {
    const write = vi.fn(async (_code: string) => ({ error: { code: '42501' } }));
    expect(await writeWithFreshJoinCode(write)).toEqual({ error: { code: '42501' } });
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('JOIN_CODE_RE ↔ leagues_join_code_format (0221)', () => {
  it('the migration CHECKs the same pattern', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/0221_league_join_code.sql'),
      'utf-8',
    );
    const m = sql.match(/leagues_join_code_format\s+check\s*\(join_code is null or join_code ~ '([^']+)'\)/i);
    expect(m?.[1]).toBe(JOIN_CODE_RE.source);
  });
});

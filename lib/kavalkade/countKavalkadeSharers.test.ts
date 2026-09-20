import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Delt-av-tallet (#2131). To regler er verdt å holde vakt over:
 *
 *   - tallet er DISTINKTE spillere, ikke antall delinger
 *   - Jørgen holdes utenfor på `users.is_admin`, ikke på en hardkodet uuid
 *
 * Selve ekskluderingen skjer i SQL, så testen ser på filteret spørringen
 * sender — og på at gjentatte delinger fra samme spiller bare teller én gang.
 */

type Row = { user_id: string };

const filters: Record<string, unknown> = {};
let selected = '';
let table = '';
let rows: Row[] = [];
let pageError: { message: string } | null = null;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (t: string) => {
      table = t;
      const builder = {
        select: (columns: string) => {
          selected = columns;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        order: () => builder,
        range: () => builder,
        returns: () => Promise.resolve({ data: rows, error: pageError }),
      };
      return builder;
    },
  }),
}));

import { countKavalkadeSharers } from './countKavalkadeSharers';

const share = (userId: string): Row => ({ user_id: userId });

beforeEach(() => {
  for (const key of Object.keys(filters)) delete filters[key];
  selected = '';
  table = '';
  rows = [];
  pageError = null;
});

describe('countKavalkadeSharers', () => {
  it('teller distinkte spillere, ikke delinger', async () => {
    rows = [share('a'), share('a'), share('a'), share('b')];
    await expect(countKavalkadeSharers()).resolves.toBe(2);
  });

  it('svarer 0 når ingen har delt', async () => {
    await expect(countKavalkadeSharers()).resolves.toBe(0);
  });

  it('spør kavalkade_shares og holder admin utenfor i SQL', async () => {
    await countKavalkadeSharers();
    expect(table).toBe('kavalkade_shares');
    expect(selected).toContain('users!inner(is_admin)');
    expect(filters['users.is_admin']).toBe(false);
  });

  // En stille feil ville vist «0 delinger» og sett ut som at ingen hadde delt.
  it('kaster når lesingen feiler, i stedet for å svare 0', async () => {
    pageError = { message: 'boom' };
    await expect(countKavalkadeSharers()).rejects.toThrow(/kavalkade delinger/);
  });
});

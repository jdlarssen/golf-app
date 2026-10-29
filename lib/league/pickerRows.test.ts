import { describe, it, expect } from 'vitest';
import { pickerRows, PICKER_VISIBLE_ROWS } from './pickerRows';

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, name: `Spiller ${i}` }));
const nameOf = (p: { name: string }) => p.name;

describe('pickerRows (#2666)', () => {
  it('shows every row when the league is small, and offers no «Vis alle»', () => {
    const r = pickerRows(people(PICKER_VISIBLE_ROWS), { query: '', showAll: false, nameOf });
    expect([r.rows.length, r.total, r.canExpand]).toEqual([PICKER_VISIBLE_ROWS, PICKER_VISIBLE_ROWS, false]);
  });

  it('caps a long list at six rows and keeps a ticked player further down', () => {
    const r = pickerRows(people(9), { query: '', showAll: false, nameOf, keepIds: new Set(['u8']) });
    expect(r.rows.map((p) => p.userId)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u8']);
    expect([r.total, r.canExpand]).toEqual([9, true]);
  });

  it('«Vis alle» lists everyone', () => {
    const r = pickerRows(people(9), { query: '', showAll: true, nameOf });
    expect(r.rows).toHaveLength(9);
  });

  it('a search lists every match, ignores case and spaces around it, and ignores the cap', () => {
    const r = pickerRows(people(12), { query: '  spiller 1 ', showAll: false, nameOf });
    expect(r.rows.map((p) => p.name)).toEqual(['Spiller 1', 'Spiller 10', 'Spiller 11']);
    expect([r.searching, r.canExpand]).toEqual([true, false]);
  });

  it('a search without a match gives no rows', () => {
    const r = pickerRows(people(9), { query: 'zzz', showAll: false, nameOf });
    expect([r.rows.length, r.total]).toEqual([0, 0]);
  });
});

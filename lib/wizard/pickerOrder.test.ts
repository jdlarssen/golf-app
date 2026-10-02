import { describe, it, expect } from 'vitest';
import {
  PICKER_STATS_CHUNK,
  chunkIds,
  orderPickerPlayers,
  pickerStatsIds,
} from './pickerOrder';

type P = { id: string; name: string | null };

const p = (id: string, name: string | null = id): P => ({ id, name });

// Offsets from now, never absolute dates (time rule, T5).
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function stats(entries: Record<string, string | null>) {
  return new Map(Object.entries(entries).map(([id, lastPlayedAt]) => [id, { lastPlayedAt }]));
}

const ids = (rows: P[]) => rows.map((r) => r.id);

describe('orderPickerPlayers', () => {
  it('puts you first, then the latest shared round first', () => {
    const players = [p('anna'), p('self'), p('bjorn'), p('cato')];
    const out = orderPickerPlayers(players, stats({ anna: daysAgo(30), cato: daysAgo(2) }), 'self');
    expect(ids(out)).toEqual(['self', 'cato', 'anna', 'bjorn']);
  });

  it('breaks a tie on name in Norwegian order', () => {
    const when = daysAgo(5);
    const players = [p('z', 'Øystein'), p('y', 'Åse'), p('x', 'Ola')];
    const out = orderPickerPlayers(players, stats({ x: when, y: when, z: when }), 'self');
    // nb: … O < Ø < Å
    expect(ids(out)).toEqual(['x', 'z', 'y']);
  });

  it('puts players without rounds after those with rounds, by name', () => {
    const players = [p('d', 'Dag'), p('b', 'Bodil'), p('a', 'Arne')];
    const out = orderPickerPlayers(players, stats({ d: daysAgo(1) }), 'self');
    expect(ids(out)).toEqual(['d', 'a', 'b']);
  });

  it('puts players without a name last, in their old order', () => {
    const players = [p('pending-2', null), p('ane', 'Ane'), p('pending-1', null), p('self', 'Meg')];
    const out = orderPickerPlayers(players, stats({ 'pending-2': daysAgo(1) }), 'self');
    expect(ids(out)).toEqual(['self', 'ane', 'pending-2', 'pending-1']);
  });

  it('handles an empty list and a missing self', () => {
    expect(orderPickerPlayers([], new Map(), 'self')).toEqual([]);
    expect(ids(orderPickerPlayers([p('b'), p('a')], new Map(), 'self'))).toEqual(['a', 'b']);
  });
});

describe('pickerStatsIds', () => {
  it('is the union of friends and every club member, without you and without duplicates', () => {
    const out = pickerStatsIds({
      friendPlayerIds: ['f1', 'f2', 'self'],
      clubMemberIdsByClub: { c1: ['self', 'm1', 'f1'], c2: ['m2', 'm1'] },
      selfId: 'self',
    });
    expect([...out].sort()).toEqual(['f1', 'f2', 'm1', 'm2']);
  });

  it('is empty without friends or clubs', () => {
    expect(pickerStatsIds({ friendPlayerIds: [], clubMemberIdsByClub: {}, selfId: 'self' })).toEqual([]);
  });
});

describe('chunkIds', () => {
  it('never makes a chunk over 100', () => {
    const many = Array.from({ length: 250 }, (_, i) => `u${i}`);
    const chunks = chunkIds(many, PICKER_STATS_CHUNK);
    expect(PICKER_STATS_CHUNK).toBe(100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(many);
  });

  it('gives no chunks for no ids, and one for a few', () => {
    expect(chunkIds([], 100)).toEqual([]);
    expect(chunkIds(['a', 'b'], 100)).toEqual([['a', 'b']]);
  });
});

import { describe, expect, it } from 'vitest';
import { onlyStandaloneGames } from './arrangedGames';

// A fake PostgREST builder that records `is()` calls — the filter is pure
// query composition, so no Supabase mock is needed.
function fakeBuilder() {
  const calls: Array<[string, boolean | null]> = [];
  const builder = {
    calls,
    is(column: string, value: boolean | null) {
      calls.push([column, value]);
      return builder;
    },
  };
  return builder;
}

describe('onlyStandaloneGames', () => {
  it('drops cup matches and league flights, and hands the builder back', () => {
    const builder = fakeBuilder();
    expect(onlyStandaloneGames(builder)).toBe(builder);
    expect(builder.calls).toEqual([
      ['tournament_id', null],
      ['league_round_id', null],
    ]);
  });
});

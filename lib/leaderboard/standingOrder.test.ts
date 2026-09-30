import { describe, expect, it } from 'vitest';
import { byStanding, inStandingOrder } from './standingOrder';

// #2255: rekkefølgen «Hull for hull» deler på tvers av formatene.
describe('inStandingOrder', () => {
  it('plassen først, så userId ved delt plass, uansett rekkefølgen inn', () => {
    const lines = [
      { userId: 'per', rank: 2 },
      { userId: 'kari', rank: 1 },
      { userId: 'ola', rank: 2 },
    ];
    expect(inStandingOrder(lines).map((l) => l.userId)).toEqual(['kari', 'ola', 'per']);
    expect(inStandingOrder([...lines].reverse()).map((l) => l.userId)).toEqual(['kari', 'ola', 'per']);
  });
});

describe('byStanding', () => {
  it('den som står høyere i stillingen først; ukjente sist', () => {
    const cmp = byStanding(['kari', 'ola']);
    const rows = [{ userId: 'ukjent' }, { userId: 'ola' }, { userId: 'kari' }];
    expect([...rows].sort(cmp).map((r) => r.userId)).toEqual(['kari', 'ola', 'ukjent']);
  });
});

describe('inStandingOrder med lagnummer (Wolf: rotasjonsplassen)', () => {
  it('delt plass ordnes etter lagnummer før userId', () => {
    const lines = [
      { userId: 'a', rank: 1, teamNumber: 3 },
      { userId: 'b', rank: 1, teamNumber: 1 },
      { userId: 'c', rank: 1, teamNumber: 2 },
    ];
    expect(inStandingOrder(lines).map((l) => l.userId)).toEqual(['b', 'c', 'a']);
  });
});


import { describe, it, expect } from 'vitest';
import { pickTeamCaptain } from './teamCaptain';

describe('pickTeamCaptain', () => {
  it('returnerer lex-min userId fra liste', () => {
    expect(pickTeamCaptain(['b', 'a', 'c'])).toBe('a');
  });

  it('er stabil uavhengig av input-rekkefølge', () => {
    const a = pickTeamCaptain(['uuid-z', 'uuid-a', 'uuid-m']);
    const b = pickTeamCaptain(['uuid-a', 'uuid-z', 'uuid-m']);
    const c = pickTeamCaptain(['uuid-m', 'uuid-z', 'uuid-a']);
    expect(a).toBe('uuid-a');
    expect(b).toBe('uuid-a');
    expect(c).toBe('uuid-a');
  });

  it('returnerer eneste medlem for 1-mannslag', () => {
    expect(pickTeamCaptain(['solo'])).toBe('solo');
  });

  it('kaster på tom liste', () => {
    expect(() => pickTeamCaptain([])).toThrow('pickTeamCaptain: empty team');
  });

  it('lex-sammenligner UUIDer korrekt', () => {
    expect(
      pickTeamCaptain([
        '00000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '00000000-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '00000000-1111-1111-1111-111111111111',
      ]),
    ).toBe('00000000-1111-1111-1111-111111111111');
  });
});

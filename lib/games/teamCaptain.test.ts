import { describe, it, expect } from 'vitest';
import {
  formerTeamRowOwnerIds,
  pickTeamCaptain,
  teamScoreOwnerId,
} from './teamCaptain';

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

function member(user_id: string, withdrawn_at: string | null = null) {
  return { user_id, withdrawn_at };
}

describe('teamScoreOwnerId (#1538)', () => {
  it('returnerer lex-min user_id blant lagets medlemmer', () => {
    expect(teamScoreOwnerId([member('b'), member('a'), member('c')])).toBe('a');
  });

  it('er stabil uavhengig av rekkefølge i rosteret', () => {
    expect(teamScoreOwnerId([member('uuid-z'), member('uuid-a')])).toBe('uuid-a');
    expect(teamScoreOwnerId([member('uuid-a'), member('uuid-z')])).toBe('uuid-a');
  });

  it('hopper over withdrawn medlemmer — de eier ikke lagets rader lenger', () => {
    expect(
      teamScoreOwnerId([
        member('a', '2026-08-14T10:00:00Z'),
        member('b'),
        member('c'),
      ]),
    ).toBe('b');
  });

  it('returnerer null når laget er tomt (kaster ikke, jf. pickTeamCaptain)', () => {
    expect(teamScoreOwnerId([])).toBeNull();
  });

  it('returnerer null når alle medlemmer har trukket seg', () => {
    expect(
      teamScoreOwnerId([
        member('a', '2026-08-14T10:00:00Z'),
        member('b', '2026-08-14T11:00:00Z'),
      ]),
    ).toBeNull();
  });

  it('returnerer eneste aktive medlem for 1-mannslag', () => {
    expect(teamScoreOwnerId([member('solo')])).toBe('solo');
  });

  it('er enig med pickTeamCaptain når ingen har trukket seg', () => {
    const ids = ['uuid-m', 'uuid-z', 'uuid-a'];
    expect(teamScoreOwnerId(ids.map((id) => member(id)))).toBe(pickTeamCaptain(ids));
  });
});

// #2067 — radene til et trukket medlem som eide lagets rad, skal fortsatt
// leses. Eierskapet går til neste lex-min aktive medlem, så den SISTE eieren
// blant de trukne er den lex-største: den kommer først.
describe('formerTeamRowOwnerIds (#2067)', () => {
  it('gir tom liste når ingen har trukket seg', () => {
    expect(formerTeamRowOwnerIds([member('a'), member('b')])).toStrictEqual([]);
  });

  it('gir den trukne kapteinen', () => {
    expect(
      formerTeamRowOwnerIds([member('b'), member('a', '2026-09-17T10:00:00Z')]),
    ).toStrictEqual(['a']);
  });

  it('sorterer de trukne lex-synkende, siste eier først', () => {
    expect(
      formerTeamRowOwnerIds([
        member('a', '2026-09-17T10:00:00Z'),
        member('c'),
        member('b', '2026-09-17T11:00:00Z'),
      ]),
    ).toStrictEqual(['b', 'a']);
  });

  it('gir alle medlemmer når hele laget har trukket seg', () => {
    expect(
      formerTeamRowOwnerIds([
        member('a', '2026-09-17T10:00:00Z'),
        member('b', '2026-09-17T11:00:00Z'),
      ]),
    ).toStrictEqual(['b', 'a']);
  });

  it('gir tom liste for et tomt lag', () => {
    expect(formerTeamRowOwnerIds([])).toStrictEqual([]);
  });
});

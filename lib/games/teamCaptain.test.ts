import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '@/lib/leaderboard';
import { compute as computeScramble } from '@/lib/scoring/modes/texasScramble';
import {
  formerTeamRowOwnerIds,
  pickTeamCaptain,
  teamScoreOwnerId,
  withCaptainFirst,
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

describe('withCaptainFirst (#2625)', () => {
  it('puts each team\'s captain first and keeps the rest in their order', () => {
    const players = [
      { userId: 'z1', teamNumber: 1 },
      { userId: 'm2', teamNumber: 2 },
      { userId: 'a1', teamNumber: 1 },
      { userId: 'b2', teamNumber: 2 },
      { userId: 'q1', teamNumber: 1 },
    ];
    expect(withCaptainFirst(players).map((p) => p.userId)).toEqual(['a1', 'b2', 'z1', 'm2', 'q1']);
  });

  it('a scramble team with mixed tees reads the captain\'s par in the brutto reveal, like the engine', () => {
    // Hole 1 is par 4 from the men's tee and par 5 from the ladies'. The
    // captain (lex-min, «a1») plays from the ladies' tee and holds the team's
    // score: 4 on hole 1 is −1 against her par. The roster lists the man first.
    const holes = [{ holeNumber: 1, par: 4, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1 }];
    const roster = [
      { userId: 'z1', name: 'Z', nickname: null, teamNumber: 1, courseHandicap: 0, teeGender: 'mens' as const },
      { userId: 'a1', name: 'A', nickname: null, teamNumber: 1, courseHandicap: 0, teeGender: 'ladies' as const },
    ];
    const scores = [{ userId: 'a1', holeNumber: 1, strokes: 4 }];
    const engine = computeScramble({
      game: {
        id: 'g',
        game_mode: 'texas_scramble',
        mode_config: { kind: 'texas_scramble', team_size: 2, teams_count: 1, team_handicap_pct: 0, ranking: 'net_to_par' },
      },
      players: roster.map((p) => ({ userId: p.userId, teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: p.teeGender })),
      holes: holes.map((h) => ({ number: h.holeNumber, par: h.par, parByGender: h.parByGender, strokeIndex: h.strokeIndex })),
      scores: scores.map((s) => ({ userId: s.userId, holeNumber: s.holeNumber, gross: s.strokes })),
    });
    const reveal = computeLeaderboard({
      mode: 'brutto',
      players: withCaptainFirst(roster),
      holes,
      scores,
      ranking: 'net_to_par',
    });

    expect(engine.teams[0].toPar).toBe(-1);
    expect(reveal[0].toPar).toBe(engine.teams[0].toPar);
  });
});

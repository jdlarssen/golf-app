// #1954 A3: hvem som står under «Trukne spillere» på tavla, og når. Webbens
// regel per visning (`leaderboard/formats/stableford.tsx`, `soloStrokeplay.tsx`
// og best ball i `leaderboardContent.tsx`): stableford-familien og slagspill
// viser lista på alle stier — live, blind (brutto) og før noen har ført et
// slag; best ball bare på den ferdige tavla, aldri på front 9-tavla mens runden
// går. Spillere uten lesbar profil (`users` er null) vises ikke, som på webben.
import { withdrawnOnBoard } from './withdrawnBoard';

type P = { userId: string; name: string | null; withdrawnAt: string | null; hasProfile?: boolean };
const player = (userId: string, name: string | null, withdrawnAt: string | null, hasProfile?: boolean): P => ({
  userId,
  name,
  withdrawnAt,
  ...(hasProfile === undefined ? {} : { hasProfile }),
});

const players = [
  player('a', 'Ada Andersen', null),
  player('b', 'Bo Berg', '2026-10-18T10:00:00Z'),
  player('c', null, '2026-10-18T11:00:00Z'),
];

describe('withdrawnOnBoard', () => {
  it('stableford-familien og slagspill: lista på alle stier, også mens runden går', () => {
    for (const gameMode of ['stableford', 'modified_stableford', 'solo_strokeplay']) {
      for (const status of ['active', 'finished']) {
        expect(withdrawnOnBoard({ gameMode, status }, players)).toEqual([
          { userId: 'b', name: 'Bo Berg' },
          { userId: 'c', name: '(ukjent)' },
        ]);
      }
    }
  });

  it('best ball: bare på den ferdige tavla, ikke på front 9 mens runden går', () => {
    expect(withdrawnOnBoard({ gameMode: 'best_ball', status: 'active' }, players)).toEqual([]);
    expect(withdrawnOnBoard({ gameMode: 'best_ball', status: 'finished' }, players)).toHaveLength(2);
  });

  it('gir ingen liste i et format uten frafall', () => {
    expect(withdrawnOnBoard({ gameMode: 'singles_matchplay', status: 'finished' }, players)).toEqual([]);
    expect(withdrawnOnBoard({ gameMode: 'wolf', status: 'active' }, players)).toEqual([]);
  });

  it('viser ikke en trukket spiller uten lesbar profil, som webben (users er null)', () => {
    const withGhost = [...players, player('d', null, '2026-10-18T12:00:00Z', false)];
    expect(withdrawnOnBoard({ gameMode: 'stableford', status: 'active' }, withGhost).map((p) => p.userId)).toEqual([
      'b',
      'c',
    ]);
  });

  it('gir en tom liste når ingen er trukket', () => {
    expect(withdrawnOnBoard({ gameMode: 'stableford', status: 'active' }, [player('a', 'Ada', null)])).toEqual([]);
  });
});

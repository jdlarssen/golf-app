// #1954 A3: hvem som står under «Trukne spillere» på tavla. Webbens regel
// (`leaderboard/formats/stableford.tsx`, `soloStrokeplay.tsx` og best ball):
// formatene som kjenner frafall, spillerne med `withdrawn_at`, i rosterens
// rekkefølge, med fullt navn.
import { withdrawnOnBoard } from './withdrawnBoard';

const player = (userId: string, name: string | null, withdrawnAt: string | null) => ({
  userId,
  name,
  withdrawnAt,
});

describe('withdrawnOnBoard', () => {
  const players = [
    player('a', 'Ada Andersen', null),
    player('b', 'Bo Berg', '2026-10-18T10:00:00Z'),
    player('c', null, '2026-10-18T11:00:00Z'),
  ];

  it('lister de trukne i et format med frafall, med navnet fra profilen', () => {
    expect(withdrawnOnBoard('stableford', players)).toEqual([
      { userId: 'b', name: 'Bo Berg' },
      { userId: 'c', name: '(ukjent)' },
    ]);
    expect(withdrawnOnBoard('best_ball', players)).toHaveLength(2);
  });

  it('gir ingen liste i et format uten frafall', () => {
    expect(withdrawnOnBoard('singles_matchplay', players)).toEqual([]);
    expect(withdrawnOnBoard('wolf', players)).toEqual([]);
  });

  it('gir en tom liste når ingen er trukket', () => {
    expect(withdrawnOnBoard('stableford', [player('a', 'Ada', null)])).toEqual([]);
  });
});

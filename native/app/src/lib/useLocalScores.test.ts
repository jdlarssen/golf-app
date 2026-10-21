// native/app/src/lib/useLocalScores.test.ts
// Gjennomgangen av #2622 (søsken av #1954 D2 punkt 8): et varseltrykk kan gi
// samme skjerm en ny gameId. Slagene fra forrige spill skal ikke stå under det
// nye spillets id mens SQLite leses, og en sen lesing av forrige spill skal
// ikke vises.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikken heises over importene */
import { act, renderHook } from '@testing-library/react-native';
import { useLocalScores } from './useGameData';

jest.mock('../supabase', () => require('../test/supabaseMock'));

jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(),
}));

const { listScoresForGame } = require('../data/db') as { listScoresForGame: jest.Mock };

const G1_ROWS = [{ id: 'g1:me:1', gameId: 'g1', userId: 'me', holeNumber: 1, strokes: 4 }];
const G2_ROWS = [{ id: 'g2:me:1', gameId: 'g2', userId: 'me', holeNumber: 1, strokes: 5 }];

beforeEach(() => {
  listScoresForGame.mockReset();
});

it('viser ikke forrige spills slag mens det nye leses, og en sen lesing av forrige vises ikke', async () => {
  listScoresForGame.mockResolvedValueOnce(G1_ROWS);
  const { result, rerender } = await renderHook(({ id }: { id: string }) => useLocalScores(id), {
    initialProps: { id: 'g1' },
  });
  expect(result.current.scores).toEqual(G1_ROWS);
  expect(result.current.loaded).toBe(true);

  let landG2!: (rows: unknown[]) => void;
  listScoresForGame.mockReturnValueOnce(
    new Promise((resolve) => {
      landG2 = resolve;
    }),
  );
  await rerender({ id: 'g2' });
  expect(result.current.scores).toEqual([]);
  expect(result.current.loaded).toBe(false);

  await act(async () => {
    landG2(G2_ROWS);
  });
  expect(result.current.scores).toEqual(G2_ROWS);
  expect(result.current.loaded).toBe(true);
});

it('en reload av forrige spill som lander etter byttet, vises ikke', async () => {
  listScoresForGame.mockResolvedValueOnce(G1_ROWS);
  const { result, rerender } = await renderHook(({ id }: { id: string }) => useLocalScores(id), {
    initialProps: { id: 'g1' },
  });

  // En reload av g1 (pollen eller en skriving) står ute idet skjermen bytter.
  let landG1!: (rows: unknown[]) => void;
  listScoresForGame.mockReturnValueOnce(
    new Promise((resolve) => {
      landG1 = resolve;
    }),
  );
  let reloading!: Promise<void>;
  await act(async () => {
    reloading = result.current.reload();
  });
  listScoresForGame.mockReturnValueOnce(new Promise(() => {})); // g2 leses fortsatt
  await rerender({ id: 'g2' });

  await act(async () => {
    landG1(G1_ROWS);
    await reloading;
  });
  expect(result.current.scores).toEqual([]);
  expect(result.current.loaded).toBe(false);
});

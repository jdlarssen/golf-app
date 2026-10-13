// #2228: den ene testen for feilgrensen (Type C).
//
// Den dekker to koblinger på én gang: at grensen fanger en feil under render
// og viser en norsk skjerm med «Prøv igjen», og at en førstelesing fra SQLite
// som feiler, havner der i stedet for å gi et tomt kort uten feiltekst.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useLocalScores } from '../lib/useGameData';
import { ErrorBoundary } from './ErrorBoundary';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(async () => []),
}));

function Scores() {
  const { loaded } = useLocalScores('game-1');
  return <Text testID="scores">{loaded ? 'lest' : 'leser'}</Text>;
}

describe('ErrorBoundary', () => {
  it('viser feilskjermen når førstelesingen feiler, og «Prøv igjen» leser på nytt', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getDb } = require('../data/db') as { getDb: jest.Mock };
    getDb.mockRejectedValueOnce(new Error('SQLITE_CANTOPEN'));

    await render(
      <ErrorBoundary variant="game">
        <Scores />
      </ErrorBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-boundary')).toBeTruthy();
    });
    // Spillskjermene (#2228, designlerretet) får linja om at slagene er trygge.
    expect(screen.getByTestId('error-boundary-game-note')).toBeTruthy();
    expect(logged).toHaveBeenCalledWith(
      '[ErrorBoundary]',
      expect.any(Error),
      expect.anything(),
    );

    await fireEvent.press(screen.getByTestId('error-boundary-retry'));
    await waitFor(() => {
      expect(screen.getByTestId('scores')).toHaveTextContent('lest');
    });
    expect(screen.queryByTestId('error-boundary')).toBeNull();
    logged.mockRestore();
  });
});

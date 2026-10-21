// native/app/src/components/GameLoadFailed.test.tsx
// #1954 D2: blokka alle spillskjermene viser når spillet ikke kom. To utfall
// som krever hver sin ting av spilleren: nettet (prøv igjen) og et spill som er
// borte (slettet, eller du er ikke med). Det siste skal ikke be om «Prøv igjen».
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GameLoadFailed } from './GameLoadFailed';

describe('GameLoadFailed', () => {
  it('nettet: setningen og «Prøv igjen», som henter på nytt', async () => {
    const onRetry = jest.fn();
    await render(<GameLoadFailed onRetry={onRetry} />);
    expect(screen.getByTestId('game-error')).toHaveTextContent('Fikk ikke tak i spillet. Sjekk nettet og prøv igjen.');
    await fireEvent.press(screen.getByTestId('game-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('spillet er borte: sier det, uten «Prøv igjen»', async () => {
    await render(<GameLoadFailed notFound onRetry={jest.fn()} />);
    expect(screen.getByTestId('game-not-found')).toHaveTextContent(
      'Fant ikke spillet. Det kan ha blitt slettet, eller du er ikke med i det.',
    );
    expect(screen.queryByTestId('game-retry')).toBeNull();
  });
});

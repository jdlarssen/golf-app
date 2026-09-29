// #2252: den ene render-testen (Type C) for toppen av hullsiden. Den sjekker
// at hullnummeret får størrelsen fra temaet (sollys endrer den der), og at
// pokalen går til resultatene.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { themeFor } from '../../theme';
import { HoleHero } from './HoleHero';

describe('HoleHero', () => {
  it('viser hullet med temaets størrelse, par og indeks, og pokalen går til resultatene', async () => {
    const onLeaderboard = jest.fn();
    await render(
      <HoleHero
        holeNumber={7}
        totalHoles={18}
        par={4}
        strokeIndex={11}
        puttsToggle={<Text testID="putts-slot">Registrer putter</Text>}
        onLeaderboard={onLeaderboard}
      />,
    );

    expect(screen.getByTestId('hole-hero-number')).toHaveStyle({
      fontSize: themeFor('light').hole.numberSize,
    });
    expect(screen.getByTestId('hole-hero-number').props.children).toBe(7);
    expect(screen.getByTestId('hole-hero-par').props.children).toBe('Par 4');
    expect(screen.getByTestId('hole-hero-index').props.children).toBe('indeks 11');
    expect(screen.getByTestId('putts-slot')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Vis resultatene'));
    expect(onLeaderboard).toHaveBeenCalledTimes(1);
  });
});

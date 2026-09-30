// #2252: den ene render-testen (Type C) for toppen av hullsiden. Den sjekker
// at hullnummeret får størrelsen fra temaet (sollys endrer den der), og at par
// og indeks står som i designet (#2385), med «av 18» bare utenfor sollys.
import { render, screen } from '@testing-library/react-native';
import { themeFor } from '../../theme';
import { HoleHero } from './HoleHero';

describe('HoleHero', () => {
  it('viser hullet med temaets størrelse, par og indeks, og dropper «av 18» i sollys', async () => {
    const { rerender } = await render(
      <HoleHero holeNumber={7} totalHoles={18} par={4} strokeIndex={11} />,
    );

    expect(screen.getByTestId('hole-hero-number')).toHaveStyle({
      fontSize: themeFor('light').hole.numberSize,
    });
    expect(screen.getByTestId('hole-hero-number').props.children).toBe(7);
    expect(screen.getByTestId('hole-hero-par').props.children).toBe('Par 4');
    expect(screen.getByTestId('hole-hero-index').props.children).toBe('Indeks 11');
    expect(screen.getByText('av 18')).toBeTruthy();

    await rerender(<HoleHero holeNumber={7} totalHoles={18} par={4} strokeIndex={11} sunlight />);
    expect(screen.queryByText('av 18')).toBeNull();
  });
});

// ScoreShape (Type C): formen er den delte `scoreShape`. Her låses fargen:
// blekk på scorekortet, scoretonen i «Hull for hull» som på webben (#2255).
import { render, screen } from '@testing-library/react-native';
import { PALETTES } from '../../theme';
import { ScoreShape } from './ScoreShape';

it('scorekortet: ringene i blekk', async () => {
  await render(<ScoreShape strokes={5} par={3} />);
  expect(screen.getByTestId('shape-double-square').children[0]).toHaveStyle({
    borderColor: PALETTES.light.text,
  });
});

it.each<[string, number, string]>([
  ['birdie', 3, PALETTES.light.scoreUnderFg],
  ['bogey', 5, PALETTES.light.scoreOver1Fg],
  ['dobbel bogey', 6, PALETTES.light.scoreOver2Fg],
])('«Hull for hull»: %s får webbens tone', async (_case, strokes, color) => {
  await render(<ScoreShape strokes={strokes} par={4} toned />);
  const box = screen.getByTestId(/^shape-/);
  expect(box.children[0]).toHaveStyle({ borderColor: color });
});

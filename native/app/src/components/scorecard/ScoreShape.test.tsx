// ScoreShape (Type C): formen er den delte `scoreShape`. Her låses fargen:
// blekk uten `toned`, scoretonen på ringene i «Hull for hull» som på webben
// (#2255), og på tallet også på scorekortet (#2385, designlerretet).
import { render, screen } from '@testing-library/react-native';
import { PALETTES } from '../../theme';
import { ScoreShape } from './ScoreShape';

it('uten tone: ringene og tallet i blekk', async () => {
  await render(<ScoreShape strokes={5} par={3} />);
  expect(screen.getByTestId('shape-double-square').children[0]).toHaveStyle({
    borderColor: PALETTES.light.text,
  });
  expect(screen.getByTestId('score-shape-number')).toHaveStyle({ color: PALETTES.light.text });
});

it('scorekortet: tallet i tonen også, og par i blekk uten form', async () => {
  const { rerender } = await render(<ScoreShape strokes={5} par={4} toned tonedNumber />);
  expect(screen.getByTestId('score-shape-number')).toHaveStyle({ color: PALETTES.light.scoreOver1Fg });
  await rerender(<ScoreShape strokes={4} par={4} toned tonedNumber />);
  expect(screen.getByTestId('shape-none')).toBeTruthy();
  expect(screen.getByTestId('score-shape-number')).toHaveStyle({ color: PALETTES.light.text });
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

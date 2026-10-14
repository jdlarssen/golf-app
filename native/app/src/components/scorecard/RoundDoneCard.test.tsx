// RoundDoneCard (Type C, #2299): kortet tegner modellen fra `buildRoundDoneModel`
// og regner ingenting selv. Her låses seksjonene og at raden for den som
// mangler et hull, åpner hullet. Tallene og tekstene er låst i
// `roundDone.test.ts` og `lib/scorecard/roundSummary.test.ts`.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { RoundDoneModel } from '../../lib/roundDone';
import { RoundDoneCard } from './RoundDoneCard';

const MODEL: RoundDoneModel = {
  greetingName: 'Sigrid',
  headline: { kind: 'points', value: 38 },
  birdies: 2,
  standing: { rank: 3, tied: false },
  best: { holeNumber: 7, strokes: 2, par: 3, term: 'birdie', holeInOne: false },
  worst: { holeNumber: 13, strokes: 7, par: 4, term: 'tripleBogey', holeInOne: false },
  flight: [
    { kind: 'complete', names: 'Marte og Tore' },
    { kind: 'missing', userId: 'jonas', name: 'Jonas', holes: [17], firstHole: 17 },
  ],
};

it('viser seksjonene, åpner hullet som mangler, og har ingen plass uten tavle', async () => {
  const onOpenHole = jest.fn();
  const { rerender } = await render(
    <RoundDoneCard model={MODEL} onReview={jest.fn()} onBack={jest.fn()} onOpenHole={onOpenHole} />,
  );

  for (const id of [
    'round-done-card',
    'round-done-greeting',
    'round-done-headline',
    'round-done-birdies',
    'round-done-place',
    'round-done-best',
    'round-done-worst',
    'round-done-flight',
    'round-done-complete',
    'round-done-review',
    'round-done-back',
  ]) {
    expect(screen.getByTestId(id)).toBeTruthy();
  }
  await fireEvent.press(screen.getByTestId('round-done-missing-jonas'));
  expect(onOpenHole).toHaveBeenCalledWith(17);

  await rerender(
    <RoundDoneCard
      model={{ ...MODEL, standing: null, flight: null }}
      onReview={jest.fn()}
      onBack={jest.fn()}
      onOpenHole={onOpenHole}
    />,
  );
  expect(screen.queryByTestId('round-done-place')).toBeNull();
  expect(screen.queryByTestId('round-done-flight')).toBeNull();
});

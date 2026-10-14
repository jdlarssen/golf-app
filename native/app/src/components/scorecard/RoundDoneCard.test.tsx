// RoundDoneCard (Type C, #2299): kortet tegner modellen fra `buildRoundDoneModel`
// og regner ingenting selv. Her låses seksjonene, at raden for den som mangler
// et hull åpner hullet, og at den faste linja (`RoundDoneBar`) sender begge
// trykkene videre. Tallene og tekstene er låst i `roundDone.test.ts` og
// `lib/scorecard/roundSummary.test.ts`.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { RoundDoneModel } from '../../lib/roundDone';
import { RoundDoneBar, RoundDoneCard } from './RoundDoneCard';

/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports */

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

it('viser seksjonene, åpner hullet som mangler, har knappene i linja og ingen plass uten tavle', async () => {
  const onOpenHole = jest.fn();
  const onReview = jest.fn();
  const onBack = jest.fn();
  const { rerender } = await render(
    <>
      <RoundDoneCard model={MODEL} onOpenHole={onOpenHole} />
      <RoundDoneBar onReview={onReview} onBack={onBack} />
    </>,
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
    'round-done-bar',
  ]) {
    expect(screen.getByTestId(id)).toBeTruthy();
  }
  await fireEvent.press(screen.getByTestId('round-done-missing-jonas'));
  expect(onOpenHole).toHaveBeenCalledWith(17);
  await fireEvent.press(screen.getByTestId('round-done-review'));
  expect(onReview).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByTestId('round-done-back'));
  expect(onBack).toHaveBeenCalledTimes(1);

  await rerender(
    <RoundDoneCard model={{ ...MODEL, standing: null, flight: null }} onOpenHole={onOpenHole} />,
  );
  expect(screen.queryByTestId('round-done-place')).toBeNull();
  expect(screen.queryByTestId('round-done-flight')).toBeNull();
});

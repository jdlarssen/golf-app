// #2254: den ene render-testen (Type C) for «Forrige runde».
//
// Ordlyden er låst mot webben i `homeCopy.test.ts`. Her låses koblingen: plass
// og brutto står på raden, gull bare når du vant, og brutto bare når tallet
// hører til nettopp denne runden. I stableford står poengene i stedet for
// brutto (Hjem v2, #2385).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { homeCard } from '../../test/homeFixtures';
import { LastRoundCard } from './LastRoundCard';

const HIDDEN = { includeHiddenElements: true };

it('viser plass og brutto, gull bare ved seier, og brutto bare for sin egen runde', async () => {
  const second = homeCard({
    gameId: 'last',
    name: 'Høstpokalen',
    status: 'finished',
    resultSummary: { kind: 'placement', rank: 2, fieldSize: 8, isTeam: false },
  });
  const score = { gameId: 'last', brutto: 88, netto: 76, teamBall: false };
  const onPress = jest.fn();

  const { rerender } = await render(
    <LastRoundCard card={second} score={score} points={null} onPress={onPress} />,
  );
  expect(screen.getByTestId('home-last-round-line-last')).toHaveTextContent(
    '2. plass av 8 · 88 brutto',
  );
  expect(screen.getByTestId('home-last-round-medal', HIDDEN)).toHaveTextContent('2');
  expect(screen.queryByTestId('home-last-round-gold', HIDDEN)).toBeNull();
  await fireEvent.press(screen.getByLabelText('Høstpokalen. 2. plass av 8, 88 brutto'));
  expect(onPress).toHaveBeenCalled();

  // Stableford: poengene dine i stedet for brutto, som «34 poeng» i designet.
  await rerender(<LastRoundCard card={second} score={score} points={34} onPress={onPress} />);
  expect(screen.getByTestId('home-last-round-line-last')).toHaveTextContent(
    '2. plass av 8 · 34 poeng',
  );
  expect(screen.getByLabelText('Høstpokalen. 2. plass av 8, 34 poeng')).toBeTruthy();

  // Seier: gull skive med 1.
  await rerender(
    <LastRoundCard
      card={{ ...second, resultSummary: { kind: 'placement', rank: 1, fieldSize: 8, isTeam: false } }}
      score={score}
      points={null}
      onPress={onPress}
    />,
  );
  expect(screen.getByTestId('home-last-round-gold', HIDDEN)).toHaveTextContent('1');

  // Brutto fra en annen runde tas ikke med; lagball merkes som lagrunde.
  await rerender(
    <LastRoundCard
      card={second}
      score={{ ...score, gameId: 'other' }}
      points={null}
      onPress={onPress}
    />,
  );
  expect(screen.getByTestId('home-last-round-line-last')).toHaveTextContent('2. plass av 8');
  await rerender(
    <LastRoundCard
      card={second}
      score={{ ...score, teamBall: true }}
      points={null}
      onPress={onPress}
    />,
  );
  expect(screen.getByTestId('home-last-round-line-last')).toHaveTextContent(
    '2. plass av 8 · Lagrunde',
  );

  // Tapt match: ingen plass å vise i skiva, og ingen gull.
  await rerender(
    <LastRoundCard
      card={{ ...second, resultSummary: { kind: 'matchplay', outcome: 'loss', margin: '2&1' } }}
      score={null}
      points={null}
      onPress={onPress}
    />,
  );
  expect(screen.getByTestId('home-last-round-line-last')).toHaveTextContent('Du tapte 2&1');
  expect(screen.getByTestId('home-last-round-medal', HIDDEN)).not.toHaveTextContent(/\d/);
});

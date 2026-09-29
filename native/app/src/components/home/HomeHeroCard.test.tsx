// #2254: den ene render-testen (Type C) for heltekortet.
//
// Hva kortet SIER er dekket av `homeHero.test.ts` (modellen) og
// `homeCopy.test.ts` (tekstene). Det som blir igjen, er koblingen: at modellen
// faktisk havner på skjermen, at knappene fører dit de skal, og at ringen er ett
// bilde med etikett for skjermleseren.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { HeroModel } from '../../lib/homeHero';
import { homeCard } from '../../test/homeFixtures';
import { HomeHeroCard } from './HomeHeroCard';

const CARD = homeCard({ gameId: 'g-live', name: 'Torsdagsrunden', courseName: 'Losby' });

const LIVE: HeroModel = {
  gate: null,
  state: 'continue',
  holeCount: 18,
  played: 7,
  nextHole: 8,
  action: { kind: 'hole', holeNumber: 8 },
  standing: {
    rank: 3,
    tied: false,
    fieldSize: 12,
    total: 15,
    holesPlayed: 7,
    leaderUserIds: ['a'],
    gap: 3,
  },
  unit: 'points',
  approvals: 0,
};

const HIDDEN = { includeHiddenElements: true };

it('tegner ring, plass og knapper fra modellen, og uten modell bare «Åpne runden»', async () => {
  const handlers = {
    onOpenGame: jest.fn(),
    onHole: jest.fn(),
    onSubmit: jest.fn(),
    onBoard: jest.fn(),
    onApprove: jest.fn(),
  };
  const { rerender } = await render(<HomeHeroCard card={CARD} model={LIVE} {...handlers} />);

  // Midt i runden: hull 8 i ringen, med etiketten skjermleseren leser.
  expect(screen.getByText('Pågår nå')).toBeTruthy();
  expect(screen.getByText('Torsdagsrunden')).toBeTruthy();
  expect(screen.getByTestId('home-hero-ring-number')).toHaveTextContent('8');
  expect(screen.getByLabelText('Hull 8 av 18, 7 spilt')).toBeTruthy();
  expect(screen.getByTestId('home-hero-ring').props.accessibilityRole).toBe('image');
  // Buen er dekor inni bildet.
  expect(screen.queryByTestId('home-hero-ring-svg')).toBeNull();
  expect(screen.getByTestId('home-hero-ring-svg', HIDDEN)).toBeTruthy();
  expect(screen.getByTestId('home-hero-place')).toHaveTextContent('3. plass');
  expect(screen.getByTestId('home-hero-detail')).toHaveTextContent(
    '15 poeng etter 7 hull · 3 poeng bak ledelsen',
  );
  expect(screen.queryByTestId('home-hero-gold', HIDDEN)).toBeNull();

  await fireEvent.press(screen.getByText('Fortsett på hull 8 →'));
  expect(handlers.onHole).toHaveBeenCalledWith(8);
  await fireEvent.press(screen.getByText('Se tavla →'));
  expect(handlers.onBoard).toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('home-hero-open'));
  expect(handlers.onOpenGame).toHaveBeenCalledTimes(1);

  // Leder med ett kort til godkjenning: gull skive, og raden under kortet.
  await rerender(
    <HomeHeroCard
      card={CARD}
      model={{ ...LIVE, standing: { ...LIVE.standing!, rank: 1, gap: null }, approvals: 2 }}
      {...handlers}
    />,
  );
  expect(screen.getByTestId('home-hero-place')).toHaveTextContent('Du leder');
  expect(screen.getByTestId('home-hero-gold', HIDDEN)).toBeTruthy();
  await fireEvent.press(screen.getByText('2 kort venter på godkjenningen din →'));
  expect(handlers.onApprove).toHaveBeenCalled();

  // Lagformat (ingen plass) med alle hull tastet: «Lever scorekort».
  await rerender(
    <HomeHeroCard
      card={CARD}
      model={{ ...LIVE, played: 18, action: { kind: 'submit' }, standing: null, unit: null }}
      {...handlers}
    />,
  );
  expect(screen.getByTestId('home-hero-played', HIDDEN)).toHaveTextContent('18 av 18 hull spilt');
  expect(screen.getByLabelText('18 av 18 hull spilt')).toBeTruthy();
  // Ringen sier det allerede; linja leses ikke en gang til.
  expect(screen.queryByTestId('home-hero-played')).toBeNull();
  await fireEvent.press(screen.getByText('Lever scorekort →'));
  expect(handlers.onSubmit).toHaveBeenCalled();

  // Levert: etiketten, ingen knapp.
  await rerender(
    <HomeHeroCard
      card={CARD}
      model={{ ...LIVE, state: 'submitted', action: null }}
      {...handlers}
    />,
  );
  expect(screen.getByTestId('home-hero-state')).toHaveTextContent('Levert');
  expect(screen.queryByTestId('home-hero-cta')).toBeNull();

  // Uten bundel: navn og bane, ingen ring, og «Åpne runden».
  await rerender(<HomeHeroCard card={CARD} model={null} {...handlers} />);
  expect(screen.queryByTestId('home-hero-ring')).toBeNull();
  expect(screen.queryByText('Se tavla →')).toBeNull();
  await fireEvent.press(screen.getByText('Åpne runden →'));
  expect(handlers.onOpenGame).toHaveBeenCalledTimes(2);

  // Et stengt spill, og en bundel som ennå sier at runden ikke er i gang: kortet
  // lover ikke mer enn modellen, så heller ikke her står ring eller tavle-lenke.
  for (const model of [
    { ...LIVE, gate: 'mode' as const, action: { kind: 'open' as const }, standing: null, unit: null },
    { ...LIVE, action: { kind: 'open' as const }, played: 0, standing: null, unit: null },
  ]) {
    await rerender(<HomeHeroCard card={CARD} model={model} {...handlers} />);
    expect(screen.queryByTestId('home-hero-ring')).toBeNull();
    expect(screen.queryByText('Se tavla →')).toBeNull();
    expect(screen.getByText('Åpne runden →')).toBeTruthy();
  }
});

// #2756: resultatets topp. Type B — det spilleren ser og hører: setningen,
// knappen, kortet utenfor skjermen, og konfetti bare når den skal fyre.
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { claimConfetti } from '../../lib/resultConfetti';
import { resultHeroFor } from '../../lib/resultHero';
import { canShareImage, shareViewImage } from '../../lib/shareImage';
import type { ModeResult } from '../../../../../lib/scoring/modes/types';
import { homeBundle, homePlayer } from '../../test/homeFixtures';
import { ResultHero } from './ResultHero';

jest.mock('../../lib/shareImage', () => ({ canShareImage: jest.fn(), shareViewImage: jest.fn() }));
jest.mock('../../lib/resultConfetti', () => ({ claimConfetti: jest.fn() }));

const result = {
  kind: 'stableford',
  variant: 'solo',
  holes: [],
  players: [
    { userId: 'a', totalPoints: 38, rank: 1, holesPlayed: 18, tiedWith: [], decidedBy: null },
    { userId: 'b', totalPoints: 34, rank: 2, holesPlayed: 18, tiedWith: [], decidedBy: null },
  ],
} as unknown as ModeResult;

const bundle = homeBundle({
  game: { status: 'finished', endedAt: '2026-11-04T10:00:00.000Z' },
  players: [homePlayer({ userId: 'a', name: 'Marte Lie' }), homePlayer({ userId: 'b', name: 'Jonas Berg' })],
});

const hero = resultHeroFor({ bundle, result, userId: 'a' });

function draw(over: Partial<Parameters<typeof ResultHero>[0]> = {}) {
  return render(
    <ResultHero
      hero={hero}
      kicker="Lørdagsrunden · Byneset"
      subtitle="Stableford · 2 spillere"
      variant="solo"
      hasQuote={false}
      note={null}
      {...over}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (canShareImage as jest.Mock).mockReturnValue(true);
  (shareViewImage as jest.Mock).mockResolvedValue({ ok: true, shared: true });
  (claimConfetti as jest.Mock).mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

it('viser spillnavnet, setningen og formatlinja, og leser dem som én overskrift', async () => {
  await draw();
  expect(screen.getByTestId('result-hero-kicker')).toHaveTextContent('Lørdagsrunden · Byneset');
  expect(screen.getByTestId('result-hero-sentence')).toHaveTextContent('Marte vant med 38 poeng');
  expect(screen.getByRole('header')).toHaveAccessibleName(
    'Lørdagsrunden · Byneset, Marte vant med 38 poeng, Stableford · 2 spillere',
  );
  await act(async () => {});
});

it('kortet står utenfor skjermen, skjult for skjermleseren, med kortets tekst', async () => {
  await draw();
  expect(screen.queryByTestId('result-share-card')).toBeNull();
  const card = screen.getByTestId('result-share-card', { includeHiddenElements: true });
  expect(card).toHaveTextContent(/Sluttresultat/);
  expect(card).toHaveTextContent(/Marte L\./);
  expect(card).toHaveTextContent(/tornygolf\.no/);
  await act(async () => {});
});

it('«Del resultat» tar bilde av kortet og er minst 44 pt høy', async () => {
  await draw();
  const button = screen.getByRole('button', { name: 'Del resultat' });
  expect(button).toHaveStyle({ height: 44 });
  await fireEvent.press(button);
  await waitFor(() => expect(shareViewImage).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId('share-result-error')).toBeNull();
});

it('et lukket ark er ingen feil', async () => {
  (shareViewImage as jest.Mock).mockResolvedValue({ ok: true, shared: false });
  await draw();
  await fireEvent.press(screen.getByRole('button', { name: 'Del resultat' }));
  await waitFor(() => expect(shareViewImage).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId('share-result-error')).toBeNull();
});

it('feiler bildet, står en linje under knappen', async () => {
  (shareViewImage as jest.Mock).mockResolvedValue({ ok: false });
  await draw();
  await fireEvent.press(screen.getByRole('button', { name: 'Del resultat' }));
  expect(await screen.findByTestId('share-result-error')).toHaveTextContent(
    'Fikk ikke delt resultatet. Prøv igjen.',
  );
});

it('et bygg uten de native delene har ingen knapp, men setningen står', async () => {
  (canShareImage as jest.Mock).mockReturnValue(false);
  await draw();
  expect(screen.queryByTestId('share-result')).toBeNull();
  expect(screen.getByTestId('result-hero-sentence')).toBeTruthy();
  await act(async () => {});
});

it('konfetti når den får lov, skjult for skjermleseren', async () => {
  (claimConfetti as jest.Mock).mockResolvedValue(true);
  await draw();
  expect(await screen.findByTestId('result-confetti', { includeHiddenElements: true })).toBeTruthy();
  expect(claimConfetti).toHaveBeenCalledWith(bundle.game.id, '2026-11-04T10:00:00.000Z');
});

it('aldri konfetti ved redusert bevegelse', async () => {
  (claimConfetti as jest.Mock).mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  await draw();
  await act(async () => {});
  expect(claimConfetti).not.toHaveBeenCalled();
  expect(screen.queryByTestId('result-confetti', { includeHiddenElements: true })).toBeNull();
});

it('ingen konfetti når ingen vant', async () => {
  (claimConfetti as jest.Mock).mockResolvedValue(true);
  await draw({ hero: { ...hero, celebrates: false } });
  await act(async () => {});
  expect(claimConfetti).not.toHaveBeenCalled();
});

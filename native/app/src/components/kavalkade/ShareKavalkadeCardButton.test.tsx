// #2265 PR 2: «Del kortet». Type C — knappen finnes bare med de native delene,
// bildet tas av deleversjonen, og delingen telles bare når spilleren delte.
// Hva bildet og arket gjør, er `lib/shareImage.test.ts` sitt.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { buildKavalkadeCardModel } from '../../../../../lib/kavalkade/cardModel';
import { logKavalkadeShare } from '../../data/kavalkade';
import { formatDayMonthLong } from '../../lib/homeDates';
import { KAVALKADE_SHARE_TEXT, kavalkadeShareT } from '../../lib/kavalkadeCopy';
import { canShareImage, shareViewImage } from '../../lib/shareImage';
import { makeKavalkadeFacts } from '../../test/kavalkadeFixtures';
import { ShareKavalkadeCardButton } from './ShareKavalkadeCardButton';

jest.mock('../../lib/shareImage', () => ({ canShareImage: jest.fn(), shareViewImage: jest.fn() }));
jest.mock('../../data/kavalkade', () => ({ logKavalkadeShare: jest.fn(async () => undefined) }));

const model = buildKavalkadeCardModel(makeKavalkadeFacts(), 'best-round', {
  t: kavalkadeShareT,
  formatDate: formatDayMonthLong,
  playerFallback: KAVALKADE_SHARE_TEXT.playerFallback,
})!;

beforeEach(() => {
  jest.clearAllMocks();
  (canShareImage as jest.Mock).mockReturnValue(true);
  (shareViewImage as jest.Mock).mockResolvedValue({ ok: true, shared: true });
});

it('draws the share version with the web’s image text, out of sight', async () => {
  await render(<ShareKavalkadeCardButton year={2026} model={model} />);
  // Skjult for skjermleseren, så spørringen må ta med skjulte elementer.
  const image = screen.getByTestId('kavalkade-share-best-round', { includeHiddenElements: true });
  expect(image).toHaveTextContent(/TørnyKavalkaden 2026Årets beste runde82slag brutto/);
  expect(image).toHaveTextContent(/SpillLørdagscupBaneLosbyDato14\. juni/);
  expect(image).toHaveTextContent(/tornygolf\.noFyr opp golfturneringen på et par minutter/);
});

it('shares the picture and counts the share when the player shared it', async () => {
  await render(<ShareKavalkadeCardButton year={2026} model={model} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Del kortet' }));
  await waitFor(() => expect(logKavalkadeShare).toHaveBeenCalledWith(2026, 'best-round'));
  expect(shareViewImage).toHaveBeenCalledTimes(1);
});

it('counts nothing when the player closed the sheet without sharing', async () => {
  (shareViewImage as jest.Mock).mockResolvedValue({ ok: true, shared: false });
  await render(<ShareKavalkadeCardButton year={2026} model={model} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Del kortet' }));
  await waitFor(() => expect(shareViewImage).toHaveBeenCalledTimes(1));
  expect(logKavalkadeShare).not.toHaveBeenCalled();
  expect(screen.queryByTestId('share-kavalkade-error-best-round')).toBeNull();
});

it('says so and counts nothing when the picture or the sheet fails', async () => {
  (shareViewImage as jest.Mock).mockResolvedValue({ ok: false });
  await render(<ShareKavalkadeCardButton year={2026} model={model} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Del kortet' }));
  expect(await screen.findByTestId('share-kavalkade-error-best-round')).toHaveTextContent(
    'Fikk ikke delt kortet. Prøv igjen.',
  );
  expect(logKavalkadeShare).not.toHaveBeenCalled();
});

it('shows no button in a build without the native parts', async () => {
  (canShareImage as jest.Mock).mockReturnValue(false);
  await render(<ShareKavalkadeCardButton year={2026} model={model} />);
  expect(screen.queryByRole('button', { name: 'Del kortet' })).toBeNull();
});

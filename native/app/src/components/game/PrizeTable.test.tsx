// #2561: premiebordet sier hvem som deler ut premiene (Type B, rendret output).
//
// App Store Review Guidelines 5.3.2 vil ha «Apple is not a sponsor» der en
// konkurranse har premier, og Google vil ikke at Tørny ser ut til å dele ut
// verdier. Linja under premiene er svaret, så testen låser at den står der
// bordet er åpnet, ikke der det er tomt eller lukket, og at hver butikk får
// sin variant: iOS nevner Apple, Android gjør det ikke.
import { Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { GamePrize } from '../../../../../lib/games/prizes';
import { PRIZE_TEXT } from '../../lib/paymentCopy';
import { PrizeTable } from './PrizeTable';

const PRIZES: GamePrize[] = [
  { category: 'placement', position: 1, description: 'Middag for to', sponsor: 'Byneset Sport', sponsorLogoPath: null },
  { category: 'longest_drive', position: 1, description: 'Ballpakke', sponsor: null, sponsorLogoPath: null },
];

describe('PrizeTable organiser note', () => {
  let platform: { restore(): void } | undefined;

  // `Platform.OS` skal ikke lekke videre om en assert feiler midt i en test.
  afterEach(() => {
    platform?.restore();
    platform = undefined;
  });

  const setOs = (os: 'ios' | 'android') => {
    platform = jest.replaceProperty(Platform, 'OS', os);
  };

  async function renderOpen() {
    await render(<PrizeTable prizes={PRIZES} />);
    await fireEvent.press(screen.getByTestId('prize-table-toggle'));
  }

  it('iOS: linja under premiene sier at arrangøren deler ut premiene og at Apple ikke står bak', async () => {
    setOs('ios');
    await renderOpen();
    const note = screen.getByTestId('prize-table-organiser-note');
    expect(note).toHaveTextContent(
      'Arrangøren deler ut premiene. Verken Tørny eller Apple står bak konkurransen.',
    );
  });

  it('Android: samme linje uten Apple-navnet', async () => {
    setOs('android');
    await renderOpen();
    const note = screen.getByTestId('prize-table-organiser-note');
    expect(note).toHaveTextContent('Arrangøren deler ut premiene. Tørny står ikke bak konkurransen.');
    expect(note).not.toHaveTextContent('Apple');
  });

  it('linja står etter den siste premien, inne i den åpne lista', async () => {
    setOs('ios');
    await renderOpen();
    const list = screen.getByTestId('prize-table-list');
    const note = screen.getByTestId('prize-table-organiser-note');
    expect(list).toContainElement(note);
    const children = list.children;
    expect(children[children.length - 1]).toBe(note);
  });

  it('er skjult mens bordet er lukket', async () => {
    setOs('ios');
    await render(<PrizeTable prizes={PRIZES} />);
    expect(screen.queryByTestId('prize-table-organiser-note')).toBeNull();
  });

  it('er borte når bordet er tomt', async () => {
    setOs('ios');
    await render(<PrizeTable prizes={[]} />);
    expect(screen.queryByTestId('prize-table')).toBeNull();
    expect(screen.queryByTestId('prize-table-organiser-note')).toBeNull();
  });

  it('teksten kommer fra PRIZE_TEXT og er valgt per plattform', () => {
    setOs('ios');
    expect(PRIZE_TEXT.organiserNote()).toContain('Apple');
    platform?.restore();
    setOs('android');
    expect(PRIZE_TEXT.organiserNote()).not.toContain('Apple');
  });
});

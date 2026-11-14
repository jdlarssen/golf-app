// #2755 (Type B): Nassau «Hull for hull» etter tegningen B3. Runden er
// tegningens (`B3`), regnet av den ekte motoren og `nassauHoleCards`; hva
// stillingen og «alene fra»-hullet ER, låses i `lib/leaderboard/nassauHoles.test.ts`.
// Her låses det skjermen sier og tegner: forklaringen, kamplinja, myntene,
// gullstreken, stripa, hullkortet og pilene.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { B3, fours, nassauResult } from '../../../../../lib/leaderboard/__fixtures__/nassauResult';
import { nassauHoleCards } from '../../../../../lib/leaderboard/nassauHoles';
import { homePlayer } from '../../test/homeFixtures';
import { PALETTES, ThemeScope, themeFor } from '../../theme';
import { NassauHoleCardsView } from './NassauHoleCardsView';

const HIDDEN = { includeHiddenElements: true };
const NBSP = '\u00A0';

const players = [
  homePlayer({ userId: 'meg', name: 'Meg Hansen' }),
  homePlayer({ userId: 'anne', name: 'Anne-Kristine Solberg' }),
  homePlayer({ userId: 'jonas', name: 'Jonas Berg' }),
  homePlayer({ userId: 'marte', name: 'Marte Lie' }),
  homePlayer({ userId: 'a', name: 'Anna Aas' }),
  homePlayer({ userId: 'b', name: 'Bjørn Berg' }),
];

async function show(
  strokes: Record<string, readonly (number | null)[]>,
  { viewer = 'meg', dark = false }: { viewer?: string | null; dark?: boolean } = {},
) {
  const cards = nassauHoleCards(nassauResult(strokes), { viewerUserId: viewer });
  await render(
    <ThemeScope theme={themeFor(dark ? 'dark' : 'light')}>
      <NassauHoleCardsView
        cards={cards}
        subtitle="Nassau · Netto"
        players={players}
        viewerUserId={viewer}
        finished
      />
    </ThemeScope>,
  );
  return cards;
}

/** Teksten i en node og alle barna, i rekkefølge. */
const textOf = (testID: string) => {
  const texts: string[] = [];
  const walk = (n: unknown) => {
    const x = n as { children?: unknown[] };
    for (const child of x.children ?? []) {
      if (typeof child === 'string') texts.push(child);
      else walk(child);
    }
  };
  walk(screen.getByTestId(testID, HIDDEN));
  return texts.join('|');
};
const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, HIDDEN).props.style);
const press = (testID: string) =>
  act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });

describe('NassauHoleCardsView (B3)', () => {
  it('toppen og tegnforklaringen', async () => {
    await show(B3);
    expect(screen.getByText('Hull for hull')).toBeTruthy();
    expect(screen.getByText('Nassau · Netto')).toBeTruthy();
    expect(textOf('nassau-legend')).toBe('Vant hullet|Delt|Alene i ledelsen ut kampen');
  });

  it('kamplinja: kampen, initialene, fornavnet («Deg» for den som ser på) og summen', async () => {
    await show(B3);
    expect(textOf('nassau-match-front9-line')).toBe('Front 9|AS|Anne-Kristine|33');
    expect(textOf('nassau-match-back9-line')).toBe('Back 9|Du|Deg|34');
    expect(textOf('nassau-match-total18-line')).toBe('Totalt|AS|Anne-Kristine|68');
  });

  it('myntene: initialene til hullvinneren, «=» på delte hull, og én setning per mynt', async () => {
    await show(B3);
    const front = ['Du', '=', 'JB', 'AS', 'AS', '=', '=', 'ML', '='];
    front.forEach((face, i) => {
      expect(textOf(`nassau-coin-${i + 1}`)).toBe(`${i + 1}|${face}`);
    });
    expect(screen.getByLabelText('Hull 1: Du vant hullet')).toBeTruthy();
    expect(screen.getByLabelText('Hull 2: delt')).toBeTruthy();
    expect(screen.getByLabelText('Hull 11: Anne-Kristine vant hullet')).toBeTruthy();
  });

  it('gullstreken og «Alene i ledelsen fra hull N»; Totalt har 18 felt, gull fra N', async () => {
    await show(B3);
    expect(screen.getByTestId('nassau-alone-bar-5', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('nassau-alone-bar-15', HIDDEN)).toBeTruthy();
    expect(textOf('nassau-match-front9-alone')).toBe(`Alene i ledelsen fra hull${NBSP}5`);
    expect(textOf('nassau-match-back9-alone')).toBe(`Alene i ledelsen fra hull${NBSP}15`);
    expect(textOf('nassau-match-total18-alone')).toBe(`Alene i ledelsen fra hull${NBSP}5`);
    const stripe = screen.getAllByTestId(/^nassau-total-\d+-(gold|track)$/, HIDDEN).map((n) =>
      String(n.props.testID).split('-').pop(),
    );
    expect(stripe).toEqual([...Array(4).fill('track'), ...Array(14).fill('gold')]);
  });

  it('hullkortet åpner på hull 15: par og indeks, spillerne best først med netto, og stillingen', async () => {
    await show(B3);
    expect(textOf('nassau-hole-card-title')).toBe('Hull 15');
    expect(screen.getByText('Par 4 · SI 15')).toBeTruthy();
    expect(['meg', 'anne', 'jonas', 'marte'].map((id) => textOf(`nassau-hole-row-${id}`))).toEqual([
      'Deg|3',
      'Anne-Kristine Solberg|4',
      'Jonas Berg|4',
      'Marte Lie|4',
    ]);
    expect(screen.getByTestId('nassau-hole-row-meg-won', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('nassau-hole-row-anne-won', HIDDEN)).toBeNull();
    expect(textOf('nassau-hole-standing')).toBe(
      `Back 9|Totalt|Du leder med${NBSP}1|Anne-Kristine leder med${NBSP}1`,
    );
    // Den valgte mynten har ringen fra tegningen.
    expect(styleOf('nassau-coin-15-won-selected').boxShadow).toBe(
      `0 0 0 2px ${PALETTES.light.surface}, 0 0 0 4px ${PALETTES.light.primary}`,
    );
    expect(screen.getByTestId('nassau-coin-15').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('et trykk på en mynt og på pilene bytter hull; pilene er av i endene', async () => {
    await show(B3);
    await press('nassau-coin-4');
    expect(textOf('nassau-hole-card-title')).toBe('Hull 4');
    expect(screen.getByTestId('nassau-coin-4-won-selected', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('nassau-coin-15-won-selected', HIDDEN)).toBeNull();
    expect(textOf('nassau-hole-standing')).toBe('Front 9|Totalt|Delt ledelse|Delt ledelse');

    expect(screen.getByLabelText('Hull 3')).toBeTruthy();
    await press('nassau-hole-prev');
    await press('nassau-hole-prev');
    await press('nassau-hole-prev');
    expect(textOf('nassau-hole-card-title')).toBe('Hull 1');
    expect(screen.getByTestId('nassau-hole-prev').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('Forrige hull')).toBeTruthy();
    await press('nassau-hole-prev');
    expect(textOf('nassau-hole-card-title')).toBe('Hull 1');

    await press('nassau-coin-18');
    expect(screen.getByTestId('nassau-hole-next').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('Neste hull')).toBeTruthy();
    await press('nassau-hole-prev');
    expect(textOf('nassau-hole-card-title')).toBe('Hull 17');
  });

  it('startpunktet: egen seier, ellers der totalens vinner ble alene, ellers hull 1', async () => {
    await show(B3, { viewer: 'meg' });
    expect(textOf('nassau-hole-card-title')).toBe('Hull 15');
    await screen.unmount();
    await show(B3, { viewer: 'jonas' });
    expect(textOf('nassau-hole-card-title')).toBe('Hull 5');
    await screen.unmount();
    await show({ a: fours(18), b: fours(18) }, { viewer: 'a' });
    expect(textOf('nassau-hole-card-title')).toBe('Hull 1');
  });

  it('en delt kamp: «=»-mynten, «Delt» og summen, uten gullstrek', async () => {
    await show({ a: fours(18), b: fours(18) }, { viewer: 'a' });
    expect(textOf('nassau-match-front9-line')).toBe('Front 9|=|Delt|36');
    expect(screen.queryByTestId('nassau-match-front9-alone', HIDDEN)).toBeNull();
    expect(screen.queryAllByTestId(/^nassau-alone-bar-/, HIDDEN)).toHaveLength(0);
  });

  it('vunnet på tilbaketelling: vinneren står, uten linje under', async () => {
    // 72 hver; b har bedre back 9 og vinner totalen på tilbaketelling.
    await show(
      {
        a: [3, 3, 4, 4, 4, 4, 4, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4, 5],
        b: [4, 4, 4, 4, 4, 4, 4, 4, 5, 3, 3, 4, 4, 4, 4, 4, 4, 5],
      },
      { viewer: 'a' },
    );
    expect(textOf('nassau-match-total18-line')).toBe('Totalt|BB|Bjørn|72');
    expect(screen.queryByTestId('nassau-match-total18-alone', HIDDEN)).toBeNull();
    expect(screen.getAllByTestId(/^nassau-total-\d+-track$/, HIDDEN)).toHaveLength(18);
  });

  it('ingen spilte kampen: «Ingen vinner» uten mynt og sum, og uspilte hull er tomme', async () => {
    await show({ a: [3, ...fours(8)], b: fours(9) }, { viewer: 'a' });
    expect(textOf('nassau-match-back9-line')).toBe('Back 9|Ingen vinner');
    expect(screen.queryByTestId('nassau-match-back9-coin', HIDDEN)).toBeNull();
    expect(screen.getByTestId('nassau-coin-12-unplayed', HIDDEN)).toBeTruthy();
    expect(screen.getByLabelText('Hull 12: ikke spilt')).toBeTruthy();
  });

  it('om natten er vinnermynten salvie med mørke initialer (`winCoin`)', async () => {
    await show(B3, { dark: true });
    expect(styleOf('nassau-coin-4-won').backgroundColor).toBe(PALETTES.dark.primary);
    const initials = within(screen.getByTestId('nassau-coin-4-won', HIDDEN)).getByText('AS', HIDDEN);
    expect(StyleSheet.flatten(initials.props.style).color).toBe(PALETTES.dark.onPrimary);
  });
});

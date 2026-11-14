// #2317 — Type C: skinspotten i appen. Strukturen per tilstand: toppkortet
// mens runden pågår, én mynt per hull med riktig tilstand, en stilling uten
// knapper, og ingen pott på spill i et ferdig spill. Tallene og teksten er
// Type A i `lib/leaderboard/skinsPot.test.ts` og `leaderboardModel.test.ts`.
import { StyleSheet } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import type { SkinsHoleRow, SkinsResult } from '../../../../../lib/scoring/modes/types';
import { BOARD_TEAM_TEXT } from '../../lib/boardCopy';
import { SkinsView } from './PotViews';
import { PALETTES, ThemeScope, themeFor } from '../../theme';

function hole(holeNumber: number, fields: Partial<SkinsHoleRow>): SkinsHoleRow {
  return {
    holeNumber,
    par: 4,
    strokeIndex: holeNumber,
    carriedIn: 0,
    atStake: 1,
    outcome: 'pending',
    winnerUserId: null,
    skinsAwarded: 0,
    perPlayer: [],
    ...fields,
  };
}

// Hull 1 delt, hull 2 vunnet av Marte med potten, hull 3 venter, hull 4 senere.
const RESULT: SkinsResult = {
  kind: 'skins',
  scoring: 'net',
  holes: [
    hole(1, { outcome: 'carryover' }),
    hole(2, { outcome: 'won', carriedIn: 1, atStake: 2, winnerUserId: 'm', skinsAwarded: 2 }),
    hole(3, {}),
    hole(4, {}),
  ],
  players: [
    { userId: 'm', totalSkins: 2, holesWon: 1, rank: 1, tiedWith: [] },
    { userId: 'j', totalSkins: 0, holesWon: 0, rank: 2, tiedWith: [] },
  ],
  carriedPot: 0,
};

const NAMES: Record<string, string> = { m: 'Marte Lie', j: 'Jonas Berg' };
const nameOf = (id: string) => NAMES[id] ?? 'Ukjent spiller';

// Mynten bærer tilstanden i testID-en: `skins-coin-<hull>-<tilstand>`.
const coinStates = () =>
  screen
    .getAllByTestId(/^skins-coin-\d+-[a-zA-Z]+$/, { includeHiddenElements: true })
    .map((coin) => String(coin.props.testID).split('-').pop());

describe('SkinsView (#2317)', () => {
  it('live: toppkortet, én mynt per hull med potten på hull 3, og en stilling uten knapper', async () => {
    await render(
      <SkinsView result={RESULT} status="active" settlement={null} nameOf={nameOf} />,
    );
    expect(screen.getByTestId('skins-pot-hero')).toBeTruthy();
    expect(coinStates()).toEqual(['carried', 'potWon', 'current', 'future']);
    expect(screen.getByTestId('skins-standing-m')).toBeTruthy();
    expect(screen.getByTestId('skins-standing-j')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // Linja om potten står i kortet mens runden pågår.
    expect(screen.queryByTestId('skins-pot')).toBeNull();
  });

  it('seerens egen rad heter «Deg», som på tegningen og lagtavla', async () => {
    await render(
      <SkinsView result={RESULT} status="active" settlement={null} nameOf={nameOf} viewerUserId="j" />,
    );
    expect(screen.getByTestId('skins-standing-j')).toHaveTextContent(new RegExp(`^${BOARD_TEAM_TEXT.you}`));
    expect(screen.queryByText('Jonas Berg')).toBeNull();
    expect(screen.getByTestId('skins-standing-m')).toHaveTextContent(/^Marte Lie/);
  });

  it('skjermleseren får én setning per mynt', async () => {
    await render(<SkinsView result={RESULT} status="active" settlement={null} nameOf={nameOf} />);
    expect(screen.getByLabelText('Hull 1: delt, 1 skin ruller videre')).toBeTruthy();
    expect(screen.getByLabelText('Hull 2: Marte Lie vant 2 skins')).toBeTruthy();
  });

  it('ferdig: ingen toppkort og ingen pott på spill, selv med uspilte hull', async () => {
    await render(
      <SkinsView result={{ ...RESULT, carriedPot: 1 }} status="finished" settlement={null} nameOf={nameOf} />,
    );
    expect(screen.queryByTestId('skins-pot-hero')).toBeNull();
    expect(coinStates()).toEqual(['carried', 'potWon', 'future', 'future']);
    expect(screen.getByTestId('skins-pot')).toBeTruthy();
  });
});

// #2755 (eierens tillegg): om natten forsvant den vunne mynten mot kortet
// (`surfaceStrong` #1F3B2C på `surface` #1C2A22). Den får vinnermynten fra
// temaet (`winCoin`); lys drakt og det grønne toppkortet er uendret.
describe('den vunne mynten (#2755)', () => {
  const styleOf = (testID: string) =>
    StyleSheet.flatten(screen.getByTestId(testID, { includeHiddenElements: true }).props.style);
  // Marte Lie vant hull 2: «ML» på mynten.
  const inkOf = (testID: string) =>
    StyleSheet.flatten(
      within(screen.getByTestId(testID, { includeHiddenElements: true })).getByText('ML', {
        includeHiddenElements: true,
      }).props.style,
    ).color;

  it('om natten: salvie med mørke initialer, og toppkortet er fortsatt skoggrønt', async () => {
    await render(
      <ThemeScope theme={themeFor('dark')}>
        <SkinsView result={RESULT} status="active" settlement={null} nameOf={nameOf} />
      </ThemeScope>,
    );
    expect(styleOf('skins-coin-2-potWon').backgroundColor).toBe(PALETTES.dark.primary);
    expect(inkOf('skins-coin-2-potWon')).toBe(PALETTES.dark.onPrimary);
    expect(styleOf('skins-pot-hero').backgroundColor).toBe(PALETTES.dark.surfaceStrong);
  });

  it('i lys drakt: skoggrønn med varme initialer, som før', async () => {
    await render(
      <ThemeScope theme={themeFor('light')}>
        <SkinsView result={RESULT} status="active" settlement={null} nameOf={nameOf} />
      </ThemeScope>,
    );
    expect(styleOf('skins-coin-2-potWon').backgroundColor).toBe(PALETTES.light.surfaceStrong);
    expect(inkOf('skins-coin-2-potWon')).toBe(PALETTES.light.onStrongWarm);
  });
});

// #2317 — Type C: skinspotten i appen. Strukturen per tilstand: toppkortet
// mens runden pågår, én mynt per hull med riktig tilstand, en stilling uten
// knapper, og ingen pott på spill i et ferdig spill. Tallene og teksten er
// Type A i `lib/leaderboard/skinsPot.test.ts` og `leaderboardModel.test.ts`.
import { render, screen } from '@testing-library/react-native';
import type { SkinsHoleRow, SkinsResult } from '../../../../../lib/scoring/modes/types';
import { SkinsView } from './PotViews';

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

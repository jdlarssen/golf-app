// Bragd-veggen og serien i statistikken. Type C: bare det rendrede. Tallene er
// Type A (`computePlayerStats`, `computeStreak`), og tegnet merke og flamme er
// det som står i stedet for emoji.
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { EMPTY_ACHIEVEMENTS } from '../../../../../lib/stats/achievements';
import type { StreakSummary } from '../../../../../lib/stats/streak';
import { HISTORY_TEXT } from '../../lib/historyCopy';
import type { SeasonSummary } from '../../../../../lib/stats/seasonStats';
import { AchievementSection, SeasonSection, StreakSection } from './StatsSections';

describe('AchievementSection', () => {
  it('draws a numeral badge per achievement, dims the ones not earned, and keeps the names', async () => {
    await render(
      <AchievementSection achievements={{ ...EMPTY_ACHIEVEMENTS, holeInOne: 1, birdie: 12 }} />,
    );

    const marks = {
      holeInOne: '1',
      eagle: '−2',
      birdie: '−1',
      turkey: '3×',
    } as const;
    for (const [key, mark] of Object.entries(marks)) {
      const badge = screen.getByTestId(`stats-badge-${key}`);
      expect(badge).toHaveTextContent(mark, { exact: false });
    }
    // Navnet og tallet leses opp som før.
    expect(screen.getByTestId('stats-badge-holeInOne').props.accessibilityLabel).toBe(
      `${HISTORY_TEXT.brag.holeInOne}: 1`,
    );
    expect(screen.getByTestId('stats-badge-eagle').props.accessibilityLabel).toBe(
      `${HISTORY_TEXT.brag.eagle}: 0`,
    );
    // Ikke opptjent: dempet. Opptjent: ikke.
    const opacity = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).opacity;
    expect(opacity('stats-badge-eagle')).toBe(0.5);
    expect(opacity('stats-badge-holeInOne')).toBeUndefined();
  });
});

describe('StreakSection', () => {
  const ACTIVE: StreakSummary = {
    weeklyStreak: 5,
    weeklyStreakActive: true,
    roundsThisSeason: 9,
    roundsInStreak: 5,
    lastRoundWeekKey: '2026-W44',
  };

  it('shows a drawn flame instead of an emoji for a running streak', async () => {
    await render(<StreakSection streak={ACTIVE} year={2026} />);
    const row = screen.getByTestId('stats-streak-active');
    expect(row.props.accessibilityLabel).toBe(`5 ${HISTORY_TEXT.streakWeeksLabel}`);
    expect(screen.queryByText('🔥')).toBeNull();
  });
});

// #2930: sesongårene ligger i et kort, så kanten toner mot kortets flate. Med
// fem sesonger eller flere er årene bredere enn kortet.
describe('SeasonSection', () => {
  const season = (year: number): SeasonSummary => ({
    year,
    rounds: 5,
    grossAverage: 90,
    bestRound: 84,
    achievements: EMPTY_ACHIEVEMENTS,
  });

  it('årsraden toner i kanten når årene ikke får plass', async () => {
    await render(<SeasonSection seasons={[2026, 2025, 2024, 2023, 2022, 2021].map(season)} />);
    const years = screen.getByTestId('stats-season-years');
    await fireEvent(years, 'layout', { nativeEvent: { layout: { width: 310, height: 44 } } });
    await fireEvent(years, 'contentSizeChange', 444, 44);
    expect(screen.getByTestId('edge-fade-right', { hidden: true })).toBeTruthy();
    expect(screen.getByTestId('stats-season-year-2021')).toBeTruthy();
  });
});

// Bragd-veggen og serien i statistikken. Type C: bare det rendrede. Tallene er
// Type A (`computePlayerStats`, `computeStreak`), og tegnet merke og flamme er
// det som står i stedet for emoji.
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { EMPTY_ACHIEVEMENTS } from '../../../../../lib/stats/achievements';
import type { StreakSummary } from '../../../../../lib/stats/streak';
import { HISTORY_TEXT } from '../../lib/historyCopy';
import { AchievementSection, StreakSection } from './StatsSections';

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

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AchievementWall } from './AchievementWall';
import { EMPTY_ACHIEVEMENTS } from '@/lib/stats/achievements';

// Type C — én render-test for bragd-veggen (#947). Verifiserer struktur (alle
// fem badge-typer rendres alltid, opptjente markeres) + at en fersk spiller får
// en helt dimmet vegg. Tallene eies av `computePlayerStats` (Type A), så de
// re-asserteres ikke her. Labels sendes inn som props.
const labels = {
  holeInOne: 'Hole-in-one',
  eagle: 'Eagle',
  birdie: 'Birdie',
  turkey: 'Turkey',
  snowman: 'Snowman',
};

describe('AchievementWall', () => {
  it('always renders all five badges and marks earned vs not-yet-earned', () => {
    const { rerender } = render(
      <AchievementWall
        achievements={{ ...EMPTY_ACHIEVEMENTS, holeInOne: 1, birdie: 12 }}
        heading="Bragd-veggen"
        subtitle="Alle bragdene dine, samlet"
        labels={labels}
      />,
    );

    const badges = screen.getAllByRole('listitem');
    expect(badges).toHaveLength(5);
    expect(
      badges.filter((b) => b.getAttribute('data-earned') === 'true'),
    ).toHaveLength(2); // hole-in-one + birdie
    expect(screen.getByText('Hole-in-one')).toBeInTheDocument();
    expect(screen.getByText('Snowman')).toBeInTheDocument();

    // Fersk spiller: alle fem dimmet, men veggen står fortsatt (aspirasjon).
    rerender(
      <AchievementWall
        achievements={EMPTY_ACHIEVEMENTS}
        heading="Bragd-veggen"
        subtitle="Alle bragdene dine, samlet"
        labels={labels}
      />,
    );
    const empty = screen.getAllByRole('listitem');
    expect(empty).toHaveLength(5);
    expect(
      empty.filter((b) => b.getAttribute('data-earned') === 'true'),
    ).toHaveLength(0);
  });
});

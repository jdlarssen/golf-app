import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AchievementWall } from './AchievementWall';
import { EMPTY_ACHIEVEMENTS } from '@/lib/stats/achievements';

// Type C — én render-test for bragd-veggen (#947). Verifiserer struktur (alle
// fire badge-typer rendres alltid, opptjente markeres) + at en fersk spiller får
// en helt dimmet vegg. Snowman er bevisst IKKE på veggen (negativt ladet). Tallene
// eies av `computePlayerStats` (Type A), så de re-asserteres ikke her. Labels
// sendes inn som props.
const labels = {
  holeInOne: 'Hole-in-one',
  eagle: 'Eagle',
  birdie: 'Birdie',
  turkey: 'Turkey',
};

describe('AchievementWall', () => {
  it('always renders all four badges and marks earned vs not-yet-earned', () => {
    const { rerender } = render(
      <AchievementWall
        achievements={{ ...EMPTY_ACHIEVEMENTS, holeInOne: 1, birdie: 12 }}
        heading="Bragd-veggen"
        subtitle="Alle bragdene dine, samlet"
        labels={labels}
      />,
    );

    const badges = screen.getAllByRole('listitem');
    expect(badges).toHaveLength(4);
    expect(
      badges.filter((b) => b.getAttribute('data-earned') === 'true'),
    ).toHaveLength(2); // hole-in-one + birdie
    expect(screen.getByText('Hole-in-one')).toBeInTheDocument();
    // Tegnet merke i stedet for emoji: golfens eget tall i ringen, skjult for
    // skjermleseren (labelen og tallet ved siden av bærer meningen).
    for (const mark of ['1', '\u22122', '\u22121', '3\u00d7']) {
      const badge = screen.getByText(mark, { selector: 'span[aria-hidden="true"]' });
      expect(badge).toBeInTheDocument();
    }
    // Opptjent merke får champagne-ringen, ikke-opptjent den dempede.
    expect(screen.getByText('1', { selector: 'span[aria-hidden="true"]' }).className).toContain('border-accent');
    expect(screen.getByText('\u22122', { selector: 'span[aria-hidden="true"]' }).className).toContain('border-border');
    // Snowman is surfaced nowhere — never a badge on the wall.
    expect(screen.queryByText('Snowman')).not.toBeInTheDocument();

    // Fersk spiller: alle fire dimmet, men veggen står fortsatt (aspirasjon).
    rerender(
      <AchievementWall
        achievements={EMPTY_ACHIEVEMENTS}
        heading="Bragd-veggen"
        subtitle="Alle bragdene dine, samlet"
        labels={labels}
      />,
    );
    const empty = screen.getAllByRole('listitem');
    expect(empty).toHaveLength(4);
    expect(
      empty.filter((b) => b.getAttribute('data-earned') === 'true'),
    ).toHaveLength(0);
  });
});

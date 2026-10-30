import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fitNamePx, InvitationPreviewCard } from './InvitationPreviewCard';

// Type A (docs/test-discipline.md): the name in the «Klar?» card is never
// clipped (#2282). It keeps 26 px when it fits, shrinks in half pixels to fit
// one line, and stops at 18 px (below that the field wraps instead).
describe('fitNamePx', () => {
  it.each<[string, number, number, number]>([
    ['fits at 26 px', 200, 289, 26],
    ['exactly fits', 289, 289, 26],
    ['a little too wide shrinks', 330, 289, 22.5],
    ['much too wide stops at 18 px', 600, 289, 18],
    ['not measured yet (0 width) stays 26 px', 0, 289, 26],
    ['field without width stays 26 px', 300, 0, 26],
  ])('%s', (_label, textWidth, available, expected) => {
    expect(fitNamePx(textWidth, available)).toBe(expected);
  });
});

// Type C: the same card on the receipt after «Publiser» (#2458) is read-only.
// The name is text, not a field, and the hint under the card is gone.
describe('InvitationPreviewCard', () => {
  const card = {
    name: 'Lørdagsrunden',
    when: { weekday: 'lørdag', date: '3. okt', time: '09:00' },
    courseName: 'Byneset',
    teeName: 'Gul',
    formatName: 'Best ball',
  };

  it('is a field with its hint when the name can change', () => {
    render(<InvitationPreviewCard {...card} onNameChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('Lørdagsrunden');
    expect(document.getElementById('game-name-hint')).not.toBeNull();
  });

  it('shows the name as text without onNameChange', () => {
    render(<InvitationPreviewCard {...card} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    // The hidden measuring twin carries the name too; the name is the <p>.
    expect(screen.getByText('Lørdagsrunden', { selector: 'p' })).toBeInTheDocument();
    expect(document.getElementById('game-name-hint')).toBeNull();
    expect(screen.getByText('Byneset · Gul tee · Best ball')).toBeInTheDocument();
  });
});

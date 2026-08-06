import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevealHiddenView } from './RevealHiddenView';

describe('RevealHiddenView', () => {
  it('renders the blind-cup-day placeholder heading and description, with no team data', () => {
    render(<RevealHiddenView gameName="Nord vs Sør" backHref="/games/g1" />);

    expect(screen.getByText('Avsløres til slutt')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Stillingen holdes hemmelig til arrangøren avslutter spillet.',
      ),
    ).toBeInTheDocument();
    // No team/score data of any kind leaks into this view.
    expect(screen.queryByText(/Lag \d/)).not.toBeInTheDocument();
  });
});

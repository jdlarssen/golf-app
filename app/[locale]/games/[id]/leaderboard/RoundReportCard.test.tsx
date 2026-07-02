import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoundReportCard } from './RoundReportCard';

/**
 * Type-C render test (max one) — #1008 «Fra pressetribunen» round report
 * card. Verifies: heading renders + the text prop is shown verbatim.
 */
describe('RoundReportCard', () => {
  it('renders the heading and the report text', () => {
    render(<RoundReportCard text="Jevn runde med spenning til siste hull." />);

    expect(screen.getByTestId('round-report')).toBeDefined();
    expect(
      screen.getByText('Jevn runde med spenning til siste hull.'),
    ).toBeDefined();
  });
});

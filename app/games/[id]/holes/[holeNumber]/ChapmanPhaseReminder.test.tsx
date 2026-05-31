import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChapmanPhaseReminder } from './ChapmanPhaseReminder';

// Type C — én render-test for et rent presentasjonskomponent. Asserter at
// stripa rendres (via data-testid, ikke norsk copy per test-disiplin).
describe('ChapmanPhaseReminder', () => {
  it('rendrer fase-stripa', () => {
    render(<ChapmanPhaseReminder />);
    expect(screen.getByTestId('chapman-phase-reminder')).toBeInTheDocument();
  });
});

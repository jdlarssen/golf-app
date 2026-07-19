import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyScorecardCta, MyScorecardCtaProvider } from './MyScorecardCta';

// Provider-tilstedeværelsen ER gaten (#1289): uten provider (spectate, demo,
// holes-drilldown, format-view-tester) rendres ingenting; med provider rendres
// lenken til spillerens eget scorekort fra den autentiserte leaderboard-siden.
describe('MyScorecardCta', () => {
  it('rendrer ingenting uten provider', () => {
    const { container } = render(<MyScorecardCta />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rendrer scorekort-lenken med href fra provideren', () => {
    render(
      <MyScorecardCtaProvider href="/games/g1/scorecard">
        <MyScorecardCta />
      </MyScorecardCtaProvider>,
    );
    const link = screen.getByTestId('my-scorecard-button');
    expect(link).toHaveAttribute('href', '/games/g1/scorecard');
    expect(link).toHaveTextContent('Mitt scorekort');
  });
});

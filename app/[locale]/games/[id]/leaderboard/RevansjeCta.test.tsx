import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevansjeCta, RevansjeCtaProvider } from './RevansjeCta';

// Provider-tilstedeværelsen ER gaten (#1020): uten provider (spectate,
// holes-drilldown, format-view-tester) rendres ingenting; med provider
// rendres lenken med prefill-href fra den autentiserte leaderboard-siden.
describe('RevansjeCta', () => {
  it('rendrer ingenting uten provider', () => {
    const { container } = render(<RevansjeCta />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rendrer revansje-lenken med href fra provideren', () => {
    render(
      <RevansjeCtaProvider href="/opprett-spill?fra=g1">
        <RevansjeCta />
      </RevansjeCtaProvider>,
    );
    const link = screen.getByTestId('revansje-button');
    expect(link).toHaveAttribute('href', '/opprett-spill?fra=g1');
    expect(link).toHaveTextContent('Revansje?');
  });
});

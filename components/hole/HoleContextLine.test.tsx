import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoleContextLine } from './HoleContextLine';

// Type C render-test — maks ÉN render-test per komponent (jfr. docs/test-discipline.md).
// Bekrefter at innholdet rendres under den videreførte test-id-en (kontrakt for
// at gamle banner-selektorer fortsatt treffer etter foldingen). #639.

describe('HoleContextLine', () => {
  it('renders children under the forwarded test id', () => {
    render(
      <HoleContextLine testId="demo-context-line">
        Segment 1/3 · innhold
      </HoleContextLine>,
    );
    const el = screen.getByTestId('demo-context-line');
    expect(el).toBeInTheDocument();
    expect(el.textContent).toContain('Segment 1/3 · innhold');
  });
});

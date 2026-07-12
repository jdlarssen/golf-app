import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DistanceToGreen } from './DistanceToGreen';

// Type C render test — maks ÉN render-test per komponent (docs/test-discipline.md).
// Låser vises/skjules på senter-propen (#1210 kontrakt-kriterium 3): uten senter
// rendres ingenting; med senter vises «Vis avstand»-affordansen (førstegangs-
// tilstanden — ingen GPS-tillatelse gitt i jsdom). Terskellogikken (≤/> 1 km)
// er Type A-testet i lib/geo/pinRules.test.ts, IKKE her.

describe('DistanceToGreen', () => {
  it('rendrer ingenting uten senter, og «Vis avstand»-knappen med senter', () => {
    const { rerender, container } = render(<DistanceToGreen center={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<DistanceToGreen center={{ lat: 59.9139, lng: 10.7522 }} />);
    expect(screen.getByTestId('show-distance-button')).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormatStyleBadge } from './FormatStyleBadge';
import type { GameMode } from '@/lib/scoring/modes/types';

// #478: merket viser spillestil. Fleksible format (stableford) er «Solo eller
// lag» uten lagstørrelse, men låses til Solo/Lag når en størrelse er gitt
// (/spillformer-4BBB-kortet).
describe('FormatStyleBadge', () => {
  it('viser format-stilen for faste format', () => {
    const { rerender } = render(<FormatStyleBadge mode="solo_strokeplay" />);
    expect(screen.getByText('Solo')).toBeInTheDocument();

    rerender(<FormatStyleBadge mode="best_ball" />);
    expect(screen.getByText('Lag')).toBeInTheDocument();

    rerender(<FormatStyleBadge mode="wolf" />);
    expect(screen.getByText('Hver for seg')).toBeInTheDocument();
  });

  it('fleksibelt format uten lagstørrelse viser «Solo eller lag»', () => {
    render(<FormatStyleBadge mode="stableford" />);
    expect(screen.getByText('Solo eller lag')).toBeInTheDocument();
  });

  it('fleksibelt format låses av lagstørrelse: ≥2 → Lag, 1 → Solo', () => {
    const { rerender } = render(
      <FormatStyleBadge mode="stableford" teamSize={2} />,
    );
    expect(screen.getByText('Lag')).toBeInTheDocument();

    rerender(<FormatStyleBadge mode="stableford" teamSize={1} />);
    expect(screen.getByText('Solo')).toBeInTheDocument();
  });

  it('rendrer ingenting for en ukjent slug (ingen tomt merke)', () => {
    const { container } = render(
      <FormatStyleBadge mode={'not_a_real_format' as GameMode} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

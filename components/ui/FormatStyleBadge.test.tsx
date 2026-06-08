import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormatStyleBadge } from './FormatStyleBadge';
import type { GameMode } from '@/lib/scoring/modes/types';

// #478/#498: merket viser spillestil. «Hver for seg» er slått sammen til «Solo»,
// så både rene solo-format og pott-/1-mot-1-format viser «Solo». Fleksible
// format (stableford) viser begge chips uten lagstørrelse, men låses til
// Solo/Lag når en størrelse er gitt (/spillformater-4BBB-kortet).
describe('FormatStyleBadge', () => {
  it('viser format-stilen for faste format (solo/individual → Solo, team → Lag)', () => {
    const { rerender } = render(<FormatStyleBadge mode="solo_strokeplay" />);
    expect(screen.getByText('Solo')).toBeInTheDocument();

    rerender(<FormatStyleBadge mode="best_ball" />);
    expect(screen.getByText('Lag')).toBeInTheDocument();

    // #498: pott-/1-mot-1-format viser nå «Solo», ikke «Hver for seg».
    rerender(<FormatStyleBadge mode="wolf" />);
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.queryByText('Hver for seg')).not.toBeInTheDocument();
  });

  it('fleksibelt format uten lagstørrelse viser begge chips: Solo + Lag', () => {
    render(<FormatStyleBadge mode="stableford" />);
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.getByText('Lag')).toBeInTheDocument();
    expect(screen.queryByText('Solo eller lag')).not.toBeInTheDocument();
  });

  it('fleksibelt format låses av lagstørrelse: ≥2 → Lag, 1 → Solo', () => {
    const { rerender } = render(
      <FormatStyleBadge mode="stableford" teamSize={2} />,
    );
    expect(screen.getByText('Lag')).toBeInTheDocument();
    expect(screen.queryByText('Solo')).not.toBeInTheDocument();

    rerender(<FormatStyleBadge mode="stableford" teamSize={1} />);
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.queryByText('Lag')).not.toBeInTheDocument();
  });

  it('rendrer ingenting for en ukjent slug (ingen tomt merke)', () => {
    const { container } = render(
      <FormatStyleBadge mode={'not_a_real_format' as GameMode} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

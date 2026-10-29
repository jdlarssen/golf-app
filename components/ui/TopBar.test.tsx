import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopBar } from './TopBar';

describe('TopBar', () => {
  it('rendrer back-link med tilbake-label som default', () => {
    render(<TopBar backHref="/" />);
    expect(screen.getByRole('link', { name: /tilbake/i })).toBeInTheDocument();
  });

  it('viser kicker uten tilbake-pil når backHref mangler (fanens forside, #2487)', () => {
    render(<TopBar kicker="SEKRETARIATET" />);
    expect(screen.getByText('SEKRETARIATET')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('holder en lang kicker på én linje bare når siden ber om det (#2481)', () => {
    const { rerender } = render(<TopBar backHref="/" kicker="LØRDAGSRUNDEN · PLANLAGT" kickerOneLine />);
    expect(screen.getByText('LØRDAGSRUNDEN · PLANLAGT')).toHaveClass('truncate');
    rerender(<TopBar backHref="/" kicker="LØRDAGSRUNDEN · PLANLAGT" />);
    expect(screen.getByText('LØRDAGSRUNDEN · PLANLAGT')).not.toHaveClass('truncate');
  });
});
